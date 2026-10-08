import type {LocationPoint,Visit} from '../types/location';
import {distanceMeters} from './geo';
function valid(p:LocationPoint){return Number.isFinite(p.timestamp)&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180&&(p.accuracy==null||p.accuracy>=0&&p.accuracy<=100);}
/** Accept chronological pages without retaining every GPS fix in memory. */
export class ObservedJourneyAccumulator {
 private previous:LocationPoint|null=null;
 private visit:{first:number;last:number;latitudeSum:number;longitudeSum:number;count:number}|null=null;
 private visits:Visit[]=[];
 private meters=0;
 private milliseconds=0;
 private count=0;
 private closeVisit(open=false){const v=this.visit;if(!v)return;const durationMs=v.last-v.first;if(durationMs>=5*60000)this.visits.push({id:v.first+'-'+v.last,latitude:v.latitudeSum/v.count,longitude:v.longitudeSum/v.count,arrivedAt:v.first,leftAt:open&&Date.now()>=v.last&&Date.now()-v.last<15*60000?null:v.last,durationMs,pointCount:v.count});this.visit=null;}
 append(points:LocationPoint[]){for(const p of points){if(!valid(p))continue;this.count++;const previous=this.previous;
  if(previous){const elapsed=p.timestamp-previous.timestamp;if(elapsed<=0)continue;const meters=distanceMeters(previous,p);
   if(elapsed>120000||meters/elapsed*3600>220)this.closeVisit();else{this.meters+=meters;this.milliseconds+=elapsed;}
  }
  const v=this.visit;if(v&&distanceMeters({latitude:v.latitudeSum/v.count,longitude:v.longitudeSum/v.count},p)>120)this.closeVisit();
  if(this.visit){this.visit.last=p.timestamp;this.visit.latitudeSum+=p.latitude;this.visit.longitudeSum+=p.longitude;this.visit.count++;}
  else this.visit={first:p.timestamp,last:p.timestamp,latitudeSum:p.latitude,longitudeSum:p.longitude,count:1};
  this.previous=p;
 }}
 result(){this.closeVisit(true);return{distanceMeters:this.meters,observedMinutes:this.milliseconds/60000,visits:this.visits,pointCount:this.count};}
}
export function observedJourneyStats(points:LocationPoint[]){const result=new ObservedJourneyAccumulator();result.append([...points].sort((a,b)=>a.timestamp-b.timestamp));return result.result();}
