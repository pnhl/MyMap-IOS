const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const button = fs.readFileSync(
  path.join(root, 'src/components/GoogleFirebaseButton.tsx'),
  'utf8',
);
const login = fs.readFileSync(path.join(root, 'src/screens/LoginScreen.tsx'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('Google authentication uses the native SDK instead of Android custom URI OAuth', () => {
  assert.match(button, /@react-native-google-signin\/google-signin/);
  assert.match(button, /GoogleSignin\.configure\(\{/);
  assert.match(button, /webClientId: googleWebClientId/);
  assert.match(button, /GoogleSignin\.signIn\(\)/);
  assert.match(button, /signInWithGoogleToken\(idToken\)/);
  assert.doesNotMatch(button, /expo-auth-session/);
  assert.doesNotMatch(button, /promptAsync/);
});

test('iOS Google authentication uses its own client and no Play Services dependency', () => {
  assert.match(button, /iosClientId: env.googleIosClientId/);
  assert.doesNotMatch(button, /hasPlayServices|PLAY_SERVICES_NOT_AVAILABLE/);
});

test('native Google sign-in dependency is pinned', () => {
  assert.equal(
    packageJson.dependencies['@react-native-google-signin/google-signin'],
    '^16.1.5',
  );
});
