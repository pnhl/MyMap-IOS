import type { PhotoPin } from '../types/photo';
import { distanceMeters } from './geo';

export function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

export type SearchOptions = {
  currentCoord?: { latitude: number; longitude: number } | null;
  radiusKm?: number | null;
  tag?: string | null;
};

export function searchMemories(photos: PhotoPin[], query: string, options?: SearchOptions) {
  let filtered = photos;

  // 1. Tag filter if requested
  if (options?.tag) {
    const targetTag = normalizeSearch(options.tag.replace(/^#/, ''));
    filtered = filtered.filter(p => p.tags && normalizeSearch(p.tags).includes(targetTag));
  }

  // 2. Distance radius filter if requested
  if (options?.currentCoord && options.radiusKm && options.radiusKm > 0) {
    const maxMeters = options.radiusKm * 1000;
    filtered = filtered.filter(p => distanceMeters(options.currentCoord!, p) <= maxMeters);
  }

  const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return filtered;

  return filtered.filter(photo => {
    const date = new Date(photo.capturedAt);
    const text = normalizeSearch([
      photo.title,
      photo.note,
      photo.placeName,
      photo.countryCode,
      photo.tags,
      date.toLocaleDateString('vi-VN'),
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    ].filter(Boolean).join(' '));
    return terms.every(term => text.includes(term));
  });
}
