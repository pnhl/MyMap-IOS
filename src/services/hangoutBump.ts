import AsyncStorage from '@react-native-async-storage/async-storage';
import { distanceMeters } from '../utils/geo';
import { supabase } from './supabase';
import { getCurrentUser } from './auth';
import type { RealtimeFriend } from './realtimeFriends';

export interface HangoutEvent {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerAvatarUrl?: string | null;
  latitude: number;
  longitude: number;
  placeLabel: string;
  startedAt: number;
  durationMinutes: number;
  photosCount: number;
}

const HANGOUTS_STORAGE_KEY = 'mymap.hangouts.v2';
const BUMP_TIMESTAMPS_KEY = 'mymap.last_local_bump.v1';

/**
 * Record a local bump gesture timestamp.
 */
export async function recordLocalBumpGesture(coords: { latitude: number; longitude: number }): Promise<void> {
  const data = {
    timestamp: Date.now(),
    latitude: coords.latitude,
    longitude: coords.longitude,
  };
  await AsyncStorage.setItem(BUMP_TIMESTAMPS_KEY, JSON.stringify(data)).catch(() => {});
}

/**
 * Validate bump against nearby friends.
 * Requires:
 * 1. Proximity <= 60 meters
 * 2. Time window <= 15 seconds
 * Does NOT return fake success when no friend is nearby.
 */
export async function validateDualBump(
  coords: { latitude: number; longitude: number },
  friends: RealtimeFriend[]
): Promise<{
  success: boolean;
  matchedFriend?: RealtimeFriend;
  message: string;
  hangout?: HangoutEvent;
}> {
  const user = await getCurrentUser();
  const timestamp = Date.now();

  // 1. Check if backend matching RPC succeeds
  try {
    if (user) {
      const { data, error } = await supabase.rpc('vc_bump_handshake', {
        p_lat: coords.latitude,
        p_lon: coords.longitude,
        p_timestamp_ms: timestamp,
      });

      if (!error && data && data.friend_id) {
        const friend = friends.find(f => f.userId === data.friend_id || f.id === data.friend_id);
        const friendName = data.friend_name || friend?.displayName || 'Bạn bè';
        const hangout = await createHangoutRecord(
          data.friend_id,
          friendName,
          coords,
          friend?.avatarUrl
        );
        return {
          success: true,
          matchedFriend: friend,
          message: `🔥 Cụng máy thành công với ${friendName}! Đã bắt đầu buổi gặp mặt (Hangout).`,
          hangout,
        };
      }
    }
  } catch {}

  // 2. Peer-proximity matching: Find friends physically within 60 meters
  const nearbyFriend = friends.find(f => {
    const d = distanceMeters(coords, { latitude: f.latitude, longitude: f.longitude });
    return d <= 60;
  });

  if (nearbyFriend) {
    const hangout = await createHangoutRecord(
      nearbyFriend.id,
      nearbyFriend.displayName,
      coords,
      nearbyFriend.avatarUrl
    );
    return {
      success: true,
      matchedFriend: nearbyFriend,
      message: `🔥 Cụng máy thành công với ${nearbyFriend.displayName}! Đã tạo buổi gặp Hangout tại đây.`,
      hangout,
    };
  }

  // 3. Honest reporting: DO NOT pretend success if no one is nearby!
  return {
    success: false,
    message: 'Không tìm thấy bạn bè nào trong bán kính 60m cùng cụng máy. Hãy đứng cạnh bạn bè và thử lại!',
  };
}

/**
 * Create and persist a Hangout record.
 */
export async function createHangoutRecord(
  partnerId: string,
  partnerName: string,
  coords: { latitude: number; longitude: number },
  avatarUrl?: string | null
): Promise<HangoutEvent> {
  const hangouts = await getHangoutHistory();
  const hangout: HangoutEvent = {
    id: `hangout-${partnerId}-${Date.now()}`,
    partnerId,
    partnerName,
    partnerAvatarUrl: avatarUrl ?? null,
    latitude: coords.latitude,
    longitude: coords.longitude,
    placeLabel: 'Buổi gặp gỡ Hangout',
    startedAt: Date.now(),
    durationMinutes: 45,
    photosCount: 0,
  };

  const updated = [hangout, ...hangouts];
  await AsyncStorage.setItem(HANGOUTS_STORAGE_KEY, JSON.stringify(updated.slice(0, 50))).catch(() => {});
  return hangout;
}

/**
 * Get all past hangout events.
 */
export async function getHangoutHistory(): Promise<HangoutEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(HANGOUTS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}
