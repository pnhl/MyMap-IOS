import AsyncStorage from '@react-native-async-storage/async-storage';
import {getCurrentUser} from './auth';
import {supabase} from './supabase';
async function scoped(key:string){return key+':'+((await getCurrentUser())?.id||'local');}

export type GhostModeLevel = 'precise' | 'fuzzy' | 'frozen';

const GHOST_GLOBAL_KEY = 'mymap.ghost_mode.global.v1';
const GHOST_FRIENDS_KEY = 'mymap.ghost_mode.friends.v1';
const GHOST_FROZEN_KEY = 'mymap.ghost_mode.frozen_coords.v1';

export type GhostFriendSettings = Record<string, GhostModeLevel>;

export async function getGlobalGhostMode(): Promise<GhostModeLevel> {
    const raw = await AsyncStorage.getItem(await scoped(GHOST_GLOBAL_KEY));
    if (raw === 'fuzzy' || raw === 'frozen' || raw === 'precise') {
      return raw;
    }
    if(raw!=null)throw new Error('Không đọc được thiết lập chia sẻ vị trí.');
  return 'precise';
}

export async function setGlobalGhostMode(mode: GhostModeLevel, currentCoords?: { latitude: number; longitude: number }): Promise<void> {
    if(!['precise','fuzzy','frozen'].includes(mode))throw new Error('Chế độ không hợp lệ.');
    if(currentCoords&&(!Number.isFinite(currentCoords.latitude)||Math.abs(currentCoords.latitude)>90||!Number.isFinite(currentCoords.longitude)||Math.abs(currentCoords.longitude)>180))throw new Error('Tọa độ không hợp lệ.');
    const owner=await scoped(GHOST_GLOBAL_KEY);
    const frozenKey=GHOST_FROZEN_KEY+owner.slice(GHOST_GLOBAL_KEY.length);
    const user=await getCurrentUser();
    if(owner!==GHOST_GLOBAL_KEY+':'+(user?.id||'local'))throw new Error('Tài khoản đã thay đổi.');
    if(user&&!user.is_anonymous){const{error}=await supabase.rpc('mm_set_global_privacy',{p_mode:mode});if(error)throw error;}
    if(owner!==await scoped(GHOST_GLOBAL_KEY))throw new Error('Tài khoản đã thay đổi.');
    if (mode === 'frozen' && currentCoords) {
      await AsyncStorage.setItem(frozenKey, JSON.stringify(currentCoords));
    }
    if(owner!==await scoped(GHOST_GLOBAL_KEY))throw new Error('Tài khoản đã thay đổi.');
    await AsyncStorage.setItem(owner, mode);
}

export async function getFriendGhostSettings(): Promise<GhostFriendSettings> {
    const raw = await AsyncStorage.getItem(await scoped(GHOST_FRIENDS_KEY));
      if (raw) {const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value)||Object.values(value).some(mode=>!['precise','fuzzy','frozen'].includes(String(mode))))throw new Error('Cài đặt riêng tư bị lỗi.');return value;}
  return {};
}

export async function setFriendGhostMode(friendUserId: string, mode: GhostModeLevel): Promise<void> {
    if(!['precise','fuzzy','frozen'].includes(mode))throw new Error('Chế độ không hợp lệ.');
    const owner=await scoped(GHOST_FRIENDS_KEY);
    if(owner!==await scoped(GHOST_FRIENDS_KEY))throw new Error('Tài khoản đã thay đổi.');
    const{error}=await supabase.rpc('mm_set_friend_privacy',{p_target:friendUserId,p_mode:mode});
    if(error)throw error;
    if(owner!==await scoped(GHOST_FRIENDS_KEY))throw new Error('Tài khoản đã thay đổi.');
    const settings = await getFriendGhostSettings();
    settings[friendUserId] = mode;
    if(owner!==await scoped(GHOST_FRIENDS_KEY))throw new Error('Tài khoản đã thay đổi.');
    await AsyncStorage.setItem(owner, JSON.stringify(settings));
}

export async function getEffectiveGhostModeForFriend(friendUserId?: string): Promise<GhostModeLevel> {
  const owner=await scoped(GHOST_GLOBAL_KEY);
  const global=await getGlobalGhostMode();
  const mode=friendUserId?(await getFriendGhostSettings())[friendUserId]||'precise':'precise';
  if(owner!==await scoped(GHOST_GLOBAL_KEY))throw new Error('Tài khoản đã thay đổi.');
  return global==='frozen'||mode==='frozen'?'frozen':global==='fuzzy'||mode==='fuzzy'?'fuzzy':'precise';
}

/**
 * Áp dụng làm mờ toạ độ (Fuzzy) hoặc đóng băng toạ độ (Frozen) trước khi chia sẻ.
 */
export async function applyGhostModeToCoords(
  coords: { latitude: number; longitude: number },
  friendUserId?: string
): Promise<{ latitude: number; longitude: number; isFuzzy: boolean; isFrozen: boolean }> {
  if(!Number.isFinite(coords.latitude)||Math.abs(coords.latitude)>90||!Number.isFinite(coords.longitude)||Math.abs(coords.longitude)>180)throw new Error('Tọa độ không hợp lệ.');
  const frozenKey=await scoped(GHOST_FROZEN_KEY);
  const mode = await getEffectiveGhostModeForFriend(friendUserId);
  if(frozenKey!==await scoped(GHOST_FROZEN_KEY))throw new Error('Tài khoản đã thay đổi.');

  if (mode === 'frozen') {
      const raw = await AsyncStorage.getItem(frozenKey);
      if(frozenKey!==await scoped(GHOST_FROZEN_KEY))throw new Error('Tài khoản đã thay đổi.');
      if (raw) {
        const frozen = JSON.parse(raw);
        if (Number.isFinite(frozen.latitude) && Math.abs(frozen.latitude)<=90 && Number.isFinite(frozen.longitude) && Math.abs(frozen.longitude)<=180) {
          return { latitude: frozen.latitude, longitude: frozen.longitude, isFuzzy: false, isFrozen: true };
        }
        throw new Error('Điểm đóng băng không hợp lệ.');
      }
    // If no frozen saved yet, lock to current
    await AsyncStorage.setItem(frozenKey, JSON.stringify(coords));
    if(frozenKey!==await scoped(GHOST_FROZEN_KEY))throw new Error('Tài khoản đã thay đổi.');
    return { ...coords, isFuzzy: false, isFrozen: true };
  }

  if (mode === 'fuzzy') {
    // Làm mờ trong bán kính ~800m - 1km một cách ổn định theo block thời gian
    const daySeed = Math.floor(Date.now() / (1000 * 60 * 60 * 4));
    const salt = (coords.latitude * 1000 + coords.longitude) * 31 + daySeed;
    const angle = (salt % 360) * (Math.PI / 180);
    const radiusMeters = 800 + (Math.abs(salt) % 400);
    const deltaLat = (radiusMeters / 111320) * Math.cos(angle);
    const deltaLon = (radiusMeters / (111320 * Math.max(.01,Math.cos((coords.latitude * Math.PI) / 180)))) * Math.sin(angle);

    return {
      latitude: Math.max(-90,Math.min(90,coords.latitude + deltaLat)),
      longitude: ((coords.longitude+deltaLon+180)%360+360)%360-180,
      isFuzzy: true,
      isFrozen: false,
    };
  }

  return { ...coords, isFuzzy: false, isFrozen: false };
}
