import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import type {accountApi} from './accountApi';

type Account=Awaited<ReturnType<typeof accountApi>>;
const BUCKET='mymap-avatars',MAX_BYTES=2097152;
const UUID='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const PATH=new RegExp(`^${UUID}/${UUID}\\.jpg$`);
const directory=FileSystem.documentDirectory+'mymap/avatars/';

/** Re-encode to a small JPEG; original EXIF and GPS metadata are not uploaded. */
export async function prepareProfileAvatar(uri:string){
 const image=await ImageManipulator.manipulateAsync(uri,[{resize:{width:512}}],{compress:.8,format:ImageManipulator.SaveFormat.JPEG});
 const to=directory+Crypto.randomUUID()+'.jpg';
 await FileSystem.makeDirectoryAsync(directory,{intermediates:true});
 try{await FileSystem.copyAsync({from:image.uri,to});const info=await FileSystem.getInfoAsync(to);if(!info.exists||info.size>MAX_BYTES)throw Error('Ảnh đại diện cần nhỏ hơn 2 MB.');return to;}
 catch(e){await FileSystem.deleteAsync(to,{idempotent:true}).catch(()=>{});throw e;}
 finally{await FileSystem.deleteAsync(image.uri,{idempotent:true}).catch(()=>{});}
}
export async function uploadProfileAvatar(api:Account,canonicalId:string,uri:string){
 if(!new RegExp(`^${UUID}$`).test(canonicalId)||!uri.startsWith('file://'))throw Error('Ảnh hồ sơ không hợp lệ.');
 await api.assertCurrent();const info=await FileSystem.getInfoAsync(uri);if(!info.exists||info.size>MAX_BYTES||info.size<3)throw Error('Ảnh đại diện bị thiếu hoặc quá lớn. Chọn lại ảnh.');
 const encoded=await FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64});
 const raw=atob(encoded),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 if(bytes.length>MAX_BYTES||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw Error('Chọn lại ảnh đại diện để chuyển sang JPEG.');
 const path=canonicalId+'/'+Crypto.randomUUID()+'.jpg';await api.assertCurrent();
 const{error}=await api.client.storage.from(BUCKET).upload(path,bytes,{contentType:'image/jpeg',upsert:false});if(error)throw Error('Chưa tải được ảnh đại diện. Ảnh vẫn được lưu trên máy.');
 return path;
}
export async function removeRemoteAvatar(api:Account,path:string|null){
 if(!path||!PATH.test(path))return;
 await api.client.storage.from(BUCKET).remove([path]);
}
/** Do not cache signed URLs: permission changes must take effect on the next refresh. */
export async function resolveProfileAvatar(api:Account,path:string|null|undefined):Promise<string|null>{
 if(!path)return null;if(path.startsWith('https://'))return path;
 if(!PATH.test(path))return null;await api.assertCurrent();
 const{data,error}=await api.client.storage.from(BUCKET).createSignedUrl(path,60);await api.assertCurrent();
 return error?null:data?.signedUrl||null;
}
export async function cacheOwnAvatar(api:Account,path:string):Promise<string|null>{
 if(!PATH.test(path))return null;
 const url=await resolveProfileAvatar(api,path);if(!url)return null;
 const to=directory+Crypto.randomUUID()+'.jpg';await FileSystem.makeDirectoryAsync(directory,{intermediates:true});
 try{const result=await FileSystem.downloadAsync(url,to);await api.assertCurrent();const info=await FileSystem.getInfoAsync(to);if(result.status!==200||!info.exists||info.size>MAX_BYTES)throw Error('Không thể tải ảnh hồ sơ.');return to;}
 catch(e){await FileSystem.deleteAsync(to,{idempotent:true}).catch(()=>{});throw e;}
}
