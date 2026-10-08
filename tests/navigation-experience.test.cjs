const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks = {}) {
  mocks={...mocks,'./traveledTrace':require('./helpers.cjs').loadPure('src/services/traveledTrace.ts')};
  const filename = path.resolve(__dirname, '..', relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const serviceModule = new Module(filename, module);
  serviceModule.filename = filename;
  serviceModule.paths = Module._nodeModulePaths(path.dirname(filename));
  serviceModule.require = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    return require(name);
  };
  serviceModule._compile(compiled, filename);
  return serviceModule.exports;
}

test('GPS speed rejects stationary jitter even when Android reports movement', () => {
  const navigation = loadTypeScriptModule('src/utils/navigation.ts');
  const previous = { latitude: 10.8231, longitude: 106.6297, accuracy: 16, speedMps: 0, timestamp: 1_000 };
  const jitter = { latitude: 10.82311, longitude: 106.62971, accuracy: 18, speedMps: 2.8, timestamp: 2_200 };
  assert.equal(navigation.deriveReliableGpsSpeedKmh(jitter, previous, null), 0);
});

test('GPS speed accepts accurate displacement and does not display a first-fix guess', () => {
  const navigation = loadTypeScriptModule('src/utils/navigation.ts');
  const previous = { latitude: 10.8231, longitude: 106.6297, accuracy: 4, speedMps: 13, timestamp: 1_000 };
  const moving = { latitude: 10.823226, longitude: 106.6297, accuracy: 4, speedMps: 13, timestamp: 2_000 };
  assert.equal(navigation.deriveReliableGpsSpeedKmh(previous, null, null), null);
  const speed = navigation.deriveReliableGpsSpeedKmh(moving, previous, null);
  assert.ok(speed > 44 && speed < 53, `Expected realistic vehicle speed, received ${speed}`);
});

test('route weather samples an interpolated point five kilometres ahead', () => {
  const navigation = loadTypeScriptModule('src/utils/navigation.ts');
  const point = navigation.pointAlongRoute([[10, 106], [10, 106.1]], 5_000);
  assert.ok(point);
  assert.ok(point.traversedMeters >= 4_999 && point.traversedMeters <= 5_001);
  assert.ok(point.coordinate.longitude > 106.04 && point.coordinate.longitude < 106.06);
});

test('routing guidance exposes distance, next turn, and the following turn', () => {
  const routing = loadTypeScriptModule('src/services/roadRouting.ts', {
    './navigationPreferences': {getNavigationPreferences:async()=>({avoidFerries:false,avoidHighways:false,avoidUnpaved:false,speedWarnings:true,sound:true,vibration:true,customSpeedKmh:null})},
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
  });
  const guidance = routing.getRouteGuidance([
    { distanceMeters: 420, instruction: 'Đi thẳng', roadName: 'Đường A', type: 'depart', modifier: 'straight', position: [10, 106] },
    { distanceMeters: 180, instruction: 'Rẽ phải vào Đường B', roadName: 'Đường B', type: 'turn', modifier: 'right', position: [10.004, 106] },
    { distanceMeters: 300, instruction: 'Rẽ trái vào Đường C', roadName: 'Đường C', type: 'turn', modifier: 'left', position: [10.006, 106] },
  ]);
  assert.equal(guidance.distanceMeters, 420);
  assert.equal(guidance.instruction, 'Rẽ phải vào Đường B');
  assert.equal(guidance.followingInstruction, 'Rẽ trái vào Đường C');
});

test('navigation providers request turn steps and the UI refreshes route weather every five minutes', () => {
  const routing = fs.readFileSync(path.resolve(__dirname, '../src/services/roadRouting.ts'), 'utf8');
  const mapScreen = fs.readFileSync(path.resolve(__dirname, '../src/screens/MapScreen.tsx'), 'utf8');
  assert.match(routing, /steps=true/);
  assert.match(routing, /getRouteGuidance/);
  assert.match(mapScreen, /<NavigationHud/);
  assert.match(mapScreen, /5 \* 60 \* 1000/);
  assert.match(mapScreen, /pointAlongRoute\(destinationRoadRoute, 5_000\)/);
});

test('free radio accepts secure community streams and rejects cleartext URLs', () => {
  const radio = loadTypeScriptModule('src/services/freeRadio.ts');
  assert.equal(radio.normalizeRadioStation({ name: 'Unsafe', url_resolved: 'http://example.com/live' }), null);
  const station = radio.normalizeRadioStation({
    stationuuid: 'station-1',
    name: 'Community Jazz',
    url_resolved: 'https://example.com/live.mp3',
    tags: 'jazz,community',
    bitrate: 128,
  });
  assert.equal(station.id, 'station-1');
  assert.deepEqual(station.tags, ['jazz', 'community']);
});

