import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TimeCapsule {
  id: string;
  title: string;
  message: string;
  photoUri?: string;
  latitude: number;
  longitude: number;
  createdAt: number;
  unlockAt: number;
  creatorName: string;
  isOpened: boolean;
}

const STORAGE_KEY = 'mymap.time_capsules.v1';

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

export async function getTimeCapsules(): Promise<TimeCapsule[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveTimeCapsule(
  data: Omit<TimeCapsule, 'id' | 'createdAt' | 'isOpened'>
): Promise<TimeCapsule> {
  const capsules = await getTimeCapsules();
  const newCapsule: TimeCapsule = {
    ...data,
    id: `tc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: Date.now(),
    isOpened: false,
  };
  capsules.push(newCapsule);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(capsules));
  return newCapsule;
}

export async function openCapsule(id: string,position?:{latitude:number;longitude:number;accuracy:number|null;timestamp:number}): Promise<boolean> {
  const capsules = await getTimeCapsules();
  const target = capsules.find(c => c.id === id);
  if (target) {
    if(!position||!Number.isFinite(position.latitude)||!Number.isFinite(position.longitude)||position.accuracy==null||position.accuracy>50||position.accuracy<0||Date.now()-position.timestamp>15000||position.timestamp>Date.now()+1000||Date.now()<target.unlockAt||haversineDistanceMeters(position.latitude,position.longitude,target.latitude,target.longitude)>50)return false;
    target.isOpened = true;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(capsules));
    return true;
  }
  return false;
}

export interface CapsuleCheckResult {
  capsule: TimeCapsule;
  distanceMeters: number;
  isWithinReach: boolean; // <= 50m
  isTimeUnlocked: boolean; // now >= unlockAt
  canOpen: boolean;
}

export async function checkNearbyCapsules(
  userLat: number,
  userLon: number,
  thresholdMeters = 50
): Promise<CapsuleCheckResult[]> {
  const capsules = await getTimeCapsules();
  const now = Date.now();

  return capsules.map(c => {
    const distanceMeters = Math.round(
      haversineDistanceMeters(userLat, userLon, c.latitude, c.longitude)
    );
    const isWithinReach = distanceMeters <= thresholdMeters;
    const isTimeUnlocked = now >= c.unlockAt;
    const canOpen = isWithinReach && isTimeUnlocked;

    return {
      capsule: c,
      distanceMeters,
      isWithinReach,
      isTimeUnlocked,
      canOpen,
    };
  });
}
