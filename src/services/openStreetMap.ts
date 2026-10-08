import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '../config/env';

const APP_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'vi,en;q=0.8',
  'User-Agent': 'MyMap/0.8.2 (contact@mymap.local)',
};

const CACHE_KEY = 'mymap.osm.search.v2';
const CACHE_TTL = 30 * 86400000; // 30 days
let nextNominatimRequestAt = 0;

export type OsmType = 'node' | 'way' | 'relation';

export type OsmSearchResult = {
  provider?: 'osm' | 'tomtom' | 'mapillary' | 'community';
  providerId?: string;
  phone?: string;
  placeId: number;
  osmType: OsmType;
  osmId: number;
  latitude: number;
  longitude: number;
  displayName: string;
  category: string | null;
  type: string | null;
  address: Record<string, string>;
};

export type OsmObjectDetails = {
  osmType: OsmType;
  osmId: number;
  latitude: number | null;
  longitude: number | null;
  tags: Record<string, string>;
};

type CacheEntry = { savedAt: number; results: OsmSearchResult[] };

export const POPULAR_SEARCH_SUGGESTIONS = [
  'Hồ Hoàn Kiếm',
  'Hồ Tây',
  'Landmark 81',
  'Chợ Bến Thành',
  'Cầu Rồng',
  'Mỹ Khê',
  'Hà Nội',
  'Đà Nẵng',
  'Hồ Chí Minh',
];

// Offline built-in fallback landmarks in Vietnam
const KNOWN_VIETNAM_LANDMARKS: OsmSearchResult[] = [
  {
    placeId: 10001,
    osmType: 'node',
    osmId: 10001,
    latitude: 21.0288313,
    longitude: 105.8525357,
    displayName: 'Hồ Hoàn Kiếm, Hoàn Kiếm, Hà Nội, Việt Nam',
    category: 'leisure',
    type: 'park',
    address: { name: 'Hồ Hoàn Kiếm', city: 'Hà Nội', country: 'Việt Nam' },
  },
  {
    placeId: 10002,
    osmType: 'node',
    osmId: 10002,
    latitude: 21.0566,
    longitude: 105.8266,
    displayName: 'Hồ Tây, Tây Hồ, Hà Nội, Việt Nam',
    category: 'natural',
    type: 'water',
    address: { name: 'Hồ Tây', city: 'Hà Nội', country: 'Việt Nam' },
  },
  {
    placeId: 10003,
    osmType: 'node',
    osmId: 10003,
    latitude: 21.028511,
    longitude: 105.854167,
    displayName: 'Thủ đô Hà Nội, Việt Nam',
    category: 'place',
    type: 'city',
    address: { name: 'Hà Nội', country: 'Việt Nam' },
  },
  {
    placeId: 10004,
    osmType: 'node',
    osmId: 10004,
    latitude: 10.7725301,
    longitude: 106.6980365,
    displayName: 'Chợ Bến Thành, Quận 1, TP. Hồ Chí Minh, Việt Nam',
    category: 'amenity',
    type: 'marketplace',
    address: { name: 'Chợ Bến Thành', city: 'Hồ Chí Minh', country: 'Việt Nam' },
  },
  {
    placeId: 10005,
    osmType: 'node',
    osmId: 10005,
    latitude: 10.7951,
    longitude: 106.7218,
    displayName: 'Landmark 81, Vinhomes Central Park, Bình Thạnh, TP. Hồ Chí Minh',
    category: 'building',
    type: 'skyscraper',
    address: { name: 'Landmark 81', city: 'Hồ Chí Minh', country: 'Việt Nam' },
  },
  {
    placeId: 10006,
    osmType: 'node',
    osmId: 10006,
    latitude: 10.8231,
    longitude: 106.6297,
    displayName: 'Thành phố Hồ Chí Minh, Việt Nam',
    category: 'place',
    type: 'city',
    address: { name: 'Thành phố Hồ Chí Minh', country: 'Việt Nam' },
  },
  {
    placeId: 10007,
    osmType: 'node',
    osmId: 10007,
    latitude: 16.0611,
    longitude: 108.2272,
    displayName: 'Cầu Rồng, Hải Châu, Đà Nẵng, Việt Nam',
    category: 'highway',
    type: 'bridge',
    address: { name: 'Cầu Rồng', city: 'Đà Nẵng', country: 'Việt Nam' },
  },
  {
    placeId: 10008,
    osmType: 'node',
    osmId: 10008,
    latitude: 16.0544,
    longitude: 108.2022,
    displayName: 'Thành phố Đà Nẵng, Việt Nam',
    category: 'place',
    type: 'city',
    address: { name: 'Đà Nẵng', country: 'Việt Nam' },
  },
  {
    placeId: 10009,
    osmType: 'node',
    osmId: 10009,
    latitude: 16.0638,
    longitude: 108.2435,
    displayName: 'Bãi biển Mỹ Khê, Sơn Trà, Đà Nẵng, Việt Nam',
    category: 'natural',
    type: 'beach',
    address: { name: 'Bãi biển Mỹ Khê', city: 'Đà Nẵng', country: 'Việt Nam' },
  },
];

