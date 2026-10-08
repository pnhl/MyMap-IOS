import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, invokeEdgeFunctionWithFallback } from './supabase';
import { getCurrentUser } from './auth';
import { enqueueOfflineSos, getPendingOfflineSos, markOfflineSosSynced } from '../db/database';
import type { CrowdCell, SosResult } from '../types/safety';
import {travelNative} from './travelPlatform';
import {sharedCoordinate} from './sharingPrivacy';

const CONTACTS_CACHE_KEY = 'mymap.trusted_contacts.cache.v1';

export type TrustedContact = {
  id: string;
  name: string;
  phone_e164: string | null;
  relationship: string | null;
  contact_user_id: string | null;
};

export async function publishLivePresence(input: {
  latitude: number;
  longitude: number;
  accuracy_m?: number | null;
  heading_deg?: number | null;
  speed_mps?: number | null;
  battery_level?: number | null;
  activity_type?: string | null;
}): Promise<CrowdCell[]> {
  try {
    const shared = await sharedCoordinate(input);
    if (!shared) return [];
    const body = {...input,latitude:shared.latitude,longitude:shared.longitude};
    // Speed/heading must not disclose movement while coordinates are frozen or delayed.
    if(shared.isFrozen || shared.isDelayed || shared.isFuzzy){body.heading_deg=null;body.speed_mps=null;}
    const { data, error } = await invokeEdgeFunctionWithFallback('mymap-presence', 'vibecoding-presence', { body });
    if (error) throw error;
    return (data?.crowd ?? []) as CrowdCell[];
  } catch {
    return [];
  }
}

export async function requestTrustedLocation(
  targetUserId: string,
  precision: 'exact' | 'coarse' = 'exact',
  message?: string
) {
  const { data, error } = await supabase.rpc('vc_request_location', {
    p_target_id: targetUserId,
    p_precision: precision,
    p_message: message ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function respondToLocationRequest(requestId: string, accept: boolean) {
  const { data, error } = await supabase.rpc('vc_respond_location_request', {
    p_request_id: requestId,
    p_accept: accept,
  });
  if (error) throw error;
  return data;
}

export async function getTrustedContactsWithCache(): Promise<TrustedContact[]> {
  // Read local cache first for instant offline access
  let cached: TrustedContact[] = [];
  try {
    const raw = await AsyncStorage.getItem(CONTACTS_CACHE_KEY);
    if (raw) cached = JSON.parse(raw);
  } catch {}

  // Attempt background sync if online
  try {
    const { data, error } = await supabase
      .from('vc_trusted_contacts')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      cached = data as TrustedContact[];
      await AsyncStorage.setItem(CONTACTS_CACHE_KEY, JSON.stringify(cached)).catch(() => {});
    }
  } catch {}

  return cached;
}

export async function addTrustedContact(input: {
  name: string;
  phoneE164?: string;
  contactUserId?: string;
  relationship?: string;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Bạn cần đăng nhập để đồng bộ người thân.');
  const {data:identity,error:identityError}=await supabase.rpc('mm_identity');
  if(identityError)throw identityError;
  const { data, error } = await supabase
    .from('vc_trusted_contacts')
    .insert({
      user_id: identity,
      contact_user_id: input.contactUserId ?? null,
      name: input.name,
      phone_e164: input.phoneE164 ?? null,
      relationship: input.relationship ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  // Refresh and update local cache
  await getTrustedContactsWithCache();
  return data;
}

export async function triggerSos(input: {
  latitude?: number | null;
  longitude?: number | null;
  accuracy_m?: number | null;
  country_code?: string | null;
  emergency_type?: 'general' | 'police' | 'medical' | 'fire';
  trigger_method?: string;
  note?: string;
}): Promise<SosResult> {
  try {
    const { data, error } = await invokeEdgeFunctionWithFallback('mymap-sos', 'vibecoding-sos', { body: input });
    if (error) throw error;
    return data as SosResult;
  } catch (err) {
    // If offline or network error, enqueue to offline SOS queue in SQLite
    const queueId = await enqueueOfflineSos({
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      accuracy_m: input.accuracy_m ?? null,
      emergency_type: input.emergency_type || 'general',
      trigger_method: input.trigger_method || 'offline_sos',
      note: input.note ?? null,
      created_at: Date.now(),
    });

    const cachedContacts = await getTrustedContactsWithCache();
    return {
      ok: true,
      event_id: `offline-sos-${queueId}`,
      emergency_number: '115',
      dial_requires_user_confirmation: true,
      contacts: cachedContacts.map(c => ({ id: c.id, name: c.name, phone_e164: c.phone_e164 })),
      suggested_message: input.note || 'Tôi cần trợ giúp khẩn cấp!',
      location_url: input.latitude && input.longitude ? `https://maps.google.com/?q=${input.latitude},${input.longitude}` : null,
    };
  }
}

export async function syncPendingSosEvents(): Promise<number> {
  const pending = await getPendingOfflineSos();
  let syncedCount = 0;
  for (const item of pending) {
    try {
      const { data, error } = await invokeEdgeFunctionWithFallback('mymap-sos', 'vibecoding-sos', {
        body: {
          latitude: item.latitude,
          longitude: item.longitude,
          accuracy_m: item.accuracy_m,
          emergency_type: item.emergency_type,
          trigger_method: `${item.trigger_method}_synced`,
          note: item.note,
        },
      });
      if (!error && (data as SosResult)?.ok) {
        if (item.id != null) await markOfflineSosSynced(item.id);
        syncedCount++;
      }
    } catch {
      break; // Still offline, wait for next connection
    }
  }
  return syncedCount;
}

export async function openEmergencyDialer(phoneNumber: string) {
  if (travelNative) {
    if (!await travelNative.openDialer(phoneNumber)) throw new Error('Thiết bị chưa thể mở cuộc gọi di động.');
    return;
  }
  await Linking.openURL(`tel:${encodeURIComponent(phoneNumber)}`);
}

export async function composeEmergencySms(phoneNumber: string, message: string) {
  const separator = Platform.OS === 'ios' ? '&' : '?';
  await Linking.openURL(`sms:${encodeURIComponent(phoneNumber)}${separator}body=${encodeURIComponent(message)}`);
}

export function createExpiringShareLink(lat: number, lon: number, expiresInHours: number = 2, precision: 'exact' | 'coarse' = 'exact') {
  const expiresAt = Date.now() + expiresInHours * 3600 * 1000;
  let finalLat = lat;
  let finalLon = lon;
  if (precision === 'coarse') {
    // Round to ~1.1km coarse accuracy
    finalLat = Math.round(lat * 100) / 100;
    finalLon = Math.round(lon * 100) / 100;
  }
  return {
    url: `https://mymap.app/share/live?lat=${finalLat}&lon=${finalLon}&exp=${expiresAt}&p=${precision}`,
    expiresAt,
    precision,
  };
}
