const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadService}=require('./service-loader.cjs');
const geo=loadService('src/utils/geo.ts');
const {analyzeDriving}=loadService('src/utils/drivingInsights.ts',{'./geo':geo});
const base=Date.UTC(2026,9,8),point=(seconds,meters,speed=10)=>({timestamp:base+seconds*1000,latitude:21,longitude:105+meters/(111320*Math.cos(21*Math.PI/180)),speed,accuracy:5,heading:null,altitude:null});
test('driving insights excludes bad accuracy and long gaps instead of connecting teleportation',()=>{
 const result=analyzeDriving([point(0,0),point(5,50),{...point(10,100),accuracy:300},point(15,10000),point(90,10500)]);
 assert.equal(result.excludedPoints,1);assert.equal(result.gaps,1);assert.ok(result.distanceKm<.06);assert.equal(result.smoothness,null);
});
test('unknown accuracy is not treated as verified telemetry',()=>{assert.equal(analyzeDriving([{...point(0,0),accuracy:null}]).acceptedPoints,0);});
test('records sustained stops and ignores duplicate times',()=>{
 const points=Array.from({length:41},(_,i)=>point(i*5,0,0));points.push(points[0]);
 const result=analyzeDriving(points);assert.equal(result.events.filter(e=>e.kind==='stop').length,1);assert.equal(result.events[0].durationSeconds,200);assert.equal(result.excludedPoints,1);
});
test('calculates measured moving speed without invented eco or legal-speed claims',()=>{
 const result=analyzeDriving(Array.from({length:151},(_,i)=>point(i*5,i*50)));
 assert.ok(Math.abs(result.averageMovingKmh-36)<.3);assert.ok(result.distanceKm>7);assert.equal(result.smoothness,100);
});
