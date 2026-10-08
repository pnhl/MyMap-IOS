import { AppState } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { clearUserMusicStatus, setUserMusicStatus } from './musicStatus';
import { emptyMusicLibrary, importMusicFiles, MUSIC_LIBRARY_LIMIT, normalizeMusicItem, normalizeMusicItems, readMusicLibrary, removeMusicFile, writeMusicLibrary, type MusicItem, type MusicRepeat, type SavedMusicLibrary } from './musicLibrary';

export type { MusicItem, MusicRepeat } from './musicLibrary';
export type MusicPlaybackSnapshot = SavedMusicLibrary & {
  current: MusicItem | null;
  playing: boolean;
  buffering: boolean;
  loaded: boolean;
  position: number;
  duration: number;
  error: string | null;
  ready: boolean;
};

let snapshot: MusicPlaybackSnapshot = { ...emptyMusicLibrary(), current: null, playing: false, buffering: false, loaded: false, position: 0, duration: 0, error: null, ready: false };
const listeners = new Set<() => void>();
let initialization: Promise<void> | null = null;
let player: AudioPlayer | null = null;
let loadedItemId: string | null = null;
let operations: Promise<void> = Promise.resolve();
let completionHandled = false;
let sourceReady = false;
let playbackAttempt = 0;
let cleaningPlaybackError = false;
let sleepTimer: ReturnType<typeof setTimeout> | null = null;
let duckTimer: ReturnType<typeof setTimeout> | null = null;
let loadTimer: ReturnType<typeof setTimeout> | null = null;
function clearLoadTimer(){if(loadTimer!==null)clearTimeout(loadTimer);loadTimer=null;}
let ducked = false;
let statusOwnership = true;
let ownershipVersion = 0;
let publishedSignature = '';
let metadataWrites: Promise<void> = Promise.resolve();

export const getMusicPlaybackSnapshot = () => snapshot;
export function subscribeMusicPlayback(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function update(value: Partial<MusicPlaybackSnapshot>) {
  snapshot = { ...snapshot, ...value };
  for (const listener of listeners) listener();
}
function persist() { void writeMusicLibrary(snapshot).catch(() => {}); }

function syncSharing() {
  if (!statusOwnership || !snapshot.ready) return;
  const current = snapshot.current;
  const signature = snapshot.shareNowPlaying && snapshot.playing && current ? `${current.id}|${current.title}|${current.artist}|${current.artworkUrl || ''}` : '';
  if (signature === publishedSignature) return;
  publishedSignature = signature;
  const version = ownershipVersion;
  metadataWrites = metadataWrites.catch(() => {}).then(async () => {
    if (!statusOwnership || version !== ownershipVersion) return;
    if (!signature || !current) await clearUserMusicStatus();
    else await setUserMusicStatus({ songTitle: current.title, artistName: current.artist, albumCoverUrl: current.artworkUrl, isPlaying: true });
  });
}

export function setMusicStatusOwnership(active: boolean) {
  statusOwnership = active; ownershipVersion++;
  publishedSignature = active ? '\u0000' : '';
  if (active) syncSharing();
}

function armSleepTimer() {
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = null;
  const deadline = snapshot.sleepUntil;
  if (deadline === null) return;
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    update({ sleepUntil: null }); persist();
    void pauseMusicPlayback().catch(() => {});
    return;
  }
  sleepTimer = setTimeout(armSleepTimer, Math.min(remaining, 60_000));
}

export function initializeMusicPlayback(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    const saved = await readMusicLibrary();
    update({ ...saved, current: saved.queue[saved.currentIndex] || null, ready: true, playing: false });
    // A saved badge describes an earlier session, never a running player after launch.
    if (statusOwnership) await clearUserMusicStatus();
    publishedSignature = '';
    AppState.addEventListener('change', state => { if (state === 'active') armSleepTimer(); });
    armSleepTimer();
  })().catch(() => { update({ ready: true }); });
  return initialization;
}

