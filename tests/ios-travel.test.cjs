const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadService}=require('./service-loader.cjs');
test('iOS missing native safety module reports unavailable instead of enabling a fake service',async()=>{
 const api=loadService('src/services/iosTravel.ts',{'expo':{requireOptionalNativeModule:()=>null},'./iosCompanions':{publishCompanionNavigation:()=>{}}});
 assert.equal(api.travelNative,null);assert.equal((await api.getSafetyState()).enabled,false);
 await assert.rejects(api.configureSafety(true,'112'),/native iOS/);
});
test('iOS sensor rejection cannot become an enabled safety setting',async()=>{
 const calls=[];const api=loadService('src/services/iosTravel.ts',{'expo':{requireOptionalNativeModule:name=>{assert.equal(name,'MyMapTravel');return{configureSafety:async(...args)=>{calls.push(args);return false;}};}},'./iosCompanions':{publishCompanionNavigation:()=>{}}});
 await assert.rejects(api.configureSafety(true,'112'),/cảm biến/);assert.deepEqual(calls[0],[true,'112']);
});
