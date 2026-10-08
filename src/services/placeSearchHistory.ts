import AsyncStorage from '@react-native-async-storage/async-storage';
import type {OsmSearchResult} from './openStreetMap';
const KEY='mymap.place_search_history.v1';
export type PlaceSearchHistoryEntry={query:string;place?:OsmSearchResult;searchedAt:number};
let writes:Promise<unknown>=Promise.resolve();
export function validSearchPlace(place:any):place is OsmSearchResult{
  return !!place&&Number.isFinite(place.latitude)&&Math.abs(place.latitude)<=90&&Number.isFinite(place.longitude)&&Math.abs(place.longitude)<=180&&typeof place.displayName==='string'&&!!place.displayName.trim()&&Number.isFinite(place.placeId);
}
export async function readPlaceSearchHistory():Promise<PlaceSearchHistoryEntry[]>{
  try{const data=JSON.parse(await AsyncStorage.getItem(KEY)||'[]');return Array.isArray(data)?data.filter(item=>typeof item?.query==='string'&&item.query.trim()&&Number.isFinite(item.searchedAt)&&(!item.place||validSearchPlace(item.place))).slice(0,12):[];}catch{return [];}
}
export function rememberPlaceSearch(query:string,place?:OsmSearchResult):Promise<void>{
  const text=query.trim().slice(0,200);if(!text||(place&&!validSearchPlace(place)))return Promise.resolve();
  const next=writes.catch(()=>{}).then(async()=>{const list=await readPlaceSearchHistory();const filtered=list.filter(item=>item.query.toLocaleLowerCase()!==text.toLocaleLowerCase()&&(!place||!item.place||item.place.latitude!==place.latitude||item.place.longitude!==place.longitude));await AsyncStorage.setItem(KEY,JSON.stringify([{query:text,place,searchedAt:Date.now()},...filtered].slice(0,12)));});writes=next;return next;
}
export function clearPlaceSearchHistory():Promise<void>{const next=writes.catch(()=>{}).then(()=>AsyncStorage.removeItem(KEY));writes=next;return next;}
export function familiarSearchPlace(name:string,latitude:number,longitude:number):OsmSearchResult{
  const id=-Math.abs(Math.round(latitude*10000)*1000000+Math.round(longitude*10000));
  return {placeId:id,osmId:id,osmType:'node',latitude,longitude,displayName:name,category:'saved',type:'saved',address:{name}};
}
export function uniqueSearchPlaces(places:OsmSearchResult[]):OsmSearchResult[]{
  const seen=new Set<string>();return places.filter(place=>{if(!validSearchPlace(place))return false;const key=`${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}`;if(seen.has(key))return false;seen.add(key);return true;});
}
