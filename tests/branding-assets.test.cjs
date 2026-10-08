const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('MyMap branding stays on the icon and splash while page headers show page titles', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  assert.equal(config.icon, './assets/branding/app-icon-v2.png');
  assert.equal(config.backgroundColor, '#061326');
  assert.deepEqual(config.platforms, ['ios']);
  const splashPlugin = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
  assert.equal(splashPlugin[1].image, './assets/branding/splash-logo-v2.png');
  assert.equal(splashPlugin[1].backgroundColor, '#061326');

  for (const asset of ['app-icon-v2.png', 'adaptive-foreground-v2.png', 'splash-background-v2.png', 'splash-logo-v2.png']) {
    assert.ok(fs.statSync(path.join(root, 'assets', 'branding', asset)).size > 1_000);
  }

  const header = fs.readFileSync(path.join(root, 'src', 'ui', 'AppHeader.tsx'), 'utf8');
  assert.doesNotMatch(header, /BrandHeader|splash-logo/);
  assert.match(header, /s\.pageTitle/);
});