function ensurePlayer(): AudioPlayer {
  if (!player) {
    const created = createAudioPlayer(null, { updateInterval: 1000, keepAudioSessionActive: false });
    player = created;
    created.addListener('playbackStatusUpdate', status => { if (player === created) receiveStatus(status); });
  }
  return player;
}

function receiveStatus(status: AudioStatus) {
  if(cleaningPlaybackError)return;
  if(status.error || status.playbackState === 'error') {
    clearLoadTimer();
    update({playing:false,buffering:false,loaded:false,error:'Không phát được nguồn âm thanh này. Hãy chọn nguồn khác.'});
    syncSharing();
    if(!cleaningPlaybackError) {
      cleaningPlaybackError=true;
      const attempt=playbackAttempt;
      void runPlayback(async()=>{
        if(attempt!==playbackAttempt)return;
        await pauseNative();
        loadedItemId=null;
        sourceReady=false;
      }).catch(()=>{});
    }
    return;
  }
  if (status.isLoaded && !status.didJustFinish) sourceReady = true;
  if(status.playing)clearLoadTimer();
  const error = status.error || status.playbackState === 'error' ? 'Không phát được nguồn âm thanh này. Hãy chọn nguồn khác.' : snapshot.error;
  update({ playing: status.playing, buffering: status.isBuffering, loaded: status.isLoaded,
    position: Number.isFinite(status.currentTime) ? Math.max(0, status.currentTime) : 0,
    duration: Number.isFinite(status.duration) ? Math.max(0, status.duration) : 0, error });
  syncSharing();
  if (snapshot.sleepUntil !== null && snapshot.sleepUntil <= Date.now()) armSleepTimer();
  if (status.didJustFinish && sourceReady && !completionHandled && snapshot.current?.kind === 'local') {
    completionHandled = true;
    void runPlayback(async () => {
      if (snapshot.repeat === 'one') { await playCurrent(true); return; }
      const next = nextIndex(1, false);
      if (next < 0) { await pauseNative(); return; }
      selectIndex(next); await playCurrent();
    }).catch(() => {});
  }
}

function runPlayback(work: () => Promise<void>): Promise<void> {
  operations = operations.catch(() => {}).then(async () => { await initializeMusicPlayback(); await work(); }).catch(error => {
    update({ error: error instanceof Error ? error.message : 'Chưa thể phát nhạc.' });
    throw error;
  });
  return operations;
}

async function playCurrent(restart = false) {
  const current = snapshot.current;
  if (!current) return;
  if (snapshot.sleepUntil !== null && snapshot.sleepUntil <= Date.now()) { armSleepTimer(); return; }
  playbackAttempt++;
  clearLoadTimer();
  cleaningPlaybackError=false;
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, allowsRecording: false, interruptionMode: 'doNotMix' });
  await setIsAudioActiveAsync(true);
  const audio = ensurePlayer();
  if (loadedItemId !== current.id) {
    audio.pause(); sourceReady = false; completionHandled = false;
    audio.replace(current.uri); loadedItemId = current.id;
    update({ position: 0, duration: 0, loaded: false, buffering: true, error: null });
  } else if (restart || completionHandled) {
    // Native can deliver the previous ended event while the seek is pending.
    // Wait for a fresh loaded/non-ended status before accepting completion again.
    sourceReady = false;
    completionHandled = false;
    await audio.seekTo(0);
  }
  audio.volume = ducked ? snapshot.volume * .25 : snapshot.volume;
  audio.setActiveForLockScreen(true, { title: current.title, artist: current.artist, artworkUrl: current.artworkUrl || undefined },
    { isLiveStream: current.kind === 'radio', showSeekBackward: current.kind === 'local', showSeekForward: current.kind === 'local' });
  const attempt=playbackAttempt;
  loadTimer=setTimeout(()=>{
    loadTimer=null;if(attempt!==playbackAttempt||snapshot.playing)return;
    cleaningPlaybackError=true;
    update({playing:false,buffering:false,loaded:false,error:'Nguồn nhạc phản hồi quá lâu. Kiểm tra mạng, thử lại hoặc chọn kênh khác.'});syncSharing();
    void runPlayback(async()=>{if(attempt!==playbackAttempt)return;await pauseNative();loadedItemId=null;sourceReady=false;}).catch(()=>{});
  },20000);
  audio.play();
  update({ error: null });
  const history = [current, ...snapshot.history.filter(item => item.id !== current.id)].slice(0, 30);
  update({ history }); persist();
}

