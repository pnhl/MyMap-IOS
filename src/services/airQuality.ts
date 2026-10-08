import {accountApi} from './accountApi';
import {extensionSnapshot,initializeExtensions} from './extensionPreferences';
import {AIR_FIELDS,parseAirQuality,type AirQuality} from '../utils/airQuality';
const cache=new Map<string,{at:number;value:AirQuality}>();
export async function fetchAirQuality(latitude:number,longitude:number):Promise<AirQuality>{
 await initializeExtensions();if(!extensionSnapshot().airQuality)throw Error('Bật dự báo chất lượng không khí trong Cài đặt trước.');
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude< -90||latitude>90||longitude< -180||longitude>180)throw Error('Tọa độ không hợp lệ.');
 const id=latitude.toFixed(2)+','+longitude.toFixed(2),hit=cache.get(id);if(hit&&Date.now()-hit.at<15*60000)return hit.value;
 let raw:unknown;
 try{const api=await accountApi();const{data,error}=await api.client.functions.invoke('mymap-environment',{body:{kind:'air',latitude,longitude},timeout:12000});await api.assertCurrent();if(error)throw error;raw=data;}
 catch{if(!__DEV__)throw Error('Dự báo chưa khả dụng. Kiểm tra đăng nhập/mạng; bản phát hành cần cấu hình Open-Meteo phù hợp với ứng dụng có quảng cáo.');
 const url=new URL('https://air-quality-api.open-meteo.com/v1/air-quality');url.searchParams.set('latitude',String(Math.round(latitude*100)/100));url.searchParams.set('longitude',String(Math.round(longitude*100)/100));url.searchParams.set('current',AIR_FIELDS.join(','));url.searchParams.set('hourly',AIR_FIELDS.join(','));url.searchParams.set('timeformat','unixtime');url.searchParams.set('timezone','GMT');url.searchParams.set('forecast_days','3');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('Chưa tải được dữ liệu dự báo.');raw=await response.json();}finally{clearTimeout(timer);}}
 const value=parseAirQuality(raw);if(cache.size>=50)cache.delete(cache.keys().next().value!);cache.set(id,{at:Date.now(),value});return value;
}
