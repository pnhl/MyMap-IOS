import { getNativeBatteryStatus } from './nativeSafety';

export type UserAutomaticStatus = {
  batteryLevel: number;
  isCharging: boolean;
  speedKmh: number;
  activityLabel: string;
  contextStatus: string;
  icon: string;
  updatedAt: number;
};

/**
 * Tính toán trạng thái ngữ cảnh tự động của người dùng dựa trên toạ độ, tốc độ, thời gian và pin.
 */
export async function computeCurrentAutomaticStatus(input: {
  speedMps?: number | null;
  latitude?: number;
  longitude?: number;
  dwellMinutes?: number;
  placeName?: string | null;
  isHome?: boolean;
}): Promise<UserAutomaticStatus> {
  const battery = await getNativeBatteryStatus();
  const speedKmh = Math.round((input.speedMps ?? 0) * 3.6);
  const now = new Date();
  const hour = now.getHours();

  let activityLabel = 'Đứng yên';
  let contextStatus = 'Đang trực tuyến';
  let icon = 'map-marker';

  // 1. Nhận diện trạng thái di chuyển
  if (speedKmh >= 20) {
    activityLabel = `Di chuyển ${speedKmh} km/h`;
    contextStatus = `Đang đi xe (${speedKmh} km/h)`;
    icon = 'car';
  } else if (speedKmh >= 6) {
    activityLabel = `Đạp xe ${speedKmh} km/h`;
    contextStatus = `Đang di chuyển (${speedKmh} km/h)`;
    icon = 'bike';
  } else if (speedKmh >= 1.5) {
    activityLabel = 'Đang đi bộ';
    contextStatus = 'Đang đi bộ';
    icon = 'walk';
  } else {
    // 2. Nhận diện trạng thái ngủ đêm: từ 22h - 7h sáng, pin đang cắm sạc hoặc đứng yên lâu
    const isLateNight = hour >= 22 || hour < 7;
    const dwell = input.dwellMinutes ?? 45;

    if (isLateNight && (battery.isCharging || dwell > 60)) {
      const sleepH = Math.max(1, Math.min(9, Math.round(dwell / 60)));
      activityLabel = 'Đang nghỉ ngơi';
      contextStatus = `Đang ngủ 💤 (${sleepH}h)`;
      icon = 'bed';
    } else if (input.isHome || (input.placeName && input.placeName.toLowerCase().includes('nhà'))) {
      const homeH = Math.max(1, Math.round(dwell / 60));
      activityLabel = 'Tại nhà';
      contextStatus = `Ở nhà (${homeH}h)`;
      icon = 'home';
    } else if (input.placeName) {
      activityLabel = input.placeName;
      contextStatus = `Tại ${input.placeName}`;
      icon = 'store';
    } else {
      activityLabel = 'Đứng yên';
      contextStatus = dwell > 120 ? `Ở yên một chỗ (${Math.round(dwell / 60)}h)` : 'Vừa mới đến';
      icon = 'map-marker-radius';
    }
  }

  return {
    batteryLevel: battery.level,
    isCharging: battery.isCharging,
    speedKmh,
    activityLabel,
    contextStatus,
    icon,
    updatedAt: Date.now(),
  };
}

/**
 * Format nhãn pin trực quan kèm icon
 */
export function formatBatteryDisplay(level: number, isCharging: boolean): { label: string; icon: string; color: string } {
  if(!Number.isFinite(level)||level<0)return{label:'—',icon:'battery-unknown',color:'#9BA6BD'};
  const safeLevel = Math.max(0, Math.min(100, Math.round(level)));
  let color = '#4CD964';
  if (safeLevel <= 15) color = '#FF3B30';
  else if (safeLevel <= 30) color = '#FF9500';

  if (isCharging) {
    return { label: `${safeLevel}%`, icon: 'battery-charging', color: '#54D6FF' };
  }
  if (safeLevel <= 15) return { label: `${safeLevel}%`, icon: 'battery-alert', color };
  if (safeLevel <= 40) return { label: `${safeLevel}%`, icon: 'battery-low', color };
  if (safeLevel <= 70) return { label: `${safeLevel}%`, icon: 'battery-medium', color };
  return { label: `${safeLevel}%`, icon: 'battery-high', color };
}
