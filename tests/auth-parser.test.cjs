const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function moduleFromSource(relative, mocks) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(
    name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(name);
    },
    module,
    module.exports
  );
  return module.exports;
}

test('parseAuthParams extracts tokens from hash and query strings correctly', () => {
  const auth = moduleFromSource('src/services/auth.ts', {
    '@react-native-async-storage/async-storage': { default: {}, getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
    '@supabase/supabase-js': {},
    '@react-native-firebase/auth': {},
    'expo-apple-authentication': {},
    'expo-crypto': {},
    '../../modules/my-map-game-center': { default: {} },
    './firebase': { firebaseAuth: {}, firebaseGoogleOAuthConfigured: false },
  });

  // Test hash parameters (typical OAuth redirect)
  const hashUrl = 'mymap://auth/callback#access_token=eyJhbGciOi...&refresh_token=test_refresh&expires_in=3600&token_type=bearer';
  const hashParams = auth.parseAuthParams(hashUrl);
  assert.equal(hashParams.access_token, 'eyJhbGciOi...');
  assert.equal(hashParams.refresh_token, 'test_refresh');
  assert.equal(hashParams.expires_in, '3600');
  assert.equal(hashParams.token_type, 'bearer');

  // Test query parameters (PKCE code flow)
  const queryUrl = 'mymap://auth/callback?code=supabase_auth_code_123';
  const queryParams = auth.parseAuthParams(queryUrl);
  assert.equal(queryParams.code, 'supabase_auth_code_123');

  // Test error in callback
  const errorUrl = 'mymap://auth/callback#error=access_denied&error_description=User%20cancelled';
  const errorParams = auth.parseAuthParams(errorUrl);
  assert.equal(errorParams.error, 'access_denied');
  assert.equal(errorParams.error_description, 'User cancelled');
});

test('Firebase Authentication is the primary identity source for app and Supabase data', () => {
  const authSource = fs.readFileSync(path.resolve(__dirname, '../src/services/auth.ts'), 'utf8');
  const firebaseSource = fs.readFileSync(path.resolve(__dirname, '../src/services/firebase.ts'), 'utf8');
  const supabaseSource = fs.readFileSync(path.resolve(__dirname, '../src/services/supabase.ts'), 'utf8');
  const loginSource = fs.readFileSync(path.resolve(__dirname, '../src/screens/LoginScreen.tsx'), 'utf8');

  assert.match(authSource, /signInWithEmailAndPassword\(firebaseAuth/);
  assert.match(authSource, /createUserWithEmailAndPassword\(firebaseAuth/);
  assert.match(authSource, /firebaseSignInAnonymously\(firebaseAuth/);
  assert.match(authSource, /signInWithPhoneNumber\(firebaseAuth/);
  assert.match(authSource, /AppleAuthProvider\.credential/);
  assert.match(authSource, /GoogleAuthProvider\.credential/);
  assert.match(authSource, /MyMapGameCenter\.signIn/);
  assert.doesNotMatch(authSource, /supabase\.auth\./);
  assert.match(firebaseSource, /getAuth\(\)/);
  assert.doesNotMatch(firebaseSource, /initializeAuth/);
  assert.match(firebaseSource, /getIdToken\(false\)/, 'Supabase must receive the native Firebase ID token');
  assert.doesNotMatch(firebaseSource, /ensureSupabaseRole/, 'Authentication must not depend on a Blaze-only Cloud Function');
  assert.match(authSource, /firebaseSession\(true\)/, 'A completed sign-in must request a fresh Firebase token');
  assert.match(supabaseSource, /accessToken: getFirebaseIdToken/);
  assert.match(loginSource, /GoogleFirebaseButton/);
  assert.match(loginSource, /key: 'phone'/);
  assert.match(loginSource, /handleNativeProvider\('apple'\)/);
  assert.match(loginSource, /handleNativeProvider\('gamecenter'\)/);
});
