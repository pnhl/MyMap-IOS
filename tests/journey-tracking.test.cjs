const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
function load(relative, mocks) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('.')) return load(path.join(path.dirname(relative), `${name}.ts`), mocks);
    throw new Error(`Unexpected dependency ${name}`);
  }, module, module.exports);
  return module.exports;
}
const fix = (timestamp, latitude = 10, longitude = 106, accuracy = 5) => ({
  timestamp, coords: { latitude, longitude, accuracy, altitude: null, speed: null, heading: null },
});
function fixture(storage = new Map(), native = null, platform = false) {
  let task, started = false, first = fix(Date.now()), failWrites = 0;
  const calls = []; const saved = new Map(); const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE points(timestamp INTEGER PRIMARY KEY, latitude REAL, longitude REAL)');
  const location = {
    Accuracy: { Balanced: 3, High: 4, Highest: 5 },
    hasServicesEnabledAsync: async () => true,
    requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    requestBackgroundPermissionsAsync: async () => ({ status: 'granted' }),
    getBackgroundPermissionsAsync: async () => ({ status: 'granted' }),
    hasStartedLocationUpdatesAsync: async () => started,
    startLocationUpdatesAsync: async (_, options) => { calls.push(['background', options]); started = true; },
    stopLocationUpdatesAsync: async () => { calls.push(['stop']); started = false; },
    watchPositionAsync: async (_, callback) => { calls.push(['watch']); return { remove() {} }; },
    getCurrentPositionAsync: async () => { calls.push(['first']); return first; },
    getLastKnownPositionAsync: async () => first,
  };
  const mocks = {
    'react-native': { Platform: { OS: 'ios' } }, 'expo-location': location,
    'expo-task-manager': { defineTask: (_, callback) => { task = callback; }, isTaskRegisteredAsync: async () => started },
    '@react-native-async-storage/async-storage': { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key) },
    'expo-sensors': { Accelerometer: { setUpdateInterval() {}, addListener: () => ({ remove() {} }) } },
    '../db/database': { insertLocationPoint: async point => {
      if (failWrites-- > 0) throw new Error('SQLITE_BUSY');
      db.prepare('INSERT OR IGNORE INTO points VALUES(?,?,?)').run(point.timestamp, point.latitude, point.longitude);
      saved.set(point.timestamp, point);
    } },
    './liveSafety': { syncPendingSosEvents: async () => {} },
    './travelPlatform': { travelNative: native },
    './platformLocation': { shouldUsePlatformLocation: async () => platform, getDeviceCurrentPosition: async () => location.getCurrentPositionAsync(), watchDevicePosition: (...args) => location.watchPositionAsync(...args), startPlatformLocationUpdates: async () => async () => {} },
  };
  const background = load('src/services/backgroundLocationTask.ts', mocks);
  mocks['./backgroundLocationTask'] = background;
  const tracking = load('src/services/locationTracking.ts', mocks);
  return { tracking, background, location, calls, storage, saved, db,
    deliver: locations => task({ data: { locations } }),
    setFirst: value => { first = value; }, failWrites: count => { failWrites = count; }, close: () => db.close(),
  };
}
test('background recording starts before waiting for an initial GPS fix', async () => {
  const f = fixture();
  try { await f.tracking.startTracking(); assert.ok(f.calls.findIndex(c => c[0] === 'background') < f.calls.findIndex(c => c[0] === 'first')); }
  finally { f.close(); }
});
test('balanced recording delivers background fixes without distance/time deferral', async () => {
  const f = fixture();
  try {
    await f.tracking.startTracking(); const o = f.calls.find(c => c[0] === 'background')[1];
    assert.ok(o.timeInterval <= 10000); assert.ok(o.distanceInterval <= 10);
    assert.equal(o.deferredUpdatesInterval, 0); assert.equal(o.deferredUpdatesDistance, 0);
    assert.equal(o.pausesUpdatesAutomatically, false); assert.equal(o.showsBackgroundLocationIndicator, true);
    assert.equal(o.foregroundService, undefined);
  } finally { f.close(); }
});
test('cold launch resumes enabled recording without requesting permissions again', async () => {
  const previous = fixture(); await previous.tracking.startTracking();
  const f = fixture(previous.storage); previous.close();
  try {
    f.location.requestForegroundPermissionsAsync = async () => { throw new Error('must not prompt'); };
    f.location.requestBackgroundPermissionsAsync = async () => { throw new Error('must not prompt'); };
    await f.tracking.restoreTracking(); assert.equal(f.calls.filter(c => c[0] === 'background').length, 1);
  } finally { f.close(); }
});
test('an explicit stop is never undone by foreground recovery', async () => {
  const f = fixture();
  try {
    await f.tracking.startTracking(); await f.tracking.stopTracking();
    const count = f.calls.filter(c => c[0] === 'background').length;
    await f.tracking.restoreTracking(); assert.equal(f.calls.filter(c => c[0] === 'background').length, count);
  } finally { f.close(); }
});
test('background startup errors are reported instead of silently claiming recording', async () => {
  const f = fixture();
  try {
    f.location.startLocationUpdatesAsync = async () => { throw new Error('service unavailable'); };
    await assert.rejects(f.tracking.startTracking(), /service unavailable|ghi.*nền/i);
  } finally { f.close(); }
});

