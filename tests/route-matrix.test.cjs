const test=require('node:test'),assert=require('node:assert/strict');
const{loadService}=require('./service-loader.cjs');const rules=loadService('src/utils/catalogRules.ts');
const origin={name:'A',latitude:21,longitude:105},destination={name:'B',latitude:21.01,longitude:105.02};
function fixture(fetch){return loadService('src/services/routeMatrix.ts',{'../config/env':{env:{tomTomTrafficKey:'test-key'}},'../utils/catalogRules':rules},{fetch,URLSearchParams,AbortController});}
const success=(originIndex=0,destinationIndex=0)=>({originIndex,destinationIndex,routeSummary:{lengthInMeters:2000,travelTimeInSeconds:300,trafficDelayInSeconds:60}});
test('matrix results preserve destination indexes even when cells arrive out of order',()=>{
 const s=fixture(()=>{}),cells=s.parseRouteMatrix({data:[success(0,1),success(0,0)]},1,2);assert.equal(cells[0].destinationIndex,0);assert.equal(cells[1].destinationIndex,1);assert.equal(cells[0].seconds,300);
});
test('failed and missing matrix cells remain unknown rather than becoming zero-minute routes',()=>{
 const s=fixture(()=>{}),cells=s.parseRouteMatrix({data:[{originIndex:0,destinationIndex:0,detailedError:{code:'NO_ROUTE_FOUND'}},success(0,1)]},1,3);assert.equal(cells[0].seconds,null);assert.equal(cells[2].seconds,null);assert.ok(cells[0].error);assert.ok(cells[2].error);assert.throws(()=>s.parseRouteMatrix({data:[success(0,0),success(0,0)]},1,2));assert.throws(()=>s.parseRouteMatrix({data:[success(0,99)]},1,2));
});
test('matrix uses one bounded live-traffic request and caches repeated calculations',async()=>{
 const calls=[],s=fixture(async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>({data:[success()]})};});await s.calculateRouteMatrix([origin],[destination]);await s.calculateRouteMatrix([origin],[destination]);assert.equal(calls.length,1);const body=JSON.parse(calls[0].options.body);assert.equal(body.options.traffic,'live');assert.equal(body.options.travelMode,'car');assert.equal(body.origins.length,1);assert.equal(body.destinations.length,1);assert.equal(calls[0].options.method,'POST');
});
test('oversized, invalid and distant matrix requests never call the provider',async()=>{
 let calls=0;const s=fixture(async()=>{calls++;});await assert.rejects(s.calculateRouteMatrix([],[destination]));await assert.rejects(s.calculateRouteMatrix([origin],Array(6).fill(destination)));await assert.rejects(s.calculateRouteMatrix([origin],[{...destination,latitude:NaN}]));await assert.rejects(s.calculateRouteMatrix([origin],[{...destination,latitude:10,longitude:106}]));assert.equal(calls,0);
});
test('matrix permissions back off and canceled requests never generate result cells',async()=>{
 let calls=0;const s=fixture(async()=>{calls++;return{ok:false,status:403};});await assert.rejects(s.calculateRouteMatrix([origin],[destination]),/quyền/);await assert.rejects(s.calculateRouteMatrix([origin],[destination]),/5 phút/);assert.equal(calls,1);const c=new AbortController();c.abort();await assert.rejects(s.calculateRouteMatrix([origin],[destination],c.signal),/hủy/);
});
