import { getPrivacyZones, savePrivacyZone, deletePrivacyZone, type PrivacyZone } from '../db/database';
import { distanceMeters } from '../utils/geo';

export { type PrivacyZone, getPrivacyZones, savePrivacyZone, deletePrivacyZone };

/**
 * Checks if a coordinate falls inside any active user privacy zone (Home/Work/Custom).
 */
export async function isInsidePrivacyZone(lat: number, lon: number): Promise<PrivacyZone | null> {
  const zones = await getPrivacyZones();
  for (const zone of zones) {
    const dist = distanceMeters({ latitude: lat, longitude: lon }, { latitude: zone.latitude, longitude: zone.longitude });
    if (dist <= zone.radius_m) {
      return zone;
    }
  }
  return null;
}

/**
 * Masks/blurs a coordinate if it falls inside an active privacy zone to protect sensitive locations.
 */
export async function maskCoordinateIfPrivate(lat: number, lon: number): Promise<{ latitude: number; longitude: number; isMasked: boolean }> {
  const zone = await isInsidePrivacyZone(lat, lon);
  if (!zone) return { latitude: lat, longitude: lon, isMasked: false };

  // Apply deterministic jitter to shift point away from true center while preserving approximate region
  const angle = ((Math.sin(lat * 1000 + lon * 1000) + 1) / 2) * 2 * Math.PI;
  const offsetMeters = zone.radius_m * 1.1;
  const deltaLat = (offsetMeters / 111320) * Math.cos(angle);
  const deltaLon = (offsetMeters / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);

  return {
    latitude: lat + deltaLat,
    longitude: lon + deltaLon,
    isMasked: true,
  };
}

export async function addDefaultPrivacyZoneIfNone(): Promise<void> {
  const zones = await getPrivacyZones();
  if (zones.length === 0) {
    // Empty by default, user configures Home/Work in Settings
  }
}
