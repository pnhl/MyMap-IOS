const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const mapScreen = fs.readFileSync(path.join(root, 'src/screens/MapScreen.tsx'), 'utf8');
const smartScreen = fs.readFileSync(path.join(root, 'src/screens/SmartScreen.tsx'), 'utf8');
const weatherService = fs.readFileSync(path.join(root, 'src/services/weather.ts'), 'utf8');

test('weather loads from a current or recorded position without requiring sign-in', () => {
  assert.match(mapScreen, /const weatherPosition = currentPosition \|\| latestPoint/);
  assert.doesNotMatch(mapScreen, /if \(!session \|\| !active\) return/);
  assert.doesNotMatch(smartScreen, /if\(p&&session\)/);
  assert.match(smartScreen, /if\(p\)\{try\{const w=await fetchWeather/);
  assert.match(mapScreen, /setWeatherRefreshKey\(value => value \+ 1\)/);
});

test('public weather requests do not inherit a Firebase token', () => {
  assert.match(weatherService, /Authorization: `Bearer \$\{SUPABASE_PUBLISHABLE_KEY\}`/);
  assert.match(weatherService, /apikey: SUPABASE_PUBLISHABLE_KEY/);
  assert.match(weatherService, /timeout: 8_000/);
});

test('weather falls back to Open-Meteo and validates its payload', () => {
  assert.match(weatherService, /fetchOpenMeteoWeather\(latitude, longitude\)/);
  assert.match(weatherService, /isWeatherSnapshot\(snapshot\)/);
  assert.match(weatherService, /controller\.abort\(\), 12_000/);
});
