import * as FS from 'expo-file-system/legacy';
import {File} from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as VideoThumbnails from 'expo-video-thumbnails';
import {AppState} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
import {getDb} from '../db/database';
import {getCurrentUser,subscribeAuthState} from './auth';
import {supabase,SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase';
import {MAX_MOMENT_BYTES,publishCoordinates,validateMoment,recapItems} from './momentPolicy';
import type {Moment,MomentGroup,MomentKind,MomentReply} from '../types/moment';
export type {Moment,MomentGroup,MomentReply} from '../types/moment';
const native=requireOptionalNativeModule<{exportRecap(json:string):Promise<string>;cancelRecap():Promise<boolean>;shareFile(uri:string):Promise<boolean>}>('MyMapMoments');
import {clearMomentWidget,updateMomentWidget,saveWidgetSelection,widgetSelection,momentWidgetSupported,type WidgetFilter} from './momentWidget';
export {momentWidgetSupported};
export const disableMomentWidget=()=>clearMomentWidget(true);
export type {WidgetFilter};
const bucket=supabase.storage.from('mymap-moments');
const changeListeners=new Set<()=>void>();
export function subscribeMomentChanges(listener:()=>void){changeListeners.add(listener);return()=>{changeListeners.delete(listener);};}
let ready:Promise<void>|null=null;
async function db(){const db=await getDb();ready??=db.execAsync('CREATE TABLE IF NOT EXISTS moment_drafts(id TEXT PRIMARY KEY,account TEXT NOT NULL,payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS moment_account ON moment_drafts(account);').catch(e=>{ready=null;throw e;});await ready;return db;}
async function account(){return (await getCurrentUser())?.id||'local';}
async function signedIn(){const u=await getCurrentUser();if(!u||u.is_anonymous)throw new Error('Đăng nhập tài khoản MyMap để chia sẻ khoảnh khắc.');return u;}
async function rpc<T>(name:string,args?:Record<string,unknown>):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message==='recipient_not_friend'?'Người nhận phải là bạn bè đã kết nối.':error.message);return data as T;}
async function persist(m:Moment){const d=await db();await d.runAsync('INSERT INTO moment_drafts(id,account,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',m.id,m.account,JSON.stringify(m));}
export async function listLocalMoments():Promise<Moment[]>{const d=await db();const rows=await d.getAllAsync<{payload:string}>('SELECT payload FROM moment_drafts WHERE account=?',await account());return rows.map(r=>JSON.parse(r.payload) as Moment).sort((a,b)=>b.capturedAt-a.capturedAt);}
export async function listUnclaimedMoments():Promise<Moment[]>{
 const u=await getCurrentUser();if(!u||u.is_anonymous)return [];
 const d=await db();const rows=await d.getAllAsync<{payload:string}>("SELECT payload FROM moment_drafts WHERE account<>? AND (account='local' OR json_extract(payload,'$.unclaimed')=1) AND json_extract(payload,'$.status')='local'",u.id);
 return rows.map(r=>JSON.parse(r.payload) as Moment);
}
export async function claimUnclaimedMoments(){
 const u=await signedIn(),items=await listUnclaimedMoments(),d=await db();
 await d.withExclusiveTransactionAsync(async tx=>{for(const m of items){if((await account())!==u.id)throw new Error('Tài khoản đã thay đổi.');const next={...m,account:u.id,unclaimed:false};await tx.runAsync("UPDATE moment_drafts SET account=?,payload=? WHERE id=? AND (account='local' OR json_extract(payload,'$.unclaimed')=1) AND json_extract(payload,'$.status')='local'",u.id,JSON.stringify(next),m.id);}});
}
export async function saveMoment(input:{uri:string;kind:MomentKind;durationSeconds:number;caption:string;latitude?:number|null;longitude?:number|null}):Promise<Moment>{
 const source=new File(input.uri);if(!source.exists||source.size<=0||source.size>MAX_MOMENT_BYTES)throw new Error('Tệp không hợp lệ hoặc lớn hơn 25 MB.');
 const id=Crypto.randomUUID(),dir=`${FS.documentDirectory}mymap/moments/${id}/`;
 const user=await getCurrentUser();
 const m:Moment={id,account:user?.id??'local',unclaimed:!user||user.is_anonymous,kind:input.kind,uri:dir+(input.kind==='photo'?'photo.jpg':'video.mp4'),coverUri:dir+'cover.jpg',capturedAt:Date.now(),durationSeconds:input.durationSeconds,caption:input.caption,latitude:input.latitude??null,longitude:input.longitude??null,status:'local',recipients:[],groupId:null,shareLocation:false};
 validateMoment(m);await FS.makeDirectoryAsync(dir,{intermediates:true});
 try{await FS.copyAsync({from:input.uri,to:m.uri});if(m.kind==='photo')m.coverUri=m.uri;else{const cover=await VideoThumbnails.getThumbnailAsync(m.uri,{time:100,quality:.6});await FS.copyAsync({from:cover.uri,to:m.coverUri});}await persist(m);return m;}
 catch(e){await FS.deleteAsync(dir,{idempotent:true});throw e;}
}
async function upload(uri:string,path:string,mime:string){const f=new File(uri);if(!f.exists||f.size>MAX_MOMENT_BYTES)throw new Error('Không tìm thấy tệp hoặc tệp vượt quá 25 MB.');const {error}=await bucket.upload(path,await f.arrayBuffer(),{contentType:mime,upsert:true});if(error)throw error;}
let syncing:Promise<void>|null=null;
export async function queueMoment(m:Moment,recipients:string[],groupId:string|null,shareLocation:boolean){const u=await signedIn();if(m.account!==u.id)throw new Error('Khoảnh khắc thuộc tài khoản khác.');if(m.status==='published')throw new Error('Khoảnh khắc đã được chia sẻ.');const next={...m,recipients:[...new Set(recipients)],groupId,shareLocation,status:'queued' as const,error:null};validateMoment(next);await persist(next);await syncMomentQueue();const result=(await listLocalMoments()).find(x=>x.id===m.id);if(!result)throw new Error('Tài khoản đã thay đổi. Khoảnh khắc vẫn được lưu riêng cho tài khoản trước.');return result;}
export function syncMomentQueue():Promise<void>{if(syncing)return syncing;syncing=syncQueue().finally(()=>{syncing=null;});return syncing;}
async function syncQueue(){
 const u=await getCurrentUser();if(!u||u.is_anonymous)return;
 const pending=(await listLocalMoments()).filter(m=>m.status==='queued');if(!pending.length)return;
 const owner=await rpc<string>('mm_identity');
 for(const m of pending){
  if((await account())!==m.account)return;
  const root=`${owner}/${m.id}`,media=root+(m.kind==='photo'?'/photo.jpg':'/video.mp4');
  try{await upload(m.uri,media,m.kind==='photo'?'image/jpeg':'video/mp4');if(m.kind==='video')await upload(m.coverUri,root+'/cover.jpg','image/jpeg');
   if((await account())!==m.account)return;
   const c=publishCoordinates(m);await rpc('mm_publish',{p_id:m.id,p_kind:m.kind,p_caption:m.caption,p_captured_at:new Date(m.capturedAt).toISOString(),p_duration:m.durationSeconds,p_recipients:m.recipients,p_group:m.groupId,p_lat:c.lat,p_lon:c.lon});
   await persist({...m,ownerId:owner,mediaPath:media,coverPath:m.kind==='photo'?media:root+'/cover.jpg',status:'published',error:null});
  }catch(e){const message=e instanceof Error?e.message:String((e as {message?:string})?.message||'Chưa gửi được. Bản lưu trên máy vẫn còn.');await persist({...m,status:/network|fetch|timeout|offline|connection|socket/i.test(message)?'queued':'failed',error:message});}
 }
}
export async function retryMoment(m:Moment){if(m.account!==await account())throw new Error('Khoảnh khắc thuộc tài khoản khác.');await persist({...m,status:'queued',error:null});await syncMomentQueue();}
export async function momentUrl(path:string){const {data,error}=await bucket.createSignedUrl(path,900);if(error)throw error;return data.signedUrl;}
type CloudMoment={id:string;owner_id:string;author_name:string;kind:MomentKind;media_path:string;cover_path:string;caption:string;captured_at:string;duration_seconds:number;latitude:number|null;longitude:number|null;group_id:string|null};
export async function listSharedMoments(groupId?:string):Promise<Moment[]>{
 await signedIn();const a=await account(),owner=await rpc<string>('mm_identity'),rows=await rpc<CloudMoment[]>('mm_feed',{p_group:groupId??null});
 if(!rows.length)return [];
 const {data,error}=await bucket.createSignedUrls([...new Set(rows.map(x=>x.cover_path))],900);if(error)throw error;
 if(a!==await account())throw new Error('Tài khoản đã thay đổi.');
 const covers=new Map((data??[]).filter(x=>!x.error&&x.signedUrl).map(x=>[x.path,x.signedUrl]));
 return rows.filter(x=>covers.has(x.cover_path)).map(x=>({id:x.id,account:a,ownerId:x.owner_id,authorName:x.author_name,isMine:x.owner_id===owner,kind:x.kind,uri:'',coverUri:covers.get(x.cover_path)!,mediaPath:x.media_path,coverPath:x.cover_path,capturedAt:new Date(x.captured_at).getTime(),caption:x.caption,durationSeconds:x.duration_seconds,latitude:x.latitude,longitude:x.longitude,groupId:x.group_id,status:'published' as const,shareLocation:x.latitude!==null,recipients:[],remote:true}));
}
export async function listMomentGroups():Promise<MomentGroup[]>{await signedIn();const {data,error}=await supabase.from('mm_groups').select('*').order('created_at',{ascending:false});if(error)throw error;return data as MomentGroup[];}
export async function createMomentGroup(name:string,members:string[]){await signedIn();if(!members.length)throw new Error('Chọn ít nhất một người bạn.');return rpc<string>('mm_create_group',{p_name:name,p_members:members});}
export async function leaveMomentGroup(id:string){await rpc('mm_leave_group',{p_id:id});}
export async function listMomentReplies(id:string):Promise<MomentReply[]>{const {data,error}=await supabase.from('mm_replies').select('*').eq('moment_id',id).order('created_at').limit(100);if(error)throw error;return data as MomentReply[];}
export async function replyToMoment(id:string,kind:'text'|'emoji'|'voice',value:string){await signedIn();const reply=Crypto.randomUUID();let body=value;if(kind==='voice'){const owner=await rpc<string>('mm_identity');body=`${owner}/${id}/${reply}.m4a`;await upload(value,body,'audio/mp4');}await rpc('mm_reply',{p_id:reply,p_moment:id,p_kind:kind,p_body:body});}
export async function deleteMoment(m:Moment){if(m.account!==await account())throw new Error('Khoảnh khắc thuộc tài khoản khác.');if(m.remote&&!m.isMine)throw new Error('Chỉ chủ khoảnh khắc được xóa nội dung.');if(m.status==='published'){await signedIn();await rpc('mm_delete',{p_id:m.id});const paths=[m.mediaPath,m.coverPath].filter((x):x is string=>!!x);if(paths.length)await bucket.remove([...new Set(paths)]);}const d=await db();await d.runAsync('DELETE FROM moment_drafts WHERE id=? AND account=?',m.id,await account());if(!m.remote)await FS.deleteAsync(`${FS.documentDirectory}mymap/moments/${m.id}/`,{idempotent:true});await refreshMomentWidget();}
export async function downloadOwnMoment(m:Moment){
 if(!m.remote||!m.isMine||!m.mediaPath||!m.coverPath)throw new Error('Chỉ tải vào thư viện cá nhân khoảnh khắc của chính bạn.');
 if(m.account!==await account())throw new Error('Tài khoản đã thay đổi.');
 const dir=`${FS.documentDirectory}mymap/moments/${m.id}/`;
 await FS.makeDirectoryAsync(dir,{intermediates:true});
 const uri=dir+(m.kind==='photo'?'photo.jpg':'video.mp4'),coverUri=m.kind==='photo'?uri:dir+'cover.jpg';
 try{await FS.downloadAsync(await momentUrl(m.mediaPath),uri);if(m.kind==='video')await FS.downloadAsync(await momentUrl(m.coverPath),coverUri);
  if(new File(uri).size>MAX_MOMENT_BYTES)throw new Error('Tệp vượt quá 25 MB.');
  if(m.account!==await account())throw new Error('Tài khoản đã thay đổi.');
  const local={...m,uri,coverUri,remote:false};await persist(local);return local;
 }catch(e){await FS.deleteAsync(dir,{idempotent:true});throw e;}
}
export type MomentRecap={uri:string;createdAt:number};
export async function listMomentRecaps():Promise<MomentRecap[]>{
 const dir=`${FS.documentDirectory}mymap-recaps/${await account()}/`;const info=await FS.getInfoAsync(dir);if(!info.exists)return [];
 return (await FS.readDirectoryAsync(dir)).flatMap(name=>{const match=/^MyMap-recap-(\d+)\.mp4$/.exec(name);return match?[{uri:dir+name,createdAt:Number(match[1])}]:[];}).sort((a,b)=>b.createdAt-a.createdAt).slice(0,10);
}
export async function exportMomentRecap(items:Moment[]){
 if(!native?.exportRecap)throw new Error('Cần bản native iOS mới để xuất video tổng kết.');
 const a=await account();if(items.some(m=>m.account!==a))throw new Error('Khoảnh khắc thuộc tài khoản khác.');
 const uri=await native.exportRecap(JSON.stringify({account:a,items:recapItems(items)})) as string;
 if(a!==await account())throw new Error('Tài khoản đã thay đổi. Video vẫn được lưu riêng cho tài khoản trước.');return uri;
}
export async function shareMomentFile(uri:string){if(!native?.shareFile)throw new Error('Thiết bị chưa hỗ trợ chia sẻ tệp.');await native.shareFile(uri);}
export async function configureMomentWidget(filter:WidgetFilter){
 if(!momentWidgetSupported)throw Error('Bản build này chưa bật WidgetKit.');
 const owner=await account();await clearMomentWidget();if(owner!==await account())throw Error('Tài khoản đã thay đổi.');await saveWidgetSelection(owner,filter);await refreshMomentWidget();return false;
}
export async function refreshMomentWidget(){
 if(!momentWidgetSupported)return;
 const selection=await widgetSelection();if(!selection)return;
 const owner=await account();if(selection.account!==owner){await clearMomentWidget(true);return;}
 const f=selection.filter;
 let items=f.mode==='friends'?await listSharedMoments(f.group):await listLocalMoments();
 if(f.author)items=items.filter(m=>m.ownerId===f.author);
 const chosen=f.momentId?items.find(m=>m.id===f.momentId):f.mode==='anniversary'?items.find(m=>{const d=new Date(m.capturedAt),now=new Date();return d.getDate()===now.getDate()&&d.getMonth()===now.getMonth()&&d.getFullYear()<now.getFullYear();}):items[0];
 await updateMomentWidget(chosen??null,owner,account,f.mode==='friends');
}
export function startMomentSync(){
 let active=true,watching=false,stamp:string|null=null,owner:string|null=null;
 async function watch(){
  if(!active||watching||AppState.currentState!=='active')return;
  watching=true;
  try{const user=await getCurrentUser();if(!active)return;if(!user||user.is_anonymous){stamp=null;owner=null;return;}
   const config:Partial<WidgetFilter>=(await widgetSelection())?.filter??{};
   if(!changeListeners.size&&config.mode!=='friends')return;
   const next=JSON.stringify(await rpc('mm_cursor'));
   if(!active||user.id!==(await account()))return;
   if(owner!==user.id){owner=user.id;stamp=null;}
   const changed=stamp!==next;stamp=next;
   if(changed){changeListeners.forEach(fn=>fn());void refreshMomentWidget().catch(()=>{});}
  }catch{/* Network failures preserve private drafts and the last valid view. */}finally{watching=false;}
 }
 const refresh=()=>{if(!active||AppState.currentState!=='active')return;void syncMomentQueue().catch(()=>{});void refreshMomentWidget().catch(()=>{});void watch();};
 const auth=subscribeAuthState(()=>{stamp=null;owner=null;void clearMomentWidget(true).catch(()=>{});refresh();});
 const sub=AppState.addEventListener('change',s=>{if(s==='active')refresh();});const timer=setInterval(refresh,60000),poll=setInterval(()=>void watch(),15000);refresh();
 return()=>{active=false;auth();sub.remove();clearInterval(timer);clearInterval(poll);};
}
