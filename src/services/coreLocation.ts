import {AppState} from 'react-native';
import * as Location from 'expo-location';
type Consumer = {options:Location.LocationOptions;onLocation:(point:Location.LocationObject)=>void;onError?:(message:string)=>void};
const consumers = new Map<symbol,Consumer>();
let source:Location.LocationSubscription|null=null,sourceKey='';
let operations:Promise<unknown>=Promise.resolve();
let stateSubscription:ReturnType<typeof AppState.addEventListener>|null=null;
export async function isAmazonLocationDevice(){return false;}
export async function shouldUsePlatformLocation(){return false;}
export async function getPlatformCurrentPosition(){return getDeviceCurrentPosition().catch(()=>null);}
function reconcile():Promise<void> {
 const next=operations.then(async()=>{
  const clients=AppState.currentState==null||AppState.currentState==='active'?[...consumers.values()]:[];
  if(!clients.length){source?.remove();source=null;sourceKey='';return;}
  const distanceInterval=Math.min(...clients.map(c=>c.options.distanceInterval??5));
  const accuracy=Math.max(...clients.map(c=>c.options.accuracy??Location.Accuracy.High));
  const key=`${distanceInterval}:${accuracy}`;
  if(source&&sourceKey===key)return;
  source?.remove();source=null;sourceKey='';
  source=await Location.watchPositionAsync({distanceInterval,accuracy},point=>{
   if(AppState.currentState!=null&&AppState.currentState!=='active')return;
   for(const client of [...consumers.values()])client.onLocation(point);
  },message=>{for(const client of [...consumers.values()])client.onError?.(message);});
  sourceKey=key;
 });
 operations=next.catch(()=>{});return next;
}
export async function watchDevicePosition(options:Location.LocationOptions,onLocation:Consumer['onLocation'],onError?:Consumer['onError']):Promise<Location.LocationSubscription>{
 const id=Symbol('location-consumer');consumers.set(id,{options,onLocation,onError});
 if(!stateSubscription)stateSubscription=AppState.addEventListener('change',()=>{void reconcile().catch(error=>{for(const c of consumers.values())c.onError?.(String(error));});});
 const remove=()=>{if(!consumers.delete(id))return;if(!consumers.size){stateSubscription?.remove();stateSubscription=null;}void reconcile().catch(()=>{});};
 try{await reconcile();}catch(error){remove();throw error;}return{remove};
}
export async function getDeviceCurrentPosition(options:Location.LocationOptions&{timeoutMs?:number}={}):Promise<Location.LocationObject>{
 const {timeoutMs=10000,...watchOptions}=options;
 return new Promise((resolve,reject)=>{
  let finished=false,subscription:Location.LocationSubscription|undefined;
  const finish=(point:Location.LocationObject|null,error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);subscription?.remove();if(point)resolve(point);else reject(error||Error('Chưa nhận được tín hiệu GPS.'));};
  const timer=setTimeout(()=>finish(null,Error('Đang chờ tín hiệu GPS.')),timeoutMs);
  void watchDevicePosition({accuracy:Location.Accuracy.High,distanceInterval:0,...watchOptions},point=>{if(Date.now()-point.timestamp<=120000)finish(point);},message=>finish(null,Error(message)))
   .then(watch=>{subscription=watch;if(finished)watch.remove();},error=>finish(null,error));
 });
}
export async function startPlatformLocationUpdates(intervalMs:number,distanceMeters:number,onLocation:Consumer['onLocation']):Promise<()=>Promise<void>>{
 const subscription=await watchDevicePosition({timeInterval:intervalMs,distanceInterval:distanceMeters},onLocation);return async()=>subscription.remove();
}
export function watchNavigationPosition(onLocation:Consumer['onLocation']){return watchDevicePosition({accuracy:Location.Accuracy.High,distanceInterval:2},onLocation);}
