import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { travelNative } from './travelPlatform';

export type MusicItem = {
  id: string;
  title: string;
  artist: string;
  uri: string;
  kind: 'radio' | 'local';
  artworkUrl?: string | null;
  fileName?: string;
};
export type MusicRepeat = 'off' | 'all' | 'one';
export type SavedMusicLibrary = {
  localTracks: MusicItem[];
  favorites: MusicItem[];
  history: MusicItem[];
  queue: MusicItem[];
  currentIndex: number;
  shuffle: boolean;
  repeat: MusicRepeat;
  volume: number;
  sleepUntil: number | null;
  shareNowPlaying: boolean;
};

const STORAGE_KEY = 'mymap.music.library.v1';
export const MUSIC_LIBRARY_LIMIT = 100;
export const MUSIC_FILE_LIMIT_BYTES = 100 * 1024 * 1024;
export const MUSIC_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024;
const AUDIO_EXTENSION = /\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i;
const MANAGED_FILE_NAME = /^audio-[a-z0-9-]+\.(mp3|m4a|aac|wav|ogg|flac|opus)$/;
const AUDIO_MIME_EXTENSIONS: Record<string, string> = {
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/aac': 'aac',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/ogg': 'ogg',
  'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/opus': 'opus',
};
let writes: Promise<void> = Promise.resolve();

export function emptyMusicLibrary(): SavedMusicLibrary {
  return { localTracks: [], favorites: [], history: [], queue: [], currentIndex: -1, shuffle: false, repeat: 'off', volume: .8, sleepUntil: null, shareNowPlaying: false };
}

function musicDirectory() { return new Directory(Paths.document, 'music'); }

export function isManagedMusicUri(uri: string): boolean {
  try {
    const root = musicDirectory().uri.replace(/\/$/, '') + '/';
    if (!uri.startsWith(root)) return false;
    return MANAGED_FILE_NAME.test(decodeURIComponent(uri.slice(root.length)));
  } catch { return false; }
}

export function normalizeMusicItem(value: unknown): MusicItem | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 180 || typeof raw.title !== 'string' || !raw.title.trim() || typeof raw.uri !== 'string' || raw.uri.length > 4096) return null;
  const kind = raw.kind;
  if (kind !== 'radio' && kind !== 'local') return null;
  if (kind === 'local' ? !isManagedMusicUri(raw.uri) : !/^https:\/\//i.test(raw.uri)) return null;
  return { id: raw.id, title: raw.title.trim().slice(0, 180), artist: typeof raw.artist === 'string' ? raw.artist.trim().slice(0, 180) : '', uri: raw.uri, kind,
    artworkUrl: typeof raw.artworkUrl === 'string' && /^https:\/\//i.test(raw.artworkUrl) ? raw.artworkUrl : null,
    ...(kind === 'local' ? { fileName: decodeURIComponent(raw.uri.split('/').pop() || '') } : {}) };
}

export function normalizeMusicItems(value: unknown, limit = MUSIC_LIBRARY_LIMIT): MusicItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: MusicItem[] = [];
  for (const raw of value) {
    const item = normalizeMusicItem(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id); items.push(item);
    if (items.length >= limit) break;
  }
  return items;
}

export function parseMusicLibrary(value: unknown): SavedMusicLibrary {
  const defaults = emptyMusicLibrary();
  if (!value || typeof value !== 'object') return defaults;
  const raw = value as Record<string, unknown>;
  const queue = normalizeMusicItems(raw.queue);
  const localTracks = normalizeMusicItems(raw.localTracks).filter(item => item.kind === 'local');
  const currentIndex = typeof raw.currentIndex === 'number' && Number.isInteger(raw.currentIndex) && raw.currentIndex >= 0 && raw.currentIndex < queue.length ? raw.currentIndex : queue.length ? 0 : -1;
  return { localTracks, queue, currentIndex, favorites: normalizeMusicItems(raw.favorites), history: normalizeMusicItems(raw.history, 30),
    shuffle: raw.shuffle === true, repeat: raw.repeat === 'all' || raw.repeat === 'one' ? raw.repeat : 'off',
    volume: typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? Math.min(1, Math.max(0, raw.volume)) : defaults.volume,
    sleepUntil: typeof raw.sleepUntil === 'number' && Number.isFinite(raw.sleepUntil) && raw.sleepUntil > Date.now() ? raw.sleepUntil : null,
    shareNowPlaying: raw.shareNowPlaying === true };
}

