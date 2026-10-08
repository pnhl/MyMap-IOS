import {observedHistory} from './observedHistory';
import {distanceMeters} from '../utils/geo';
import { getPhotoPins } from '../db/database';
import { getHangoutHistory } from './hangoutBump';
import { getUnlockedHexCells } from './scratchMap';
import { getSavedPlaces } from './placeMetadata';

export interface WrappedStats {
  weekLabel: string;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  topPlaceName: string;
  topPlaceCategory?: string;
  photoCount: number;
  hangoutCount: number;
  unlockedHexCount: number;
  titleBadge: string;
  slides: {
    title: string;
    headline: string;
    description: string;
    icon: string;
    highlight: string;
    bgColor: string;
  }[];
}

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

export async function generateWeeklyWrapped(period:'week'|'month'|'year'='week'): Promise<WrappedStats> {
  const now = Date.now();
  const oneWeekAgo = period==='week'?now-7*86400000:period==='month'?new Date(new Date(now).getFullYear(),new Date(now).getMonth(),1).getTime():new Date(new Date(now).getFullYear(),0,1).getTime();

  const [observed, allPhotos, hangouts, hexCells, savedPlaces] = await Promise.all([
    observedHistory(oneWeekAgo,now+1),
    getPhotoPins().catch(() => []),
    getHangoutHistory().catch(() => []),
    getUnlockedHexCells().catch(() => []),
    getSavedPlaces().catch(() => []),
  ]);

  // Filter last 7 days
  const recentPhotos = allPhotos.filter(p => p.capturedAt >= oneWeekAgo&&p.capturedAt<=now);
  const recentHangouts = hangouts.filter(h => (h.startedAt || 0) >= oneWeekAgo&&(h.startedAt||0)<=now);

  const totalDistanceKm = Math.round(observed.distanceMeters / 100) / 10;
  const totalDurationMinutes = Math.round(observed.observedMinutes);
  const recentHexCells=hexCells.filter(c=>c.unlockedAt>=oneWeekAgo&&c.unlockedAt<=now);
  const counts=new Map<string,number>();
  for(const visit of observed.visits){const nearby=savedPlaces.filter(p=>distanceMeters(p,visit)<=150).sort((a,b)=>distanceMeters(a,visit)-distanceMeters(b,visit))[0];if(nearby)counts.set(nearby.name,(counts.get(nearby.name)||0)+1);}
  for(const photo of recentPhotos){if(photo.placeName)counts.set(photo.placeName,(counts.get(photo.placeName)||0)+1);}
  const topPlaceName=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'Chưa có lượt ghé hoặc ảnh được gắn địa danh';
  const topPlaceCategory='Lượt ghé và ảnh đã ghi nhận';
  const periodLabel=period==='week'?'7 ngày qua':period==='month'?'tháng này':'năm nay';
  // Determine Title Badge
  let titleBadge = 'Người Đi Lạc Mộng Mơ';
  if (totalDistanceKm > 50) {
    titleBadge = 'Tên Lửa Xuyên Phố';
  } else if (recentHangouts.length >= 2) {
    titleBadge = 'Bậc Thầy Cụng Máy';
  } else if (recentPhotos.length >= 3) {
    titleBadge = 'Kẻ Săn Hoàng Hôn';
  } else if (recentHexCells.length >= 15) {
    titleBadge = 'Khai Hoang Lục Địa';
  }

  const startDateStr = new Date(oneWeekAgo).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
  });
  const endDateStr = new Date(now).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
  });
  const weekLabel = `${startDateStr} - ${endDateStr}`;

  const slides = [
    {
      title: 'HÀNH TRÌNH ĐÃ GHI',
      headline: `${totalDistanceKm} km đã qua bánh xe`,
      description: `Dữ liệu GPS ghi nhận ${totalDurationMinutes} phút giữa các lần định vị liên tiếp; khoảng mất GPS được loại trừ.`,
      icon: 'map-marker-distance',
      highlight: `${totalDistanceKm} KM`,
      bgColor: '#158CC9',
    },
    {
      title: 'ĐỊA BÀN QUEN THUỘC',
      headline: topPlaceName,
      description: `Nơi bạn để lại nhiều dấu chân và lưu giữ nhiều kỷ niệm nhất trong ${periodLabel}.`,
      icon: 'heart-pulse',
      highlight: topPlaceCategory,
      bgColor: '#734BD1',
    },
    {
      title: 'KẾT NỐI & KỶ NIỆM',
      headline: `${recentHangouts.length} lần cụng máy · ${recentPhotos.length} bức ảnh`,
      description: `Những khoảnh khắc chân thực bên bạn bè ngoài đời thật được ghim trực tiếp lên bản đồ.`,
      icon: 'camera-burst',
      highlight: `${recentPhotos.length} ẢNH`,
      bgColor: '#ED4366',
    },
    {
      title: 'MỞ CÕI BẢN ĐỒ',
      headline: `${recentHexCells.length} ô sương mù đã mở`,
      description: `Danh hiệu trong ${periodLabel} của bạn: ${titleBadge}! Hãy tiếp tục khám phá.`,
      icon: 'trophy',
      highlight: titleBadge,
      bgColor: '#1D9E74',
    },
  ];

  return {
    weekLabel,
    totalDistanceKm,
    totalDurationMinutes,
    topPlaceName,
    topPlaceCategory,
    photoCount: recentPhotos.length,
    hangoutCount: recentHangouts.length,
    unlockedHexCount: recentHexCells.length,
    titleBadge,
    slides,
  };
}
