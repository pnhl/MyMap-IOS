import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppState} from 'react-native';

// Independent client for the local Connect protocol shipped by Spotube 5.1.2.
// Account credentials, music discovery and playback remain in the companion app.
export const DEFAULT_SPOTUBE_PORT = 8765;
const PORT_KEY = 'mymap.spotube.port.v1';
const CONNECTION_TIMEOUT_MS = 10_000;
const APPROVAL_TIMEOUT_MS = 90_000;
const MAX_MESSAGE_LENGTH = 2_000_000;
const MAX_QUEUE_LENGTH = 500;

export type SpotubeStatus = 'disconnected' | 'connecting' | 'awaitingApproval' | 'connected' | 'error';
export type SpotubeRepeatMode = 'none' | 'loop' | 'single';
export type SpotubeTrack = Readonly<{
  id: string;
  name: string;
  artists: readonly string[];
  artwork: string | null;
  duration: number;
}>;
export type SpotubeSnapshot = Readonly<{
  status: SpotubeStatus;
  error: string | null;
  port: number;
  currentTrack: SpotubeTrack | null;
  queue: readonly SpotubeTrack[];
  currentIndex: number;
  playing: boolean;
  position: number;
  duration: number;
  shuffled: boolean;
  repeatMode: SpotubeRepeatMode;
}>;
export type SpotubeConnectOptions = {
  connectionTimeoutMs?: number;
  approvalTimeoutMs?: number;
};

const EMPTY_QUEUE: readonly SpotubeTrack[] = Object.freeze([]);
const playbackDefaults = {
  currentTrack: null,
  queue: EMPTY_QUEUE,
  currentIndex: 0,
  playing: false,
  position: 0,
  duration: 0,
  shuffled: false,
  repeatMode: 'none' as SpotubeRepeatMode,
};
let snapshot: SpotubeSnapshot = Object.freeze({
  ...playbackDefaults,
  status: 'disconnected',
  error: null,
  port: DEFAULT_SPOTUBE_PORT,
});
const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let generation = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let appStateSubscription: {remove(): void} | null = null;
let pending: {promise: Promise<void>; resolve(): void; reject(error: Error): void} | null = null;
let preferenceLoad: Promise<void> | null = null;
let preferenceRevision = 0;

