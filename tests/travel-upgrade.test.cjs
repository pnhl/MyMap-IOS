const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

function load(file, mocks = {}, globals = {}) {
  mocks={...mocks,'./traveledTrace':require('./helpers.cjs').loadPure('src/services/traveledTrace.ts')};
  const filename = path.resolve(__dirname, '../src', file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
  const module = {exports: {}};
  const context = {module, exports: module.exports, require: name => {if (!(name in mocks)) throw new Error(`Missing mock: ${name}`); return mocks[name];}, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Date, btoa, process: {env: {}}, ...globals};
  vm.runInNewContext(compiled, context, {filename});
  return module.exports;
}
const defaults = {avoidFerries:false, avoidHighways:false, avoidUnpaved:false, speedWarnings:true, sound:true, vibration:true, customSpeedKmh:null};
const storage = {getItem:async()=>null, setItem:async()=>{}};

test('custom speed reminders never raise a lower road limit and work without road metadata', async () => {
  const service = load('services/navigationPreferences.ts', {'@react-native-async-storage/async-storage': storage});
  assert.equal(service.warningThreshold({...defaults, customSpeedKmh:100}, 50), 50);
  assert.equal(service.warningThreshold({...defaults, customSpeedKmh:35}, null), 35);
  assert.equal(service.warningThreshold({...defaults, speedWarnings:false, customSpeedKmh:35}, 50), null);
  const bad = load('services/navigationPreferences.ts', {'@react-native-async-storage/async-storage': {getItem:async()=>JSON.stringify({avoidHighways:'false', customSpeedKmh:9999})}});
  assert.equal((await bad.getNavigationPreferences()).avoidHighways, false);
  assert.equal((await bad.getNavigationPreferences()).customSpeedKmh, null);
});

test('foreign roads, conditional signs and missing geography never inherit a Vietnamese estimate', () => {
  const {inferRoadSpeedContext: infer} = load('services/roadSpeedLimit.ts');
  assert.equal(infer({highway:'primary'}, 'car', 'US').speedLimitKmh, null);
  assert.equal(infer({highway:'residential'}, 'car').source, 'unknown');
  assert.equal(infer({highway:'primary', maxspeed:'55 mph'}, 'car', 'US').speedLimitKmh, 89);
  assert.equal(infer({highway:'primary', maxspeed:'60', 'maxspeed:conditional':'30 @ (wet)'}, 'car', 'VN').speedLimitKmh, null);
});

function routing(fetch, env={}) {
  return load('services/roadRouting.ts', {'@react-native-async-storage/async-storage':storage, './navigationPreferences':{getNavigationPreferences:async()=>defaults}}, {fetch, process:{env}});
}
const origin={latitude:10.1,longitude:106.1}, destination={latitude:10.2,longitude:106.2};
const osrm={code:'Ok',routes:[{geometry:{coordinates:[[106.1,10.1],[106.2,10.2]]},distance:1000,duration:100,legs:[]}]};
test('avoidance changes invalidate cached routes and cannot fall back to unrestricted OSRM', async () => {
  const requests=[];
  const service=routing(async(url,options)=>{requests.push({url,options});if(url.includes('/route/v1/'))return {ok:true,json:async()=>osrm};return {ok:true,json:async()=>({warnings:['Hard exclusions disabled']})};});
  assert.equal((await service.fetchRoadRoute(origin,destination,'car',defaults)).provider,'osrm');
  const avoid={...defaults,avoidFerries:true};
  assert.equal(await service.fetchRoadRoute(origin,destination,'car',avoid),null);
  assert.equal(requests.filter(r=>r.url.includes('/route/v1/')).length,1);
  const body=JSON.parse(requests.find(r=>r.options?.body)?.options.body);
  assert.equal(body.costing_options.auto.exclude_ferries,true);
});
test('a gateway must confirm avoidance and motorcycle unpaved requests cannot silently ignore it', async () => {
  const service=routing(async()=>({ok:true,json:async()=>({coordinates:[[10.1,106.1],[10.2,106.2]],distanceMeters:1000,durationSeconds:100,preferencesApplied:false})}), {EXPO_PUBLIC_ROUTING_GATEWAY_URL:'https://routing.example.test',EXPO_PUBLIC_ROUTING_PROVIDERS:'valhalla'});
  assert.equal(await service.fetchRoadRoute(origin,destination,'motorbike',{...defaults,avoidUnpaved:true}),null);
});
test('all 21 languages have aligned core labels and persist selection', async () => {
  const records=[];
  const locale=load('i18n/languages.ts', {'./staticMessages':{loadMessages:code=>code==='kw'?{}:require('../src/i18n/messages/'+code+'.json')}, './templateMessages.json':require('../src/i18n/templateMessages.json'), 'react':{useSyncExternalStore:()=>{}}, '@react-native-async-storage/async-storage':{getItem:async()=>null,setItem:async(...args)=>records.push(args)}});
  assert.equal(locale.LANGUAGES.length,21);
  for(const [code]of locale.LANGUAGES){assert.ok(locale.translate('Cài đặt',code));if(code!=='vi')assert.notEqual(locale.translate('Cài đặt',code),'Cài đặt');}
  await locale.setLanguage('ja');assert.equal(locale.getLanguage(),'ja');assert.equal(locale.translate('Bản đồ'),'地図');assert.equal(records[0][1],'ja');
  const email='traveller+id@example.test';
  const message=`Đã gửi email khôi phục mật khẩu đến ${email}. Hãy kiểm tra hộp thư của bạn.`;
  const translated=locale.translate(message,'en');
  assert.ok(translated.includes(email));assert.ok(translated.startsWith('Password recovery email'));
  assert.ok(!locale.translate('Rẽ phải · Đường Nguyễn Ái Quốc','ja').includes('Rẽ phải'));
  assert.ok(locale.translate('Rẽ phải · Đường Nguyễn Ái Quốc','ja').includes('Đường Nguyễn Ái Quốc'));
  assert.notEqual(locale.translate('Nhập email và mật khẩu của bạn.','kw'),'Nhập email và mật khẩu của bạn.');
});

function spotify(callbackState=true,apiResponse=null,tokenResponse=null) {
  const secrets=new Map(), requests=[];let auth;
  const service=load('services/spotify.ts', {
    'expo-crypto':{getRandomBytes:length=>new Uint8Array(length).fill(7),CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_,s)=>crypto.createHash('sha256').update(s).digest('hex')},
    'expo-secure-store':{WHEN_UNLOCKED_THIS_DEVICE_ONLY:4,setItemAsync:async(k,v)=>secrets.set(k,v),getItemAsync:async k=>secrets.get(k),deleteItemAsync:async k=>secrets.delete(k)},
    'expo-web-browser':{openAuthSessionAsync:async(url,returnUri)=>{auth={url:new URL(url),returnUri};const state=callbackState?auth.url.searchParams.get('state'):'tampered';return {type:'success',url:`mymap://spotify?code=test-code&state=${state}`};}},
    'react-native':{Linking:{canOpenURL:async()=>true,openURL:async()=>{}}},
  }, {process:{env:{EXPO_PUBLIC_SPOTIFY_CLIENT_ID:'public-client',EXPO_PUBLIC_SPOTIFY_REDIRECT_URI:'https://mymap.html-5.me/?i=1'}},fetch:async(url,options)=>{requests.push({url,options});const override=url.includes('/api/token')?tokenResponse:apiResponse;if(override)return typeof override==='function'?override():override;return {ok:true,status:200,json:async()=>url.includes('/api/token')?{access_token:'test-access',refresh_token:'test-refresh',expires_in:3600}:{id:'account',display_name:'My account'}};}});
  return {service,secrets,requests,getAuth:()=>auth};
}
test('Spotify uses PKCE with the exact registered HTTPS URI and stores tokens only in SecureStore', async () => {
  const {service,secrets,requests,getAuth}=spotify();
  assert.equal((await service.connectSpotify()).id,'account');
  const auth=getAuth();assert.equal(auth.returnUri,'mymap://spotify');assert.equal(auth.url.searchParams.get('redirect_uri'),'https://mymap.html-5.me/?i=1');
  const tokenBody=new URLSearchParams(requests[0].options.body);
  const challenge=crypto.createHash('sha256').update(tokenBody.get('code_verifier')).digest('base64url');
  assert.equal(auth.url.searchParams.get('code_challenge'),challenge);assert.equal(tokenBody.has('client_secret'),false);
  assert.equal(JSON.parse([...secrets.values()][0]).refresh_token,'test-refresh');
  await service.disconnectSpotify();assert.equal(secrets.size,0);
});
test('a mismatched OAuth state is rejected before token exchange', async () => {
  const {service,requests,secrets}=spotify(false);await assert.rejects(service.connectSpotify(),/Callback/);assert.equal(requests.length,0);assert.equal(secrets.size,0);
});

