import { Linking, Platform } from 'react-native';
import { env } from './config/env';

export type MapEngine = 'apple' | 'google' | 'maplibre_osm' | 'stadia_osm';

export interface MapProviderInfo {
  engine: MapEngine;
  label: string;
  isOpenSource: boolean;
  requiresApiKey: boolean;
  vectorTilesSupported: boolean;
  stadiaConfigured: boolean;
}

/**
 * Lấy URL raster tile của Stadia Maps (OpenStreetMap / OpenMapTiles).
 * Kiểu mặc định là Alidade Smooth Dark phù hợp với chủ đề navy glassmorphism.
 */
export function getStadiaTileUrl(
  style: 'alidade_smooth_dark' | 'alidade_smooth' | 'outdoors' | 'osm_bright' = 'alidade_smooth_dark',
): string | null {
  if (!env.stadiaMapsKey) return null;
  return `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}@2x.png?api_key=${env.stadiaMapsKey}`;
}

/** Configurable OpenStreetMap raster URL for a viewport tile. */
export function getOpenStreetMapTileUrl(z:number,x:number,y:number):string {
  return env.osmTileUrl.replace('{z}',String(z)).replace('{x}',String(x)).replace('{y}',String(y));
}

/**
 * Lấy URL ảnh bản đồ tĩnh từ Stadia Maps cho preview địa điểm và heatmap.
 */
export function getStadiaStaticMapUrl(
  latitude: number,
  longitude: number,
  zoom: number = 14,
  width: number = 600,
  height: number = 400,
): string | null {
  if (!env.stadiaMapsKey) return null;
  const center = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  const size = `${Math.round(width)}x${Math.round(height)}@2x`;
  return `https://tiles.stadiamaps.com/static/alidade_smooth_dark.png?center=${encodeURIComponent(center)}&zoom=${zoom}&size=${encodeURIComponent(size)}&api_key=${encodeURIComponent(env.stadiaMapsKey)}`;
}

/** MapLibre is the shared renderer on Android, Fire OS and iOS. */
export function nativeMapEngine(): MapEngine {
  return env.stadiaMapsKey ? 'stadia_osm' : 'maplibre_osm';
}

export function nativeMapEngineLabel(): string {
  return env.stadiaMapsKey ? 'MapLibre Native + Stadia Maps' : 'MapLibre Native + OpenStreetMap';
}

export function getMapProviderInfo(): MapProviderInfo {
  const engine = nativeMapEngine();
  return {
    engine,
    label: nativeMapEngineLabel(),
    isOpenSource: !env.stadiaMapsKey,
    requiresApiKey: false,
    vectorTilesSupported: true,
    stadiaConfigured: Boolean(env.stadiaMapsKey),
  };
}

/**
 * Open external turn-by-turn navigation or map location.
 */
export async function openExternalNavigation(latitude: number, longitude: number, label?: string): Promise<void> {
  const query = encodeURIComponent(label || `${latitude},${longitude}`);
  const url = Platform.select({
    ios: `maps:0,0?q=${query}@${latitude},${longitude}`,
    android: `geo:0,0?q=${latitude},${longitude}(${query})`,
    default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
  });
  if (url && (await Linking.canOpenURL(url).catch(() => false))) {
    await Linking.openURL(url);
  } else {
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
  }
}
