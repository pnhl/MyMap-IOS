import {env} from '../config/env';
import {validCoordinate} from '../utils/catalogRules';
export type RangeOrigin={latitude:number;longitude:number;name:string};
export type ReachableRange={center:{latitude:number;longitude:number};boundary:[number,number][];calculatedAt:number;minutes:number;mode:'car'|'motorbike'};
const cache=new Map<string,ReachableRange>();
let blockedUntil=0;
export function parseReachableRange(data:unknown):Pick<ReachableRange,'center'|'boundary'>{
 const range=(data as any)?.reachableRange,center=range?.center;
 if(!center||!validCoordinate(center.latitude,center.longitude)||!Array.isArray(range.boundary)||range.boundary.length<3||range.boundary.length>20000)throw new Error('TomTom chưa trả về vùng đi tới hợp lệ.');
 const boundary=range.boundary.map((point:any):[number,number]=>{if(!point||!validCoordinate(point.latitude,point.longitude))throw new Error('Dữ liệu vùng đi tới không hợp lệ.');return[point.latitude,point.longitude];});
 if(new Set(boundary.map((point:[number,number])=>point.join(','))).size<3)throw new Error('Dữ liệu vùng đi tới không hợp lệ.');
 if(boundary[0]![0]!==boundary.at(-1)![0]||boundary[0]![1]!==boundary.at(-1)![1])boundary.push([...boundary[0]!]);
 return{center:{latitude:center.latitude,longitude:center.longitude},boundary};
}
export async function calculateReachableRange(origin:RangeOrigin,minutes:number,mode:'car'|'motorbike',signal?:AbortSignal):Promise<ReachableRange>{
 if(!validCoordinate(origin.latitude,origin.longitude)||![10,15,30,45,60].includes(minutes)||!['car','motorbike'].includes(mode))throw new Error('Chọn vị trí, phương tiện và thời gian hợp lệ.');
 if(!env.tomTomTrafficKey)throw new Error('Bản ứng dụng chưa cấu hình dịch vụ vùng đi tới.');
 if(signal?.aborted)throw new Error('Đã hủy tính vùng đi tới.');
 const key=`${origin.latitude.toFixed(6)},${origin.longitude.toFixed(6)}:${minutes}:${mode}`,saved=cache.get(key);
 if(saved&&Date.now()-saved.calculatedAt<300000)return saved;
 if(Date.now()<blockedUntil)throw new Error('TomTom đang hạn chế yêu cầu. Hãy thử lại sau 5 phút.');
 const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,20000);signal?.addEventListener('abort',abort,{once:true});
 try{
  const parameters=new URLSearchParams({key:env.tomTomTrafficKey,timeBudgetInSec:String(minutes*60),travelMode:mode==='motorbike'?'motorcycle':'car',routeType:'fastest',traffic:'true',departAt:'now'});
  const response=await fetch(`https://api.tomtom.com/routing/1/calculateReachableRange/${origin.latitude},${origin.longitude}/json?${parameters}`,{signal:controller.signal});
  if(!response.ok){if([401,403,429].includes(response.status))blockedUntil=Date.now()+300000;throw new Error(response.status===429?'TomTom đã giới hạn yêu cầu. Thử lại sau.':[401,403].includes(response.status)?'Dịch vụ vùng đi tới chưa được cấp quyền cho khóa TomTom này.':'Chưa tính được vùng đi tới. Kiểm tra mạng và thử lại.');}
  const parsed=parseReachableRange(await response.json());if(controller.signal.aborted)throw new Error('Đã hủy tính vùng đi tới.');
  const result={...parsed,calculatedAt:Date.now(),minutes,mode};cache.set(key,result);if(cache.size>20)cache.delete(cache.keys().next().value!);return result;
 }catch(e){if(controller.signal.aborted)throw new Error(signal?.aborted?'Đã hủy tính vùng đi tới.':'TomTom phản hồi chậm. Hãy thử lại.');throw e;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
