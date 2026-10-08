import AsyncStorage from '@react-native-async-storage/async-storage';
import { distanceMeters } from '../utils/geo';
import { getSavedPlaces, savePlace, placeKey, type SavedPlace } from './placeMetadata';
import type { LocationPoint, Visit } from '../types/location';
import type { RealtimeFriend } from './realtimeFriends';

export type SmartPlaceType = 'home' | 'work' | 'school' | 'frequent' | 'want_to_go' | 'custom';

export interface SmartPlaceMeta {
  key: string;
  type: SmartPlaceType;
  name: string;
  latitude: number;
  longitude: number;
  visitCount: number;
  lastVisitedMs: number;
  isAutoDetected?: boolean;
}

export interface PlaceFriendVisitor {
  friendId: string;
  friendName: string;
  avatarUrl: string | null;
  lastVisitedMs: number;
  visitCount: number | null;
  source: 'presence' | 'footprints';
}

const SMART_PLACES_KEY = 'mymap.smart_places.v2';

/**
 * Detect Home, Work, and School automatically based on GPS visits and dwelling patterns.
 */
export function detectSmartPlacesFromVisits(visits: Visit[]): SmartPlaceMeta[] {
  const clusters = new Map<string, { latSum: number; lonSum: number; visits: Visit[] }>();

  for (const v of visits) {
    let matchedKey: string | null = null;
    for (const [key, cluster] of clusters.entries()) {
      const center = {
        latitude: cluster.latSum / cluster.visits.length,
        longitude: cluster.lonSum / cluster.visits.length,
      };
      if (distanceMeters(center, v) <= 150) {
        matchedKey = key;
        break;
      }
    }

    if (matchedKey) {
      const cl = clusters.get(matchedKey)!;
      cl.latSum += v.latitude;
      cl.lonSum += v.longitude;
      cl.visits.push(v);
    } else {
      const key = `${v.latitude.toFixed(4)}:${v.longitude.toFixed(4)}`;
      clusters.set(key, { latSum: v.latitude, lonSum: v.longitude, visits: [v] });
    }
  }

  const results: SmartPlaceMeta[] = [];

  clusters.forEach((cl, key) => {
    const lat = cl.latSum / cl.visits.length;
    const lon = cl.lonSum / cl.visits.length;
    const count = cl.visits.length;
    const lastVisit = Math.max(...cl.visits.map(v => v.arrivedAt));

    // Night stays count (22:00 - 07:00)
    let nightStays = 0;
    // Weekday business hours stays (08:30 - 17:30, Monday to Friday)
    let workdayStays = 0;

    for (const v of cl.visits) {
      const d = new Date(v.arrivedAt);
      const hour = d.getHours();
      const day = d.getDay(); // 0 = Sunday, 6 = Saturday

      if (hour >= 22 || hour <= 7) {
        nightStays++;
      }
      if (day >= 1 && day <= 5 && hour >= 8 && hour <= 17 && (v.durationMs || 0) >= 2 * 3600000) {
        workdayStays++;
      }
    }

    if (nightStays >= 3) {
      results.push({
        key,
        type: 'home',
        name: 'Nhà của bạn',
        latitude: lat,
        longitude: lon,
        visitCount: count,
        lastVisitedMs: lastVisit,
        isAutoDetected: true,
      });
    } else if (workdayStays >= 3) {
      results.push({
        key,
        type: 'work',
        name: 'Nơi làm việc',
        latitude: lat,
        longitude: lon,
        visitCount: count,
        lastVisitedMs: lastVisit,
        isAutoDetected: true,
      });
    } else if (count >= 2) {
      results.push({
        key,
        type: 'frequent',
        name: 'Điểm đến quen thuộc',
        latitude: lat,
        longitude: lon,
        visitCount: count,
        lastVisitedMs: lastVisit,
        isAutoDetected: true,
      });
    }
  });

  return results;
}

/**
 * Get all tagged smart places (including wishlists and manual tags).
 */
export async function getSmartPlaces(): Promise<SmartPlaceMeta[]> {
  try {
    const raw = await AsyncStorage.getItem(SMART_PLACES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

/**
 * Tag or update a place as Home, Work, School or Want-to-go.
 */
export async function setPlaceSmartTag(
  key: string,
  type: SmartPlaceType,
  name: string,
  coords: { latitude: number; longitude: number }
): Promise<void> {
  const list = await getSmartPlaces();
  const idx = list.findIndex(p => p.key === key);
  const item: SmartPlaceMeta = {
    key,
    type,
    name,
    latitude: coords.latitude,
    longitude: coords.longitude,
    visitCount: idx >= 0 ? list[idx]!.visitCount + 1 : 1,
    lastVisitedMs: Date.now(),
    isAutoDetected: false,
  };

  if (idx >= 0) list[idx] = item;
  else list.push(item);

  await AsyncStorage.setItem(SMART_PLACES_KEY, JSON.stringify(list)).catch(() => {});
}

/**
 * Find which friends have visited this place (within 200m).
 */
export function getFriendsWhoVisitedPlace(
  placeLat: number,
  placeLon: number,
  friends: RealtimeFriend[]
): PlaceFriendVisitor[] {
  const visitors: PlaceFriendVisitor[] = [];

  for (const f of friends) {
    if(f.ghostMode!=='precise')continue;
    const now=Date.now(),stays=(f.footprints||[]).filter(fp=>Number.isFinite(fp.timestamp)&&fp.timestamp<=now&&Number.isFinite(fp.dwellMinutes)&&fp.dwellMinutes!>=5&&distanceMeters(fp,{latitude:placeLat,longitude:placeLon})<=200);
    const times=[...new Set(stays.map(fp=>fp.timestamp))],recent=f.isOnline!==false&&Number.isFinite(f.lastSeenMs)&&now-f.lastSeenMs>=0&&now-f.lastSeenMs<=300000&&distanceMeters(f,{latitude:placeLat,longitude:placeLon})<=250;
    if (times.length||recent) {
      visitors.push({
        friendId: f.id,
        friendName: f.displayName,
        avatarUrl: f.avatarUrl,
          lastVisitedMs:times.length?Math.max(...times):f.lastSeenMs,
          visitCount:times.length||null,
          source:times.length?'footprints':'presence',
      });
    }
  }

  return visitors.sort((a, b) => b.lastVisitedMs - a.lastVisitedMs);
}

/**
 * Regulars leaderboard for a place among friend circle.
 */
export function getPlaceRegularsLeaderboard(
  visitors: PlaceFriendVisitor[]
): PlaceFriendVisitor[] {
  return visitors.filter(v=>v.visitCount!=null).sort((a, b) => (b.visitCount||0) - (a.visitCount||0));
}
