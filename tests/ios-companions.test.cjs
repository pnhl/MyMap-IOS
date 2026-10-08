const test=require('node:test'),assert=require('node:assert/strict');
const {loadService}=require('./service-loader.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const prefs={iosWatch:false,carPlay:false},events={},configured=[],published=[];let listener,auth;let sos=0,stops=0;
 const native={configure:async(...args)=>configured.push(args),updateNavigation:async(json)=>published.push(JSON.parse(json)),addListener:(name,fn)=>{events[name]=fn;return{remove:()=>delete events[name]};}};
 const api=loadService('src/services/iosCompanions.ts',{
  expo:{requireOptionalNativeModule:()=>native},'react-native':{AppState:{currentState:'active'},DeviceEventEmitter:{emit:()=>stops++}},
  'expo-notifications':{addNotificationResponseReceivedListener:()=>({remove(){}}),getLastNotificationResponseAsync:async()=>null},
  './extensionPreferences':{extensionSnapshot:()=>prefs,initializeExtensions:async()=>{},subscribeExtensions:fn=>{listener=fn;return()=>{listener=null};}},
  './auth':{subscribeAuthState:fn=>{auth=fn;return()=>{};}},
 });
 return{api,prefs,events,configured,published,update:()=>listener(),auth:()=>auth(),start:()=>api.startIOSCompanions(()=>sos++),sos:()=>sos,stops:()=>stops};
}
test('companion navigation stays off until explicitly enabled and disabling stops publishing',async()=>{
 const f=fixture(),stop=f.start();await tick();f.api.publishCompanionNavigation('{"active":true}');await tick();assert.equal(f.published.length,0);
 f.prefs.iosWatch=true;f.update();f.api.publishCompanionNavigation('{"active":true}');await tick();assert.equal(f.published.length,1);
 f.prefs.iosWatch=false;f.update();f.api.publishCompanionNavigation('{"active":true}');await tick();assert.equal(f.published.length,1);stop();
});
test('watch SOS is gated, stop reaches the map and auth change clears the route',async()=>{
 const f=fixture(),stop=f.start();await tick();f.events.onWatchSOS();assert.equal(f.sos(),0);
 f.prefs.iosWatch=true;f.update();await tick();f.events.onWatchSOS();assert.equal(f.sos(),1);f.events.onCarStop();assert.equal(f.stops(),1);
 f.auth();await tick();assert.equal(f.published.at(-1).active,false);stop();assert.equal(Object.keys(f.events).length,0);
});
