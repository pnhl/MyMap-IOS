const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadRouting() {
  const filename = path.resolve(__dirname, '../src/services/roadRouting.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(
    name => name === './traveledTrace' ? require('./helpers.cjs').loadPure('src/services/traveledTrace.ts') : name === './navigationPreferences' ? {getNavigationPreferences:async()=>({avoidFerries:false,avoidHighways:false,avoidUnpaved:false,speedWarnings:true,sound:true,vibration:true,customSpeedKmh:null})} : name === '@react-native-async-storage/async-storage'
      ? { getItem: async () => null, setItem: async () => {} }
      : (() => { throw new Error(`Missing mock for ${name}`); })(),
    module,
    module.exports,
  );
  return module.exports;
}

function encodePolyline6(points) {
  let previousLat = 0;
  let previousLon = 0;
  let encoded = '';
  const encode = value => {
    let number = value < 0 ? ~(value << 1) : value << 1;
    let output = '';
    while (number >= 0x20) {
      output += String.fromCharCode((0x20 | (number & 0x1f)) + 63);
      number >>= 5;
    }
    return output + String.fromCharCode(number + 63);
  };
  for (const [lat, lon] of points) {
    const nextLat = Math.round(lat * 1e6);
    const nextLon = Math.round(lon * 1e6);
    encoded += encode(nextLat - previousLat) + encode(nextLon - previousLon);
    previousLat = nextLat;
    previousLon = nextLon;
  }
  return encoded;
}

test('Valhalla polyline6 decoder preserves Vietnamese coordinates', () => {
  const routing = loadRouting();
  const expected = [[21.028511, 105.854167], [21.033123, 105.861456]];
  const decoded = routing.decodePolyline6(encodePolyline6(expected));
  assert.deepEqual(decoded, expected);
});

test('routing source contains OSRM, GraphHopper, Valhalla and gateway fallbacks', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/services/roadRouting.ts'), 'utf8');
  for (const provider of ['routeWithGateway', 'routeWithOsrm', 'routeWithGraphHopper', 'routeWithValhalla']) {
    assert.ok(source.includes(provider), `Missing routing provider: ${provider}`);
  }
  assert.ok(source.includes('/match/v1/driving/'), 'Recorded routes should use OSRM map matching');
});
