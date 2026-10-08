import Native from '../../modules/my-map-capabilities';
import {getDb} from '../db/database';
import type {PhotoPin} from '../types/photo';
import type {PhotoInsight} from '../utils/mediaInsights';
let setup:Promise<void>|null=null;
async function database(){const db=await getDb();setup??=db.execAsync('CREATE TABLE IF NOT EXISTS photo_insights(photo_id INTEGER PRIMARY KEY,uri TEXT NOT NULL,payload TEXT NOT NULL);').catch(e=>{setup=null;throw e;});await setup;return db;}
export async function getPhotoInsights(){const db=await database();return(await db.getAllAsync<{payload:string}>('SELECT payload FROM photo_insights')).map(r=>JSON.parse(r.payload)as PhotoInsight);}
export async function analyzeLocalPhoto(photo:PhotoPin){if(!Native)throw new Error('Cần bản native có công cụ ảnh để phân tích.');const result=await Native.analyzePhoto(photo.uri);const data:PhotoInsight={...result,photoId:photo.id,uri:photo.uri,analyzedAt:Date.now()};const db=await database();await db.runAsync('INSERT INTO photo_insights(photo_id,uri,payload) VALUES(?,?,?) ON CONFLICT(photo_id) DO UPDATE SET uri=excluded.uri,payload=excluded.payload',photo.id,photo.uri,JSON.stringify(data));return data;}
export async function clearPhotoInsights(){const db=await database();await db.runAsync('DELETE FROM photo_insights');}
