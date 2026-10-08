const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function moduleFromSource(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(
    name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if(name==='./friendSocial'||name==='./profileAvatars')return {resolveProfileAvatar:async()=>null};
      if(name==='./accountApi')return {accountApi:async()=>{const user=await mocks['./auth']?.getCurrentUser();return {owner:user?.id,assertCurrent:async()=>{if(user?.id!==(await mocks['./auth']?.getCurrentUser())?.id)throw Error('account changed');},client:mocks['./supabase'].supabase};}};
      if (name === '../utils/geo') {
        return { distanceMeters: () => 1000 };
      }
      throw new Error(`Missing mock for ${name}`);
    },
    module,
    module.exports,
  );
  return module.exports;
}

function createStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, String(value)); },
    async removeItem(key) { values.delete(key); },
  };
}

test('Firebase/Supabase bridge errors explain the missing cloud configuration', () => {
  const service = moduleFromSource('src/services/friendDiscovery.ts', {
    './platformLocation': {},
    'expo-location': {},
    'react-native': { Share: { share: async () => ({}) } },
    './supabase': { supabase: {} },
  });

  assert.match(
    service.friendError({ message: 'No suitable key or wrong key type' }).message,
    /Firebase.*Supabase/i,
  );
  assert.match(
    service.friendError({ message: 'permission denied for function vc_list_connections' }).message,
    /token Firebase/i,
  );
});

test('Realtime friend cache is isolated per Firebase user', async () => {
  const storage = createStorage();
  let currentUserId = 'firebase-user-a';
  let failLiveQuery = false;

  const liveFriend = {
    id: 'presence-a',
    user_id: 'friend-a',
    display_name: 'Bạn A',
    username: 'ban_a',
    latitude: 21.0285,
    longitude: 105.8542,
    updated_at: new Date().toISOString(),
  };

  const realtimeFriends = moduleFromSource('src/services/realtimeFriends.ts', {
    '@react-native-async-storage/async-storage': storage,
    './auth': { getCurrentUser: async () => ({ id: currentUserId }) },
    './friendDiscovery': {
      listConnections: async () => [{
        user_id: 'friend-a',
        connection_id: 'connection-a',
        direction: 'accepted',
        relationship_status: 'accepted',
        username: 'ban_a',
        display_name: 'Bạn A',
        avatar_path: null,
        created_at: new Date().toISOString(),
      }],
    },
    './friendStatus': { computeCurrentAutomaticStatus: async () => ({}) },
    './sharingPrivacy': {sharedCoordinate:async c=>c},
    './ghostMode': { applyGhostModeToCoords: value => value, getGlobalGhostMode: async () => 'precise' },
    './privacyZones': { maskCoordinateIfPrivate: async (lat, lon) => ({ isMasked: false, latitude: lat, longitude: lon }) },
    './musicStatus': { getUserMusicStatus: async () => null, formatMusicForBroadcast: () => ({}) },
    './supabase': {
      invokeEdgeFunctionWithFallback: async () => ({ error: null }),
      supabase: {
        rpc:async()=>failLiveQuery?{data:null,error:{message:'temporary failure'}}:{data:[liveFriend],error:null},
        from: () => ({
          select: () => ({
            order: async () => failLiveQuery
              ? { data: null, error: { message: 'temporary failure' } }
              : { data: [liveFriend], error: null },
          }),
        }),
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: async () => {},
      },
    },
  });

  const firstUserFriends = await realtimeFriends.getLiveFriends();
  assert.equal(firstUserFriends.length, 1);

  currentUserId = 'firebase-user-b';
  failLiveQuery = true;
  const secondUserFriends = await realtimeFriends.getLiveFriends();
  assert.deepEqual(secondUserFriends, [], 'A different Firebase user must never receive the previous account cache');

  assert.ok(storage.values.has('mymap.realtime_friends.cache.v4:firebase-user-a'));
  assert.ok(!storage.values.has('mymap.realtime_friends.cache.v4:firebase-user-b'));
});

test('Presence writes resolve the Firebase identity inside Postgres', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/services/realtimeFriends.ts'),
    'utf8',
  );

  assert.match(source, /rpc\('vc_upsert_presence'/);
  assert.doesNotMatch(source, /upsert\(\{\s*user_id:\s*user\.id/);
});

test('Firebase fallback migration is fail-closed for claim-less ID tokens', () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../supabase/migrations/20260926012943_firebase_anon_role_bridge.sql'),
    'utf8',
  );

  assert.match(migration, /https:\/\/securetoken\.google\.com\/mymap-a3ae4/);
  assert.match(migration, /auth\.jwt\(\) ->> 'aud' = 'mymap-a3ae4'/);
  assert.match(migration, /as restrictive for all to authenticated, anon/i);
  assert.match(migration, /revoke execute on function/);
  assert.doesNotMatch(migration, /grant .* on all tables in schema public to anon/i);
});
