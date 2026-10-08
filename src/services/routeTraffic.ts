import {env} from '../config/env';
import {evaluateRouteProximity,pointAlongRoute,navigationDistanceMeters} from '../utils/navigation';
export type TrafficSegment={id:string;coordinates:[number,number][];currentSpeed:number;freeFlowSpeed:number;closed:boolean;updatedAt:number};
export type RouteTraffic={status:'unconfigured'|'available'|'partial'|'unavailable';segments:TrafficSegment[];sampledPoints:number;updatedAt:number|null};
export function parseTrafficSegment(data:any,routes:[number,number][][]):TrafficSegment|null{
 const flow=data?.flowSegmentData;if(!flow)return null;
 const currentSpeed=Number(flow.currentSpeed),freeFlowSpeed=Number(flow.freeFlowSpeed),confidence=Number(flow.confidence);
 if(!Number.isFinite(currentSpeed)||currentSpeed<0||!Number.isFinite(freeFlowSpeed)||freeFlowSpeed<=0||!Number.isFinite(confidence)||confidence<.7)return null;
 if(!flow.roadClosure&&currentSpeed/freeFlowSpeed>.5)return null;
 const coordinates:[number,number][]=(flow.coordinates?.coordinate??[]).filter((p:any)=>Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180).map((p:any)=>[p.latitude,p.longitude]);
 if(coordinates.length<2)return null;
 // Do not paint a nearby crossing/parallel road as congestion on this route.
 const onRoute=routes.some(route=>coordinates.every(([latitude,longitude])=>(evaluateRouteProximity({latitude,longitude},route)?.distanceMeters??Infinity)<35));
 if(!onRoute)return null;
 return {id:JSON.stringify(coordinates),coordinates,currentSpeed,freeFlowSpeed,closed:flow.roadClosure===true,updatedAt:Date.now()};
}
export function trafficSamplePoints(routes:[number,number][][]):{latitude:number;longitude:number}[]{
 const points:{latitude:number;longitude:number}[]=[];
 for(const route of routes){let total=0;for(let i=1;i<route.length;i++)total+=navigationDistanceMeters({latitude:route[i-1]![0],longitude:route[i-1]![1]},{latitude:route[i]![0],longitude:route[i]![1]});
  for(const fraction of [.25,.75]){const point=pointAlongRoute(route,total*fraction)?.coordinate;if(point&&!points.some(other=>navigationDistanceMeters(point,other)<150))points.push(point);}
 }return points.slice(0,6);
}
export async function fetchRouteTraffic(routes:[number,number][][],signal?:AbortSignal):Promise<RouteTraffic>{
 if(!env.tomTomTrafficKey)return {status:'unconfigured',segments:[],sampledPoints:0,updatedAt:null};
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();const timer=setTimeout(abort,14000);
 try{const points=trafficSamplePoints(routes);const results=await Promise.allSettled(points.map(async point=>{const params=new URLSearchParams({key:env.tomTomTrafficKey,point:`${point.latitude},${point.longitude}`,unit:'kmph'});const response=await fetch(`https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/16/json?${params}`,{signal:controller.signal});if(!response.ok)throw new Error('Traffic unavailable');return parseTrafficSegment(await response.json(),routes);}));
  if(controller.signal.aborted)throw new Error('Traffic cancelled');const fulfilled=results.filter(r=>r.status==='fulfilled'),segments=results.flatMap(r=>r.status==='fulfilled'&&r.value?[r.value]:[]);const seen=new Set<string>();
  return {status:fulfilled.length===points.length?'available':fulfilled.length?'partial':'unavailable',segments:segments.filter(s=>{if(seen.has(s.id))return false;seen.add(s.id);return true;}),sampledPoints:points.length,updatedAt:Date.now()};
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
