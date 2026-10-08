import {env} from '../config/env';
import type {OsmSearchResult} from './openStreetMap';
import {nearbyTomTomPlaces,type NearbyCategory} from './tomTomPlaces';
export type MapPlace=OsmSearchResult&{kind:NearbyCategory|'traffic_sign'|'street_image'|'infrastructure'|'dead_end'|'road_report'};
const cache=new Map<string,{at:number;places:MapPlace[]}>();
export function parseMapPlaces(data:any):MapPlace[]{
 const names:Record<NearbyCategory,string>={fuel:'Cây xăng',restaurant:'Quán ăn',cafe:'Cà phê',pharmacy:'Nhà thuốc',hospital:'Bệnh viện',parking:'Bãi đỗ xe',charging_station:'Trạm sạc EV'};
 return (Array.isArray(data?.elements)?data.elements:[]).flatMap((item:any)=>{
  const kind=item.tags?.amenity as NearbyCategory,latitude=item.lat??item.center?.lat,longitude=item.lon??item.center?.lon;
  if(!(kind in names)||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return [];
  const name=String(item.tags.name||item.tags.brand||names[kind]);
  return [{kind,placeId:item.id,osmId:item.id,osmType:item.type,latitude,longitude,displayName:name,category:'amenity',type:kind,address:{name}}];
 }).slice(0,80);
}
export async function getNearbyMapPlaces(latitude:number,longitude:number,signal?:AbortSignal):Promise<MapPlace[]>{
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return [];
 const key=`${latitude.toFixed(2)},${longitude.toFixed(2)}`,saved=cache.get(key);
 if(saved&&Date.now()-saved.at<600000)return saved.places;
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
 const timer=setTimeout(abort,14000);
 try{
  if(env.tomTomTrafficKey){try{const found=await nearbyTomTomPlaces(latitude,longitude,undefined,controller.signal);const places:MapPlace[]=found.map(place=>{const category=place.category?.toLowerCase()||'';const kind:NearbyCategory=(category.includes('charging')||category.includes('electric_vehicle'))?'charging_station':category.includes('parking')?'parking':category.includes('gas')||category.includes('petrol')?'fuel':category.includes('cafe')?'cafe':category.includes('pharmacy')?'pharmacy':category.includes('hospital')?'hospital':'restaurant';return {...place,kind};});cache.set(key,{at:Date.now(),places});if(cache.size>12)cache.delete(cache.keys().next().value!);return places;}catch{if(controller.signal.aborted)throw new Error('POI cancelled');}}
  const data=`[out:json][timeout:8];nwr(around:2000,${latitude},${longitude})[amenity~"^(fuel|restaurant|cafe|pharmacy|hospital|parking|charging_station)$"];out center 80;`;
  const response=await fetch(env.osmOverpassUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data}).toString(),signal:controller.signal});if(!response.ok)throw new Error('POI unavailable');
  const places=parseMapPlaces(await response.json());if(controller.signal.aborted)throw new Error('POI cancelled');cache.set(key,{at:Date.now(),places});if(cache.size>12)cache.delete(cache.keys().next().value!);return places;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
