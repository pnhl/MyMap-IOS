import MyMapSafety, {
  type NativeIncidentEvent,
  type NativeActivityEvent,
  type NativeVisitEvent,
} from '../../modules/my-map-safety';

export type NativeSafetySubscription = { remove(): void };

const CRASH_THRESHOLD_G = 4.5;
const FALL_THRESHOLD_G = 3.2;
const COOLDOWN_MS = 30_000;

export async function isNativeSafetyAvailable() {
  return MyMapSafety ? MyMapSafety.isAvailable() : false;
}

export async function getNativeAvailableSensors(): Promise<Record<string, boolean>> {
  if (!MyMapSafety?.getAvailableSensors) return {};
  return MyMapSafety.getAvailableSensors();
}

export async function startNativeSafetyDetection(
  listener: (event: NativeIncidentEvent) => void,
): Promise<NativeSafetySubscription> {
  if (!MyMapSafety) {
    throw new Error('MyMapSafety native module is not linked.');
  }

  const subscription = MyMapSafety.addListener('onIncidentDetected', listener);
  try {
    const started = await MyMapSafety.startDetection(
      CRASH_THRESHOLD_G,
      FALL_THRESHOLD_G,
      COOLDOWN_MS,
    );
    if (!started) {
      throw new Error('Native accelerometer or motion sensors unavailable.');
    }
    return subscription;
  } catch (error) {
    subscription.remove();
    throw error;
  }
}

export async function stopNativeSafetyDetection() {
  if (MyMapSafety) {
    await MyMapSafety.stopDetection();
  }
}

// --- Tier B: Battery Optimization (Doze Exemption) ---
export async function isBatteryOptimizationIgnored(): Promise<boolean> {
  if (!MyMapSafety?.isIgnoringBatteryOptimizations) return true;
  return MyMapSafety.isIgnoringBatteryOptimizations();
}

export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  if (!MyMapSafety?.requestIgnoreBatteryOptimizations) return false;
  return MyMapSafety.requestIgnoreBatteryOptimizations();
}

// --- Tier B: Activity Recognition ---
export async function getNativeDetectedActivity(): Promise<string> {
  if (!MyMapSafety?.getDetectedActivity) return 'STILL';
  return MyMapSafety.getDetectedActivity();
}

export function subscribeToActivityChanges(
  listener: (event: NativeActivityEvent) => void,
): NativeSafetySubscription | null {
  if (!MyMapSafety) return null;
  return MyMapSafety.addListener('onActivityChanged', listener);
}

// --- Tier B: WebP Compression & EXIF ---
export async function compressImageNativeWebP(sourceUri: string, quality = 80): Promise<string | null> {
  if (!MyMapSafety?.compressImageToWebP) return null;
  try {
    return await MyMapSafety.compressImageToWebP(sourceUri, quality);
  } catch {
    return null;
  }
}

export async function writeGeoExif(
  filePath: string,
  lat: number,
  lon: number,
  altitude?: number | null,
  timestampMs?: number | null,
): Promise<boolean> {
  if (!MyMapSafety?.writeGeoExif) return false;
  try {
    return await MyMapSafety.writeGeoExif(filePath, lat, lon, altitude, timestampMs);
  } catch {
    return false;
  }
}

export async function readGeoExif(filePath: string) {
  if (!MyMapSafety?.readGeoExif) return { hasLocation: false };
  try {
    return await MyMapSafety.readGeoExif(filePath);
  } catch {
    return { hasLocation: false };
  }
}

// --- Tier B: Wear OS Vibration & Notifications ---
export async function notifyWearDevice(type: 'geofence' | 'sos', message: string): Promise<boolean> {
  if (!MyMapSafety?.notifyWearDevice) return false;
  try {
    return await MyMapSafety.notifyWearDevice(type, message);
  } catch {
    return false;
  }
}

// --- Tier C: iOS CLVisit & Significant Location Changes ---
export async function startNativeSignificantLocationMonitoring(): Promise<boolean> {
  if (!MyMapSafety?.startSignificantLocationMonitoring) return false;
  try {
    return await MyMapSafety.startSignificantLocationMonitoring();
  } catch {
    return false;
  }
}

export function subscribeToNativeVisits(
  listener: (event: NativeVisitEvent) => void,
): NativeSafetySubscription | null {
  if (!MyMapSafety) return null;
  return MyMapSafety.addListener('onVisitDetected', listener);
}

export async function getNativeBatteryStatus(): Promise<{ level: number; isCharging: boolean }> {
  if (!MyMapSafety?.getBatteryStatus) {
    return { level: -1, isCharging: false };
  }
  try {
    return await MyMapSafety.getBatteryStatus();
  } catch {
    return { level: -1, isCharging: false };
  }
}
