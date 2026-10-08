const test=require('node:test'),assert=require('node:assert/strict');
const {loadService}=require('./service-loader.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const fix=()=>({timestamp:Date.now(),coords:{latitude:10.7,longitude:106.7,accuracy:8,speed:0,heading:0,altitude:null}});
function fixture(fail=false){
 let callback,change,removed=0,listeners=0;const requests=[];
 const state={currentState:'active',addEventListener:(_,cb)=>{change=cb;listeners++;return{remove:()=>listeners--};}};
 const api=loadService('src/services/coreLocation.ts',{
  'react-native':{AppState:state},'expo-location':{Accuracy:{High:4},watchPositionAsync:async(options,cb)=>{requests.push(options);if(fail)throw Error('Location permission denied');callback=cb;return{remove:()=>removed++};}},
 });
 return{api,requests,removed:()=>removed,listeners:()=>listeners,deliver:()=>callback(fix()),state:async value=>{state.currentState=value;change(value);await tick();await tick();}};
}
test('iOS navigation subscribers share CoreLocation and removing one preserves the other',async()=>{
 const f=fixture(),a=[],b=[];
 const first=await f.api.watchNavigationPosition(p=>a.push(p)),second=await f.api.watchNavigationPosition(p=>b.push(p));
 assert.equal(f.requests.length,1);first.remove();await tick();f.deliver();assert.equal(a.length,0);assert.equal(b.length,1);assert.equal(f.removed(),0);
 second.remove();await tick();assert.equal(f.removed(),1);assert.equal(f.listeners(),0);
});
test('CoreLocation permission failure releases the client and lifecycle subscription',async()=>{
 const f=fixture(true);await assert.rejects(f.api.watchNavigationPosition(()=>{}),/permission/);await tick();assert.equal(f.listeners(),0);assert.equal(f.requests.length,1);
});
test('foreground watchers stop in background and resume exactly once',async()=>{
 const f=fixture(),watch=await f.api.watchNavigationPosition(()=>{});
 await f.state('background');assert.equal(f.removed(),1);await f.state('active');await f.state('active');assert.equal(f.requests.length,2);
 watch.remove();await tick();assert.equal(f.removed(),2);
});
test('timed out one-shot removes the GPS request even without a fix',async()=>{
 const f=fixture();await assert.rejects(f.api.getDeviceCurrentPosition({timeoutMs:15}),/GPS/);await tick();assert.equal(f.removed(),1);assert.equal(f.listeners(),0);
});
test('finishing a simultaneous one-shot preserves the live navigation request',async()=>{
 const f=fixture(),navigation=[],watch=await f.api.watchDevicePosition({accuracy:4,distanceInterval:0},p=>navigation.push(p));
 const pending=f.api.getDeviceCurrentPosition({timeoutMs:200});await tick();f.deliver();assert.equal((await pending).coords.latitude,10.7);await tick();
 assert.equal(f.requests.length,1);assert.equal(f.removed(),0);f.deliver();assert.equal(navigation.length,2);watch.remove();await tick();assert.equal(f.removed(),1);
});
