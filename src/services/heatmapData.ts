import type {LocationPoint} from '../types/location';
import type {PhotoPin} from '../types/photo';

export function validMapCoordinate(point: {latitude: number; longitude: number; accuracy?: number | null}) {
  return Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180 &&
    (point.accuracy == null || (Number.isFinite(point.accuracy) && point.accuracy >= 0 && point.accuracy <= 100));
}

/** Combine repeated fixes at the same metre, never move a pin to a coarse centroid. */
export function buildHeatmapObservations(points: LocationPoint[], photos: PhotoPin[]) {
  const grouped = new Map<string, {id: string; latitude: number; longitude: number; count: number; label: string}>();
  for (const point of points) {
    if (!validMapCoordinate(point)) continue;
    const key = `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
    const existing = grouped.get(key);
    if (existing) existing.count++;
    else grouped.set(key, {id: `gps:${key}`, latitude: point.latitude, longitude: point.longitude, count: 1, label: 'Điểm GPS đã ghi'});
  }
  return [...grouped.values(), ...photos.filter(validMapCoordinate).map(photo => ({
    id: `photo:${photo.id}`, latitude: photo.latitude, longitude: photo.longitude, count: 1,
    label: photo.placeName || photo.title || 'Kỷ niệm đã lưu',
  }))];
}
