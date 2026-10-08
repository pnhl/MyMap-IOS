const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relative) {
  return fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');
}

// Regression: ISSUE-001 — the header overlapped the Android status bar and its decorative layers could intercept taps
// Found by /qa on 2026-09-19
// Report: .gstack/qa-reports/qa-report-android-local-2026-09-19.md
test('header button decoration cannot intercept touch events', () => {
  const glass = source('src/ui/glass.tsx');
  const topButton = glass.slice(glass.indexOf('export function TopIconButton'), glass.indexOf('export function GlassSegmentedTabs'));
  assert.match(topButton, /<View pointerEvents="none"/);
  assert.match(topButton, /<MaterialCommunityIcons pointerEvents="none"/);
});

// Regression: ISSUE-002 — scaffold ScrollView expanded past the viewport and could not scroll
// Found by /qa on 2026-09-19
// Report: .gstack/qa-reports/qa-report-android-local-2026-09-19.md
test('screen scaffold constrains scroll content to the available viewport', () => {
  const scaffold = source('src/ui/ScreenScaffold.tsx');
  assert.match(scaffold, /foreground:\s*\{\s*flex:\s*1,/);
  assert.match(scaffold, /paddingBottom:\s*\(actions\.length\?170:88\)\s*\+\s*Math\.max\(insets\.bottom,8\)/);
});

test('normal headers are positioned below the Android system status bar', () => {
  const scaffold = source('src/ui/ScreenScaffold.tsx');
  const map = source('src/screens/MapScreen.tsx');
  assert.match(scaffold, /Math\.max\(insets\.top,\s*Platform\.OS\s*===\s*'android'/);
  assert.match(scaffold, /paddingTop:\s*topInset\s*\+\s*8/);
  assert.match(map, /s\.socialTop,\{top:topInset\+8\}/);
});

test('social map UI keeps primary actions visible and secondary tools collapsible', () => {
  const map = source('src/screens/MapScreen.tsx');
  const dock = source('src/ui/AppDock.tsx');
  const theme = source('src/ui/theme.tsx');
  assert.match(theme, /name:\s*'Atlas'/);
  assert.match(theme, /layout:\s*\{\s*name:\s*'Social map'/);
  assert.match(map, /const \[toolsExpanded, setToolsExpanded\] = useState\(false\)/);
  assert.match(map, /toolsExpanded \? 'close' : 'dots-horizontal'/);
  assert.match(map, /<ActionSheet visible=\{toolsExpanded\}/);
  assert.match(map, /<ActionSheet visible=\{expanded && NATIVE_MAPS_ENABLED\}/);
  assert.match(dock, /const landscapeCompact = r\.isLandscape/);
  assert.match(dock, /landscapeCompact\s*&&\s*\{\s*left:\s*landscapeInset,\s*right:\s*landscapeInset\s*\}/);
  assert.match(dock, /dockCompact\s*\?\s*58\s*:\s*70/);
});
