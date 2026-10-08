import {env} from '../config/env';
import type {OsmSearchResult} from './openStreetMap';

export type NearbyCategory='fuel'|'restaurant'|'cafe'|'pharmacy'|'hospital'|'parking'|'charging_station';
// Official Search API category IDs. Locations only, not prices or live availability.
export const TOMTOM_CATEGORIES:Record<NearbyCategory,string>={fuel:'7311',restaurant:'7315',cafe:'9376',pharmacy:'7326',hospital:'7321',parking:'7369,7313',charging_station:'7309'};
const cache=new Map<string,{at:number;places:OsmSearchResult[]}>();
let blockedUntil=0;
function hashId(value:string){let hash=2166136261;for(const char of value)hash=Math.imul(hash^char.charCodeAt(0),16777619);return -(hash>>>0)-1;}
export function parseTomTomPlaces(data:any):OsmSearchResult[]{
 return (Array.isArray(data?.results)?data.results:[]).flatMap((item:any)=>{
  const latitude=item.position?.lat,longitude=item.position?.lon;
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return [];
  const name=String(item.poi?.name||item.address?.freeformAddress||'').trim();if(!name)return [];
  const id=String(item.id||`${latitude},${longitude}:${name}`),address=String(item.address?.freeformAddress||'');
  const category=String(item.poi?.classifications?.[0]?.code||item.type||'place');
  return [{provider:'tomtom' as const,providerId:id,placeId:hashId(id),osmId:0,osmType:'node' as const,latitude,longitude,displayName:address&&address!==name?`${name}, ${address}`:name,category,type:category.toLowerCase(),address:{name,city:String(item.address?.municipality||''),country:String(item.address?.country||''),formatted:address},phone:item.poi?.phone?String(item.poi.phone):undefined}];
 });
}
async function requestPlaces(path:string,parameters:Record<string,string>,signal?:AbortSignal){
 if(!env.tomTomTrafficKey||Date.now()<blockedUntil)throw new Error('Place service unavailable');
 if(signal?.aborted)throw new Error('Search cancelled');
 const cacheKey=path+JSON.stringify(parameters),saved=cache.get(cacheKey);
 if(saved&&Date.now()-saved.at<600000)return saved.places;
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,12000);
 try{
  const query=new URLSearchParams({...parameters,key:env.tomTomTrafficKey,language:'vi-VN'});
  const response=await fetch(`https://api.tomtom.com/search/2/${path}.json?${query}`,{signal:controller.signal});
  if(!response.ok){if([401,403,429].includes(response.status))blockedUntil=Date.now()+300000;throw new Error('Place service unavailable');}
  const places=parseTomTomPlaces(await response.json());if(controller.signal.aborted)throw new Error('Search cancelled');
  cache.set(cacheKey,{at:Date.now(),places});if(cache.size>40)cache.delete(cache.keys().next().value!);return places;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function searchTomTomPlaces(query:string,position?:{latitude:number;longitude:number},signal?:AbortSignal){
 if(query.trim().length<2)return Promise.resolve([]);
 return requestPlaces(`search/${encodeURIComponent(query.trim())}`,{limit:'10',typeahead:'true',...(position?{lat:position.latitude.toFixed(3),lon:position.longitude.toFixed(3)}:{})},signal);
}
export function nearbyTomTomPlaces(latitude:number,longitude:number,category?:NearbyCategory,signal?:AbortSignal){
 if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)return Promise.resolve([]);
 return requestPlaces('nearbySearch/',{lat:latitude.toFixed(3),lon:longitude.toFixed(3),radius:category?'5000':'2000',limit:category?'20':'40',categorySet:category?TOMTOM_CATEGORIES[category]:Object.values(TOMTOM_CATEGORIES).join(',')},signal);
}
