import { getLocationPoints, getPhotoPins } from '../db/database';
import { getHangoutHistory, type HangoutEvent } from './hangoutBump';
import { getUnlockedHexCells } from './scratchMap';
import type { PhotoPin } from '../types/photo';

export type MapStoryType = 'new_city' | 'party_hangout' | 'photo_checkin' | 'scratch_unlock' | 'one_year_ago';

export interface MapStory {
  id: string;
  type: MapStoryType;
  title: string;
  subtitle: string;
  emoji: string;
  coverUri?: string | null;
  timestamp: number;
  latitude: number;
  longitude: number;
  metric?: string;
  tag?: string;
}

/**
 * Generate 24-hour highlights stories from existing map data.
 */
export async function getMapStories24h(): Promise<MapStory[]> {
  const stories: MapStory[] = [];
  const now = Date.now();
  const oneDayAgo = now - 24 * 3600000;

  try {
    const [photos, points, hangouts, scratchCells] = await Promise.all([
      getPhotoPins().catch(() => []),
      getLocationPoints().catch(() => []),
      getHangoutHistory().catch(() => []),
      getUnlockedHexCells().catch(() => []),
    ]);

    // 1. Photos taken in the last 24 hours
    const recentPhotos = photos.filter(p => p.capturedAt >= oneDayAgo);
    if (recentPhotos.length > 0) {
      const topPhoto = recentPhotos[0]!;
      stories.push({
        id: `story-photo-${topPhoto.id}`,
        type: 'photo_checkin',
        title: topPhoto.placeName || 'Khoảnh khắc mới',
        subtitle: `${recentPhotos.length} ảnh kỷ niệm chụp hôm nay`,
        emoji: '📸',
        coverUri: topPhoto.uri,
        timestamp: topPhoto.capturedAt,
        latitude: topPhoto.latitude,
        longitude: topPhoto.longitude,
        metric: `${recentPhotos.length} ảnh`,
        tag: 'Check-in',
      });
    }

    // 2. Hangouts / Bump meetups in the last 24 hours
    const recentHangouts = hangouts.filter(h => h.startedAt >= oneDayAgo);
    if (recentHangouts.length > 0) {
      const h = recentHangouts[0]!;
      stories.push({
        id: `story-hangout-${h.id}`,
        type: 'party_hangout',
        title: `Cụng máy cùng ${h.partnerName}`,
        subtitle: 'Gặp gỡ ngoài đời thực',
        emoji: '🔥',
        coverUri: h.partnerAvatarUrl ?? null,
        timestamp: h.startedAt,
        latitude: h.latitude,
        longitude: h.longitude,
        metric: '+15 điểm',
        tag: 'Hangout',
      });
    }

    // 3. New Scratch cells unlocked today
    const recentCells = scratchCells.filter(c => c.unlockedAt >= oneDayAgo);
    if (recentCells.length > 0) {
      const sample = recentCells[0]!;
      stories.push({
        id: `story-scratch-${sample.key}`,
        type: 'scratch_unlock',
        title: `Mở khóa ${recentCells.length} ô mới!`,
        subtitle: 'Sương mù bản đồ đã tan ra',
        emoji: '🗺️',
        timestamp: sample.unlockedAt,
        latitude: sample.centerLat,
        longitude: sample.centerLon,
        metric: `${recentCells.length} ô cào`,
        tag: 'Khám phá',
      });
    }

    // 4. "One year ago today" memory (365 days ago +/- 3 days)
    const oneYearAgoMs = now - 365 * 24 * 3600000;
    const windowMs = 3 * 24 * 3600000;
    const anniversaryPhoto = photos.find(p => Math.abs(p.capturedAt - oneYearAgoMs) <= windowMs);
    if (anniversaryPhoto) {
      stories.push({
        id: `story-anniversary-${anniversaryPhoto.id}`,
        type: 'one_year_ago',
        title: 'Một năm trước hôm nay',
        subtitle: anniversaryPhoto.placeName || 'Hành trình kỷ niệm',
        emoji: '⏳',
        coverUri: anniversaryPhoto.uri,
        timestamp: anniversaryPhoto.capturedAt,
        latitude: anniversaryPhoto.latitude,
        longitude: anniversaryPhoto.longitude,
        metric: '1 năm trước',
        tag: 'Kỷ niệm',
      });
    }

    // 5. If no stories found, provide a welcome discovery story
    if (stories.length === 0) {
      stories.push({
        id: 'story-welcome',
        type: 'new_city',
        title: 'Hành trình hôm nay',
        subtitle: 'Bắt đầu ghi dấu chân để tạo Story',
        emoji: '✨',
        timestamp: now,
        latitude: points[0]?.latitude || 21.0285,
        longitude: points[0]?.longitude || 105.8542,
        tag: 'MyMap',
      });
    }
  } catch {}

  return stories;
}
