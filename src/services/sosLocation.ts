import * as Location from 'expo-location';
import {getDeviceCurrentPosition,watchDevicePosition} from './platformLocation';

export type SosLocation = {latitude:number;longitude:number;accuracy:number|null;timestamp:number};
function recent(position:Location.LocationObject|null):position is Location.LocationObject {
  return !!position && Number.isFinite(position.coords.latitude) && Number.isFinite(position.coords.longitude)
    && Date.now()-position.timestamp<=120000 && (position.coords.accuracy ?? 150)<=150;
}
function coordinates(position:Location.LocationObject):SosLocation {
  return {latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp};
}
async function available(){
  const permission=await Location.requestForegroundPermissionsAsync();
  if(!permission.granted)throw Error('Chưa cấp quyền vị trí. Bạn vẫn có thể mở số khẩn cấp bên dưới.');
  if(!await Location.hasServicesEnabledAsync())throw Error('Hãy bật dịch vụ vị trí. Bạn vẫn có thể mở số khẩn cấp bên dưới.');
}
async function freshPosition():Promise<Location.LocationObject|null> {
  return getDeviceCurrentPosition({accuracy:Location.Accuracy.High,timeoutMs:6000}).catch(()=>null);
}
export async function getSosLocation():Promise<SosLocation> {
  await available();
  const fresh=await freshPosition();
  if(recent(fresh))return coordinates(fresh);
  const cached=await Location.getLastKnownPositionAsync({maxAge:120000,requiredAccuracy:150}).catch(()=>null);
  if(recent(cached))return coordinates(cached);
  throw Error('Chưa nhận được vị trí mới. Bạn vẫn có thể gọi số khẩn cấp.');
}

/** Starts on screen focus. Cleanup is safe even when permissions/watch setup are still pending. */
export function startAutoSosLocation(onLocation:(position:SosLocation)=>void,onError:(message:string)=>void):()=>void {
  let active=true;
  let subscription:Location.LocationSubscription|undefined;
  const publish=(position:Location.LocationObject|null)=>{if(active && recent(position))onLocation(coordinates(position));};
  void (async()=>{
    await available();
    if(!active)return;
    publish(await Location.getLastKnownPositionAsync({maxAge:120000,requiredAccuracy:150}).catch(()=>null));
    if(!active)return;
    const watch=await watchDevicePosition({accuracy:Location.Accuracy.High,timeInterval:5000,distanceInterval:5},publish,message=>{if(active)onError(message);});
    if(!active){watch.remove();return;}
    subscription=watch;
  })().catch(error=>{if(active)onError(error instanceof Error?error.message:String(error));});
  return ()=>{active=false;subscription?.remove();};
}
