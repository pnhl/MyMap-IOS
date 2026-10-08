import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeFriend } from './realtimeFriends';

export interface WidgetSnapshotData {
  friendId: string;
  displayName: string;
  avatarUrl: string | null;
  batteryLevel: number;
  isCharging: boolean;
  statusText: string;
  speedKmh: number;
  placeName?: string;
  lastUpdatedMs: number;
}

const WIDGET_SNAPSHOT_KEY = 'mymap.widget_snapshot.v1';

export async function exportWidgetSnapshot(friend: RealtimeFriend): Promise<WidgetSnapshotData> {
  const data: WidgetSnapshotData = {
    friendId: friend.id,
    displayName: friend.displayName,
    avatarUrl: friend.avatarUrl,
    batteryLevel: friend.batteryLevel,
    isCharging: friend.isCharging,
    statusText: friend.statusText,
    speedKmh: friend.speedKmh,
    placeName: friend.footprints?.[0]?.placeName || 'Đang di chuyển',
    lastUpdatedMs: Date.now(),
  };

  await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(data)).catch(() => {});
  return data;
}

export async function updateWidgetSnapshot(data: Record<string, any>): Promise<void> {
  await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify({ ...data, lastUpdatedMs: Date.now() })).catch(() => {});
}

export async function getWidgetSnapshot(): Promise<WidgetSnapshotData | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}
