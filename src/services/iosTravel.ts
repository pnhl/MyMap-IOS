import {requireOptionalNativeModule} from 'expo';
type SafetyState = {enabled:boolean;pendingAt:number;deadline:number;heightMeters:number;kind:string;emergencyNumber:string};
type TravelIOS = {
 configureSafety(enabled:boolean,number:string):Promise<boolean>;
 safetyState():Promise<SafetyState>;
 openDialer(number:string):Promise<boolean>;
 setForeground(active:boolean):Promise<void>;
 userInteraction():Promise<void>;
 dismissIncident():Promise<void>;
 playWarning():Promise<void>;
 getBuildInfo():Promise<{channel:string;appstoreId:string}>;
};
const ios = requireOptionalNativeModule<TravelIOS>('MyMapTravel');
// Journey tracking is handled by expo-location / CoreLocation.
export const travelNative = ios ? {
 configureSafety: (enabled:boolean,number:string)=>ios.configureSafety(enabled,number),
 safetyState: ()=>ios.safetyState(),
 openDialer: (number:string)=>ios.openDialer(number),
 getBuildInfo: ()=>ios.getBuildInfo(),
 setForeground: (active:boolean)=>{void ios.setForeground(active).catch(()=>{});},
 userInteraction: ()=>{void ios.userInteraction().catch(()=>{});},
 dismissIncident: ()=>{void ios.dismissIncident().catch(()=>{});},
 playWarning: ()=>{void ios.playWarning().catch(()=>{});},
 updateCarState: (_json:string)=>{}, // Requires approved CarPlay entitlement.
 getSpotubeInstallation: async()=>({installed:false}),
 openSpotube: async()=>false,
 getAudioDocumentInfo: async(_uri:string):Promise<{name:string|null;mimeType:string|null}|null>=>null,
 isPlatformTracking: async()=>false,
 stopPlatformTracking: async()=>false,
 platformTrackingError: async()=>null,
 startPlatformTracking: async(_interval:number,_distance:number):Promise<boolean>=>{throw Error('Ghi hành trình iOS sử dụng CoreLocation.');},
} : null;
export async function getSafetyState():Promise<SafetyState> {
 return ios?.safetyState() || {enabled:false,pendingAt:0,deadline:0,heightMeters:0,kind:'',emergencyNumber:'112'};
}
export async function configureSafety(enabled:boolean,number:string) {
 if (!ios) throw Error('Cần bản native iOS có module cảm biến.');
 if (!await ios.configureSafety(enabled,number)) throw Error('Thiết bị chưa có cảm biến chuyển động phù hợp.');
 return true;
}
