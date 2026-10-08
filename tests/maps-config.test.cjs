const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function moduleFromSource(relative, mocks) {
  mocks={...mocks,'../services/traveledTrace':require('./helpers.cjs').loadPure('src/services/traveledTrace.ts')};
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(
    name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Missing mock for ${name}`);
    },
    module,
    module.exports
  );
  return module.exports;
}

test('MapLibre Native is always available in native builds', () => {
  const mapsConfig = moduleFromSource('src/config/maps.ts', {});
  assert.equal(mapsConfig.NATIVE_MAPS_ENABLED, true);
});

test('open map styles use the public service or a self-hosted server without keys', () => {
  for (const base of ['https://tiles.openfreemap.org', 'https://maps.example.org/']) {
    const maps = moduleFromSource('src/config/mapProviders.ts', { './env': { env: { openFreeMapBaseUrl: base } } });
    assert.equal(maps.DEFAULT_MAP_PROVIDER, 'openfreemap_liberty');
    assert.equal(maps.is3DMapProvider('openfreemap_liberty_3d'),true);
    assert.equal(maps.is3DMapProvider('openfreemap_liberty'),false);
    assert.equal(maps.openMapStyleUrl('openfreemap_liberty_3d'),`${base.replace(/\/$/,'')}/styles/liberty`);
    for (const style of maps.OPEN_MAP_STYLES) {
      assert.equal(maps.openMapStyleUrl(style.id), `${base.replace(/\/$/, '')}/styles/${style.style}`);
      assert.equal(maps.isMapTileProvider(style.id), true);
      assert.equal(maps.isOpenMapProvider(style.id), true);
    }
    assert.equal(maps.openMapStyleUrl('satellite'), null);
    assert.equal(maps.isMapTileProvider('unknown'), false);
    assert.equal(maps.isMapTileProvider(null), false);
    assert.equal(maps.isMapTileProvider('osm'), true);
  }
});

function offlineFixture(template, fail = false) {
  const files = new Map(); const storage = new Map(); let downloads = 0;
  const offline = moduleFromSource('src/services/offlineMap.ts', {
    '../config/env': { env: { offlineTileUrl: template } },
    '@react-native-async-storage/async-storage': { getItem: async key => storage.get(key) || null, setItem: async (key, value) => storage.set(key, value) },
    'expo-file-system/legacy': {
      documentDirectory: 'file:///test/', getInfoAsync: async file => ({ exists: files.has(file), size: files.get(file) || 0 }),
      EncodingType:{Base64:'base64'},readAsStringAsync:async()=>Buffer.from('\x89PNG\r\n\x1a\n','latin1').toString('base64'),
      makeDirectoryAsync: async () => {}, deleteAsync: async file => files.delete(file),
      downloadAsync: async (url, file) => { downloads++; assert.ok(url.startsWith('https://maps.example.org/')); if (fail) return { status: 503 }; files.set(file, 256); return { status: 200 }; },
    },
  });
  return { offline, storage, downloads: () => downloads };
}

test('offline packs reject public OSM bulk downloads and unconfigured sources', async () => {
  for (const template of ['', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png']) {
    const fixture = offlineFixture(template);
    await assert.rejects(fixture.offline.downloadCityOfflinePack('hanoi'));
    assert.equal(fixture.downloads(), 0);
    assert.equal(fixture.storage.size, 0);
  }
});

test('configured offline packs count actual files and do not claim failed downloads', async () => {
  const template = 'https://maps.example.org/{z}/{x}/{y}.png';
  const fixture = offlineFixture(template);
  const pack = await fixture.offline.downloadCityOfflinePack('hanoi');
  assert.equal(pack.tileCount, 18); assert.equal(pack.sizeBytes, 18 * 256);
  await fixture.offline.downloadCityOfflinePack('hanoi');
  assert.equal(fixture.downloads(), 18, 'Retry uses the actual cached files');
  const failed = offlineFixture(template, true);
  await assert.rejects(failed.offline.downloadCityOfflinePack('hanoi'), /0\/18/);
  assert.equal(failed.storage.size, 0);
});

test('web vector map renders the selected style and both road routes in longitude/latitude order', () => {
  const env = { osmTileUrl: 'https://maps.example.org/{z}/{x}/{y}.png', mapLibreDemUrl: '', cesiumIonToken: '' };
  const web = moduleFromSource('src/components/WebMapEngine.tsx', {
    react: { forwardRef: fn => fn, useMemo: fn => fn(), useEffect:()=>{}, useRef: value => ({ current: value }), useCallback: fn => fn, useImperativeHandle: () => {}, createElement: (type, props, ...children) => ({ type, props, children }) },
    'react-native': { View: 'View', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: value => value, absoluteFill: {} } },
    'react-native-webview': { WebView: 'WebView' },
    '../config/env': { env },
    '../config/mapProviders': { is3DMapProvider:()=>false,openMapStyleUrl: provider => provider === 'openfreemap_dark' ? 'https://tiles.openfreemap.org/styles/dark' : null },
  });
  const tree = web.WebMapEngine({ engine: 'maplibre_gl', tileProvider: 'openfreemap_dark', currentPosition: null, todayRoadRoute: [[21.1, 105.8], [21.2, 105.9]], destinationRoadRoute: [[10.1, 106.8], [10.2, 106.9]] }, null);
  const html = tree.children[0].props.source.html;
  const payload = JSON.parse(html.match(/const payload=(.*?);const send=/)[1]);
  assert.deepEqual(payload.todaySegments, [[[105.8, 21.1], [105.9, 21.2]]]);
  assert.deepEqual(payload.destinationRoute, [[106.8, 10.1], [106.9, 10.2]]);
  assert.equal(payload.vectorStyleUrl, 'https://tiles.openfreemap.org/styles/dark');
});

test('map renderer exposes native, web and 3D engines', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/components/MapRenderer.tsx'), 'utf8');
  for (const engine of ['maplibre_native', 'leaflet', 'maplibre_gl', 'openlayers', 'cesium']) {
    assert.ok(source.includes(engine), `Missing renderer engine: ${engine}`);
  }
});

test('geo distance between current location and destination calculates correctly', () => {
  const geo = moduleFromSource('src/utils/geo.ts', {});
  const origin = { latitude: 21.028511, longitude: 105.804817 }; // Hanoi
  const destination = { latitude: 10.823099, longitude: 106.629664 }; // HCMC
  const meters = geo.distanceMeters(origin, destination);
  assert.ok(meters > 1100000 && meters < 1200000, `Expected ~1140km, got ${meters}m`);
  const km = (meters / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  assert.ok(km.length > 0);
});

test('embedded leaflet bundle contains valid CSS, JS and heat engine', () => {
  const bundle = moduleFromSource('src/components/leafletBundle.ts', {});
  assert.ok(bundle.LEAFLET_CSS && bundle.LEAFLET_CSS.length > 5000, 'LEAFLET_CSS should be populated');
  assert.ok(bundle.LEAFLET_JS && bundle.LEAFLET_JS.length > 100000, 'LEAFLET_JS should be populated');
  assert.ok(bundle.LEAFLET_HEAT_JS && bundle.LEAFLET_HEAT_JS.length > 3000, 'LEAFLET_HEAT_JS should be populated');
  assert.ok(bundle.LEAFLET_JS.includes('tileLayer'), 'Leaflet core map API must exist');
});
