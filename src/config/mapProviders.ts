import { env } from './env';

export const OPEN_MAP_STYLES = [
  { id: 'openfreemap_liberty', label: 'Liberty · Đường phố', style: 'liberty' },
  { id: 'openfreemap_liberty_3d', label: 'OpenFreeMap · Thành phố 3D', style: 'liberty' },
  { id: 'openfreemap_dark', label: 'Dark · Ban đêm', style: 'dark' },
  { id: 'openfreemap_positron', label: 'Positron · Tối giản', style: 'positron' },
] as const;
export type OpenMapProvider = typeof OPEN_MAP_STYLES[number]['id'];
export type MapTileProvider = OpenMapProvider | 'carto_dark' | 'stadia_dark' | 'osm' | 'stadia_smooth' | 'satellite';
export const DEFAULT_MAP_PROVIDER: MapTileProvider = 'openfreemap_liberty';
export function is3DMapProvider(provider: string | undefined): boolean {
  return provider === 'openfreemap_liberty_3d';
}

export function isOpenMapProvider(value: string): value is OpenMapProvider {
  return OPEN_MAP_STYLES.some(style => style.id === value);
}
export function isMapTileProvider(value: string | null): value is MapTileProvider {
  return !!value && (isOpenMapProvider(value) || ['carto_dark','stadia_dark','osm','stadia_smooth','satellite'].includes(value));
}
export function openMapStyleUrl(provider: string): string | null {
  const style = OPEN_MAP_STYLES.find(item => item.id === provider);
  return style ? `${env.openFreeMapBaseUrl.replace(/\/$/, '')}/styles/${style.style}` : null;
}
export const OPEN_MAP_ATTRIBUTION = '© OpenMapTiles · © OpenStreetMap contributors';
