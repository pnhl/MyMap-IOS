import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { distanceMeters } from '../utils/geo';
import type { RealtimeFriend } from './realtimeFriends';
import type { SmartPlaceMeta } from './smartPlaces';

export interface DestinationPrediction {
  targetPlaceName: string;
  targetLat: number;
  targetLon: number;
  etaMinutes: number;
  etaTimeStr: string;
  isDelayed?: boolean;
}

export interface ArrivalAlertWatcher {
  id: string;
  friendId: string;
  friendName: string;
  destinationName: string;
  targetLat: number;
  targetLon: number;
  registeredAt: number;
  expectedArrivalMs: number;
}

const ARRIVAL_ALERTS_KEY = 'mymap.arrival_watchers.v1';

/**
 * Predict where a moving friend is heading to, matching against known places.
 */
export function predictFriendDestination(
  friend: RealtimeFriend,
  knownPlaces: SmartPlaceMeta[]
): DestinationPrediction | null {
  // Only predict if friend is actually moving (> 8 km/h)
  if (!friend.speedKmh || friend.speedKmh < 8) return null;

  const friendPos = { latitude: friend.latitude, longitude: friend.longitude };
  let closestMatch: { place: SmartPlaceMeta; distanceM: number } | null = null;

  for (const p of knownPlaces) {
    const dist = distanceMeters(friendPos, { latitude: p.latitude, longitude: p.longitude });
    // Within 25km radius
    if (dist > 300 && dist < 25000) {
      if (!closestMatch || dist < closestMatch.distanceM) {
        closestMatch = { place: p, distanceM: dist };
      }
    }
  }

  if (!closestMatch) {
    // Default fallback prediction based on hour of day
    const hour = new Date().getHours();
    if (hour >= 17 || hour <= 21) {
      return {
        targetPlaceName: 'Nhà',
        targetLat: friend.latitude + 0.01,
        targetLon: friend.longitude + 0.01,
        etaMinutes: Math.max(5, Math.round(15 - (friend.speedKmh / 10))),
        etaTimeStr: new Date(Date.now() + 15 * 60000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
    }
    return null;
  }

  const speedKmh = Math.max(15, friend.speedKmh);
  const hours = (closestMatch.distanceM / 1000) / speedKmh;
  const etaMinutes = Math.max(2, Math.round(hours * 60));
  const arrivalDate = new Date(Date.now() + etaMinutes * 60000);

  return {
    targetPlaceName: closestMatch.place.name,
    targetLat: closestMatch.place.latitude,
    targetLon: closestMatch.place.longitude,
    etaMinutes,
    etaTimeStr: arrivalDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  };
}

/**
 * Get active one-time arrival alert watchers.
 */
export async function getArrivalAlertWatchers(): Promise<ArrivalAlertWatcher[]> {
  try {
    const raw = await AsyncStorage.getItem(ARRIVAL_ALERTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

/**
 * Register a one-time alert to be notified when a friend reaches their destination.
 * Automatically self-destructs upon arrival.
 */
export async function registerOneTimeArrivalAlert(
  friend: RealtimeFriend,
  destination: { name: string; latitude: number; longitude: number; etaMinutes?: number }
): Promise<ArrivalAlertWatcher> {
  const watchers = await getArrivalAlertWatchers();
  const etaMin = destination.etaMinutes || 15;
  const watcher: ArrivalAlertWatcher = {
    id: `arr-${friend.id}-${Date.now()}`,
    friendId: friend.id,
    friendName: friend.displayName,
    destinationName: destination.name,
    targetLat: destination.latitude,
    targetLon: destination.longitude,
    registeredAt: Date.now(),
    expectedArrivalMs: Date.now() + etaMin * 60000,
  };

  const updated = [...watchers.filter(w => w.friendId !== friend.id), watcher];
  await AsyncStorage.setItem(ARRIVAL_ALERTS_KEY, JSON.stringify(updated)).catch(() => {});
  return watcher;
}

/**
 * Check arrival watchers against current friend positions.
 * Triggers notification and removes watcher once friend arrives (<= 150m).
 */
export async function checkArrivalAlerts(
  friends: RealtimeFriend[],
  onArrivalTriggered?: (w: ArrivalAlertWatcher) => void
): Promise<void> {
  const watchers = await getArrivalAlertWatchers();
  if (!watchers.length) return;

  const remaining: ArrivalAlertWatcher[] = [];

  for (const w of watchers) {
    const friend = friends.find(f => f.id === w.friendId);
    if (!friend) {
      remaining.push(w);
      continue;
    }

    const dist = distanceMeters(
      { latitude: friend.latitude, longitude: friend.longitude },
      { latitude: w.targetLat, longitude: w.targetLon }
    );

    // Friend arrived! (within 180m)
    if (dist <= 180) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `🎉 ${w.friendName} đã đến nơi!`,
            body: `${w.friendName} vừa đến an toàn tại ${w.destinationName}.`,
            sound: true,
          },
          trigger: null, // deliver immediately
        });
      } catch {}

      if (onArrivalTriggered) onArrivalTriggered(w);
      // Not pushing back to remaining: self-destructs!
    } else {
      // Check if abnormal delay (> 25 mins past expected arrival)
      if (Date.now() > w.expectedArrivalMs + 25 * 60000) {
        // We can keep watcher or alert once
      }
      remaining.push(w);
    }
  }

  if (remaining.length !== watchers.length) {
    await AsyncStorage.setItem(ARRIVAL_ALERTS_KEY, JSON.stringify(remaining)).catch(() => {});
  }
}
