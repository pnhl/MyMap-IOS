import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {getCurrentUser} from './auth';
import {encryptPrivate,decryptPrivate} from './platformCapabilities';
import {initializeExtensions,extensionSnapshot} from './extensionPreferences';
import {validateOfflineRoute,type OfflineRoute} from '../utils/offlineRouteRules';
export type {OfflineRoute} from '../utils/offlineRouteRules';
let writes:Promise<unknown>=Promise.resolve();
async function context(){await initializeExtensions();if(!extensionSnapshot().offlineTrips)throw Error('Bật lưu tuyến ngoại tuyến trong Cài đặt.');const owner=(await getCurrentUser())?.id||'local';return{owner,key:'mymap.offline-routes.v1:'+encodeURIComponent(owner)};}
async function current(owner:string){if(((await getCurrentUser())?.id||'local')!==owner)throw Error('Tài khoản đã thay đổi.');}
async function read(key:string){const text=await AsyncStorage.getItem(key);if(!text)return[];if(text.length>12*1024*1024)throw Error('Dữ liệu tuyến ngoại tuyến quá lớn.');const data=await decryptPrivate<unknown>(text);if(!Array.isArray(data)||data.length>20)throw Error('Dữ liệu tuyến ngoại tuyến không hợp lệ.');for(const r of data)validateOfflineRoute(r);return data as OfflineRoute[];}
export async function offlineRoutes(){const c=await context(),data=await read(c.key);await current(c.owner);return data;}
export function saveOfflineRoute(input:Omit<OfflineRoute,'id'|'createdAt'>){const run=writes.catch(()=>{}).then(async()=>{const c=await context(),entry={...input,id:Crypto.randomUUID(),createdAt:Date.now()};validateOfflineRoute(entry);const rows=await read(c.key);if(rows.length>=20)throw Error('Đã lưu 20 tuyến. Xóa một tuyến trước khi lưu thêm.');const encrypted=await encryptPrivate([entry,...rows]);if(encrypted.length>12*1024*1024)throw Error('Tuyến vượt dung lượng lưu ngoại tuyến.');await current(c.owner);await AsyncStorage.setItem(c.key,encrypted);await current(c.owner);return entry;});writes=run;return run;}
export function deleteOfflineRoute(id:string){const run=writes.catch(()=>{}).then(async()=>{const c=await context(),rows=await read(c.key),encrypted=await encryptPrivate(rows.filter(r=>r.id!==id));await current(c.owner);await AsyncStorage.setItem(c.key,encrypted);await current(c.owner);});writes=run;return run;}