export const getSpotubeSnapshot = (): SpotubeSnapshot => snapshot;
export function subscribeSpotube(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function update(patch: Partial<SpotubeSnapshot>): void {
  snapshot = Object.freeze({...snapshot, ...patch});
  listeners.forEach(listener => listener());
}

export function isValidSpotubePort(value: unknown): value is number {
  // Spotube allows a custom port. Reserve its -1/random mode for Spotube itself;
  // MyMap connects only to an explicit unprivileged port entered by the user.
  return typeof value === 'number' && Number.isInteger(value) && value >= 5000 && value <= 65535;
}

export function loadSpotubePreferences(): Promise<void> {
  if (!preferenceLoad) {
    const revision = preferenceRevision;
    preferenceLoad = AsyncStorage.getItem(PORT_KEY).then(raw => {
      const port = raw ? Number(raw) : null;
      if (revision === preferenceRevision && isValidSpotubePort(port)) update({port});
    }).catch(() => { /* The default port remains usable if local storage is unavailable. */ });
  }
  return preferenceLoad;
}

function clearTimer(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

function releaseSocket(): void {
  generation++;
  clearTimer();
  appStateSubscription?.remove();
  appStateSubscription = null;
  const previous = socket;
  socket = null;
  if (previous) {
    previous.onopen = null;
    previous.onmessage = null;
    previous.onerror = null;
    previous.onclose = null;
    try { previous.close(); } catch { /* Already closed by Android. */ }
  }
}

function fail(message: string): void {
  const attempt = pending;
  pending = null;
  releaseSocket();
  update({...playbackDefaults, status: 'error', error: message});
  attempt?.reject(new Error(message));
}

export function disconnectSpotube(): void {
  const attempt = pending;
  pending = null;
  releaseSocket();
  update({...playbackDefaults, status: 'disconnected', error: null});
  attempt?.reject(new Error('Kết nối Spotube đã được đóng.'));
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 1000) : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function seconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function repeatMode(value: unknown): SpotubeRepeatMode | null {
  return value === 'none' || value === 'loop' || value === 'single' ? value : null;
}

function normalizeTrack(value: unknown): SpotubeTrack | null {
  const track = record(value);
  if (!track) return null;
  const id = stringValue(track.id), name = stringValue(track.name);
  if (!id || !name) return null;
  const artists = Array.isArray(track.artists)
    ? track.artists.slice(0, 20).map(artist => stringValue(record(artist)?.name)).filter((artist): artist is string => Boolean(artist))
    : [];
  const album = record(track.album);
  const images = Array.isArray(album?.images) ? album.images : [];
  const artwork = images.slice(0, 10).map(image => stringValue(record(image)?.url))
    .find(url => url !== null && /^https:\/\//i.test(url)) ?? null;
  return Object.freeze({
    id, name, artists: Object.freeze(artists), artwork,
    duration: (seconds(track.durationMs) ?? 0) / 1000,
  });
}

function accept(): void {
  if (snapshot.status !== 'connecting' && snapshot.status !== 'awaitingApproval') return;
  clearTimer();
  const attempt = pending;
  pending = null;
  update({status: 'connected', error: null});
  attempt?.resolve();
}

function receive(raw: unknown): void {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_LENGTH) return;
  let event: Record<string, unknown> | null;
  try { event = record(JSON.parse(raw)); } catch { return; }
  if (!event) return;
  const {type, data} = event;
  if (type === 'error') {
    if(data==='Connection denied')fail('Bạn đã từ chối kết nối trong Spotube. Hãy kết nối lại khi muốn sử dụng.');
    else if(snapshot.status==='connected')update({error:'Spotube chưa thực hiện được thao tác. Mở Spotube để kiểm tra bài hát hoặc hàng đợi rồi thử lại.'});
    else fail('Spotube chưa thực hiện được thao tác. Hãy kiểm tra ứng dụng nhạc rồi kết nối lại.');
    return;
  }
  if (type === 'queue') {
    const queue = record(data);
    if (!queue || !Array.isArray(queue.tracks) || typeof queue.currentIndex !== 'number'
      || !Number.isInteger(queue.currentIndex) || queue.currentIndex < 0) return;
    const tracks = Object.freeze(queue.tracks.slice(0, MAX_QUEUE_LENGTH).map(normalizeTrack)
      .filter((track): track is SpotubeTrack => track !== null));
    const currentTrack = normalizeTrack(queue.tracks[queue.currentIndex]);
    const changed = currentTrack?.id !== snapshot.currentTrack?.id;
    update({
      queue: tracks, currentIndex: queue.currentIndex, currentTrack,
      playing: typeof queue.playing === 'boolean' ? queue.playing : snapshot.playing,
      shuffled: typeof queue.shuffled === 'boolean' ? queue.shuffled : snapshot.shuffled,
      repeatMode: repeatMode(queue.loopMode) ?? snapshot.repeatMode,
      ...(changed ? {position: 0, duration: currentTrack?.duration ?? 0} : {}),
    });
    // v5.1.2 emits queue/playing only after the user accepts its Connect dialog.
    // WebSocket onopen itself is deliberately insufficient to authorize controls.
    accept();
  } else if (type === 'playing' && typeof data === 'boolean') {
    update({playing: data});
    accept();
  } else if (type === 'position' && seconds(data) !== null) {
    update({position: snapshot.duration > 0 ? Math.min(data as number, snapshot.duration) : data as number});
  } else if (type === 'duration' && seconds(data) !== null) {
    update({duration: data as number});
  } else if (type === 'shuffle' && typeof data === 'boolean') {
    update({shuffled: data});
  } else if (type === 'loop' && repeatMode(data)) {
    update({repeatMode: repeatMode(data)!});
  }
}

function timeout(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(value, 120_000) : fallback;
}

export function connectSpotube(port: number, options: SpotubeConnectOptions = {}): Promise<void> {
  if (!isValidSpotubePort(port)) {
    return Promise.reject(new Error('Nhập cổng Spotube từ 5000 đến 65535.'));
  }
  if (snapshot.port === port && socket) {
    if (pending) return pending.promise;
    if (snapshot.status === 'connected' && socket.readyState === 1) return Promise.resolve();
  }
  disconnectSpotube();
  preferenceRevision++;
  update({...playbackDefaults, port, status: 'connecting', error: null});
  void AsyncStorage.setItem(PORT_KEY, String(port)).catch(() => { /* Connection can still work without persistence. */ });
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((acceptConnection, rejectConnection) => {
    resolve = acceptConnection;
    reject = rejectConnection;
  });
  pending = {promise, resolve, reject};
  const currentGeneration = generation;
  try {
    const connection = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    socket = connection;
    const current = () => generation === currentGeneration && socket === connection;
    timer = setTimeout(() => {
      if (current()) fail(`Chưa kết nối được Spotube tại cổng ${port}. Mở Spotube trên cùng điện thoại, đặt cổng ${port} (không chọn Ngẫu nhiên), đóng rồi mở lại Spotube để khởi động cổng mới. Quay về MyMap và thử lại.`);
    }, timeout(options.connectionTimeoutMs, CONNECTION_TIMEOUT_MS));
    connection.onopen = () => {
      if (!current() || snapshot.status==='connected') return;
      clearTimer();
      update({status: 'awaitingApproval'});
      timer = setTimeout(() => {
        if (current()) fail('Chưa được Spotube chấp thuận. Mở Spotube, chấp nhận yêu cầu rồi kết nối lại.');
      }, timeout(options.approvalTimeoutMs, APPROVAL_TIMEOUT_MS));
    };
    connection.onmessage = event => { if (current()) receive(event.data); };
    connection.onerror = () => {
      if (current()) fail(`Kết nối Spotube tại cổng ${port} bị gián đoạn. Kiểm tra Spotube đang chạy trên cùng điện thoại và cổng Connect là ${port}. Sau khi đổi cổng, đóng rồi mở lại Spotube và thử lại.`);
    };
    connection.onclose = () => {
      if (current()) fail('Spotube đã ngắt kết nối. Bạn có thể kết nối lại khi ứng dụng nhạc đang mở.');
    };
    // Keep the pending socket while opening Spotube to accept its dialog. On
    // return, release dead sockets; never scan ports or silently reconnect.
    appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active' && current() && connection.readyState > 1) {
        fail('Kết nối Spotube đã đóng khi ứng dụng chạy nền. Hãy kết nối lại.');
      }
    });
  } catch {
    fail('Thiết bị chưa mở được kết nối Spotube. Hãy thử lại sau khi mở ứng dụng nhạc.');
  }
  return promise;
}

