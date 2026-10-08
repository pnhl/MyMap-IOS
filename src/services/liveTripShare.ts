import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TripWaypoint {
  name: string;
  latitude: number;
  longitude: number;
}

export interface LiveTripSession {
  id: string;
  destination: TripWaypoint;
  origin: TripWaypoint;
  startedAt: number;
  currentLatitude: number;
  currentLongitude: number;
  currentSpeedKmh: number;
  remainingDistanceMeters: number;
  etaMinutes: number;
  isActive: boolean;
}

const STORAGE_KEY = 'mymap.live_trip.v1';

function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function getActiveLiveTrip(): Promise<LiveTripSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session: LiveTripSession = JSON.parse(raw);
    return session.isActive ? session : null;
  } catch {
    return null;
  }
}

export async function startLiveTrip(
  origin: TripWaypoint,
  destination: TripWaypoint,
  initialSpeedKmh = 30
): Promise<LiveTripSession> {
  const distanceMeters = Math.round(
    haversineDistanceMeters(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude
    )
  );

  const speedKmh = Math.max(15, initialSpeedKmh);
  const speedMetersPerMin = (speedKmh * 1000) / 60;
  const etaMinutes = Math.max(1, Math.round(distanceMeters / speedMetersPerMin));

  const session: LiveTripSession = {
    id: `trip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    origin,
    destination,
    startedAt: Date.now(),
    currentLatitude: origin.latitude,
    currentLongitude: origin.longitude,
    currentSpeedKmh: speedKmh,
    remainingDistanceMeters: distanceMeters,
    etaMinutes,
    isActive: true,
  };

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export async function updateLiveTrip(
  currentLat: number,
  currentLon: number,
  speedKmh = 30
): Promise<LiveTripSession | null> {
  const session = await getActiveLiveTrip();
  if (!session) return null;

  const remainingDistanceMeters = Math.round(
    haversineDistanceMeters(
      currentLat,
      currentLon,
      session.destination.latitude,
      session.destination.longitude
    )
  );

  const effectiveSpeed = Math.max(15, speedKmh);
  const speedMetersPerMin = (effectiveSpeed * 1000) / 60;
  const etaMinutes = Math.max(1, Math.round(remainingDistanceMeters / speedMetersPerMin));

  const updated: LiveTripSession = {
    ...session,
    currentLatitude: currentLat,
    currentLongitude: currentLon,
    currentSpeedKmh: speedKmh,
    remainingDistanceMeters,
    etaMinutes,
  };

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export async function endLiveTrip(): Promise<void> {
  const session = await getActiveLiveTrip();
  if (session) {
    session.isActive = false;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

export function formatTripShareMessage(session: LiveTripSession): string {
  const distKm = (session.remainingDistanceMeters / 1000).toFixed(1);
  return (
    `🚗 Mình đang trên đường đến: ${session.destination.name}!\n` +
    `⏱️ Dự kiến đến sau: ~${session.etaMinutes} phút (còn ${distKm} km)\n` +
    `⚡ Vận tốc hiện tại: ${Math.round(session.currentSpeedKmh)} km/h\n` +
    `📍 Điểm xuất phát: ${session.origin.name}\n\n` +
    `Theo dõi trực tiếp cùng mình trên MyMap!`
  );
}
