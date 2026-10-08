import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const THEME_STORAGE_KEY = 'mymap.interface_theme';

export type AppThemeId = 'ocean' | 'aurora' | 'sunset' | 'forest' | 'graphite' | 'sakura';
export type ThemeGradient = readonly [string, string, ...string[]];

export type AppTheme = {
  id: AppThemeId;
  name: string;
  description: string;
  icon: 'waves' | 'aurora' | 'weather-sunset' | 'pine-tree' | 'circle-slice-8' | 'flower-tulip-outline';
  colors: {
    bg: string;
    bgRaised: string;
    text: string;
    muted: string;
    faint: string;
    primary: string;
    secondary: string;
    danger: string;
    success: string;
    glass: string;
    glassStrong: string;
    border: string;
    borderStrong: string;
    shadow: string;
  };
  radius: { surface: number; control: number; dock: number };
  layout: {
    name: string;
    density: 'airy' | 'balanced' | 'compact';
    header: 'editorial' | 'centered' | 'technical';
    surface: 'glass' | 'solid' | 'outline' | 'layered';
    dock: 'floating' | 'island' | 'compact';
  };
  ambient: {
    imageOpacity: number;
    gradient: ThemeGradient;
    orbPrimary: string;
    orbSecondary: string;
  };
  surfaceGradient: ThemeGradient;
  surfaceTopLight: ThemeGradient;
  activeGradient: ThemeGradient;
  dockGradient: ThemeGradient;
  buttonGradients: Record<'blue' | 'purple' | 'red' | 'neutral', ThemeGradient>;
};

