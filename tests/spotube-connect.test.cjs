const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const tick = () => new Promise(resolve => setImmediate(resolve));
const track = (id, name = `Track ${id}`) => ({
  id, name, artists: [{id: 'artist', name: 'Artist'}],
  album: {images: [{url: 'file:///private/album.png'}, {url: 'https://example.org/cover.png'}]},
  durationMs: 180000, runtimeType: 'full',
});

function fixture({storedPort = null, failStorage = false, constructorError = false} = {}) {
  const sockets = [], writes = [], appListeners = new Set();
  let getCalls = 0, resolveRead;
  const deferredRead = new Promise(resolve => { resolveRead = resolve; });
  const storage = {
    getItem: async () => { getCalls++; return storedPort === 'deferred' ? deferredRead : storedPort; },
    setItem: async (...args) => { writes.push(args); if (failStorage) throw Error('Storage unavailable'); },
  };
  class Socket {
    constructor(url) {
      if (constructorError) throw Error('Unsupported socket');
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.closed = 0;
      sockets.push(this);
    }
    open() { this.readyState = 1; this.onopen?.({}); }
    message(data) { this.onmessage?.({data: typeof data === 'string' ? data : JSON.stringify(data)}); }
    send(data) { if (this.failSend) throw Error('Gone'); this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; this.closed++; }
    remoteClose() { this.readyState = 3; this.onclose?.({}); }
    error() { this.onerror?.({}); }
  }
  const mocks = {
    '@react-native-async-storage/async-storage': {__esModule: true, default: storage},
    'react-native': {AppState: {addEventListener: (_, cb) => {
      appListeners.add(cb); return {remove: () => appListeners.delete(cb)};
    }}},
  };
  const module = {exports: {}};
  const code = ts.transpileModule(fs.readFileSync('src/services/spotube.ts', 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, require: name => mocks[name],
    WebSocket: Socket, setTimeout, clearTimeout, Promise, Set, Object, Number, JSON,
  });
  return {
    service: module.exports, sockets, writes, getCalls: () => getCalls,
    appListeners, resolveRead,
    appState: state => [...appListeners].forEach(listener => listener(state)),
  };
}

async function connected(f) {
  const promise = f.service.connectSpotube(8765);
  const socket = f.sockets.at(-1);
  socket.open();
  socket.message({type: 'playing', data: false});
  await promise;
  return socket;
}

test('manual connection uses one exact loopback port and never grants control at WebSocket open', async () => {
  const f = fixture(), states = [];
  const unsubscribe = f.service.subscribeSpotube(() => states.push(f.service.getSpotubeSnapshot().status));
  const promise = f.service.connectSpotube(8765);
  const duplicate = f.service.connectSpotube(8765);
  assert.equal(promise, duplicate);
  assert.equal(f.sockets.length, 1);
  const socket = f.sockets[0];
  assert.equal(socket.url, 'ws://127.0.0.1:8765/ws');
  socket.open();
  assert.equal(f.service.getSpotubeSnapshot().status, 'awaitingApproval');
  assert.throws(() => f.service.playSpotube(), /chấp nhận/);
  assert.equal(socket.sent.length, 0);
  socket.message({type: 'playing', data: false});
  await promise;
  assert.equal(f.service.getSpotubeSnapshot().status, 'connected');
  assert.ok(states.includes('awaitingApproval'));
  assert.equal(await f.service.connectSpotube(8765), undefined);
  assert.equal(f.sockets.length, 1);
  unsubscribe(); f.service.disconnectSpotube();
});

test('Spotube consent denial cannot become a connected session and releases its socket/listener', async () => {
  const f = fixture();
  const promise = f.service.connectSpotube(8765);
  const rejection = assert.rejects(promise, /từ chối/);
  const socket = f.sockets[0]; socket.open();
  socket.message({type: 'error', data: 'Connection denied'});
  await rejection;
  assert.equal(f.service.getSpotubeSnapshot().status, 'error');
  assert.equal(socket.closed, 1);
  assert.equal(f.appListeners.size, 0);
  assert.throws(() => f.service.nextSpotube(), /chấp nhận/);
});

