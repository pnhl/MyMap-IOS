import type{LocationPoint}from'../types/location';
import{deriveVisits,distanceMeters}from'./geo';

export function localDayKey(timestamp:number){const d=new Date(timestamp);const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return`${y}-${m}-${day}`;}

export function groupPointsByLocalDay(points:LocationPoint[]){const days=new Map<string,LocationPoint[]>();for(const p of points){const k=localDayKey(p.timestamp);const list=days.get(k)||[];list.push(p);days.set(k,list)}for(const list of days.values())list.sort((a,b)=>a.timestamp-b.timestamp);return days;}

export function distanceWithinLocalDays(points:LocationPoint[]){let total=0;for(const list of groupPointsByLocalDay(points).values())for(let i=1;i<list.length;i++)total+=distanceMeters(list[i-1]!,list[i]!);return total;}

export function visitsWithinLocalDays(points:LocationPoint[]){let total=0;for(const list of groupPointsByLocalDay(points).values())total+=deriveVisits(list).length;return total;}
