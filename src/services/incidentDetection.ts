import { getDeviceCurrentPosition } from './platformLocation';
import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { supabase } from './supabase';
import {
  isNativeSafetyAvailable,
  startNativeSafetyDetection,
  stopNativeSafetyDetection,
  type NativeSafetySubscription,
} from './nativeSafety';

export type SafetyIncident = {
  id: string;
  type: 'possible_crash' | 'possible_fall';
  peakG: number;
};

let subscription: { remove(): void } | null = null;
let nativeSubscription: NativeSafetySubscription | null = null;
let lastTrigger = 0;

async function recordIncident(
  type: SafetyIncident['type'],
  peakG: number,
  detector: 'native_v1' | 'accelerometer_v1',
) {
  let latitude: number | null = null;
  let longitude: number | null = null;
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status === 'granted') {
      const p = await getDeviceCurrentPosition({ accuracy: Location.Accuracy.Balanced });
      latitude = p.coords.latitude;
      longitude = p.coords.longitude;
    }
  } catch {}

  const { data, error } = await supabase.rpc('vc_create_safety_incident', {
    p_type: type,
    p_peak_g: peakG,
    p_lat: latitude,
    p_lon: longitude,
    p_metadata: { detector },
  });
  if (error) throw error;
  return data as string;
}

export async function startIncidentDetection(onIncident: (incident: SafetyIncident) => void) {
  await stopIncidentDetection();

  const publishIncident = async (
    type: SafetyIncident['type'],
    peakG: number,
    detector: 'native_v1' | 'accelerometer_v1',
  ) => {
    let incidentId = `local_${Date.now()}`;
    try {
      const serverId = await recordIncident(type, peakG, detector);
      if (serverId) {
        incidentId = serverId;
      }
    } catch (e) {
      console.warn('MyMap incident server record failed; proceeding with local incident', e);
    }
    // Always trigger safety incident callback regardless of network state
    onIncident({ id: incidentId, type, peakG });
  };

  if (await isNativeSafetyAvailable()) {
    try {
      nativeSubscription = await startNativeSafetyDetection(({ type, peakG }) => {
        void publishIncident(type, peakG, 'native_v1');
      });
      return;
    } catch (e) {
      console.warn('MyMap native safety unavailable; using Expo sensor fallback', e);
    }
  }

  const available = await Accelerometer.isAvailableAsync();
  if (!available) throw new Error('Thiết bị không hỗ trợ cảm biến gia tốc.');

  Accelerometer.setUpdateInterval(100);
  subscription = Accelerometer.addListener(async ({ x, y, z }) => {
    const now = Date.now();
    if (now - lastTrigger < 30_000) return;
    const g = Math.sqrt(x * x + y * y + z * z);

    // Conservative thresholds to reduce false positives. This is not a medical detector.
    const type: SafetyIncident['type'] | null = g >= 4.5 ? 'possible_crash' : g >= 3.2 ? 'possible_fall' : null;
    if (!type) return;

    lastTrigger = now;
    void publishIncident(type, g, 'accelerometer_v1');
  });
}

export async function stopIncidentDetection() {
  subscription?.remove();
  subscription = null;
  nativeSubscription?.remove();
  nativeSubscription = null;
  await stopNativeSafetyDetection();
}

export async function resolveIncident(id: string, status: 'dismissed' | 'sos_triggered' | 'resolved') {
  if (id.startsWith('local_')) {
    // Incident was only tracked locally (e.g. offline)
    return;
  }
  const { error } = await supabase
    .from('vc_safety_incidents')
    .update({ status, confirmed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
