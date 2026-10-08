import*as Crypto from'expo-crypto';
import*as FS from'expo-file-system/legacy';
import{getDb}from'../db/database';
import{signProof,encryptPrivate,decryptPrivate}from'./platformCapabilities';
import type{LocationPoint}from'../types/location';
async function history(days:number){
 if(![7,30,90].includes(days))throw new Error('Khoảng xuất không hợp lệ.');
 const db=await getDb();const points=await db.getAllAsync<LocationPoint>('SELECT latitude,longitude,accuracy,altitude,speed,heading,timestamp FROM location_points WHERE timestamp>=? AND timestamp<=? ORDER BY timestamp ASC LIMIT 50001',Date.now()-days*86400000,Date.now());
 if(points.length>50000)throw new Error('Vượt 50.000 điểm. Chọn khoảng thời gian ngắn hơn để xuất.');
 return points;
}
export async function createLocationProof(days=30){
 const points=await history(days);
 let previous='0'.repeat(64);const chain:Array<{point:LocationPoint;previous:string;hash:string}>=[];
 for(const point of points){const hash=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,previous+'\n'+JSON.stringify(point));chain.push({point,previous,hash});previous=hash;}
 const manifest={format:'mymap-proof-v1',algorithm:'SHA-256',createdAt:new Date().toISOString(),periodDays:days,count:chain.length,root:previous};
 const manifestText=JSON.stringify(manifest),signature=await signProof(manifestText);
 const bundle={manifest,manifestText,...signature,chain};const uri=FS.documentDirectory+`MyMap-proof-${Date.now()}.json`;await FS.writeAsStringAsync(uri,JSON.stringify(bundle));return uri;
}
export async function exportEncryptedHistory(days=30){const points=await history(days);const payload=await encryptPrivate({format:'mymap-history-v1',periodDays:days,points});const uri=FS.documentDirectory+`MyMap-private-${Date.now()}.json`;await FS.writeAsStringAsync(uri,JSON.stringify({format:'mymap-vault-v1',cipher:'AES-GCM',payload}));return uri;}
export async function inspectEncryptedHistory(uri:string){const bundle=JSON.parse(await FS.readAsStringAsync(uri));if(bundle.format!=='mymap-vault-v1')throw new Error('Tệp không hợp lệ.');return decryptPrivate<{format:string;points:LocationPoint[]}>(bundle.payload);}
