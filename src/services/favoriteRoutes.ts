import AsyncStorage from '@react-native-async-storage/async-storage';
import {getCurrentUser} from './auth';
let writes:Promise<unknown>=Promise.resolve();
async function key(){return 'mymap.favorite-routes:' + ((await getCurrentUser())?.id||'local');}
async function read(owner:string){const raw=JSON.parse(await AsyncStorage.getItem(owner)||'[]');return Array.isArray(raw)?raw.filter((id):id is string=>typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id)).slice(0,1000):[];}
export async function getFavoriteRoutes(){const owner=await key(),ids=await read(owner);return owner===await key()?ids:[];}
export function favoriteRoute(id:string,enabled:boolean){if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('Mã chuyến đi không hợp lệ.');const target=key();const work=writes.catch(()=>{}).then(async()=>{const owner=await target;if(owner!==await key())throw new Error('Tài khoản đã thay đổi.');const ids=await read(owner),next=ids.filter(value=>value!==id);if(enabled)next.push(id);await AsyncStorage.setItem(owner,JSON.stringify(next.slice(-1000)));});writes=work;return work;}
