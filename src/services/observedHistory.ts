import {getDb} from '../db/database';
import {ObservedJourneyAccumulator} from '../utils/observedJourneyStats';
import type {LocationPoint} from '../types/location';
async function historyPages(start:number,end:number,append:(points:LocationPoint[])=>void){
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=end)throw new Error('Khoảng lịch sử không hợp lệ.');
 const db=await getDb();let cursor=start-1;
 for(;;){const points=await db.getAllAsync<LocationPoint>('SELECT latitude,longitude,accuracy,altitude,speed,heading,timestamp FROM location_points WHERE timestamp>=? AND timestamp<? AND timestamp>? ORDER BY timestamp ASC LIMIT 2048',start,end,cursor);append(points);if(points.length<2048)break;const next=points[points.length-1]!.timestamp;if(next<=cursor)throw new Error('Lịch sử GPS không tăng theo thời gian.');cursor=next;}
}
export async function observedHistory(start:number,end:number){
 const stats=new ObservedJourneyAccumulator();await historyPages(start,end,points=>stats.append(points));
 return stats.result();
}
export type ObservedDay={day:string;distanceMeters:number;visits:number;pointCount:number};
export async function dailyObservedHistory(start=0,end=Date.now()+1):Promise<ObservedDay[]>{
 const days:ObservedDay[]=[];let current='',stats=new ObservedJourneyAccumulator();
 const finish=()=>{if(!current)return;const result=stats.result();if(result.pointCount)days.push({day:current,distanceMeters:result.distanceMeters,visits:result.visits.length,pointCount:result.pointCount});};
 await historyPages(start,end,points=>{for(const point of points){const d=new Date(point.timestamp);if(!Number.isFinite(d.getTime()))continue;const day=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;if(day!==current){finish();current=day;stats=new ObservedJourneyAccumulator();}stats.append([point]);}});
 finish();return days;
}
