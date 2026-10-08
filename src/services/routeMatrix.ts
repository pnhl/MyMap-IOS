import {env} from '../config/env';
import {validCoordinate} from '../utils/catalogRules';
export type MatrixPlace={name:string;latitude:number;longitude:number};
export type MatrixCell={originIndex:number;destinationIndex:number;distanceMeters:number|null;seconds:number|null;delaySeconds:number|null;error:string|null};
export type RouteMatrix={cells:MatrixCell[];calculatedAt:number};
const cache=new Map<string,RouteMatrix>();let blockedUntil=0;
export function parseRouteMatrix(payload:unknown,origins:number,destinations:number):MatrixCell[]{
 const data=(payload as any)?.data;if(!Array.isArray(data)||data.length>origins*destinations)throw new Error('Dữ liệu so sánh tuyến không hợp lệ.');
 const cells:Array<MatrixCell>=Array.from({length:origins*destinations},(_,i)=>({originIndex:Math.floor(i/destinations),destinationIndex:i%destinations,distanceMeters:null,seconds:null,delaySeconds:null,error:'Chưa có kết quả tuyến này.'})),seen=new Set<number>();
 for(const value of data){const o=value?.originIndex,d=value?.destinationIndex;
  if(!Number.isInteger(o)||!Number.isInteger(d)||o<0||o>=origins||d<0||d>=destinations||seen.has(o*destinations+d))throw new Error('Chỉ số tuyến trả về không hợp lệ.');seen.add(o*destinations+d);
  const summary=value.routeSummary;
  if(!value.detailedError&&summary&&Number.isFinite(summary.lengthInMeters)&&summary.lengthInMeters>=0&&Number.isFinite(summary.travelTimeInSeconds)&&summary.travelTimeInSeconds>=0){cells[o*destinations+d]={originIndex:o,destinationIndex:d,distanceMeters:summary.lengthInMeters,seconds:summary.travelTimeInSeconds,delaySeconds:Number.isFinite(summary.trafficDelayInSeconds)&&summary.trafficDelayInSeconds>=0?summary.trafficDelayInSeconds:null,error:null};}
  else cells[o*destinations+d]!.error='Không tìm được tuyến phù hợp đến địa điểm này.';
 }
 return cells;
}
export async function calculateRouteMatrix(origins:MatrixPlace[],destinations:MatrixPlace[],signal?:AbortSignal):Promise<RouteMatrix>{
 if(!origins.length||!destinations.length||origins.length>5||destinations.length>5||[...origins,...destinations].some(p=>!validCoordinate(p.latitude,p.longitude)))throw new Error('Chọn từ 1 đến 5 điểm xuất phát và điểm đến.');
 const points=[...origins,...destinations],lats=points.map(p=>p.latitude),lons=points.map(p=>p.longitude),spanLat=Math.max(...lats)-Math.min(...lats),spanLon=Math.max(...lons)-Math.min(...lons),latitude=(Math.max(...lats)+Math.min(...lats))/2;
 if(spanLat*111320>390000||spanLon*111320*Math.cos(latitude*Math.PI/180)>390000)throw new Error('So sánh các địa điểm trong cùng khu vực, rộng dưới 390 km.');
 if(!env.tomTomTrafficKey)throw new Error('Bản ứng dụng chưa cấu hình dịch vụ so sánh tuyến.');if(signal?.aborted)throw new Error('Đã hủy so sánh tuyến.');
 const point=(p:MatrixPlace)=>({point:{latitude:p.latitude,longitude:p.longitude}}),body={origins:origins.map(point),destinations:destinations.map(point),options:{routeType:'fastest',travelMode:'car',departAt:'now',traffic:'live'}},key=JSON.stringify(body),saved=cache.get(key);if(saved&&Date.now()-saved.calculatedAt<300000)return saved;
 if(Date.now()<blockedUntil)throw new Error('TomTom đang hạn chế yêu cầu. Thử lại sau 5 phút.');
 const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,25000);signal?.addEventListener('abort',abort,{once:true});
 try{const response=await fetch(`https://api.tomtom.com/routing/matrix/2?${new URLSearchParams({key:env.tomTomTrafficKey})}`,{method:'POST',headers:{'Content-Type':'application/json'},body:key,signal:controller.signal});
  if(!response.ok){if([401,403,429].includes(response.status))blockedUntil=Date.now()+300000;throw new Error([401,403].includes(response.status)?'Khóa TomTom chưa có quyền Matrix Routing hoặc đã hết hạn mức.':response.status===429?'TomTom đã giới hạn yêu cầu. Hãy thử lại sau.':'Chưa so sánh được tuyến. Kiểm tra mạng và thử lại.');}
  const cells=parseRouteMatrix(await response.json(),origins.length,destinations.length);if(controller.signal.aborted)throw new Error('Đã hủy so sánh tuyến.');const result={cells,calculatedAt:Date.now()};cache.set(key,result);if(cache.size>20)cache.delete(cache.keys().next().value!);return result;
 }catch(e){if(controller.signal.aborted)throw new Error(signal?.aborted?'Đã hủy so sánh tuyến.':'TomTom phản hồi chậm. Thử ít địa điểm hơn.');throw e;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
