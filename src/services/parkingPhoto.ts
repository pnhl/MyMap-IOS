import {File,Directory,Paths} from 'expo-file-system';
import {randomUUID} from 'expo-crypto';
function directory(){return new Directory(Paths.document,'parking_photos');}
export async function persistParkingPhoto(uri:string){
 if(!/^(file|content):\/\//.test(uri))throw new Error('Ảnh phải nằm trên thiết bị.');
 const source=new File(uri);if(!source.exists||source.size>15*1024*1024||source.size<=0)throw new Error('Ảnh không hợp lệ hoặc vượt 15 MB.');
 const dir=directory();dir.create({intermediates:true,idempotent:true});const destination=new File(dir,randomUUID()+'.jpg');source.copy(destination);return destination.uri;
}
export function deleteParkingPhoto(uri:string){const prefix=directory().uri.replace(/\/$/,'')+'/';if(!uri.startsWith(prefix)||uri.slice(prefix.length).includes('/')||uri.includes('..'))throw new Error('Ảnh nằm ngoài thư mục chỗ đỗ.');const file=new File(uri);if(file.exists)file.delete();}