async function pauseNative() {
  clearLoadTimer();
  player?.pause();
  player?.clearLockScreenControls();
  await setIsAudioActiveAsync(false);
}

function selectIndex(currentIndex: number) {
  update({ currentIndex, current: snapshot.queue[currentIndex] || null, error: null }); persist();
}

function nextIndex(direction: 1 | -1, manual = true): number {
  if (!snapshot.queue.length) return -1;
  if (snapshot.shuffle && snapshot.queue.length > 1) {
    const choices = snapshot.queue.map((_, index) => index).filter(index => index !== snapshot.currentIndex);
    return choices[Math.floor(Math.random() * choices.length)] ?? 0;
  }
  const candidate = snapshot.currentIndex + direction;
  if (candidate >= 0 && candidate < snapshot.queue.length) return candidate;
  if (manual || snapshot.repeat === 'all') return direction > 0 ? 0 : snapshot.queue.length - 1;
  return -1;
}

export function playMusicItem(item: MusicItem, queue?: MusicItem[]): Promise<void> {
  return runPlayback(async () => {
    const clean = normalizeMusicItem(item);
    if (!clean) throw new Error('Nguồn nhạc không hợp lệ.');
    const items = normalizeMusicItems(queue || [clean]);
    if (!items.some(value => value.id === clean.id)) items.unshift(clean);
    const bounded = items.slice(0, MUSIC_LIBRARY_LIMIT);
    update({ queue: bounded, currentIndex: bounded.findIndex(value => value.id === clean.id), current: clean });
    await playCurrent();
  });
}

export function toggleMusicPlayback(): Promise<void> { return runPlayback(async () => { if (player?.playing) await pauseNative(); else await playCurrent(); }); }
export function pauseMusicPlayback(): Promise<void> { return runPlayback(pauseNative); }
export function stopMusicPlayback(): Promise<void> {
  return runPlayback(async () => { await pauseNative(); player?.remove(); player = null; loadedItemId = null; sourceReady = false; completionHandled = false;
    if (sleepTimer) clearTimeout(sleepTimer); sleepTimer = null;
    update({ queue: [], currentIndex: -1, current: null, playing: false, loaded: false, buffering: false, position: 0, duration: 0, sleepUntil: null }); syncSharing(); persist(); });
}
export function nextMusicItem(): Promise<void> { return runPlayback(async () => { const index = nextIndex(1); if (index >= 0) { selectIndex(index); await playCurrent(); } }); }
export function previousMusicItem(): Promise<void> { return runPlayback(async () => {
  if (snapshot.current?.kind === 'local' && snapshot.position > 3 && player) { await player.seekTo(0); return; }
  const index = nextIndex(-1); if (index >= 0) { selectIndex(index); await playCurrent(); }
}); }
export function enqueueMusicItem(item: MusicItem): Promise<void> { return runPlayback(async () => {
  const clean = normalizeMusicItem(item); if (!clean) throw new Error('Nguồn nhạc không hợp lệ.');
  if (snapshot.queue.some(value => value.id === clean.id)) return;
  if (snapshot.queue.length >= MUSIC_LIBRARY_LIMIT) throw new Error('Hàng đợi đã có 100 mục.');
  update({ queue: [...snapshot.queue, clean] }); if (!snapshot.current) selectIndex(0); persist();
}); }
export function removeQueuedMusicItem(id: string): Promise<void> { return runPlayback(async () => {
  const index = snapshot.queue.findIndex(item => item.id === id); if (index < 0) return;
  const wasCurrent = snapshot.current?.id === id, playing = Boolean(player?.playing);
  const queue = snapshot.queue.filter(item => item.id !== id);
  if (wasCurrent) await pauseNative();
  const currentIndex = queue.length ? wasCurrent ? Math.min(index, queue.length - 1) : Math.max(0, snapshot.currentIndex - (index < snapshot.currentIndex ? 1 : 0)) : -1;
  update({ queue, currentIndex, current: queue[currentIndex] || null }); persist();
  if (wasCurrent && playing && queue.length) await playCurrent();
}); }
export function seekMusicPlayback(seconds: number): Promise<void> { return runPlayback(async () => {
  if (!player || snapshot.current?.kind !== 'local' || !Number.isFinite(seconds)) return;
  await player.seekTo(Math.max(0, Math.min(seconds, snapshot.duration || seconds)));
}); }