test('connection timeout and consent timeout both close the only socket without a retry', async () => {
  for (const open of [false, true]) {
    const f = fixture();
    const promise = f.service.connectSpotube(8765, {connectionTimeoutMs: 15, approvalTimeoutMs: 15});
    const rejection = assert.rejects(promise, open ? /chấp thuận/ : /Chưa kết nối/);
    const socket = f.sockets[0];
    if (open) socket.open();
    await rejection; await tick();
    assert.equal(f.sockets.length, 1);
    assert.equal(socket.closed, 1);
    assert.equal(f.appListeners.size, 0);
    assert.equal(f.service.getSpotubeSnapshot().status, 'error');
  }
});

test('malformed/unknown messages do not accept consent or corrupt playback state', async () => {
  const f = fixture();
  const promise = f.service.connectSpotube(8765, {approvalTimeoutMs: 20});
  const rejection = assert.rejects(promise, /chấp thuận/);
  const socket = f.sockets[0]; socket.open();
  for (const message of ['not-json', '{}', null, {type: 'playing', data: 'true'},
    {type: 'queue', data: {tracks: [], currentIndex: -1}}, {type: 'position', data: -7},
    {type: 'duration', data: '90'}, {type: 'other', data: true}]) socket.message(message);
  assert.equal(f.service.getSpotubeSnapshot().status, 'awaitingApproval');
  assert.equal(f.service.getSpotubeSnapshot().duration, 0);
  assert.equal(f.service.getSpotubeSnapshot().position, 0);
  await rejection;
});

test('queue/currentIndex use actual track metadata; snapshots and nested arrays stay immutable', async () => {
  const f = fixture();
  const promise = f.service.connectSpotube(8765);
  const socket = f.sockets[0]; socket.open();
  socket.message({type: 'queue', data: {
    tracks: [track('one'), track('two')], currentIndex: 1, playing: true,
    shuffled: true, loopMode: 'single', collections: [],
  }});
  await promise;
  const state = f.service.getSpotubeSnapshot();
  assert.equal(state.currentTrack.id, 'two');
  assert.equal(state.currentTrack.duration, 180);
  assert.equal(state.currentTrack.artwork, 'https://example.org/cover.png');
  assert.equal(state.currentTrack.artists[0], 'Artist');
  assert.equal(state.duration, 180);
  assert.equal(state.playing, true);
  assert.equal(state.shuffled, true);
  assert.equal(state.repeatMode, 'single');
  assert.ok(Object.isFrozen(state)); assert.ok(Object.isFrozen(state.queue));
  assert.ok(Object.isFrozen(state.currentTrack)); assert.ok(Object.isFrozen(state.currentTrack.artists));
  assert.equal(f.service.getSpotubeSnapshot(), state);
  socket.message({type: 'position', data: 50});
  assert.equal(state.position, 0);
  assert.equal(f.service.getSpotubeSnapshot().position, 50);
  socket.message({type: 'queue', data: {tracks: [track('three')], currentIndex: 0}});
  assert.equal(f.service.getSpotubeSnapshot().position, 0);
  assert.equal(f.service.getSpotubeSnapshot().currentTrack.id, 'three');
  f.service.disconnectSpotube();
});

test('controls send verified WebSocket events and do not fabricate optimistic playing state', async () => {
  const f = fixture(), socket = await connected(f);
  socket.message({type: 'duration', data: 180});
  f.service.playSpotube(); f.service.pauseSpotube(); f.service.nextSpotube();
  f.service.previousSpotube(); f.service.seekSpotube(999); f.service.shuffleSpotube(true);
  f.service.repeatSpotube('loop'); f.service.stopSpotube();
  assert.deepEqual(socket.sent, [
    {type: 'resume', data: null}, {type: 'pause', data: null}, {type: 'next', data: null},
    {type: 'previous', data: null}, {type: 'seek', data: 180}, {type: 'shuffle', data: true},
    {type: 'loop', data: 'loop'}, {type: 'stop', data: null},
  ]);
  assert.equal(f.service.getSpotubeSnapshot().playing, false);
  assert.throws(() => f.service.seekSpotube(-1), /không hợp lệ/);
  assert.throws(() => f.service.seekSpotube(Infinity), /không hợp lệ/);
  assert.throws(() => f.service.repeatSpotube('forever'), /không hợp lệ/);
  assert.throws(() => f.service.shuffleSpotube('yes'), /không hợp lệ/);
  socket.message({type: 'playing', data: true});
  socket.message({type: 'loop', data: 'single'});
  socket.message({type: 'shuffle', data: true});
  assert.equal(f.service.getSpotubeSnapshot().playing, true);
  assert.equal(f.service.getSpotubeSnapshot().repeatMode, 'single');
  assert.equal(f.service.getSpotubeSnapshot().shuffled, true);
  f.service.disconnectSpotube();
});

