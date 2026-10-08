import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, invokeEdgeFunctionWithFallback } from './supabase';
import { getCurrentUser } from './auth';
import { computeCurrentAutomaticStatus } from './friendStatus';
import { getUserMusicStatus, formatMusicForBroadcast } from './musicStatus';
import { distanceMeters } from '../utils/geo';
import {sharedCoordinate} from './sharingPrivacy';
import {accountApi} from './accountApi';
import {resolveProfileAvatar} from './profileAvatars';

export type RealtimeFriend = {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  phoneNumber?: string | null;
  avatarUrl: string | null;
  latitude: number;
  longitude: number;
  heading?: number;
  speedKmh: number;
  batteryLevel: number;
  isCharging: boolean;
  statusText: string;
  statusIcon: string;
  ghostMode: 'precise' | 'fuzzy' | 'frozen';
  lastSeenMs: number;
  footprints?: FriendFootprintPoint[];
  rankingScore: number;
  streakDays: number;
  musicTitle?: string;
  musicArtist?: string;
  musicIsPlaying?: boolean;
  isOnline?: boolean;
};

export type FriendFootprintPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
  dwellMinutes?: number;
  placeName?: string;
};

export type RealtimePartyGroup = {
  id: string;
  centerLat: number;
  centerLon: number;
  friends: RealtimeFriend[];
  label: string;
};

export type MapChatMessage = {
  id: string;
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  latitude: number;
  longitude: number;
  message: string;
  emoji?: string;
  createdAt: number;
};

export type FriendInteractionType = 'peek' | 'heart' | 'invite' | 'buzz' | 'emoji_bomb' | 'voice';

export interface FriendInteractionEvent {
  id: string;
  senderId: string;
  senderName: string;
  targetFriendId: string;
  type: FriendInteractionType;
  timestamp: number;
  metadata?: Record<string, any>;
}

const FRIENDS_CACHE_KEY_PREFIX = 'mymap.realtime_friends.cache.v4';
function friendsCacheKey(userId: string) { return `${FRIENDS_CACHE_KEY_PREFIX}:${userId}`; }

/**
 * Đẩy vị trí hiện tại của mình lên đám mây liên tục (Continuous Presence)
 * Có áp dụng Vùng riêng tư (Privacy Zone) và Chế độ tàng hình (Ghost Mode).
 */
export async function broadcastContinuousPresence(coords: {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speedMps?: number | null;
}) {
  const user = await getCurrentUser();
  const status = await computeCurrentAutomaticStatus({
    speedMps: coords.speedMps,
    latitude: coords.latitude,
    longitude: coords.longitude,
  });

  // 1. Kiểm tra Vùng riêng tư: làm mờ tọa độ nếu ở Nhà/Cơ quan đã ghim
  const ghostCoords = await sharedCoordinate(coords);
  if (!ghostCoords) return null;

  // 3. Đọc trạng thái bài hát đang nghe nếu có
  const currentMusic = await getUserMusicStatus();
  const musicBroadcast = formatMusicForBroadcast(currentMusic);

  const payload = {
    latitude: ghostCoords.latitude,
    longitude: ghostCoords.longitude,
    heading_deg: ghostCoords.isFuzzy || ghostCoords.isFrozen || ghostCoords.isDelayed ? null : coords.heading ?? null,
    speed_mps: ghostCoords.isFuzzy || ghostCoords.isFrozen || ghostCoords.isDelayed ? null : coords.speedMps ?? null,
    battery_level: status.batteryLevel<0?null:status.batteryLevel,
    is_charging: status.isCharging,
    status_text: status.contextStatus,
    status_icon: status.icon,
    speed_kmh: ghostCoords.isFuzzy || ghostCoords.isFrozen || ghostCoords.isDelayed ? null : status.speedKmh,
    is_fuzzy: ghostCoords.isFuzzy,
    is_frozen: ghostCoords.isFrozen,
    music_title: musicBroadcast.musicTitle,
    music_artist: musicBroadcast.musicArtist,
    music_is_playing: currentMusic?.isPlaying || false,
    updated_at: new Date().toISOString(),
  };

  try {
    if (user) {
      // Resolve the Firebase string UID to MyMap's canonical UUID inside
      // Postgres. A direct upsert with user.id would violate the UUID schema.
      const { error } = await supabase.rpc('vc_upsert_presence', { p_payload: payload });
      if (error) {
        await invokeEdgeFunctionWithFallback('mymap-presence', 'vibecoding-presence', { body: payload });
      }
    }
  } catch {}

  return payload;
}

/**
 * Lấy danh sách bạn bè realtime kèm toạ độ, pin, tốc độ và trạng thái.
 */
