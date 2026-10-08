const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks, globals) {
  const module = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.React, esModuleInterop:true},
  }).outputText;
  vm.runInNewContext(code, {module, exports:module.exports, require:name => {
    if (!(name in mocks)) throw Error(`Missing mock: ${name}`);
    return mocks[name];
  }, console, ...globals});
  return module.exports;
}

function fixture(request) {
  let now = 0, focused = true, appState = 'active', stateListener, dirty = false, cursor = 0;
  let requests = 0, tree;
  const slots = [], pendingEffects = [], timers = new Map(), diagnostics = [];
  let timerId = 0;
  const globals = {
    Date:class extends Date {static now(){return now;}},
    setTimeout:(fn, ms) => {const id=++timerId;timers.set(id,{fn,at:now+ms});return id;},
    clearTimeout:id => timers.delete(id),
  };
  const policy = load('src/services/adRequestPolicy.ts', {}, globals);
  const react = {
    createElement:(type, props, ...children) => ({type, props:props || {}, children}),
    useRef:initial => {const index=cursor++;return slots[index] ||= {current:initial};},
    useState:initial => {
      const index=cursor++;
      if (!slots[index]) slots[index]={value:initial};
      return [slots[index].value, value => {
        const next=typeof value==='function'?value(slots[index].value):value;
        if (!Object.is(next,slots[index].value)) {slots[index].value=next;dirty=true;}
      }];
    },
    useEffect:(fn, deps) => {
      const index=cursor++, old=slots[index];
      if (!old || deps.some((dep,i) => !Object.is(dep,old.deps[i]))) {
        slots[index]={deps,cleanup:old?.cleanup};
        pendingEffects.push(() => {slots[index].cleanup?.();slots[index].cleanup=fn();});
      }
    },
  };
  const native = {
    AppState:{currentState:appState,addEventListener:(_,listener) => {stateListener=listener;return {remove:()=>{stateListener=null;}};}},
    Image:'Image',View:'View',StyleSheet:{create:styles=>styles},
  };
  const ads = {
    NativeAd:{createForAdRequest:async () => {requests++;return request(requests);}},
    NativeAdChoicesPlacement:{TOP_RIGHT:1}, NativeAssetType:{}, NativeMediaAspectRatio:{LANDSCAPE:1},
    TestIds:{GAM_NATIVE:'test-native'}, BannerAdSize:{ANCHORED_ADAPTIVE_BANNER:1},
  };
  const {NativeAdCard} = load('src/components/NativeAdCard.tsx', {
    'react':react,'react-native':native,'@react-navigation/native':{useIsFocused:()=>focused},
    '@expo/vector-icons':{MaterialCommunityIcons:'Icon'},'react-native-google-mobile-ads':ads,
    '../config/env':{env:{enableTestAds:false,nativeAdUnitIds:{profile:'real-unit'},bannerAdUnitIds:{}}},
    '../services/adsPrivacy':{prepareAds:async()=>true},
    '../services/adRequestPolicy':policy,
    '../services/adDiagnostics':{recordAdDiagnostic:(...args)=>diagnostics.push(args)},
    '../ui/Text':{Text:'Text'},'../ui/theme':{useAppTheme:()=>({theme:{colors:{}}})},
  }, globals);
  function render() {
    let count=0;
    do {
      if (++count>20) throw Error('Render loop');
      dirty=false;cursor=0;tree=NativeAdCard({placement:'profile'});
      while (pendingEffects.length) pendingEffects.shift()();
    } while (dirty);
  }
  async function flush() {for(let i=0;i<8;i++){await Promise.resolve();if(dirty)render();}}
  async function advance(ms) {
    const until=now+ms;
    for (;;) {
      const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
      if (!entry || entry[1].at>until) break;
      now=entry[1].at;timers.delete(entry[0]);entry[1].fn();
      if(dirty)render();await flush();
    }
    now=until;
  }
  return {
    render,flush,advance,diagnostics,
    get requests(){return requests;},get tree(){return tree;},
    focus:value=>{focused=value;render();},
    appState:value=>{appState=value;stateListener(value);render();},
    dispose:()=>{for(const slot of slots)slot?.cleanup?.();},
  };
}

test('no-fill leaves no error card or gap, preserves cooldown on refocus and can recover after three retries', async () => {
  let destroyed=0;
  const f=fixture(count => {
    if(count<=4) throw {code:'no-fill',message:'No fill.'};
    return {headline:'Sponsored',destroy:()=>destroyed++};
  });
  try {
    f.render();await f.flush();
    assert.equal(f.requests,1);assert.equal(f.tree,null);
    assert.ok(f.diagnostics.some(([,state])=>state==='unavailable'));
    assert.ok(!f.diagnostics.some(([,state])=>state==='error'));
    await f.advance(30000);f.focus(false);f.focus(true);await f.flush();
    assert.equal(f.requests,1,'changing screens does not skip the no-fill cooldown');
    for(const delay of [30000,120000,240000,300000]) await f.advance(delay);
    assert.equal(f.requests,5);assert.notEqual(f.tree,null);
    f.focus(false);assert.equal(destroyed,1);
  } finally {f.dispose();}
});

test('background suspends retries and foreground observes the remaining cooldown', async () => {
  const f=fixture(()=>{throw {code:'no-fill'};});
  try {
    f.render();await f.flush();await f.advance(10000);
    f.appState('background');await f.advance(30000);
    assert.equal(f.requests,1);f.appState('active');await f.flush();
    assert.equal(f.requests,1);await f.advance(20000);assert.equal(f.requests,2);
  } finally {f.dispose();}
});

test('leaving during a request does not start a duplicate; late success is destroyed once', async () => {
  let resolve, destroyed=0;
  const f=fixture(()=>new Promise(done=>{resolve=done;}));
  try {
    f.render();await f.flush();f.focus(false);f.focus(true);await f.flush();
    assert.equal(f.requests,1);
    resolve({destroy:()=>destroyed++});await f.flush();
    assert.equal(destroyed,1);assert.equal(f.tree,null);
  } finally {f.dispose();}
});
