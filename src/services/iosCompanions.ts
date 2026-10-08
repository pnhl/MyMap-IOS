import {requireOptionalNativeModule} from 'expo';
import {AppState,DeviceEventEmitter} from 'react-native';
import * as Notifications from 'expo-notifications';
import {extensionSnapshot,initializeExtensions,subscribeExtensions} from './extensionPreferences';
import {subscribeAuthState} from './auth';
type CompanionEvents={onWatchSOS:()=>void;onCarStop:()=>void};
type CompanionModule={
 addListener<E extends keyof CompanionEvents>(event:E,listener:CompanionEvents[E]):{remove():void};
 configure(watch:boolean,car:boolean):Promise<void>;
 updateNavigation(json:string):Promise<void>;
 geofenceHaptic(name:string):Promise<boolean>;
 status():Promise<{watchSupported:boolean;paired:boolean;installed:boolean;reachable:boolean;carPlayConfigured:boolean}>;
};
const native=requireOptionalNativeModule<CompanionModule>('MyMapCompanion');
let configuration:Promise<void>=Promise.resolve();
function configure(){
 configuration=configuration.catch(()=>{}).then(async()=>{const p=extensionSnapshot();await native?.configure(p.iosWatch,p.carPlay);});
 return configuration;
}
export async function companionStatus(){return native?.status()??{watchSupported:false,paired:false,installed:false,reachable:false,carPlayConfigured:false};}
export function publishCompanionNavigation(json:string){
 const p=extensionSnapshot();if(!native||(!p.iosWatch&&!p.carPlay))return;
 void configuration.then(()=>native.updateNavigation(json)).catch(()=>{});
}
export async function companionGeofenceHaptic(name:string){
 await initializeExtensions();if(!extensionSnapshot().iosWatch||!native)return false;
 await configure();return native.geofenceHaptic(name);
}
export function startIOSCompanions(onSOS:()=>void){
 let active=true;
 const apply=()=>{if(active)void configure().catch(()=>{});};
 void initializeExtensions().then(apply);
 const prefs=subscribeExtensions(apply);
 const auth=subscribeAuthState(()=>{void native?.updateNavigation(JSON.stringify({active:false,coordinates:[],updatedAt:Date.now()})).catch(()=>{});});
 const sos=native?.addListener('onWatchSOS',()=>{if(AppState.currentState==='active'&&extensionSnapshot().iosWatch)onSOS();});
 const stop=native?.addListener('onCarStop',()=>DeviceEventEmitter.emit('carStopNavigation'));
 const notification=Notifications.addNotificationResponseReceivedListener(response=>{
  if(response.notification.request.content.data?.url==='mymap://sos'&&extensionSnapshot().iosWatch)onSOS();
 });
 void Notifications.getLastNotificationResponseAsync().then(response=>{
  if(active&&response?.notification.request.content.data?.url==='mymap://sos'&&extensionSnapshot().iosWatch){onSOS();void Notifications.clearLastNotificationResponseAsync();}
 });
 return()=>{active=false;prefs();auth();sos?.remove();stop?.remove();notification.remove();void native?.configure(false,false).catch(()=>{});};
}