export const APP_THEMES: readonly AppTheme[] = [
  {
    id: 'ocean', name: 'Atlas', description: 'Bản đồ và bạn bè, thân thiện và gần gũi', icon: 'waves',
    layout: { name: 'Social map', density: 'airy', header: 'editorial', surface: 'solid', dock: 'floating' },
    colors: { bg: '#111726', bgRaised: '#1E273A', text: '#F7F9FF', muted: '#B4BED3', faint: '#8190AC', primary: '#829AFF', secondary: '#AFBCE8', danger: '#F292A3', success: '#829AFF', glass: '#1E273A', glassStrong: '#1E273A', border: 'rgba(184,204,210,.12)', borderStrong: 'rgba(184,204,210,.28)', shadow: '#0E1418' },
    radius: { surface: 22, control: 15, dock: 23 },
    ambient: { imageOpacity: .23, gradient: ['rgba(7,19,31,.35)', 'rgba(7,19,31,.52)', 'rgba(7,19,31,.90)'], orbPrimary: 'rgba(83,166,184,.09)', orbSecondary: 'rgba(111,131,177,.06)' },
    surfaceGradient: ['rgba(196,221,232,.075)', 'rgba(109,145,163,.035)', 'rgba(13,29,43,.06)'],
    surfaceTopLight: ['rgba(231,243,248,.20)', 'rgba(156,196,210,.05)', 'transparent'],
    activeGradient: ['#4464F6', '#4464F6'], dockGradient: ['rgba(130,154,255,.18)', 'rgba(130,154,255,.18)'],
    buttonGradients: { blue: ['#4464F6','#4464F6'], purple: ['#303B59','#303B59'], red: ['#713D50','#713D50'], neutral: ['#2B3550','#2B3550'] },
  },
  {
    id: 'aurora', name: 'Immersive', description: 'Tiêu đề trung tâm, lớp nổi giàu chiều sâu', icon: 'aurora',
    layout: { name: 'Immersive layers', density: 'airy', header: 'centered', surface: 'glass', dock: 'island' },
    colors: { bg: '#100C2D', bgRaised: '#26195A', text: '#FBF8FF', muted: '#CEC2F1', faint: '#9584C4', primary: '#9AF6E4', secondary: '#C49BFF', danger: '#FF6F91', success: '#70EDC5', glass: 'rgba(43,27,92,.66)', glassStrong: 'rgba(55,34,112,.91)', border: 'rgba(201,175,255,.58)', borderStrong: 'rgba(226,210,255,.92)', shadow: '#8E62E9' },
    radius: { surface: 26, control: 20, dock: 27 },
    ambient: { imageOpacity: .38, gradient: ['rgba(17,11,47,.30)', 'rgba(28,13,63,.18)', 'rgba(12,8,34,.82)'], orbPrimary: 'rgba(74,235,199,.16)', orbSecondary: 'rgba(176,92,255,.22)' },
    surfaceGradient: ['rgba(218,190,255,.25)', 'rgba(104,65,172,.16)', 'rgba(32,20,71,.42)', 'rgba(67,210,187,.12)'],
    surfaceTopLight: ['rgba(228,255,250,.58)', 'rgba(207,174,255,.18)', 'transparent'],
    activeGradient: ['#45CDBA', '#6D55C7', '#402C86'], dockGradient: ['rgba(72,217,193,.31)', 'rgba(159,91,237,.40)'],
    buttonGradients: { blue: ['#2B9F99','#28627F','#273B73'], purple: ['#9C70DD','#6240A6','#342768'], red: ['#E95C82','#9D355E','#55254F'], neutral: ['#51447C','#332B60','#211D48'] },
  },
  {
    id: 'sunset', name: 'Postcard', description: 'Mảng đặc, hình khối như nhật ký chuyến đi', icon: 'weather-sunset',
    layout: { name: 'Travel postcard', density: 'airy', header: 'editorial', surface: 'solid', dock: 'floating' },
    colors: { bg: '#24100D', bgRaised: '#54261C', text: '#FFF9F4', muted: '#EDC7B5', faint: '#B78370', primary: '#FFB45F', secondary: '#FF7B73', danger: '#FF5E72', success: '#85D99C', glass: 'rgba(81,35,24,.68)', glassStrong: 'rgba(103,42,27,.92)', border: 'rgba(255,184,123,.60)', borderStrong: 'rgba(255,220,184,.94)', shadow: '#D75A31' },
    radius: { surface: 20, control: 17, dock: 22 },
    ambient: { imageOpacity: .44, gradient: ['rgba(53,18,12,.24)', 'rgba(63,20,12,.10)', 'rgba(31,10,9,.82)'], orbPrimary: 'rgba(255,122,60,.20)', orbSecondary: 'rgba(210,49,88,.14)' },
    surfaceGradient: ['rgba(255,197,139,.28)', 'rgba(143,65,39,.14)', 'rgba(67,24,19,.45)', 'rgba(198,65,65,.20)'],
    surfaceTopLight: ['rgba(255,238,216,.60)', 'rgba(255,163,105,.16)', 'transparent'],
    activeGradient: ['#F69A4B', '#CF5D37', '#803346'], dockGradient: ['rgba(245,135,58,.40)', 'rgba(202,58,91,.28)'],
    buttonGradients: { blue: ['#DD823E','#A84A31','#642C34'], purple: ['#CF6774','#9C3C63','#572945'], red: ['#F05A5F','#A42D41','#5B2533'], neutral: ['#745044','#52352F','#382523'] },
  },
  {
    id: 'forest', name: 'Trail', description: 'Gọn theo tuyến, viền rõ cho lúc di chuyển', icon: 'pine-tree',
    layout: { name: 'Trail outline', density: 'balanced', header: 'editorial', surface: 'outline', dock: 'compact' },
    colors: { bg: '#071E19', bgRaised: '#123E32', text: '#F3FBF6', muted: '#ADD6C2', faint: '#739D88', primary: '#70D9A3', secondary: '#C3D578', danger: '#FF7180', success: '#79E0A8', glass: 'rgba(16,64,49,.67)', glassStrong: 'rgba(19,78,58,.92)', border: 'rgba(141,215,178,.58)', borderStrong: 'rgba(194,239,213,.94)', shadow: '#27865D' },
    radius: { surface: 18, control: 15, dock: 21 },
    ambient: { imageOpacity: .50, gradient: ['rgba(5,34,27,.25)', 'rgba(7,43,31,.12)', 'rgba(4,25,21,.84)'], orbPrimary: 'rgba(74,180,118,.17)', orbSecondary: 'rgba(183,202,88,.10)' },
    surfaceGradient: ['rgba(169,231,197,.26)', 'rgba(55,126,91,.13)', 'rgba(15,57,45,.43)', 'rgba(135,160,61,.13)'],
    surfaceTopLight: ['rgba(224,255,235,.58)', 'rgba(130,213,169,.16)', 'transparent'],
    activeGradient: ['#55C589', '#277B5B', '#225041'], dockGradient: ['rgba(71,185,119,.38)', 'rgba(160,178,68,.20)'],
    buttonGradients: { blue: ['#3BAE78','#247255','#174A3C'], purple: ['#8D9D49','#657438','#3C462B'], red: ['#D95362','#963747','#522B35'], neutral: ['#346955','#24503F','#193A30'] },
  },
  {
    id: 'graphite', name: 'Navigator', description: 'Dày thông tin, kỹ thuật và ít trang trí', icon: 'circle-slice-8',
    layout: { name: 'Technical navigator', density: 'compact', header: 'technical', surface: 'solid', dock: 'compact' },
    colors: { bg: '#101214', bgRaised: '#24282C', text: '#F6F7F8', muted: '#C0C5CA', faint: '#858C93', primary: '#D9E0E6', secondary: '#AEB7C0', danger: '#FF6B78', success: '#8BD3B0', glass: 'rgba(39,43,47,.72)', glassStrong: 'rgba(47,52,57,.94)', border: 'rgba(202,211,219,.42)', borderStrong: 'rgba(235,240,244,.82)', shadow: '#090A0B' },
    radius: { surface: 12, control: 10, dock: 14 },
    ambient: { imageOpacity: .22, gradient: ['rgba(15,17,19,.40)', 'rgba(16,18,20,.26)', 'rgba(13,15,17,.91)'], orbPrimary: 'rgba(194,204,214,.08)', orbSecondary: 'rgba(118,128,138,.06)' },
    surfaceGradient: ['rgba(229,234,239,.12)', 'rgba(98,105,112,.07)', 'rgba(31,34,37,.48)', 'rgba(114,121,128,.09)'],
    surfaceTopLight: ['rgba(246,248,250,.38)', 'rgba(187,194,201,.08)', 'transparent'],
    activeGradient: ['#3F484F', '#3F484F'], dockGradient: ['rgba(199,209,218,.16)', 'rgba(94,103,112,.22)'],
    buttonGradients: { blue: ['#414C54','#414C54'], purple: ['#41474F','#41474F'], red: ['#653C43','#653C43'], neutral: ['#343C43','#343C43'] },
  },
  {
    id: 'sakura', name: 'Social', description: 'Thân thiện, cân giữa và ưu tiên kết nối', icon: 'flower-tulip-outline',
    layout: { name: 'Social focus', density: 'balanced', header: 'centered', surface: 'layered', dock: 'island' },
    colors: { bg: '#25101D', bgRaised: '#51233F', text: '#FFF7FB', muted: '#EAC0D4', faint: '#B77E9A', primary: '#FF9CCB', secondary: '#C9A4FF', danger: '#FF6383', success: '#7DDFB8', glass: 'rgba(79,30,61,.68)', glassStrong: 'rgba(101,37,76,.92)', border: 'rgba(255,164,207,.56)', borderStrong: 'rgba(255,211,232,.93)', shadow: '#CE4C87' },
    radius: { surface: 28, control: 23, dock: 29 },
    ambient: { imageOpacity: .35, gradient: ['rgba(48,13,37,.25)', 'rgba(63,18,48,.12)', 'rgba(34,10,28,.85)'], orbPrimary: 'rgba(255,103,174,.18)', orbSecondary: 'rgba(164,104,238,.14)' },
    surfaceGradient: ['rgba(255,194,222,.25)', 'rgba(144,61,105,.14)', 'rgba(67,21,51,.45)', 'rgba(137,88,194,.17)'],
    surfaceTopLight: ['rgba(255,238,247,.60)', 'rgba(255,160,205,.16)', 'transparent'],
    activeGradient: ['#E96BA7', '#A64279', '#672B62'], dockGradient: ['rgba(239,94,165,.38)', 'rgba(142,86,212,.28)'],
    buttonGradients: { blue: ['#D5639A','#9D3E73','#5E2A56'], purple: ['#A46ED6','#70449E','#432D68'], red: ['#ED567A','#A52E59','#5D2945'], neutral: ['#75415F','#532E4A','#392236'] },
  },
] as const;

export const DEFAULT_APP_THEME: AppTheme = APP_THEMES[0]!;

type ThemeContextValue = {
  theme: AppTheme;
  themeId: AppThemeId;
  setThemeId: (id: AppThemeId) => Promise<void>;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeId(value: string | null): value is AppThemeId {
  return APP_THEMES.some(theme => theme.id === value);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<AppThemeId>(DEFAULT_APP_THEME.id);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then(value => { if (active && isThemeId(value)) setThemeIdState(value); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const setThemeId = useCallback(async (id: AppThemeId) => {
    setThemeIdState(id);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, id);
  }, []);

  const theme = useMemo(() => APP_THEMES.find(item => item.id === themeId) || DEFAULT_APP_THEME, [themeId]);
  const value = useMemo(() => ({ theme, themeId, setThemeId, ready }), [theme, themeId, setThemeId, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
}