test('dynamic route guidance advances and calculates live distance from current position', () => {
  const routing = loadTypeScriptModule('src/services/roadRouting.ts', {
    './navigationPreferences': {getNavigationPreferences:async()=>({avoidFerries:false,avoidHighways:false,avoidUnpaved:false,speedWarnings:true,sound:true,vibration:true,customSpeedKmh:null})},
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
  });
  const steps = [
    { distanceMeters: 400, instruction: 'Đi theo Đường A', roadName: 'Đường A', type: 'depart', modifier: 'straight', position: [10.0, 106.0] },
    { distanceMeters: 300, instruction: 'Rẽ phải vào Đường B', roadName: 'Đường B', type: 'turn', modifier: 'right', position: [10.003, 106.0] },
    { distanceMeters: 500, instruction: 'Đến nơi', roadName: null, type: 'arrive', modifier: null, position: [10.007, 106.0] },
  ];
  // User is at 10.001, 106.0 approaching step 1 (10.003, 106.0)
  const guidance = routing.getRouteGuidance(steps, { latitude: 10.001, longitude: 106.0 });
  assert.ok(guidance);
  assert.equal(guidance.instruction, 'Rẽ phải vào Đường B');
  assert.ok(guidance.distanceMeters > 200 && guidance.distanceMeters < 250);
});

test('curated radio stations are available offline without API dependency', () => {
  const radio = loadTypeScriptModule('src/services/freeRadio.ts');
  assert.ok(Array.isArray(radio.CURATED_RADIO_STATIONS));
  assert.ok(radio.CURATED_RADIO_STATIONS.length >= 3);
  assert.ok(radio.CURATED_RADIO_STATIONS.some(s => s.name.includes('Giao Thông') || s.name.includes('Chill')));
});

test('route proximity evaluates on-route status, deviation, and remaining distance', () => {
  const navigation = loadTypeScriptModule('src/utils/navigation.ts');
  // Simple L-shaped route: (10.0, 106.0) -> (10.01, 106.0) -> (10.01, 106.01)
  const route = [
    [10.0, 106.0],
    [10.01, 106.0],
    [10.01, 106.01],
  ];

  // Point right on the first segment (10.005, 106.0)
  const onRoute = navigation.evaluateRouteProximity({ latitude: 10.005, longitude: 106.0 }, route);
  assert.ok(onRoute);
  assert.equal(onRoute.isOnRoute, true);
  assert.ok(onRoute.distanceMeters <= 5);
  assert.ok(onRoute.remainingDistanceMeters > 1500 && onRoute.remainingDistanceMeters < 1800);

  // Point deviating 100 meters away (10.005, 106.001)
  const offRoute = navigation.evaluateRouteProximity({ latitude: 10.005, longitude: 106.001 }, route);
  assert.ok(offRoute);
  assert.equal(offRoute.isOnRoute, false);
  assert.ok(offRoute.distanceMeters > 90);
});

test('OSRM and Valhalla route requests include vehicle heading when available', async () => {
  const requests = [];
  const routing = loadTypeScriptModule('src/services/roadRouting.ts', {
    './navigationPreferences': { getNavigationPreferences: async () => ({ avoidFerries: false, avoidHighways: false, avoidUnpaved: false, speedWarnings: true, sound: true, vibration: true, customSpeedKmh: null }) },
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
  });

  const origin = { latitude: 10.7769, longitude: 106.7009 };
  const destination = { latitude: 10.7798, longitude: 106.6990 };

  // Fetch with heading 45 and accuracy 20
  const globalFetch = global.fetch;
  try {
    global.fetch = async (url, options) => {
      requests.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [{
            distance: 500,
            duration: 90,
            geometry: { coordinates: [[106.7009, 10.7769], [106.6990, 10.7798]] },
            legs: [],
          }],
        }),
      };
    };

    const res = await routing.fetchRoadRoute(origin, destination, 'car', undefined, { heading: 45, accuracy: 20 });
    assert.ok(res);
    assert.equal(res.provider, 'osrm');
    assert.ok(requests.some(r => r.url.includes('bearings=45,60;') && r.url.includes('radiuses=20;')), 'Expected bearings and radiuses in OSRM request URL');
  } finally {
    global.fetch = globalFetch;
  }
});
