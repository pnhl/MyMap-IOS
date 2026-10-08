import AsyncStorage from '@react-native-async-storage/async-storage';
import {getCurrentUser} from './auth';
import {accountApi} from './accountApi';
import {uploadProfileAvatar,removeRemoteAvatar,cacheOwnAvatar} from './profileAvatars';
export type LocalProfile={name:string;bio:string;avatarUri:string|null};
type Stored={profile:LocalProfile;revision:number;pending:boolean;avatarDirty?:boolean;avatarPath?:string|null};
const EMPTY:LocalProfile={name:'',bio:'',avatarUri:null},LEGACY='mymap.local-profile.v1';
let writes:Promise<unknown>=Promise.resolve(),flushing:Promise<boolean>|null=null;
const key=(owner:string)=>'mymap.local-profile.v2:'+encodeURIComponent(owner);
async function owner(){return(await getCurrentUser())?.id||'local';}
async function remoteAccount(){const user=await getCurrentUser();return !!user&&!user.is_anonymous;}
async function unchanged(id:string){if(await owner()!==id)throw Error('Tài khoản đã thay đổi.');}
function profile(value:unknown):LocalProfile{const p=value as LocalProfile;return {name:typeof p?.name==='string'?p.name.slice(0,80):'',bio:typeof p?.bio==='string'?p.bio.slice(0,500):'',avatarUri:typeof p?.avatarUri==='string'&&p.avatarUri.startsWith('file://')?p.avatarUri:null};}
async function read(id:string):Promise<Stored>{const raw=await AsyncStorage.getItem(key(id));if(raw){const record=JSON.parse(raw);return {profile:profile(record.profile),revision:Number(record.revision)||0,pending:record.pending===true,avatarDirty:record.avatarDirty===true,avatarPath:typeof record.avatarPath==='string'?record.avatarPath:null};}if(id==='local'){const old=await AsyncStorage.getItem(LEGACY);if(old)return {profile:profile(JSON.parse(old)),revision:0,pending:false};}return {profile:{...EMPTY},revision:0,pending:false};}
function serialize<T>(work:()=>Promise<T>){const task=writes.catch(()=>{}).then(work);writes=task;return task;}
export function flushLocalProfile(){if(flushing)return flushing;flushing=(async()=>{
 const id=await owner();if(!(await remoteAccount()))return true;
 const record=await read(id);if(!record.pending)return true;
 const api=await accountApi();if(api.owner!==id)throw Error('Tài khoản đã thay đổi.');
 let uploaded:string|null=null,oldPath=record.avatarPath||null,updated=false;
 try{
  if(record.avatarDirty){const remote=await api.client.rpc('mm_profile_read');await api.assertCurrent();if(remote.error)throw remote.error;oldPath=remote.data?.avatar_path||null;if(record.profile.avatarUri)uploaded=await uploadProfileAvatar(api,remote.data?.id,record.profile.avatarUri);}
  await api.assertCurrent();const{error}=await api.client.rpc('mm_profile_update',{p_name:record.profile.name,p_bio:record.profile.bio,p_update_avatar:record.avatarDirty===true,p_avatar:uploaded});if(error)throw error;updated=true;await api.assertCurrent();
  await serialize(async()=>{await unchanged(id);const latest=await read(id);const sameAvatar=latest.profile.avatarUri===record.profile.avatarUri;await AsyncStorage.setItem(key(id),JSON.stringify({...latest,pending:latest.revision!==record.revision,avatarDirty:sameAvatar?false:latest.avatarDirty,avatarPath:record.avatarDirty?uploaded:latest.avatarPath}));});
  if(record.avatarDirty&&oldPath!==uploaded)await removeRemoteAvatar(api,oldPath).catch(()=>{});
 }catch(e){if(uploaded&&!updated)await removeRemoteAvatar(api,uploaded).catch(()=>{});throw e;}
 return !(await read(id)).pending;
 })().finally(()=>{flushing=null;});return flushing;}
export async function profileNeedsSync(){const id=await owner();return(await read(id)).pending;}
export async function getLocalProfile():Promise<LocalProfile>{
 const id=await owner();let record=await read(id);await unchanged(id);
 if(!(await remoteAccount())){await unchanged(id);return record.profile;}
 if(record.pending){await flushLocalProfile().catch(()=>false);record=await read(id);await unchanged(id);if(record.pending)return record.profile;}
 try{const api=await accountApi();if(api.owner!==id)throw Error('Tài khoản đã thay đổi.');const{data,error}=await api.client.rpc('mm_profile_read');await api.assertCurrent();if(error)throw error;if(data&&typeof data.name==='string'&&typeof data.bio==='string'){const path=typeof data.avatar_path==='string'?data.avatar_path:null;let avatarUri=record.profile.avatarUri;if(path!==record.avatarPath||path&&!avatarUri){avatarUri=path?await cacheOwnAvatar(api,path):null;}const remote=profile({...record.profile,name:data.name,bio:data.bio,avatarUri});await serialize(async()=>{await unchanged(id);const latest=await read(id);if(latest.revision===record.revision&&!latest.pending)await AsyncStorage.setItem(key(id),JSON.stringify({...latest,profile:remote,pending:false,avatarDirty:false,avatarPath:path}));});record=await read(id);}}
 catch{await unchanged(id);}await unchanged(id);return record.profile;
}
export async function saveLocalProfile(value:LocalProfile,expectedOwner?:string){
 const id=await owner();if(expectedOwner&&expectedOwner!==id)throw Error('Tài khoản đã thay đổi.');
 if(!value.name.trim()||value.name.trim().length>80||value.bio.trim().length>500)throw Error('Tên cần 1–80 ký tự, giới thiệu tối đa 500 ký tự.');
 const next=profile({...value,name:value.name.trim(),bio:value.bio.trim()});
 const remote=await remoteAccount();await unchanged(id);
 await serialize(async()=>{await unchanged(id);const previous=await read(id);await AsyncStorage.setItem(key(id),JSON.stringify({...previous,profile:next,revision:previous.revision+1,pending:remote,avatarDirty:previous.avatarDirty||next.avatarUri!==previous.profile.avatarUri}));});
 await unchanged(id);const synced=await flushLocalProfile().catch(()=>false);await unchanged(id);return {synced};
}
