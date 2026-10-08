import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser } from './auth';
import { applyGhostModeToCoords } from './ghostMode';
import { maskCoordinateIfPrivate } from './privacyZones';
import {supabase} from './supabase';

export type SharingPrivacy = { privateTrip: boolean; delayMinutes: 0 | 5 | 15 | 30; ghostUntil: number | null };
const listeners = new Set<() => void>();
let writes: Promise<unknown> = Promise.resolve();
let settingsWrites: Promise<unknown> = Promise.resolve();
let revision = 0;
async function key() { return `mymap.sharing:${(await getCurrentUser())?.id || 'local'}`; }
async function readPrivacy(owner: string): Promise<SharingPrivacy> {
  const raw = JSON.parse(await AsyncStorage.getItem(owner) || '{}');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Không đọc được cài đặt riêng tư.');
  if(raw.privateTrip!=null&&typeof raw.privateTrip!=='boolean'||raw.delayMinutes!=null&&![0,5,15,30].includes(raw.delayMinutes)||raw.ghostUntil!=null&&!Number.isFinite(raw.ghostUntil))throw new Error('Cài đặt riêng tư không hợp lệ.');
  return { privateTrip: raw.privateTrip === true, delayMinutes: [5, 15, 30].includes(raw.delayMinutes) ? raw.delayMinutes : 0,
    ghostUntil: Number.isFinite(raw.ghostUntil) && raw.ghostUntil > Date.now() ? raw.ghostUntil : null };
}
export async function getSharingPrivacy() { return readPrivacy(await key()); }
export function saveSharingPrivacy(value: SharingPrivacy) {
  if (![0, 5, 15, 30].includes(value.delayMinutes)) throw new Error('Thời gian trễ không hợp lệ.');
  if (value.ghostUntil != null && !Number.isFinite(value.ghostUntil)) throw new Error('Lịch ẩn không hợp lệ.');
  // Capture the account at invocation, before waiting for earlier setting writes.
  const target = key();
  const work = settingsWrites.catch(() => {}).then(async () => {
  const owner = await target;
  if (owner !== await key()) throw new Error('Tài khoản đã thay đổi.');
  revision++;
  await AsyncStorage.setItem(owner, JSON.stringify(value));
  revision++;
  listeners.forEach(listener => listener());
  const user=await getCurrentUser();
  if (owner !== `mymap.sharing:${user?.id || 'local'}`) throw new Error('Tài khoản đã thay đổi.');
  if(user&&!user.is_anonymous){
    const until=value.ghostUntil??(value.delayMinutes?Date.now()+value.delayMinutes*60000:null);
    const{error}=await supabase.rpc('mm_set_presence_pause',{p_private:value.privateTrip,p_until:until?new Date(until).toISOString():null});
    if(error)throw new Error('Đã ngừng chia sẻ trên máy; chưa thể cập nhật quyền riêng tư lên máy chủ. Hãy thử lại khi có mạng.');
  }
  });
  settingsWrites = work.catch(() => {});
  return work;
}
export function subscribeSharingPrivacy(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** All automatic presence publishers use this gate. Explicit SOS is a separate user action. */
export function sharedCoordinate(coords: { latitude: number; longitude: number }, friendId?: string) {
  const work = writes.catch(() => {}).then(async () => {
    const owner = await key();
    const token = revision;
    const privacy = await readPrivacy(owner);
    if (privacy.privateTrip || privacy.ghostUntil) return null;
    if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) throw new Error('Tọa độ không hợp lệ.');
    let point = coords;
    const now = Date.now();
    if (privacy.delayMinutes) {
      const historyKey = owner + ':delay';
      const saved = JSON.parse(await AsyncStorage.getItem(historyKey) || '[]') as Array<{ latitude: number; longitude: number; at: number }>;
      const history = saved.filter(p => Number.isFinite(p.at) && p.at > now - 31 * 60000 && p.at <= now && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180).sort((a,b) => a.at-b.at);
      if (!history.length || now - history[history.length - 1]!.at >= 15000) history.push({ ...coords, at: now });
      await AsyncStorage.setItem(historyKey, JSON.stringify(history.slice(-125)));
      const cutoff = now - privacy.delayMinutes * 60000;
      const delayed = [...history].reverse().find(p => p.at <= cutoff);
      if (!delayed) return null; // Never expose a current fix while waiting for delayed history.
      point = delayed;
    } else await AsyncStorage.removeItem(owner + ':delay');
    const masked = await maskCoordinateIfPrivate(point.latitude, point.longitude);
    const ghost = await applyGhostModeToCoords(masked, friendId);
    if (owner !== await key() || token !== revision) return null;
    return { latitude: ghost.latitude, longitude: ghost.longitude, isFuzzy: ghost.isFuzzy || masked.isMasked,
      isFrozen: ghost.isFrozen, isDelayed: privacy.delayMinutes > 0 };
  });
  writes = work.catch(() => {});
  return work;
}