test('a CoreLocation background failure never pretends an Android service is recording', async () => {
  let starts=0,stops=0;
  const f=fixture(new Map(), {startPlatformTracking:async()=>{starts++;},stopPlatformTracking:async()=>{stops++;},isPlatformTracking:async()=>starts>stops});
  try {
    f.location.startLocationUpdatesAsync=async()=>{throw Error('CoreLocation unavailable');};
    await assert.rejects(f.tracking.startTracking(), /CoreLocation unavailable/);
    assert.equal(starts,0);
    assert.equal(f.calls.filter(c=>c[0]==='watch').length,0);
    await f.tracking.stopTracking();assert.equal(stops,1);
  } finally {f.close();}
});

test('iOS recording always uses CoreLocation even if an obsolete provider flag is set', async () => {
  let starts=0;
  const f=fixture(new Map(), {startPlatformTracking:async()=>{starts++;},isPlatformTracking:async()=>true}, true);
  try {
    assert.equal((await f.tracking.startTracking()).mode,'background');assert.equal(starts,0);
    assert.equal(f.calls.filter(c=>c[0]==='background').length,1);
  } finally {f.close();}
});
test('changing GPS profile keeps the journey running', async () => {
  const f = fixture();
  try {
    await f.tracking.startTracking(); await f.tracking.setBatteryProfile('high_accuracy');
    assert.equal(f.calls.filter(c => c[0] === 'stop').length, 0);
    assert.equal(f.calls.filter(c => c[0] === 'background').at(-1)[1].accuracy, 5);
  } finally { f.close(); }
});
test('coarse stationary fixes retain a heartbeat and movement resumes recording', async () => {
  const f = fixture();
  try {
    await f.deliver([fix(1000,10,106,80), fix(601000,10,106,80), fix(661000,10.001,106,80)]);
    assert.equal(f.saved.size, 3);
  } finally { f.close(); }
});
test('a 40 km route survives shuffled batches and delayed historical fixes in SQLite', async () => {
  const f = fixture();
  try {
    const route = Array.from({ length: 401 }, (_, i) => fix(1000+i*5000,10+i*.001,106));
    await f.deliver(route.slice(300)); await f.deliver(route.slice(0,300).reverse());
    const points = f.db.prepare('SELECT * FROM points ORDER BY timestamp').all();
    const { distanceMeters } = load('src/utils/geo.ts', {});
    const km = points.reduce((sum,p,i) => sum+(i ? distanceMeters(points[i-1],p)/1000 : 0),0);
    assert.equal(points.length, route.length); assert.ok(km > 40 && km < 45, `saved ${km} km`);
  } finally { f.close(); }
});
test('a transient SQLite failure does not drop the rest of a location batch', async () => {
  const f = fixture();
  try { f.failWrites(1); await f.deliver([fix(1000),fix(6000,10.0001)]); assert.equal(f.saved.size, 2); }
  finally { f.close(); }
});
test('invalid coordinates and impossible GPS jumps are rejected', async () => {
  const f = fixture();
  try {
    await f.deliver([fix(1000),fix(2000,50),fix(3000,NaN),fix(4000,10.0001)]);
    assert.deepEqual([...f.saved.keys()], [1000,4000]);
  } finally { f.close(); }
});
test('unwritten points survive process recreation and are replayed before new points', async () => {
  const previous = fixture(); previous.failWrites(2);
  await assert.rejects(previous.deliver([fix(1000),fix(6000,10.0001)]), /SQLITE_BUSY/);
  const f = fixture(previous.storage); previous.close();
  try { await f.deliver([fix(11000,10.0002)]); assert.deepEqual([...f.saved.keys()], [1000,6000,11000]); }
  finally { f.close(); }
});
test('concurrent background batches share one writer and preserve every moving fix', async () => {
  const f = fixture();
  try {
    await Promise.all([f.deliver([fix(1000),fix(6000,10.0001)]),f.deliver([fix(11000,10.0002),fix(16000,10.0003)])]);
    assert.equal(f.saved.size, 4);
  } finally { f.close(); }
});
test('approximate-only permission cannot silently start a precise journey', async () => {
  const f = fixture();
  try {
    f.location.requestForegroundPermissionsAsync = async () => ({status:'granted',ios:{accuracy:'reduced'}});
    await assert.rejects(f.tracking.startTracking(), /Vị trí chính xác/);
    assert.equal(f.calls.length, 0);
  } finally { f.close(); }
});
test('denying background permission still records in foreground with an honest mode', async () => {
  const f = fixture();
  try {
    f.location.requestBackgroundPermissionsAsync = async () => ({status:'denied'});
    assert.equal((await f.tracking.startTracking()).mode, 'foreground');
    assert.ok(f.calls.some(c=>c[0]==='watch')); assert.ok(!f.calls.some(c=>c[0]==='background'));
  } finally { f.close(); }
});