test('Spotify profile 403 after successful OAuth explains allowlist and does not save an unusable link', async () => {
  const {service,secrets,requests}=spotify(true,{ok:false,status:403,json:async()=>({error:{status:403,message:'User not registered in the Developer Dashboard'}})});
  await assert.rejects(service.connectSpotify(),error=>error.status===403&&/Users Management/.test(error.message)&&/Premium/.test(error.message));
  assert.equal(requests.length,2);assert.equal(secrets.size,0);
});

test('a plain-text Spotify 403 still gives an actionable diagnosis', async () => {
  const {service,secrets}=spotify(true,{ok:false,status:403,json:async()=>{throw new SyntaxError('plain text');}});
  await assert.rejects(service.connectSpotify(),/403.*Users Management/);
  assert.equal(secrets.size,0);
});

test('Spotify insufficient scope is distinguished from development allowlist rejection', async () => {
  const {service,secrets}=spotify(true,{ok:false,status:403,json:async()=>({error:{message:'Insufficient client scope'}})});
  await assert.rejects(service.connectSpotify(),/quyền truy cập.*liên kết lại/);
  assert.equal(secrets.size,0);
});

test('after enabling Spotify API access a failed link can be retried without a stored broken session', async () => {
  let allowed=false;
  const {service,secrets}=spotify(true,()=>allowed?{ok:true,status:200,json:async()=>({id:'enabled-account',display_name:'Allowed'})}:{ok:false,status:403,json:async()=>({error:{message:'Forbidden'}})});
  await assert.rejects(service.connectSpotify(),/403/);assert.equal(secrets.size,0);
  allowed=true;assert.equal((await service.connectSpotify()).id,'enabled-account');assert.equal(secrets.size,1);
});