export async function readMusicLibrary(): Promise<SavedMusicLibrary> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw && raw.length <= 2_000_000 ? parseMusicLibrary(JSON.parse(raw)) : emptyMusicLibrary();
  } catch { return emptyMusicLibrary(); }
}

export function writeMusicLibrary(library: SavedMusicLibrary): Promise<void> {
  const serialized = JSON.stringify(parseMusicLibrary(library));
  writes = writes.catch(() => {}).then(() => AsyncStorage.setItem(STORAGE_KEY, serialized));
  return writes;
}

export async function importMusicFiles(existing: MusicItem[]): Promise<MusicItem[]> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw new Error('Nhập nhạc cần ứng dụng Android hoặc iOS.');
  if (existing.length >= MUSIC_LIBRARY_LIMIT) throw new Error('Thư viện đã có 100 tệp. Hãy xóa một tệp trước khi nhập thêm.');
  const picked = await File.pickFileAsync({ mimeTypes: 'audio/*', multipleFiles: true });
  if (picked.canceled) return [];
  const directory = musicDirectory();
  directory.create({ idempotent: true, intermediates: true });
  let total = directory.size ?? 0;
  const created: MusicItem[] = [];
  try {
    for (const [index, source] of picked.result.entries()) {
      if (existing.length + created.length >= MUSIC_LIBRARY_LIMIT) throw new Error('Mỗi thư viện hỗ trợ tối đa 100 tệp nhạc.');
      // Android SAF URI basenames are document IDs, not the selected filename.
      // Query DISPLAY_NAME before deciding the type; keep imported paths generated.
      const document = Platform.OS === 'android'
        ? await travelNative?.getAudioDocumentInfo?.(source.uri).catch(() => null)
        : null;
      const displayName = typeof document?.name === 'string' && document.name.trim() ? document.name.trim() : null;
      const name = displayName || source.name;
      const namedExtension = AUDIO_EXTENSION.exec(name)?.[1]?.toLowerCase();
      const mimeType = (document?.mimeType || source.type || '').split(';')[0]?.trim().toLowerCase() || '';
      const hasOtherExtension = /\.[a-z0-9]{1,12}$/i.test(name);
      const extension = namedExtension || (!hasOtherExtension ? AUDIO_MIME_EXTENSIONS[mimeType] : undefined);
      if (!extension) throw new Error('Hỗ trợ MP3, M4A, AAC, WAV, OGG, FLAC và OPUS.');
      const size = source.size;
      if (!Number.isFinite(size) || size <= 0 || size > MUSIC_FILE_LIMIT_BYTES) throw new Error('Không thể đọc tệp hoặc tệp vượt quá 100 MB.');
      if (total + size > MUSIC_STORAGE_LIMIT_BYTES) throw new Error('Nhạc nhập vào MyMap được giới hạn ở 500 MB.');
      const id = `audio-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 10)}`;
      const target = new File(directory, `${id}.${extension}`);
      const title = (displayName || namedExtension ? name.replace(AUDIO_EXTENSION, '') : 'Nhạc đã nhập').replace(/[\u0000-\u001f\\/]/g, ' ').trim().slice(0, 180) || 'Nhạc đã nhập';
      const item: MusicItem = { id, title, artist: 'Nhạc trên thiết bị', uri: target.uri, kind: 'local', fileName: target.name };
      created.push(item);
      await source.copy(target);
      if (target.size <= 0 || target.size > MUSIC_FILE_LIMIT_BYTES) throw new Error('Tệp nhạc không hợp lệ hoặc vượt quá giới hạn.');
      total += target.size;
      if (total > MUSIC_STORAGE_LIMIT_BYTES) throw new Error('Nhạc nhập vào MyMap được giới hạn ở 500 MB.');
    }
    return created;
  } catch (error) {
    for (const item of created) await removeMusicFile(item).catch(() => {});
    throw error;
  }
}

export async function removeMusicFile(item: MusicItem): Promise<void> {
  if (item.kind !== 'local' || !isManagedMusicUri(item.uri)) return;
  const file = new File(item.uri);
  if (file.exists) file.delete();
}
