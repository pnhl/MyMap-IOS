import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY = 'mymap.places.v1';
export type SavedPlace = { key: string; name: string; latitude: number; longitude: number; note: string; favorite: boolean };
export const placeKey = (latitude: number, longitude: number) => `${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
export async function getSavedPlaces(): Promise<SavedPlace[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}
let pending: Promise<unknown> = Promise.resolve();
export function savePlace(place: SavedPlace): Promise<void> {
  const work = pending.catch(() => {}).then(async () => {
    const list = await getSavedPlaces(); const index = list.findIndex(p => p.key === place.key);
    if (index < 0) list.push(place); else list[index] = place;
    await AsyncStorage.setItem(KEY,JSON.stringify(list));
  });
  pending = work; return work;
}
