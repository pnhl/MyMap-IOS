import AsyncStorage from '@react-native-async-storage/async-storage';

export type NavigationPreferences = {
  avoidFerries: boolean; avoidHighways: boolean; avoidUnpaved: boolean;
  speedWarnings: boolean; sound: boolean; vibration: boolean;
  customSpeedKmh: number | null;
  voiceGuidance: boolean;
};
export const DEFAULT_NAVIGATION_PREFERENCES: NavigationPreferences = {
  avoidFerries: false, avoidHighways: false, avoidUnpaved: false,
  speedWarnings: true, sound: true, vibration: true, customSpeedKmh: null,voiceGuidance:false,
};
const KEY = 'mymap.navigation.preferences.v1';
export async function getNavigationPreferences(): Promise<NavigationPreferences> {
  try { const saved = JSON.parse(await AsyncStorage.getItem(KEY) || '{}');
    const result = {...DEFAULT_NAVIGATION_PREFERENCES};
    for (const key of ['avoidFerries','avoidHighways','avoidUnpaved','speedWarnings','sound','vibration','voiceGuidance'] as const) {
      if (typeof saved?.[key] === 'boolean') result[key] = saved[key];
    }
    result.customSpeedKmh = Number.isFinite(saved?.customSpeedKmh) && saved.customSpeedKmh >= 5 && saved.customSpeedKmh <= 300 ? saved.customSpeedKmh : null;
    return result;
  } catch { return {...DEFAULT_NAVIGATION_PREFERENCES}; }
}
export async function saveNavigationPreferences(value: NavigationPreferences) {
  await AsyncStorage.setItem(KEY, JSON.stringify(value));
}
export function warningThreshold(preferences: NavigationPreferences, legalLimit: number | null) {
  const thresholds = [legalLimit, preferences.customSpeedKmh].filter((n): n is number => n != null && n > 0);
  return preferences.speedWarnings && thresholds.length ? Math.min(...thresholds) : null;
}
