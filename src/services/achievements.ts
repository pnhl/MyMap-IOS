import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocationPoints, getPhotoPins } from '../db/database';
import { getHangoutHistory } from './hangoutBump';
import { getUnlockedHexCells } from './scratchMap';
import { getSavedPlaces } from './placeMetadata';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number; // 0 to 100
  unlockedAt?: number;
  rewardPoints: number;
}

const ACHIEVEMENTS_STORAGE_KEY = 'mymap.achievements.v1';

export const ALL_ACHIEVEMENT_DEFINITIONS = [
  {
    id: 'night_owl',
    title: 'Cú Đêm Lạc Lối',
    description: 'Ghi nhận di chuyển hoặc chụp ảnh sau 02:00 sáng',
    icon: 'weather-night',
    rewardPoints: 50,
  },
  {
    id: 'coffee_lover',
    title: 'Tín Đồ Cà Phê',
    description: 'Ghé thăm và lưu lại 5 quán cà phê khác nhau',
    icon: 'coffee',
    rewardPoints: 40,
  },
  {
    id: 'vietnam_explorer',
    title: 'Phượt Thủ Xuyên Việt',
    description: 'Ghi nhận vị trí tại ít nhất 3 vùng lưới 1 độ (không quy đổi thành tỉnh/thành)',
    icon: 'motorbike',
    rewardPoints: 100,
  },
  {
    id: 'vitamin_sea',
    title: 'Vitamin Sea',
    description: 'Đặt chân đến một thành phố hoặc bãi biển (Hạ Long, Đà Nẵng, Nha Trang...)',
    icon: 'beach',
    rewardPoints: 60,
  },
  {
    id: 'bump_master',
    title: 'Đồng Chí Cụng Máy',
    description: 'Thực hiện thành công 5 lần cụng máy (Bump) ngoài đời thực',
    icon: 'cellphone-nfc',
    rewardPoints: 75,
  },
  {
    id: 'scratch_pioneer',
    title: 'Người Mở Cõi',
    description: 'Cào mở ít nhất 30 ô lục giác sương mù trên bản đồ',
    icon: 'hexagon-multiple',
    rewardPoints: 80,
  },
  {
    id: 'photo_collector',
    title: 'Nhiếp Ảnh Gia Bản Đồ',
    description: 'Ghim ít nhất 10 bức ảnh kỷ niệm lên các địa danh',
    icon: 'camera-iris',
    rewardPoints: 50,
  },
];

export async function evaluateAchievements(): Promise<Achievement[]> {
  const [points, photos, hangouts, scratchCells, savedPlaces] = await Promise.all([
    getLocationPoints().catch(() => []),
    getPhotoPins().catch(() => []),
    getHangoutHistory().catch(() => []),
    getUnlockedHexCells().catch(() => []),
    getSavedPlaces().catch(() => []),
  ]);

  // 1. Night Owl: any point or photo between 02:00 and 05:00
  const nightOwlActive = [...points, ...photos].some(item => {
    const ts = 'timestamp' in item ? item.timestamp : item.capturedAt;
    const hour = new Date(ts).getHours();
    return hour >= 2 && hour < 5;
  });

  // 2. Coffee lover: places containing 'cafe', 'cà phê', 'coffee'
  const coffeeCount = savedPlaces.filter(p => {
    const n = (p.name || '').toLowerCase();
    return n.includes('cafe') || n.includes('cà phê') || n.includes('coffee');
  }).length;

  // 3. Sea city check: points near coastal areas (Da Nang, Ha Long, Nha Trang, etc.)
  const seaCitiesActive = points.some(p => {
    return (
      (p.latitude > 15.8 && p.latitude < 16.3 && p.longitude > 108.0) || // Da Nang
      (p.latitude > 20.7 && p.latitude < 21.2 && p.longitude > 106.8) || // Ha Long
      (p.latitude > 12.0 && p.latitude < 12.5 && p.longitude > 109.0) || // Nha Trang
      (p.latitude > 10.2 && p.latitude < 10.5 && p.longitude > 107.0)    // Vung Tau
    );
  });

  // 4. Multi-city count: rough latitude clusters
  const cityClusters = new Set<string>();
  points.forEach(p => {
    cityClusters.add(`${Math.floor(p.latitude)}:${Math.floor(p.longitude)}`);
  });

  let previous:Achievement[]=[];try{const saved=JSON.parse(await AsyncStorage.getItem(ACHIEVEMENTS_STORAGE_KEY)||'[]');if(Array.isArray(saved))previous=saved;}catch{}
  const list: Achievement[] = ALL_ACHIEVEMENT_DEFINITIONS.map(def => {
    let unlocked = false;
    let progress = 0;

    switch (def.id) {
      case 'night_owl':
        unlocked = nightOwlActive;
        progress = nightOwlActive ? 100 : 0;
        break;
      case 'coffee_lover':
        progress = Math.min(100, Math.round((coffeeCount / 5) * 100));
        unlocked = coffeeCount >= 5;
        break;
      case 'vietnam_explorer':
        progress = Math.min(100, Math.round((cityClusters.size / 3) * 100));
        unlocked = cityClusters.size >= 3;
        break;
      case 'vitamin_sea':
        unlocked = seaCitiesActive;
        progress = seaCitiesActive ? 100 : 0;
        break;
      case 'bump_master':
        progress = Math.min(100, Math.round((hangouts.length / 5) * 100));
        unlocked = hangouts.length >= 5;
        break;
      case 'scratch_pioneer':
        progress = Math.min(100, Math.round((scratchCells.length / 30) * 100));
        unlocked = scratchCells.length >= 30;
        break;
      case 'photo_collector':
        progress = Math.min(100, Math.round((photos.length / 10) * 100));
        unlocked = photos.length >= 10;
        break;
    }

    const earned=previous.find(a=>a.id===def.id&&a.unlocked);if(earned){unlocked=true;progress=100;}
    return {
      ...def,
      unlocked,
      progress,
      unlockedAt: unlocked ? previous.find(a=>a.id===def.id&&a.unlocked)?.unlockedAt??Date.now() : undefined,
    };
  });

  await AsyncStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(list)).catch(() => {});
  return list;
}