function validType(value: unknown): value is OsmType {
  return value === 'node' || value === 'way' || value === 'relation';
}

function finite(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function request(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new Error('Yêu cầu tìm kiếm phản hồi quá lâu.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForNominatim() {
  const wait = Math.max(0, nextNominatimRequestAt - Date.now());
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  nextNominatimRequestAt = Date.now() + 1100;
}

async function loadCache(): Promise<Record<string, CacheEntry>> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveCache(cache: Record<string, CacheEntry>) {
  try {
    const trimmed = Object.fromEntries(
      Object.entries(cache)
        .sort((a, b) => b[1].savedAt - a[1].savedAt)
        .slice(0, 100)
    );
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {}
}

function parsePhotonFeature(feature: any): OsmSearchResult | null {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const props = feature.properties || {};
  const name = props.name || props.street || props.city || props.state || 'Địa điểm';

  // Build clean display name
  const parts = [
    props.name,
    props.housenumber ? `${props.housenumber} ${props.street || ''}`.trim() : props.street,
    props.district || props.locality,
    props.city || props.state,
    props.country,
  ].filter(Boolean);

  const displayName = parts.length > 0 ? parts.join(', ') : name;

  const rawType = (props.osm_type || 'N').toUpperCase();
  const osmType: OsmType = rawType === 'W' ? 'way' : rawType === 'R' ? 'relation' : 'node';

  const address: Record<string, string> = {};
  if (props.name) address.name = props.name;
  if (props.street) address.street = props.street;
  if (props.district) address.district = props.district;
  if (props.city) address.city = props.city;
  if (props.state) address.state = props.state;
  if (props.country) address.country = props.country;

  return {
    placeId: props.osm_id ? Number(props.osm_id) : Math.floor(Math.random() * 10000000),
    osmType,
    osmId: props.osm_id ? Number(props.osm_id) : Math.floor(Math.random() * 10000000),
    latitude: lat,
    longitude: lon,
    displayName,
    category: props.osm_key || 'place',
    type: props.osm_value || props.type || 'poi',
    address,
  };
}

function parseNominatim(item: any): OsmSearchResult | null {
  const latitude = finite(item?.lat);
  const longitude = finite(item?.lon);
  const placeId = finite(item?.place_id);
  const osmId = finite(item?.osm_id);
  if (
    latitude === null ||
    longitude === null ||
    placeId === null ||
    osmId === null ||
    !validType(item?.osm_type) ||
    typeof item?.display_name !== 'string'
  ) {
    return null;
  }
  const address: Record<string, string> = {};
  if (item.address && typeof item.address === 'object') {
    for (const [key, value] of Object.entries(item.address)) {
      if (typeof value === 'string') address[key] = value;
    }
  }
  return {
    placeId,
    osmType: item.osm_type,
    osmId,
    latitude,
    longitude,
    displayName: item.display_name,
    category: typeof item.category === 'string' ? item.category : null,
    type: typeof item.type === 'string' ? item.type : null,
    address,
  };
}

/**
 * High-performance search with Photon (OSM Elasticsearch) as Tier 1,
 * Nominatim as Tier 2, and built-in landmark dictionary as Tier 3.
 */
export async function searchOpenStreetMap(
  query: string,
  limit = 8,
  coords?: { latitude: number; longitude: number } | null,
  options: { allowNominatim?: boolean } = {}
): Promise<OsmSearchResult[]> {
  const text = query.trim();
  if (text.length < 2) return [];

  const safeLimit = Math.max(1, Math.min(15, Math.round(limit)));
  const normalizedKey = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
  const locationBias = coords
    ? `${coords.latitude.toFixed(2)},${coords.longitude.toFixed(2)}`
    : 'global';
  const cacheKey = `${normalizedKey}|${safeLimit}|${locationBias}`;

  const cache = await loadCache();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.savedAt < CACHE_TTL && cached.results.length > 0) {
    return cached.results;
  }

  // Tier 1: Photon Geocoding API (Fast, reliable, OSM-backed, unblocked in VN)
  try {
    let photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=${safeLimit}&lang=default`;
    if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
      photonUrl += `&lat=${coords.latitude}&lon=${coords.longitude}`;
    }

    const res = await request(photonUrl, { headers: APP_HEADERS }, 5000);
    if (res.ok) {
      const data: { features?: unknown[] } = await res.json();
      if (Array.isArray(data?.features) && data.features.length > 0) {
        const results = data.features
          .map(parsePhotonFeature)
          .filter((result: OsmSearchResult | null): result is OsmSearchResult => Boolean(result));

        if (results.length > 0) {
          cache[cacheKey] = { savedAt: Date.now(), results };
          await saveCache(cache);
          return results;
        }
      }
    }
  } catch {
    // Fallthrough to Tier 2
  }

  // Tier 2: Nominatim is submit-only. Public Nominatim must not be used for autocomplete.
  if (options.allowNominatim !== false) {
    try {
      await waitForNominatim();
      const url = new URL(env.osmSearchUrl || 'https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', text);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('limit', String(safeLimit));
      url.searchParams.set('accept-language', 'vi,en');

      const res = await request(url.toString(), { headers: APP_HEADERS }, 6000);
      if (res.ok) {
        const payload: unknown = await res.json();
        if (Array.isArray(payload) && payload.length > 0) {
          const results = payload
            .map(parseNominatim)
            .filter((item: OsmSearchResult | null): item is OsmSearchResult => Boolean(item));

          if (results.length > 0) {
            cache[cacheKey] = { savedAt: Date.now(), results };
            await saveCache(cache);
            return results;
          }
        }
      }
    } catch {
      // Fallthrough to Tier 3
    }
  }

  // Tier 3: Local Known Landmarks Matcher
  const localMatches = KNOWN_VIETNAM_LANDMARKS.filter(lm => {
    const normalize = (value: string) => value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase();
    const full = normalize(lm.displayName);
    const name = normalize(lm.address.name || '');
    return full.includes(normalizedKey) || name.includes(normalizedKey);
  });

  if (localMatches.length > 0) {
    return localMatches;
  }

  return [];
}

export async function reverseOpenStreetMap(
  latitude: number,
  longitude: number
): Promise<OsmSearchResult | null> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    throw new Error('Tọa độ không hợp lệ.');
  }

  // Tier 1: Photon Reverse
  try {
    const photonUrl = `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}`;
    const res = await request(photonUrl, { headers: APP_HEADERS }, 5000);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.features) && data.features.length > 0) {
        const parsed = parsePhotonFeature(data.features[0]);
        if (parsed) return parsed;
      }
    }
  } catch {
    // Fallthrough
  }

  // Tier 2: Nominatim Reverse
  try {
    await waitForNominatim();
    const url = new URL(env.osmReverseUrl || 'https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('zoom', '18');

    const res = await request(url.toString(), { headers: APP_HEADERS }, 6000);
    if (res.ok) {
      const payload = await res.json();
      return parseNominatim(payload);
    }
  } catch {
    // Fallthrough
  }

  return null;
}

export async function getOpenStreetMapDetails(
  osmType: OsmType,
  osmId: number
): Promise<OsmObjectDetails | null> {
  if (!validType(osmType) || !Number.isInteger(osmId) || osmId <= 0) {
    throw new Error('Đối tượng OpenStreetMap không hợp lệ.');
  }
  const selector = osmType === 'node' ? 'node' : osmType === 'way' ? 'way' : 'relation';
  const query = `[out:json][timeout:20];${selector}(${osmId});out center tags;`;
  const body = new URLSearchParams({ data: query }).toString();

  try {
    const payload = await request(
      env.osmOverpassUrl || 'https://overpass-api.de/api/interpreter',
      {
        method: 'POST',
        headers: {
          ...APP_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body,
      },
      15000
    )
      .then(res => (res.ok ? res.json() : null))
      .catch(() => null);

    const item = Array.isArray(payload?.elements) ? payload.elements[0] : null;
    if (!item || !validType(item.type) || Number(item.id) !== osmId) return null;

    const tags: Record<string, string> = {};
    if (item.tags && typeof item.tags === 'object') {
      for (const [key, value] of Object.entries(item.tags)) {
        if (typeof value === 'string') tags[key] = value;
      }
    }
    return {
      osmType: item.type,
      osmId,
      latitude: finite(item.lat ?? item.center?.lat),
      longitude: finite(item.lon ?? item.center?.lon),
      tags,
    };
  } catch {
    return null;
  }
}

export const openStreetMapEndpoints = {
  tiles: env.osmTileUrl,
  search: env.osmSearchUrl,
  reverse: env.osmReverseUrl,
  details: env.osmOverpassUrl,
} as const;