export async function setMusicVolume(volume: number) {
  await initializeMusicPlayback(); if (!Number.isFinite(volume)) return;
  update({ volume: Math.max(0, Math.min(1, volume)) }); if (player) player.volume = ducked ? snapshot.volume * .25 : snapshot.volume; persist();
}
export async function setMusicShuffle(shuffle: boolean) { await initializeMusicPlayback(); update({ shuffle: Boolean(shuffle) }); persist(); }
export async function setMusicRepeat(repeat: MusicRepeat) { await initializeMusicPlayback(); if (repeat !== 'off' && repeat !== 'all' && repeat !== 'one') return; update({ repeat }); persist(); }
export async function setMusicSleepTimer(minutes: number | null) {
  await initializeMusicPlayback();
  update({ sleepUntil: minutes !== null && Number.isFinite(minutes) && minutes > 0 ? Date.now() + Math.min(1440, minutes) * 60_000 : null }); persist(); armSleepTimer();
}
export async function setMusicSharing(shareNowPlaying: boolean) { await initializeMusicPlayback(); update({ shareNowPlaying: Boolean(shareNowPlaying) }); syncSharing(); persist(); }
export async function toggleMusicFavorite(item: MusicItem) {
  await initializeMusicPlayback(); const clean = normalizeMusicItem(item); if (!clean) return;
  const exists = snapshot.favorites.some(value => value.id === clean.id);
  update({ favorites: exists ? snapshot.favorites.filter(value => value.id !== clean.id) : [clean, ...snapshot.favorites].slice(0, MUSIC_LIBRARY_LIMIT) }); persist();
}
export function importLocalMusic(): Promise<void> { return runPlayback(async () => {
  const added = await importMusicFiles(snapshot.localTracks); if (!added.length) return;
  update({ localTracks: [...snapshot.localTracks, ...added], error:null }); await writeMusicLibrary(snapshot);
}); }
export function deleteLocalMusic(id: string): Promise<void> { return runPlayback(async () => {
  const item = snapshot.localTracks.find(track => track.id === id); if (!item) return;
  const deletingCurrent = snapshot.current?.id === id;
  if (deletingCurrent) { await pauseNative(); loadedItemId = null; player?.replace(null); }
  const queue = snapshot.queue.filter(track => track.id !== id);
  const selectedId = snapshot.current?.id === id ? null : snapshot.current?.id;
  const currentIndex = queue.length ? Math.max(0, queue.findIndex(track => track.id === selectedId)) : -1;
  update({ localTracks: snapshot.localTracks.filter(track => track.id !== id), favorites: snapshot.favorites.filter(track => track.id !== id), history: snapshot.history.filter(track => track.id !== id), queue, currentIndex, current: queue[currentIndex] || null,
    ...(deletingCurrent ? { loaded: false, buffering: false, position: 0, duration: 0 } : {}) });
  await writeMusicLibrary(snapshot); await removeMusicFile(item); syncSharing();
}); }

export function duckMusicForWarning(durationMs = 900) {
  if (!player?.playing) return;
  if (duckTimer) clearTimeout(duckTimer);
  ducked = true; player.volume = snapshot.volume * .25;
  duckTimer = setTimeout(() => { ducked = false; duckTimer = null; if (player) player.volume = snapshot.volume; }, Math.max(100, Math.min(10_000, durationMs)));
}
