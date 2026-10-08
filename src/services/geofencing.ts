import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

export const GEOFENCE_TASK_NAME = 'mymap-place-geofence-v1';

type PlaceAlert = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  notify_on_enter: boolean;
  notify_on_exit: boolean;
};

type GeofenceTaskEvent = {
  eventType: number;
  region: {
    identifier?: string;
    latitude: number;
    longitude: number;
  };
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error || !data) return;
  const event = data as GeofenceTaskEvent;
  const eventType = event.eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit';
  const alertId = event.region.identifier;
  if (!alertId) return;

  try {
    await supabase.rpc('vc_record_place_alert_event', {
      p_alert_id: alertId,
      p_event_type: eventType,
      p_lat: event.region.latitude,
      p_lon: event.region.longitude,
    });

    await Notifications.scheduleNotificationAsync({
      content: {
        title: eventType === 'enter' ? 'MyMap · Đã đến địa điểm' : 'MyMap · Đã rời địa điểm',
        body: 'Mở MyMap để xem chi tiết hoặc chia sẻ trạng thái an toàn.',
        data: { type: 'place_alert', alertId, eventType },
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('MyMap geofence task failed', e);
  }
});

export async function syncGeofences() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('Cần quyền vị trí để bật cảnh báo địa điểm.');
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') throw new Error('Cần quyền vị trí nền để nhận cảnh báo khi app không mở.');

  const { data, error } = await supabase
    .from('vc_place_alerts')
    .select('id,label,latitude,longitude,radius_m,notify_on_enter,notify_on_exit')
    .eq('is_enabled', true)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;

  const regions = ((data ?? []) as PlaceAlert[]).map((a) => ({
    identifier: a.id,
    latitude: a.latitude,
    longitude: a.longitude,
    radius: Math.max(50, Math.min(a.radius_m, 5000)),
    notifyOnEnter: a.notify_on_enter,
    notifyOnExit: a.notify_on_exit,
  }));

  if (!regions.length) {
    const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
    if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    return 0;
  }

  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
  return regions.length;
}

export async function stopGeofences() {
  if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME)) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
  }
}
