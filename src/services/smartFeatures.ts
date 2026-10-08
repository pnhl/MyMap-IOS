import { getDeviceCurrentPosition } from './platformLocation';
import * as Location from 'expo-location';
import { supabase } from './supabase';
import { syncGeofences } from './geofencing';
import { getCurrentUser } from './auth';

export type TripRecap = {
  trip_id: string;
  distance_m: number;
  duration_seconds: number;
  place_count: number;
  photo_count: number;
  country_count: number;
  city_count: number;
  summary_text?: string | null;
  generated_at: string;
};

async function currentCoords() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Cần quyền vị trí để sử dụng tính năng này.');
  const pos = await getDeviceCurrentPosition({ accuracy: Location.Accuracy.Balanced });
  return pos.coords;
}

export async function checkIn(message = 'Tôi đã đến nơi an toàn', visibility: 'private' | 'trusted' | 'friends' = 'trusted') {
  const c = await currentCoords();
  const { data, error } = await supabase.rpc('vc_create_checkin', {
    p_lat: c.latitude,
    p_lon: c.longitude,
    p_message: message,
    p_place_name: null,
    p_visibility: visibility,
  });
  if (error) throw error;
  return data as string;
}

export async function createPlaceAlert(label = 'Địa điểm của tôi', radiusM = 250, autoCheckin = true, notifyTrusted = true) {
  const c = await currentCoords();
  const { data, error } = await supabase.rpc('vc_create_place_alert', {
    p_label: label,
    p_lat: c.latitude,
    p_lon: c.longitude,
    p_radius_m: radiusM,
  });
  if (error) throw error;
  const id = data as string;
  const { error: updateError } = await supabase.from('vc_place_alerts').update({ auto_checkin: autoCheckin, notify_trusted: notifyTrusted }).eq('id', id);
  if (updateError) throw updateError;
  await syncGeofences();
  return id;
}

export async function createEtaShare(targetUserId: string | null, destination: { label?: string; latitude: number; longitude: number }, etaAt?: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Bạn cần đăng nhập.');
  const {data:identity,error:identityError}=await supabase.rpc('mm_identity');
  if(identityError)throw identityError;
  const { data, error } = await supabase.from('vc_eta_shares').insert({
    owner_id: identity,
    target_user_id: targetUserId,
    destination_label: destination.label ?? 'Điểm đến',
    destination_lat: destination.latitude,
    destination_lon: destination.longitude,
    eta_at: etaAt ?? null,
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function cancelEtaShare(id: string) {
  const { error } = await supabase.from('vc_eta_shares').update({ status: 'cancelled' }).eq('id', id);
  if (error) throw error;
}

export async function generateTripRecap(tripId: string) {
  const { data, error } = await supabase.rpc('vc_generate_trip_recap', { p_trip_id: tripId });
  if (error) throw error;
  return data as TripRecap;
}

export async function listPlaceAlerts(includeDisabled = false) {
  let query = supabase.from('vc_place_alerts').select('*');
  if (!includeDisabled) query = query.eq('is_enabled', true);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listRecentCheckins() {
  const { data, error } = await supabase.from('vc_checkins').select('*').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data ?? [];
}
