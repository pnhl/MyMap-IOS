import type {Expense} from '../types/catalog';
/** Tank-to-tank totals. An unknown fill invalidates that interval rather than guessing. */
export function measuredConsumption(vehicleId:string,category:'fuel'|'charging',expenses:Expense[]){
 const fills=expenses.filter(e=>e.vehicleId===vehicleId&&e.category===category).sort((a,b)=>a.at-b.at);
 let anchor:number|null=null,units=0,complete=true,distanceKm=0,measuredUnits=0,intervals=0;
 for(const fill of fills){
  if(anchor!==null){if(fill.quantity==null||!Number.isFinite(fill.quantity)||fill.quantity<=0)complete=false;else units+=fill.quantity;}
  if(!fill.fullFill||fill.odometerKm==null||!Number.isFinite(fill.odometerKm)||fill.odometerKm<0)continue;
  if(anchor!==null&&fill.odometerKm>anchor&&complete){distanceKm+=fill.odometerKm-anchor;measuredUnits+=units;intervals++;}
  anchor=fill.odometerKm;units=0;complete=true;
 }
 return{fills:fills.length,totalPaid:fills.reduce((n,f)=>n+f.amount,0),intervals,distanceKm,measuredUnits,per100Km:distanceKm>0?measuredUnits/distanceKm*100:null};
}
