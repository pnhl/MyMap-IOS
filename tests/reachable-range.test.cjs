const test=require('node:test'),assert=require('node:assert/strict');
const{loadService}=require('./service-loader.cjs');
const rules=loadService('src/utils/catalogRules.ts');
const sample=()=>({reachableRange:{center:{latitude:21,longitude:105},boundary:[{latitude:21,longitude:105},{latitude:21.1,longitude:105},{latitude:21,longitude:105.1}]}});
function fixture(fetch,key='test-key'){return loadService('src/services/reachableRange.ts',{'../config/env':{env:{tomTomTrafficKey:key}},'../utils/catalogRules':rules},{fetch,AbortController,URLSearchParams});}
const origin={latitude:21,longitude:105,name:'Hà Nội'};
test('reachable range validates every point and closes the real provider boundary',()=>{
 const s=fixture(()=>{}),parsed=s.parseReachableRange(sample());assert.equal(parsed.boundary.length,4);assert.deepEqual([...parsed.boundary[0]],[...parsed.boundary[3]]);const bad=sample();bad.reachableRange.boundary[1].latitude=100;assert.throws(()=>s.parseReachableRange(bad));const collapsed=sample();collapsed.reachableRange.boundary=Array(3).fill({latitude:21,longitude:105});assert.throws(()=>s.parseReachableRange(collapsed));
});
test('manual range requests use one time budget, traffic and separate vehicle caches',async()=>{
 const calls=[],s=fixture(async url=>{calls.push(new URL(url));return{ok:true,json:async()=>sample()};});await s.calculateReachableRange(origin,15,'car');await s.calculateReachableRange(origin,15,'car');await s.calculateReachableRange(origin,15,'motorbike');assert.equal(calls.length,2);assert.equal(calls[0].searchParams.get('timeBudgetInSec'),'900');assert.equal(calls[0].searchParams.get('traffic'),'true');assert.equal(calls[1].searchParams.get('travelMode'),'motorcycle');assert.ok(!calls[0].searchParams.has('distanceBudgetInMeters'));await assert.rejects(s.calculateReachableRange(origin,90,'car'));await assert.rejects(s.calculateReachableRange({...origin,latitude:NaN},15,'car'));
});
test('permission and quota failures back off rather than repeatedly charging requests',async()=>{
 let calls=0;const s=fixture(async()=>{calls++;return{ok:false,status:403};});await assert.rejects(s.calculateReachableRange(origin,15,'car'),/cấp quyền/);await assert.rejects(s.calculateReachableRange(origin,30,'car'),/5 phút/);assert.equal(calls,1);
});
test('missing configuration and canceled requests never call the provider',async()=>{
 let calls=0;const fetch=async()=>{calls++;};await assert.rejects(fixture(fetch,'').calculateReachableRange(origin,15,'car'),/cấu hình/);const c=new AbortController();c.abort();await assert.rejects(fixture(fetch).calculateReachableRange(origin,15,'car',c.signal),/hủy/);assert.equal(calls,0);
});
test('a late provider response after cancellation never enters the cache',async()=>{
 let finish,calls=0;const gate=new Promise(resolve=>{finish=resolve;});const s=fixture(async()=>{calls++;if(calls===1)await gate;return{ok:true,json:async()=>sample()};}),c=new AbortController();const first=s.calculateReachableRange(origin,15,'car',c.signal);c.abort();finish();await assert.rejects(first,/hủy/);await s.calculateReachableRange(origin,15,'car');assert.equal(calls,2);
});
