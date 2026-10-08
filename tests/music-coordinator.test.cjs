const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
const radio = {id: 'radio-a', kind: 'radio', title: 'Journey radio', artist: 'Radio', uri: 'https://example.test/radio'};
const remoteTrack = {id: 'remote-a', name: 'Companion song', artists: ['Artist'], artwork: null, duration: 180};

function fixture({delayPause = false, initialBadge = null} = {}) {
  let local = {ready: true, current: null, playing: false, shareNowPlaying: false};
  let remote = {status: 'disconnected', currentTrack: null, playing: false, position: 0};
  let coreOperations = Promise.resolve(), releasePause, pauseStarted = false, badge = initialBadge;
  const gate = delayPause ? new Promise(resolve => {releasePause = resolve;}) : Promise.resolve();
  const coreListeners = new Set(), remoteListeners = new Set(), calls = [], metadata = [];
  let clears = 0;
  const updateLocal = patch => {local = {...local, ...patch}; for (const listener of coreListeners) listener();};
  const updateRemote = patch => {remote = {...remote, ...patch}; for (const listener of remoteListeners) listener();};
  const serializeCore = work => {coreOperations = coreOperations.then(work); return coreOperations;};
  const playback = {
    pauseMusicPlayback: () => serializeCore(async () => {pauseStarted = true; await gate; calls.push('pauseLocal'); updateLocal({playing: false});}),
    setMusicSleepTimer: async () => {await Promise.resolve(); calls.push('clearSleep');},
    setMusicStatusOwnership: active => calls.push(`ownership:${active}`),
    playMusicItem: item => serializeCore(async () => {calls.push('playLocal'); updateLocal({current: item, playing: true});}),
    toggleMusicPlayback: () => serializeCore(async () => {calls.push('toggleLocal'); updateLocal({playing: !local.playing});}),
    nextMusicItem: () => serializeCore(async () => {calls.push('nextLocal');}),
    previousMusicItem: () => serializeCore(async () => {calls.push('previousLocal');}),
    getMusicPlaybackSnapshot: () => local,
    subscribeMusicPlayback: listener => {coreListeners.add(listener); return () => coreListeners.delete(listener);},
  };
  const spotube = {
    getSpotubeSnapshot: () => remote,
    pauseSpotube: () => calls.push('pauseRemote'),
    playSpotube: () => calls.push('playRemote'),
    nextSpotube: () => calls.push('nextRemote'),
    previousSpotube: () => calls.push('previousRemote'),
    subscribeSpotube: listener => {remoteListeners.add(listener); return () => remoteListeners.delete(listener);},
  };
  const mocks = {
    react: {useEffect: callback => callback(), useSyncExternalStore: (_, getSnapshot) => getSnapshot()},
    '../hooks/useMusicPlayback': {useMusicPlayback: () => local},
    '../hooks/useSpotube': {useSpotube: () => remote},
    './freeRadio': {CURATED_RADIO_STATIONS: []},
    './musicPlayback': playback,
    './spotube': spotube,
    './musicStatus': {
      clearUserMusicStatus: async () => {clears++; badge = null;},
      setUserMusicStatus: async value => {metadata.push(value); badge = value;},
    },
  };
  const module = {exports: {}};
  const code = ts.transpileModule(fs.readFileSync('src/services/musicControls.ts', 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(code, {module, exports: module.exports, require: name => mocks[name], Set, Promise});
  return {service: module.exports, updateLocal, updateRemote, releasePause, calls, metadata,
    pauseStarted: () => pauseStarted, local: () => local, clears: () => clears, badge: () => badge,
    coreSubscriptions: () => coreListeners.size, remoteSubscriptions: () => remoteListeners.size};
}

test('a slow Spotube handoff cannot overwrite a newer local music transaction', async () => {
  const f = fixture({delayPause: true});
  const older = f.service.selectMusicSource('spotube');
  await tick();
  assert.equal(f.pauseStarted(), true);
  const newer = f.service.playJourneyMusic(radio);
  f.releasePause();
  await Promise.all([older, newer]);
  assert.equal(f.service.getMusicSource(), 'mymap');
  assert.equal(f.local().playing, true);
  assert.equal(f.local().current.id, radio.id);
  await f.service.toggleJourneyMusic();
  assert.equal(f.local().playing, false);
  assert.equal(f.calls.at(-1), 'toggleLocal');
});

test('delayed Spotube approval cannot stop music chosen after connection began', async () => {
  const f = fixture();
  const intent = f.service.beginSpotubeConnectionIntent();
  await f.service.playJourneyMusic(radio);
  f.updateRemote({status: 'connected', playing: true, currentTrack: remoteTrack});
  const selected = await f.service.selectMusicSource('spotube', intent);
  assert.equal(selected, false);
  assert.equal(f.service.getMusicSource(), 'mymap');
  assert.equal(f.local().playing, true);
  assert.equal(f.calls.filter(call => call === 'pauseLocal').length, 0);
  assert.equal(f.calls.at(-1), 'pauseRemote');
});

test('map, widget and music screens create one semantic remote metadata publisher', async () => {
  const f = fixture();
  f.service.useJourneyMusic(); f.service.useJourneyMusic(); f.service.useJourneyMusic();
  assert.equal(f.coreSubscriptions(), 1);
  assert.equal(f.remoteSubscriptions(), 1);
  f.updateLocal({shareNowPlaying: true});
  f.updateRemote({status: 'connected', playing: true, currentTrack: remoteTrack});
  await f.service.selectMusicSource('spotube');
  await tick();
  assert.equal(f.metadata.length, 1);
  assert.equal(f.metadata[0].songTitle, remoteTrack.name);
  f.updateRemote({position: 1}); f.updateRemote({position: 2}); f.updateRemote({position: 3});
  await tick();
  assert.equal(f.metadata.length, 1);
  f.updateLocal({shareNowPlaying: false});
  await tick();
  assert.equal(f.badge(), null);
  assert.equal(f.clears(), 1);
});

test('handoff to an unconnected Spotube clears the previously playing local badge', async () => {
  const f = fixture({initialBadge: {songTitle: radio.title, isPlaying: true}});
  f.service.useJourneyMusic();
  f.updateLocal({current: radio, playing: true, shareNowPlaying: true});
  await f.service.selectMusicSource('spotube');
  await tick();
  assert.equal(f.local().playing, false);
  assert.equal(f.service.getMusicSource(), 'spotube');
  assert.equal(f.badge(), null);
  assert.equal(f.clears(), 1);
});

test('remote updates cannot publish after a local source takes ownership', async () => {
  const f = fixture();
  f.service.useJourneyMusic();
  f.updateLocal({shareNowPlaying: true});
  f.updateRemote({status: 'connected', playing: true, currentTrack: remoteTrack});
  await f.service.selectMusicSource('spotube');
  await tick();
  await f.service.playJourneyMusic(radio);
  const count = f.metadata.length;
  f.updateRemote({currentTrack: {...remoteTrack, id: 'remote-b', name: 'Remote song after handoff'}});
  await tick();
  assert.equal(f.metadata.length, count);
  assert.equal(f.service.getMusicSource(), 'mymap');
});
