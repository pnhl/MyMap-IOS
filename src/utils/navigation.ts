export type NavigationCoordinate = {
  latitude: number;
  longitude: number;
};

export type GpsSpeedFix = NavigationCoordinate & {
  accuracy?: number | null;
  speedMps?: number | null;
  timestamp: number;
};

const EARTH_RADIUS_M = 6_371_000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function navigationDistanceMeters(
  start: NavigationCoordinate,
  end: NavigationCoordinate,
): number {
  const dLat = toRadians(end.latitude - start.latitude);
  const dLon = toRadians(end.longitude - start.longitude);
  const lat1 = toRadians(start.latitude);
  const lat2 = toRadians(end.latitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Fuse Android's native speed with measured displacement and reject GPS jitter.
 * A speed is not displayed until two usable fixes are available.
 */
export function deriveReliableGpsSpeedKmh(
  current: GpsSpeedFix,
  previous: GpsSpeedFix | null,
  previousFilteredKmh: number | null = null,
): number | null {
  const accuracy = Number.isFinite(current.accuracy) ? Math.max(0, current.accuracy ?? 0) : 100;
  if (!previous || accuracy > 60) return null;

  const previousAccuracy = Number.isFinite(previous.accuracy)
    ? Math.max(0, previous.accuracy ?? 0)
    : 100;
  const elapsedSeconds = (current.timestamp - previous.timestamp) / 1000;
  if (previousAccuracy > 60 || elapsedSeconds < 0.45 || elapsedSeconds > 12) return null;

  const displacement = navigationDistanceMeters(previous, current);
  const noiseRadius = Math.max(3, Math.min(45, (accuracy + previousAccuracy) * 0.38));
  if (displacement <= noiseRadius) return 0;

  const displacementKmh = (displacement / elapsedSeconds) * 3.6;
  const rawNativeKmh = Number.isFinite(current.speedMps)
    && (current.speedMps ?? -1) >= 0
    ? (current.speedMps ?? 0) * 3.6
    : null;

  let candidate = displacementKmh;
  if (rawNativeKmh !== null && rawNativeKmh <= 220) {
    const agreementWindow = Math.max(12, displacementKmh * 0.55);
    if (Math.abs(rawNativeKmh - displacementKmh) <= agreementWindow) {
      candidate = rawNativeKmh * 0.62 + displacementKmh * 0.38;
    }
  }

  if (!Number.isFinite(candidate) || candidate < 3) return 0;
  if (candidate > 220) return null;

  if (previousFilteredKmh !== null) {
    const maximumChange = Math.max(18, elapsedSeconds * 24);
    const delta = candidate - previousFilteredKmh;
    if (Math.abs(delta) > maximumChange) {
      candidate = previousFilteredKmh + Math.sign(delta) * maximumChange;
    }
  }

  return Math.max(0, candidate);
}

export type RoutePointAtDistance = {
  coordinate: NavigationCoordinate;
  traversedMeters: number;
  totalMeters: number;
};

/** Return the interpolated point a requested distance along a [lat, lon] route. */
export function pointAlongRoute(
  route: [number, number][],
  requestedMeters: number,
): RoutePointAtDistance | null {
  if (!Array.isArray(route) || route.length === 0) return null;
  const safeRequested = Math.max(0, requestedMeters);
  let traversed = 0;
  let total = 0;
  const segments: { start: NavigationCoordinate; end: NavigationCoordinate; meters: number }[] = [];

  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1]!;
    const current = route[index]!;
    const start = { latitude: previous[0], longitude: previous[1] };
    const end = { latitude: current[0], longitude: current[1] };
    const meters = navigationDistanceMeters(start, end);
    if (!Number.isFinite(meters) || meters <= 0) continue;
    segments.push({ start, end, meters });
    total += meters;
  }

  if (!segments.length) {
    const first = route[0]!;
    return {
      coordinate: { latitude: first[0], longitude: first[1] },
      traversedMeters: 0,
      totalMeters: 0,
    };
  }

  for (const segment of segments) {
    if (traversed + segment.meters >= safeRequested) {
      const ratio = Math.min(1, Math.max(0, (safeRequested - traversed) / segment.meters));
      return {
        coordinate: {
          latitude: segment.start.latitude + (segment.end.latitude - segment.start.latitude) * ratio,
          longitude: segment.start.longitude + (segment.end.longitude - segment.start.longitude) * ratio,
        },
        traversedMeters: Math.min(safeRequested, total),
        totalMeters: total,
      };
    }
    traversed += segment.meters;
  }

  const last = segments[segments.length - 1]!.end;
  return { coordinate: last, traversedMeters: total, totalMeters: total };
}

export function formatNavigationDistance(meters?: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return '—';
  if (meters < 950) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km`;
}

export interface RouteDeviationResult {
  distanceMeters: number;
  closestPoint: NavigationCoordinate;
  segmentIndex: number;
  remainingDistanceMeters: number;
  isOnRoute: boolean;
}

/** Evaluate current position against a road route polyline. */
export function evaluateRouteProximity(
  position: NavigationCoordinate,
  route: [number, number][],
  thresholdMeters = 50,
): RouteDeviationResult | null {
  if (!Array.isArray(route) || route.length < 2) return null;
  const lat = position.latitude;
  const lon = position.longitude;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos((lat * Math.PI) / 180);

  let minDistance = Infinity;
  let closestSegment = 0;
  let closestFraction = 0;
  let closestCoord: NavigationCoordinate = { latitude: route[0]![0], longitude: route[0]![1] };

  const segmentLengths: number[] = [];
  for (let i = 1; i < route.length; i++) {
    const p1 = route[i - 1]!;
    const p2 = route[i]!;
    const dx = (p2[1] - p1[1]) * metersPerDegreeLon;
    const dy = (p2[0] - p1[0]) * metersPerDegreeLat;
    const segLen = Math.hypot(dx, dy);
    segmentLengths.push(segLen);

    const ax = (lon - p1[1]) * metersPerDegreeLon;
    const ay = (lat - p1[0]) * metersPerDegreeLat;
    const lenSq = dx * dx + dy * dy;
    const projection = lenSq > 0 ? Math.max(0, Math.min(1, (ax * dx + ay * dy) / lenSq)) : 0;
    const projX = p1[1] * metersPerDegreeLon + projection * dx;
    const projY = p1[0] * metersPerDegreeLat + projection * dy;
    const dist = Math.hypot(lon * metersPerDegreeLon - projX, lat * metersPerDegreeLat - projY);

    if (dist < minDistance) {
      minDistance = dist;
      closestSegment = i - 1;
      closestFraction = projection;
      closestCoord = {
        latitude: p1[0] + projection * (p2[0] - p1[0]),
        longitude: p1[1] + projection * (p2[1] - p1[1]),
      };
    }
  }

  let remaining = (1 - closestFraction) * (segmentLengths[closestSegment] ?? 0);
  for (let i = closestSegment + 1; i < segmentLengths.length; i++) {
    remaining += segmentLengths[i] ?? 0;
  }

  return {
    distanceMeters: Math.round(minDistance),
    closestPoint: closestCoord,
    segmentIndex: closestSegment,
    remainingDistanceMeters: Math.max(0, Math.round(remaining)),
    isOnRoute: minDistance <= thresholdMeters,
  };
}