export async function getLiveFriends(myCoords?: { latitude: number; longitude: number } | null): Promise<RealtimeFriend[]> {
  const user = await getCurrentUser();
  if (!user || user.is_anonymous) return [];

  let friends: RealtimeFriend[] = [];
  const cacheKey = friendsCacheKey(user.id);

  // 1. Đọc cache cục bộ (lọc bỏ các ID mẫu nếu từng lưu trước đây)
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        friends = parsed.filter(
          (f: any) => f && f.id && !['friend_linh', 'friend_huy', 'friend_mai'].includes(f.id)
        );
      }
    }
  } catch {}

  // 2. Thử truy vấn từ Supabase
  try {
    const api=await accountApi();if(api.owner!==user.id)return [];
    const { data, error } = await api.client.rpc('mm_live_friends');await api.assertCurrent();

    if (!error && data) {
        const liveFriends: RealtimeFriend[] = await Promise.all(data.map(async(d: any) => ({
          id: d.id || d.user_id,
          userId: d.user_id,
          displayName: d.display_name || d.name || 'Bạn bè MyMap',
          username: d.username || 'friend',
          phoneNumber: d.phone_e164 || d.phone || null,
          avatarUrl: await resolveProfileAvatar(api,d.avatar_url||d.avatar_path),
          latitude: Number(d.latitude),
          longitude: Number(d.longitude),
          heading: Number(d.heading || 0),
          speedKmh: Number(d.speed_kmh || 0),
          batteryLevel: d.battery_level == null ? -1 : Number(d.battery_level),
          isCharging: Boolean(d.is_charging),
          statusText: d.status_text || 'Đang trực tuyến',
          statusIcon: d.status_icon || 'map-marker',
          ghostMode: (d.is_fuzzy ? 'fuzzy' : d.is_frozen ? 'frozen' : 'precise') as RealtimeFriend['ghostMode'],
          lastSeenMs: new Date(d.updated_at || Date.now()).getTime(),
          rankingScore: Number(d.ranking_score ?? 0),
          streakDays: Number(d.streak_days ?? 0),
          musicTitle: d.music_title || undefined,
          musicArtist: d.music_artist || undefined,
          musicIsPlaying: Boolean(d.music_is_playing),
          isOnline: Date.now() - new Date(d.updated_at || Date.now()).getTime() < 5 * 60 * 1000,
        })));

        // An online empty result can mean sharing was withdrawn. Never resurrect it from cache.
        friends=liveFriends;
        if(user.id!==(await getCurrentUser())?.id)return [];
        await AsyncStorage.setItem(cacheKey, JSON.stringify(friends)).catch(() => {});
    }
  } catch {}

  if(user.id!==(await getCurrentUser())?.id)return [];
  return friends;
}

/**
 * Phát hiện các nhóm bạn bè đang gặp nhau trong bán kính 50m (Party / Pop).
 */
export function detectPartyGroups(friends: RealtimeFriend[], myCoords?: { latitude: number; longitude: number } | null): RealtimePartyGroup[] {
  const allEntities = [...friends];
  if (myCoords) {
    allEntities.push({
      id: 'me',
      userId: 'me',
      displayName: 'Bạn',
      username: 'you',
      avatarUrl: null,
      latitude: myCoords.latitude,
      longitude: myCoords.longitude,
      speedKmh: 0,
      batteryLevel: -1,
      isCharging: false,
      statusText: 'Tại đây',
      statusIcon: 'account',
      ghostMode: 'precise',
      lastSeenMs: Date.now(),
      rankingScore: 0,
      streakDays: 0,
    });
  }

  const groups: RealtimePartyGroup[] = [];
  const visited = new Set<string>();

  for (let i = 0; i < allEntities.length; i++) {
    const f1 = allEntities[i]!;
    if (visited.has(f1.id)) continue;

    const cluster: RealtimeFriend[] = [f1];
    for (let j = i + 1; j < allEntities.length; j++) {
      const f2 = allEntities[j]!;
      if (visited.has(f2.id)) continue;
      const d = distanceMeters(
        { latitude: f1.latitude, longitude: f1.longitude },
        { latitude: f2.latitude, longitude: f2.longitude }
      );
      if (d <= 65) {
        cluster.push(f2);
        visited.add(f2.id);
      }
    }

    if (cluster.length >= 2) {
      visited.add(f1.id);
      const centerLat = cluster.reduce((sum, c) => sum + c.latitude, 0) / cluster.length;
      const centerLon = cluster.reduce((sum, c) => sum + c.longitude, 0) / cluster.length;
      groups.push({
        id: `party_${f1.id}`,
        centerLat,
        centerLon,
        friends: cluster,
        label: `🎉 Tụ họp ${cluster.length} người!`,
      });
    }
  }

  return groups;
}

/**
 * Lấy danh sách tin nhắn ghim bản đồ (Map Chat).
 */
export {getMapChatMessages,postMapChatMessage,subscribeToMapChat,sendFriendInteraction,subscribeToFriendInteractions} from './friendSocial';