test('a track operation error preserves an accepted Spotube socket so controls can retry',async()=>{
 const f=fixture(),socket=await connected(f);
 socket.message({type:'error',data:'No track to resume'});
 assert.equal(f.service.getSpotubeSnapshot().status,'connected');assert.equal(socket.closed,0);
 f.service.nextSpotube();assert.equal(socket.sent.at(-1).type,'next');
 f.service.disconnectSpotube();
});

test('invalid ports cannot scan/connect or interrupt a working local session', async () => {
  const f = fixture(), socket = await connected(f);
  for (const port of [0, 4999, 65536, -1, NaN, Infinity, 8765.2, '8765']) {
    await assert.rejects(f.service.connectSpotube(port), /5000 đến 65535/);
  }
  assert.equal(f.sockets.length, 1);
  assert.equal(socket.closed, 0);
  assert.equal(f.service.getSpotubeSnapshot().status, 'connected');
  assert.equal(f.service.isValidSpotubePort(5000), true);
  assert.equal(f.service.isValidSpotubePort(65535), true);
  f.service.disconnectSpotube();
});

test('disconnect/replacement ignore late events from a previous connection', async () => {
  const f = fixture(), first = await connected(f);
  const late = first.onmessage;
  const pending = f.service.connectSpotube(9000);
  const second = f.sockets[1];
  late({data: JSON.stringify({type: 'playing', data: true})});
  assert.equal(f.service.getSpotubeSnapshot().status, 'connecting');
  assert.equal(f.service.getSpotubeSnapshot().playing, false);
  second.open(); second.message({type: 'queue', data: {tracks: [], currentIndex: 0}});
  await pending;
  assert.equal(f.service.getSpotubeSnapshot().port, 9000);
  assert.equal(first.closed, 1);
  f.service.disconnectSpotube();
  assert.equal(f.service.getSpotubeSnapshot().status, 'disconnected');
  assert.equal(f.appListeners.size, 0);
});

test('port is saved/read once; a late stored preference cannot overwrite the manual selection', async () => {
  const f = fixture({storedPort: 'deferred'});
  const load = f.service.loadSpotubePreferences();
  const socket = await connected(f);
  f.resolveRead('9999'); await load;
  await f.service.loadSpotubePreferences();
  assert.equal(f.getCalls(), 1);
  assert.equal(f.service.getSpotubeSnapshot().port, 8765);
  assert.equal(f.writes[0][1], '8765');
  socket.remoteClose();
  assert.equal(f.service.getSpotubeSnapshot().status, 'error');
  const saved = fixture({storedPort: '9999'}); await saved.service.loadSpotubePreferences();
  assert.equal(saved.service.getSpotubeSnapshot().port, 9999);
  const invalid = fixture({storedPort: '-1'}); await invalid.service.loadSpotubePreferences();
  assert.equal(invalid.service.getSpotubeSnapshot().port, 8765);
});

test('switching to Spotube preserves pending approval; returning with a dead socket does not auto-reconnect', async () => {
  const f = fixture();
  const promise = f.service.connectSpotube(8765);
  const socket = f.sockets[0]; socket.open();
  f.appState('background');
  assert.equal(socket.closed, 0);
  socket.message({type: 'playing', data: false}); await promise;
  socket.readyState = 3;
  f.appState('active');
  assert.equal(f.service.getSpotubeSnapshot().status, 'error');
  assert.equal(f.appListeners.size, 0);
  assert.equal(f.sockets.length, 1);
});

test('construction/send failures release resources and leave no pretend connected state', async () => {
  const unsupported = fixture({constructorError: true});
  await assert.rejects(unsupported.service.connectSpotube(8765), /Thiết bị/);
  assert.equal(unsupported.appListeners.size, 0);
  assert.equal(unsupported.service.getSpotubeSnapshot().status, 'error');
  const f = fixture({failStorage: true}), socket = await connected(f);
  socket.failSend = true;
  assert.throws(() => f.service.playSpotube(), /Chưa gửi/);
  assert.equal(socket.closed, 1);
  assert.equal(f.service.getSpotubeSnapshot().status, 'error');
  await tick();
});
