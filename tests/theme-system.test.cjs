const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const themeSource = fs.readFileSync(path.join(root, 'src', 'ui', 'theme.tsx'), 'utf8');
const settingsSource = fs.readFileSync(path.join(root, 'src', 'screens', 'SettingsScreen.tsx'), 'utf8');

test('interface theme system exposes six persisted visual styles', () => {
  for (const id of ['ocean', 'aurora', 'sunset', 'forest', 'graphite', 'sakura']) {
    assert.match(themeSource, new RegExp(`id: '${id}'`));
  }
  assert.match(themeSource, /mymap\.interface_theme/);
  assert.match(themeSource, /AsyncStorage\.setItem\(THEME_STORAGE_KEY, id\)/);
  assert.match(settingsSource, /APP_THEMES\.map/);
  assert.match(settingsSource, /accessibilityRole="radio"/);
  for (const layout of ['editorial', 'centered', 'technical']) assert.match(themeSource, new RegExp(`header: '${layout}'`));
  for (const surface of ['glass', 'solid', 'outline', 'layered']) assert.match(themeSource, new RegExp(`surface: '${surface}'`));
  assert.match(settingsSource, /không chỉ đổi màu/);
});
