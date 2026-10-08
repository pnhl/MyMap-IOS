import AsyncStorage from '@react-native-async-storage/async-storage';
import {distanceMeters} from '../utils/geo';
import type {LocationPoint} from '../types/location';

export interface ScratchHexCell {
  key: string; q: number; r: number; centerLat: number; centerLon: number; unlockedAt: number; isNew?: boolean;
}
export interface CityNights {cityName: string; nightsCount: number; lastStayMs: number}
export interface ExplorationStats {
  unlockedCellsCount: number; exploredAreaKm2: number; newCellsSinceLastSession: number;
}
// Rebuild the old independently rounded grid from GPS, preserving the original history.
const SCRATCH_STORAGE_KEY = 'mymap.scratch_cells.v3';
const LAST_SESSION_TIMESTAMP_KEY = 'mymap.scratch_last_session.v1';
const RADIUS = 6371000, SIZE = 250, RAD = Math.PI / 180;
// Axial hexagons in a cylindrical equal-area projection; area per cell is constant.
export function coordsToHex(lat: number, lon: number) {
  const x = RADIUS * lon * RAD, y = RADIUS * Math.sin(lat * RAD);
  const aq = (Math.sqrt(3) / 3 * x - y / 3) / SIZE, ar = 2 * y / (3 * SIZE);
  let q = Math.round(aq), r = Math.round(ar), s = Math.round(-aq-ar);
  const dq = Math.abs(q-aq), dr = Math.abs(r-ar), ds = Math.abs(s+aq+ar);
  if (dq > dr && dq > ds) q = -r-s;
  else if (dr > ds) r = -q-s;
  return {q, r, key: q+':'+r};
}
function unproject(x: number, y: number) {
  return {lat: Math.asin(Math.max(-1, Math.min(1, y / RADIUS))) / RAD, lon: x / (RADIUS * RAD)};
}
export function hexToCoords(q: number, r: number) {
  return unproject(SIZE * Math.sqrt(3) * (q+r/2), SIZE * 1.5 * r);
}
export function hexToPolygonCoords(q: number, r: number): [number, number][] {
  const x = SIZE * Math.sqrt(3) * (q+r/2), y = SIZE * 1.5 * r;
  return Array.from({length: 6}, (_, i) => {
    const angle = (60*i-30)*RAD, p = unproject(x+SIZE*Math.cos(angle), y+SIZE*Math.sin(angle));
    return [p.lat, p.lon];
  });
}
const valid = (p: {latitude: number; longitude: number; accuracy?: number | null}) =>
  Number.isFinite(p.latitude) && Math.abs(p.latitude) < 85 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180 &&
  (p.accuracy == null || (Number.isFinite(p.accuracy) && p.accuracy >= 0 && p.accuracy <= 100));
export async function getUnlockedHexCells(): Promise<ScratchHexCell[]> {
  try {
    const raw = JSON.parse(await AsyncStorage.getItem(SCRATCH_STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(c => c && Number.isInteger(c.q) && Number.isInteger(c.r) &&
      c.key === c.q+':'+c.r && Number.isFinite(c.unlockedAt) && valid({latitude:c.centerLat,longitude:c.centerLon})) : [];
  } catch {return [];}
}
let scratchOperation: Promise<unknown> = Promise.resolve();
export function processAndSaveScratchPoints(points: LocationPoint[]): Promise<{allCells: ScratchHexCell[]; newlyUnlocked: number}> {
  const operation = scratchOperation.then(async () => {
    const existing = await getUnlockedHexCells();
    const lastViewed = Number(await AsyncStorage.getItem(LAST_SESSION_TIMESTAMP_KEY)) || 0;
    const cells = new Map(existing.map(c => [c.key, {...c, isNew:c.unlockedAt > lastViewed}]));
    let newlyUnlocked = 0;
    for (const p of points) {
      if (!valid(p) || !Number.isFinite(p.timestamp)) continue;
      const {q,r,key} = coordsToHex(p.latitude,p.longitude);
      if (cells.has(key)) continue;
      const center = hexToCoords(q,r);
      cells.set(key,{key,q,r,centerLat:center.lat,centerLon:center.lon,unlockedAt:p.timestamp,isNew:p.timestamp>lastViewed});
      newlyUnlocked++;
    }
    const allCells = [...cells.values()];
    await AsyncStorage.setItem(SCRATCH_STORAGE_KEY,JSON.stringify(allCells));
    return {allCells,newlyUnlocked};
  });
  scratchOperation = operation.catch(() => {});
  return operation;
}
export async function markScratchSessionViewed() {
  await AsyncStorage.setItem(LAST_SESSION_TIMESTAMP_KEY,String(Date.now()));
}
export function computeExplorationStats(cells: ScratchHexCell[]): ExplorationStats {
  const unique = [...new Map(cells.map(c => [c.key,c])).values()];
  return {unlockedCellsCount:unique.length, exploredAreaKm2:unique.length * 3*Math.sqrt(3)/2*SIZE*SIZE/1e6,
    newCellsSinceLastSession:unique.filter(c=>c.isNew).length};
}
/** Name stays only from known nearby places; otherwise show their GPS coordinates. */
export function computeCityNights(points: LocationPoint[], places: {latitude:number;longitude:number;placeName?:string|null}[] = []): CityNights[] {
  const nights = new Map<string,{dates:Set<string>;lastStay:number}>();
  for (const p of points) {
    if (!valid(p)) continue;
    const date = new Date(p.timestamp), hour = date.getHours();
    if (hour < 23 && hour >= 6) continue;
    if (hour < 6) date.setDate(date.getDate()-1);
    const hex = coordsToHex(p.latitude,p.longitude), center = hexToCoords(hex.q,hex.r);
    const nearby = places.filter(x=>x.placeName&&valid(x)&&distanceMeters(x,p)<1000).sort((a,b)=>distanceMeters(a,p)-distanceMeters(b,p))[0];
    const cityName = nearby?.placeName || 'Khu vực '+center.lat.toFixed(3)+', '+center.lon.toFixed(3);
    const entry = nights.get(cityName) || {dates:new Set<string>(),lastStay:p.timestamp};
    entry.dates.add(date.getFullYear()+'-'+(date.getMonth()+1)+'-'+date.getDate());
    entry.lastStay = Math.max(entry.lastStay,p.timestamp);
    nights.set(cityName,entry);
  }
  return [...nights.entries()].map(([cityName,x])=>({cityName,nightsCount:x.dates.size,lastStayMs:x.lastStay})).sort((a,b)=>b.nightsCount-a.nightsCount);
}
export function compareScratchWithFriends(userCellCount:number,friends:{id:string;displayName:string;avatarUrl?:string|null;unlockedCells?:number}[]) {
  return [{id:'me',name:'Bạn',avatarUrl:null as string|null,cells:userCellCount,isMe:true},
    ...friends.filter(f=>Number.isSafeInteger(f.unlockedCells)&&f.unlockedCells!>=0).map(f=>({id:f.id,name:f.displayName,avatarUrl:f.avatarUrl??null,cells:f.unlockedCells!,isMe:false}))]
    .sort((a,b)=>b.cells-a.cells);
}
