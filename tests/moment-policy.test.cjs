const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const moduleObject={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/momentPolicy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:moduleObject.exports,module:moduleObject,Date,Error,Number,Math,Set});
const p=moduleObject.exports;
const moment=(extra={})=>({id:'148b2041-a272-4aab-8da2-f20780716cdf',kind:'photo',uri:'file:///private/photo.jpg',caption:'',durationSeconds:0,recipients:[],latitude:10,longitude:106,capturedAt:1000,...extra});
test('GPS sharing requires its own explicit choice, even with a geotagged photo',()=>{
 assert.equal(JSON.stringify(p.publishCoordinates({...moment(),shareLocation:false})),JSON.stringify({lat:null,lon:null}));
 assert.equal(JSON.stringify(p.publishCoordinates({...moment(),shareLocation:true})),JSON.stringify({lat:10,lon:106}));
});
test('capture validation rejects oversize metadata, long videos and partial or fabricated invalid coordinates',()=>{
 assert.doesNotThrow(()=>p.validateMoment(moment()));
 for(const extra of [{caption:'a'.repeat(501)},{durationSeconds:16},{latitude:NaN},{longitude:null},{latitude:91},{recipients:Array(31).fill('x')}])assert.throws(()=>p.validateMoment(moment(extra)));
});
test('recap uses ordered local media only, caps clips and bounds total inputs',()=>{
 const rows=[moment({capturedAt:5000,kind:'video',durationSeconds:15}),moment({capturedAt:1000}),moment({remote:true,capturedAt:0})];
 const items=p.recapItems(rows);assert.equal(items.length,2);assert.equal(items[0].durationMs,3000);assert.equal(items[1].durationMs,10000);
 assert.equal(p.recapItems(Array.from({length:40},(_,i)=>moment({capturedAt:i}))).length,20);
 assert.throws(()=>p.recapItems([moment({remote:true})]));
});
test('anniversary respects the local calendar and excludes this year',()=>{
 const today=new Date(2026,9,5,12);assert.equal(p.sameCalendarDay(new Date(2025,9,5,20).getTime(),today),true);assert.equal(p.sameCalendarDay(today.getTime(),today),false);assert.equal(p.sameCalendarDay(new Date(2025,9,6).getTime(),today),false);
});
