const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},globals={}){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{if(!(name in mocks))throw Error('Missing '+name);return mocks[name];},Date,Number,Math,Map,Set,Promise,JSON,Error,AbortController,URLSearchParams,setTimeout,clearTimeout,process:{env:{}},...globals});
 return module.exports;
}
const gps=(lat,lon,timestamp=1000,accuracy=5)=>({latitude:lat,longitude:lon,timestamp,accuracy});
test('moment audio cleanup survives released native getters and resets recording mode after stop failure',async()=>{
 const modes=[];
 const audio=load('src/services/momentAudioLifecycle.ts',{'expo-audio':{setAudioModeAsync:async mode=>{modes.push(mode);}}});
 assert.equal(await audio.stopMomentRecording({get isRecording(){throw Error('already released');},stop(){throw Error('should not stop');}}),false);
 assert.equal(await audio.stopMomentRecording({isRecording:true,stop(){throw Error('released during stop');}}),false);
 assert.equal(modes.length,1);assert.equal(modes[0].allowsRecording,false);
 assert.equal(await audio.stopMomentRecording({isRecording:true,stop:async()=>{}}),true);
 assert.equal(modes.length,2);
});
test('heatmap keeps adjacent real fixes at their original coordinates and includes geotagged photos',()=>{
 const h=load('src/services/heatmapData.ts');
 const first=gps(21.0285,105.8542),second=gps(21.031,105.85);
 const observations=h.buildHeatmapObservations([first,second,first,gps(NaN,106),gps(10,106,10,150)],
  [{id:1,latitude:10.8231,longitude:106.6297,accuracy:5,placeName:'Kỷ niệm'}]);
 assert.equal(observations.length,3);assert.equal(observations[0].latitude,first.latitude);assert.equal(observations[0].longitude,first.longitude);
 assert.equal(observations[0].count,2);assert.equal(observations[1].latitude,second.latitude);assert.equal(observations[2].label,'Kỷ niệm');
});
function scratchFixture(){
 const storage=new Map(),geo=require('./helpers.cjs').loadPure('src/utils/geo.ts');
 return {storage,s:load('src/services/scratchMap.ts',{'@react-native-async-storage/async-storage':{getItem:async key=>storage.get(key)||null,setItem:async(key,value)=>storage.set(key,value)},'../utils/geo':geo})};
}
test('scratch migration ignores the legacy displaced grid, survives concurrent unlocks and resets new counts when viewed',async()=>{
 const {storage,s}=scratchFixture();storage.set('mymap.scratch_cells.v2',JSON.stringify([{key:'fake'}]));
 const [a,b]=await Promise.all([s.processAndSaveScratchPoints([gps(10.8,106.7)]),s.processAndSaveScratchPoints([gps(21.03,105.85),gps(90,999)])]);
 assert.equal(a.allCells.length,1);assert.equal(b.allCells.length,2);
 assert.equal(s.computeExplorationStats([]).exploredAreaKm2,0);
 await s.markScratchSessionViewed();const again=await s.processAndSaveScratchPoints([]);
 assert.equal(again.allCells.length,2);assert.equal(s.computeExplorationStats(again.allCells).newCellsSinceLastSession,0);
 assert.equal(s.compareScratchWithFriends(2,[{id:'absent',displayName:'No data'},{id:'real',displayName:'Measured',unlockedCells:0}]).length,2);
});
test('scratch centres map back to their own cell and polygon vertices enclose the recorded point',()=>{
 const {s}=scratchFixture();
 for(const [lat,lon]of [[10.8231,106.6297],[21.0285,105.8542],[48.85,2.35],[-33.87,151.21]]){
  const h=s.coordsToHex(lat,lon),center=s.hexToCoords(h.q,h.r),again=s.coordsToHex(center.lat,center.lon);
  assert.equal(h.key,again.key);const poly=s.hexToPolygonCoords(h.q,h.r);
  let inside=false;for(let i=0,j=5;i<6;j=i++){
   const [yi,xi]=poly[i],[yj,xj]=poly[j];if((yi>lat)!==(yj>lat)&&lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;
  }assert.ok(inside,`GPS fix ${lat},${lon} must be inside its scratch cell`);
 }
});
test('overnight stays do not fabricate cities or double-count one night across midnight',()=>{
 const {s}=scratchFixture(),points=[gps(48.85,2.35,new Date(2026,9,4,23).getTime()),gps(48.85,2.35,new Date(2026,9,5,2).getTime())];
 const result=s.computeCityNights(points);assert.equal(result.length,1);assert.equal(result[0].nightsCount,1);assert.match(result[0].cityName,/48\./);assert.doesNotMatch(result[0].cityName,/Hà Nội/);
});
test('today filters distinguish this year from anniversary content',()=>{
 const policy=load('src/services/momentPolicy.ts'),today=new Date(2026,9,5,12);
 assert.equal(policy.sameLocalDate(new Date(2026,9,5,2).getTime(),today),true);
 assert.equal(policy.sameLocalDate(new Date(2025,9,5).getTime(),today),false);
 assert.equal(policy.sameCalendarDay(new Date(2025,9,5).getTime(),today),true);
});
function roadFixture(){
 const calls=[];
 const service=load('src/services/roadSpeedLimit.ts',{}, {fetch:async(url,options)=>{calls.push(decodeURIComponent(options.body));return {ok:true,json:async()=>({elements:[
  {tags:{'ISO3166-1:alpha2':'VN'}},
  {id:1,tags:{highway:'primary',name:'Đường đang đi',maxspeed:'40'},geometry:[{lat:10,lon:105.99},{lat:10,lon:106.01}]},
  {id:2,tags:{highway:'primary',name:'Đường cắt ngang',maxspeed:'90'},geometry:[{lat:9.99,lon:106},{lat:10.01,lon:106}]},
 ]})};}});
 return {service,calls};
}
test('road lookup uses the actual fix, checks direction at intersections, and does not reuse a 100-metre cache cell',async()=>{
 const {service,calls}=roadFixture();
 const result=await service.getRoadSpeedContext(10,106,'car',{heading:90});assert.equal(result.roadName,'Đường đang đi');assert.equal(result.speedLimitKmh,40);
 const query=new URLSearchParams(calls[0]).get('data');assert.ok(query.includes('around:45,10,106'));assert.ok(query.endsWith('out tags geom;'));
 await service.getRoadSpeedContext(10,106.0002,'car',{heading:90});assert.equal(calls.length,2);
 const far=await service.getRoadSpeedContext(10.1,106.1,'car');assert.equal(far.speedLimitKmh,null);assert.equal(far.source,'unknown');
 const cancelled=new AbortController();cancelled.abort();await service.getRoadSpeedContext(10,106,'car',{signal:cancelled.signal});assert.equal(calls.length,3);
});
test('directional and conditional speed signs are not presented as an unconditional limit',()=>{
 const {service}=roadFixture();
 const tags={highway:'primary','maxspeed:forward':'40','maxspeed:backward':'60'};
 assert.equal(service.inferRoadSpeedContext(tags,'car','VN','forward').speedLimitKmh,40);
 assert.equal(service.inferRoadSpeedContext(tags,'car','VN','backward').speedLimitKmh,60);
 assert.equal(service.inferRoadSpeedContext(tags,'car','VN').speedLimitKmh,null);
 assert.equal(service.inferRoadSpeedContext({highway:'primary',maxspeed:'80','maxspeed:conditional':'40 @ (wet)'},'car','VN').speedLimitKmh,null);
});
test('ad preparation shares consent/initialization, exposes blocked state and can recover without bypassing consent',async()=>{
 let allowed=false,gathers=0,initialized=0;
 const diagnostics=load('src/services/adDiagnostics.ts');
 const service=load('src/services/adsPrivacy.ts',{
  'react-native-google-mobile-ads':{default:()=>({initialize:async()=>{initialized++;}}),__esModule:true,AdsConsent:{gatherConsent:async()=>{gathers++;return {canRequestAds:allowed};}}},
  './platformLocation':{initializeAmazonPublisherServices:async()=>true},'../config/env':{env:{enableTestAds:false,amazonApsAppId:''}},'./adDiagnostics':diagnostics,
 });
 const results=await Promise.all([service.prepareAds(),service.prepareAds()]);assert.equal(results[0],false);assert.equal(initialized,0);assert.equal(gathers,1);assert.equal(diagnostics.getAdDiagnostics().consent.state,'blocked');
 allowed=true;await Promise.all([service.prepareAds(),service.prepareAds()]);assert.equal(initialized,1);assert.equal(gathers,2);assert.equal(diagnostics.getAdDiagnostics().consent.state,'ready');
});

test('native map keeps the latest camera move until style loads and pauses following only on user gestures',async()=>{
 const refs=[],moves=[];let controls,ready=0,gestures=0;
 const react={forwardRef:fn=>fn,useMemo:fn=>fn(),useEffect:()=>{},useRef:current=>{const ref={current};refs.push(ref);return ref;},useImperativeHandle:(_ref,fn)=>{controls=fn();},createElement:(type,props,...children)=>({type,props,children})};
 const native=load('src/components/MapLibreNativeMap.tsx',{'react':react,'react-native':{Image:'Image',View:'View',StyleSheet:{create:s=>s,absoluteFill:{}}},'../ui/Text':{Text:'Text'},'@maplibre/maplibre-react-native':{Camera:'Camera',GeoJSONSource:'GeoJSONSource',Layer:'Layer',Map:'Map',Marker:'Marker'},'../config/env':{env:{osmTileUrl:'https://example.org/{z}/{x}/{y}',mapLibreDemUrl:''}},'../config/mapProviders':{DEFAULT_MAP_PROVIDER:'osm',is3DMapProvider:()=>false,openMapStyleUrl:()=>null},'../services/traveledTrace':require('./helpers.cjs').loadPure('src/services/traveledTrace.ts')});
 const tree=native.MapLibreNativeMap({currentPosition:null,onMapReady:()=>ready++,onMapGesture:()=>gestures++},null);
 refs[0].current={easeTo:async options=>moves.push(options),setStop:async()=>{},fitBounds:async()=>{throw Error('superseded fit should not run');}};
 controls.fitToCoordinates([gps(10,106),gps(11,107)]);
 controls.animateToRegion({...gps(10.7769,106.7009),zoom:16},650);
 assert.equal(moves.length,0);
 tree.props.onDidFinishLoadingStyle();await Promise.resolve();
 assert.equal(ready,1);assert.equal(moves.length,1);assert.equal(moves[0].zoom,16);assert.equal(moves[0].center[0],106.7009);assert.equal(moves[0].center[1],10.7769);
 tree.props.onRegionWillChange({nativeEvent:{userInteraction:false}});assert.equal(gestures,0);
 tree.props.onRegionWillChange({nativeEvent:{userInteraction:true}});assert.equal(gestures,1);
});

test('all web map documents contain syntactically valid incremental update bridges',()=>{
 const react={forwardRef:fn=>fn,useMemo:fn=>fn(),useEffect:()=>{},useRef:current=>({current}),useCallback:fn=>fn,useImperativeHandle:()=>{},createElement:(type,props,...children)=>({type,props,children})};
 const web=load('src/components/WebMapEngine.tsx',{'react':react,'react-native':{View:'View',ActivityIndicator:'ActivityIndicator',StyleSheet:{create:s=>s,absoluteFill:{}}},'react-native-webview':{WebView:'WebView'},'../config/env':{env:{osmTileUrl:'https://example.org/{z}/{x}/{y}',mapLibreDemUrl:'',cesiumIonToken:''}},'../config/mapProviders':{is3DMapProvider:()=>false,openMapStyleUrl:()=>null},'../services/traveledTrace':require('./helpers.cjs').loadPure('src/services/traveledTrace.ts')});
 for(const engine of ['maplibre_gl','openlayers','cesium']){
  const tree=web.WebMapEngine({engine,currentPosition:gps(10,106)},null),html=tree.children[0].props.source.html;
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new vm.Script(script));assert.match(script,/myMapBridge=\{update:/);
 }
});
