import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { insertLocationPoint } from '../db/database';
import { distanceMeters } from '../utils/geo';
import { syncPendingSosEvents } from './liveSafety';

export const LOCATION_TASK_NAME = 'vibecoding-background-location';

let lastPoint: { latitude: number; longitude: number; timestamp: number } | null = null;
const PENDING_POINTS_KEY = 'mymap:pending-location-points';
export const TRACKING_ERROR_KEY = 'mymap:tracking-error';
let writes: Promise<unknown> = Promise.resolve();

// The foreground watcher and headless task share one writer. Persist the input
// before SQLite so a busy database or a process restart cannot discard a batch.
export function persistLocations(locations: Location.LocationObject[]): Promise<boolean> {
  const work = writes.then(async () => {
    const stored = await AsyncStorage.getItem(PENDING_POINTS_KEY);
    const pending: Location.LocationObject[] = stored ? JSON.parse(stored) : [];
    const ordered = [...new Map([...pending, ...locations].map(p => [p.timestamp, p])).values()]
      .sort((a, b) => a.timestamp - b.timestamp);
    if (!ordered.length) return false;
    await AsyncStorage.setItem(PENDING_POINTS_KEY, JSON.stringify(ordered));
    let saved = false;
    let previous = lastPoint;
    for (let i = 0; i < ordered.length; i++) {
      const location = ordered[i]!;
      const c = location.coords;
      if (!c || !Number.isFinite(c.latitude) || Math.abs(c.latitude) > 90 ||
          !Number.isFinite(c.longitude) || Math.abs(c.longitude) > 180 ||
          !Number.isFinite(location.timestamp) || location.timestamp <= 0 ||
          (c.accuracy != null && (!Number.isFinite(c.accuracy) || c.accuracy > 120))) continue;
      const current = { latitude: c.latitude, longitude: c.longitude, timestamp: Math.round(location.timestamp) };
      // Delayed batches must be saved in their own chronological context, not
      // compared to a newer foreground fix with an artificial one-second gap.
      if (previous && current.timestamp > previous.timestamp) {
        const distance = distanceMeters(previous, current);
        const seconds = (current.timestamp - previous.timestamp) / 1000;
        if (distance > 100 * seconds + Math.max(0, c.accuracy ?? 0) + 120) continue;
        // Retain a heartbeat even for coarse stationary fixes. Movement leaves
        // this branch immediately; GPS is never stopped by motion detection.
        if (distance < 8 && seconds < 60 && (c.speed == null || c.speed < 0.5)) continue;
      }
      const point = { ...current, accuracy: c.accuracy ?? null, altitude: c.altitude ?? null,
        speed: c.speed ?? null, heading: c.heading ?? null };
      try {
        try { await insertLocationPoint(point); }
        catch { await insertLocationPoint(point); } // Retry a transient SQLite/open failure.
      } catch (error) {
        await AsyncStorage.setItem(PENDING_POINTS_KEY, JSON.stringify(ordered.slice(i)));
        await AsyncStorage.setItem(TRACKING_ERROR_KEY, 'Chưa lưu được điểm GPS. MyMap sẽ thử lại; hãy kiểm tra dung lượng thiết bị.');
        throw error;
      }
      previous = current;
      if (!lastPoint || current.timestamp > lastPoint.timestamp) lastPoint = current;
      saved = true;
    }
    await AsyncStorage.removeItem(PENDING_POINTS_KEY);
    await AsyncStorage.removeItem(TRACKING_ERROR_KEY);
    return saved;
  });
  writes = work.catch(() => {});
  return work;
}

export async function flushLocationWrites() {
  await persistLocations([]);
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    await AsyncStorage.setItem(TRACKING_ERROR_KEY, 'GPS nền bị gián đoạn. Mở MyMap để khôi phục và kiểm tra quyền vị trí.');
    return;
  }
  if (!data) return;
  const { locations } = data as { locations: Location.LocationObject[] };

  // Opportunistically sync pending offline SOS events whenever location task fires
  void syncPendingSosEvents().catch(() => {});

  if (Array.isArray(locations)) await persistLocations(locations);
});