function send(type: string, data: unknown = null): void {
  if (snapshot.status !== 'connected' || !socket || socket.readyState !== 1) {
    throw new Error('Kết nối và chấp nhận trong Spotube trước khi điều khiển nhạc.');
  }
  try { socket.send(JSON.stringify({type, data})); }
  catch {
    fail('Spotube đã ngắt kết nối. Hãy kết nối lại để điều khiển nhạc.');
    throw new Error('Chưa gửi được thao tác đến Spotube.');
  }
}

export const playSpotube = (): void => send('resume');
export const pauseSpotube = (): void => send('pause');
export const nextSpotube = (): void => send('next');
export const previousSpotube = (): void => send('previous');
export const stopSpotube = (): void => send('stop');
export function seekSpotube(position: number): void {
  if (seconds(position) === null || !Number.isSafeInteger(Math.floor(position))) throw new Error('Vị trí phát nhạc không hợp lệ.');
  send('seek', Math.floor(snapshot.duration > 0 ? Math.min(position, snapshot.duration) : position));
}
export function shuffleSpotube(shuffled: boolean): void {
  if (typeof shuffled !== 'boolean') throw new Error('Chế độ trộn bài không hợp lệ.');
  send('shuffle', shuffled);
}
export function repeatSpotube(mode: SpotubeRepeatMode): void {
  if (!repeatMode(mode)) throw new Error('Chế độ lặp lại không hợp lệ.');
  send('loop', mode);
}
