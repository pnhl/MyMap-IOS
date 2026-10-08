const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadService}=require('./service-loader.cjs');
const {validateOfflineRoute}=loadService('src/utils/offlineRouteRules.ts');
const valid=()=>({id:'00112233-4455-6677-8899-aabbccddeeff',name:'Route',createdAt:Date.now(),mode:'motorbike',destination:{name:'B',latitude:21,longitude:105},route:{provider:'tomtom',coordinates:[[21,105],[21.1,105.1]],steps:[{instruction:'Go',distanceMeters:50}],distanceMeters:1000,durationSeconds:200}});
test('cached provider route remains readable without traffic alternatives',()=>assert.doesNotThrow(()=>validateOfflineRoute(valid())));
test('invalid GPS, negative distance and unknown providers cannot become saved routes',()=>{for(const change of [{coordinates:[[91,105],[21,105]]},{distanceMeters:-1},{durationSeconds:NaN},{provider:'invented'}]){const r=valid();Object.assign(r.route,change);assert.throws(()=>validateOfflineRoute(r));}});
test('oversized route or instructions cannot exhaust offline storage',()=>{const r=valid();r.route.coordinates=Array.from({length:25001},()=>[21,105]);assert.throws(()=>validateOfflineRoute(r));r.route.coordinates=[[21,105],[22,106]];r.route.steps[0].instruction='a'.repeat(1001);assert.throws(()=>validateOfflineRoute(r));});
