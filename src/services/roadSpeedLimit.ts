export type TravelMode = 'motorbike' | 'car';

const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function getOverpassUrl(): string {
  if (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_OSM_OVERPASS_URL) {
    return process.env.EXPO_PUBLIC_OSM_OVERPASS_URL.trim() || DEFAULT_OVERPASS_URL;
  }
  return DEFAULT_OVERPASS_URL;
}

export type RoadSpeedContext = {
  speedLimitKmh: number | null;
  countryCode?: string | null;
  roadName: string | null;
  roadClass: string | null;
  isDivided: boolean;
  isBuiltUp: boolean;
  source: 'osm' | 'estimated' | 'unknown';
  updatedAt: number;
};

type OsmRoadElement = {
  id?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

const memoryCache = new Map<string, { savedAt: number; value: RoadSpeedContext }>();
const CACHE_TTL_MS = 60 * 1000;

function parseSpeed(value: string | undefined): number | null {
  if (!value) return null;
  if (!/^\s*\d{1,3}(?:\s*(?:km\/h|kph|mph))?\s*$/i.test(value)) return null;
  const match = value.match(/(\d{1,3})/);
  if (!match) return null;
  const raw = Number(match[1]);
  if (!Number.isFinite(raw) || raw < 5 || raw > 160) return null;
  return /mph/i.test(value) ? Math.round(raw * 1.60934) : raw;
}

function hasPositiveTag(value: string | undefined): boolean {
  return Boolean(value && !['no', 'none', '0', 'false'].includes(value.toLowerCase()));
}

export function inferRoadSpeedContext(
  tags: Record<string, string> = {},
  mode: TravelMode = 'motorbike',
  countryCode: string | null = null,
  direction: 'forward' | 'backward' | null = null,
): RoadSpeedContext {
  const roadClass = tags.highway || null;
  const lanes = Number(tags.lanes || 0);
  const isOneWay = ['yes', '1', '-1', 'reversible'].includes((tags.oneway || '').toLowerCase());
  const majorRoad = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link'].includes(tags.highway || '');
  const isDivided =
    hasPositiveTag(tags.divider) ||
    hasPositiveTag(tags.median) ||
    hasPositiveTag(tags.dual_carriageway) ||
    (isOneWay && tags.junction !== 'roundabout' && (lanes >= 2 || majorRoad));

  const urbanType = `${tags['maxspeed:type'] || ''} ${tags['zone:maxspeed'] || ''}`.toLowerCase();
  const isBuiltUp =
    /urban|built.?up|city/.test(urbanType) ||
    ['residential', 'living_street', 'service'].includes(tags.highway || '') ||
    (tags.lit === 'yes' && !['motorway', 'trunk'].includes(tags.highway || ''));

  countryCode = (countryCode || tags['addr:country'] || tags['maxspeed:type']?.split(':')[0] || '').toUpperCase() || null;
  const directional = direction ? tags['maxspeed:'+direction] : undefined;
  const conditional = Boolean(tags['maxspeed:conditional'] || (direction && tags['maxspeed:'+direction+':conditional']) ||
    (mode==='motorbike' && tags['maxspeed:motorcycle:conditional']));
  const unknownDirection = !direction && Boolean(tags['maxspeed:forward'] || tags['maxspeed:backward']);
  const posted = conditional || unknownDirection ? null : parseSpeed(directional || tags.maxspeed);
  const motorcyclePosted = conditional ? null : parseSpeed(tags['maxspeed:motorcycle']);
  let estimated = isBuiltUp ? (isDivided ? 60 : 50) : (isDivided ? 70 : 60);

  if (mode === 'car') {
    estimated = isBuiltUp ? (isDivided ? 60 : 50) : (isDivided ? 90 : 80);
  }

  const explicit = mode === 'motorbike' ? motorcyclePosted : posted;
  // Numeric OSM signs apply worldwide; country-specific vehicle caps only where known.
  // Do not invent a legal limit for an unknown country, conditional sign or unknown road.
  const vnEstimate = countryCode === 'VN' && !!roadClass && !conditional && !unknownDirection && roadClass !== 'motorway' && roadClass !== 'motorway_link' ? estimated : null;
  const speedLimitKmh = explicit ?? (posted != null ? (mode === 'motorbike' && vnEstimate != null ? Math.min(posted,vnEstimate) : posted) : vnEstimate);

  return {
    speedLimitKmh,
    countryCode,
    roadName: tags.name || tags.ref || null,
    roadClass,
    isDivided,
    isBuiltUp,
    source: explicit || posted ? 'osm' : vnEstimate != null ? 'estimated' : 'unknown',
    updatedAt: Date.now(),
  };
}

export async function getRoadSpeedContext(
  latitude: number,
  longitude: number,
  mode: TravelMode = 'motorbike',
  options: {heading?: number | null; signal?: AbortSignal} = {},
): Promise<RoadSpeedContext> {
  const fallback = inferRoadSpeedContext({}, mode);
  if (!Number.isFinite(latitude) || Math.abs(latitude)>90 || !Number.isFinite(longitude) || Math.abs(longitude)>180 || options.signal?.aborted) return fallback;

  const heading = options.heading != null && Number.isFinite(options.heading) && options.heading>=0 ? options.heading%360 : null;
  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}|${mode}|${heading==null?'unknown':Math.round(heading/15)}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < (cached.value.source==='unknown'?15000:CACHE_TTL_MS)) return cached.value;

  const query = `[out:json][timeout:8];is_in(${latitude},${longitude})->.areas;area.areas["admin_level"="2"];out tags;way(around:45,${latitude},${longitude})["highway"]["highway"!~"footway|pedestrian|cycleway|path|steps|bridleway|corridor|construction|proposed"];out tags geom;`;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort',abort,{once:true});
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(getOverpassUrl(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'MyMap/0.8.2 (com.pnhl.vibecoding)',
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal,
    });
    if (!response.ok) return fallback;

    const payload: { elements?: OsmRoadElement[] } = await response.json();
    const roads = Array.isArray(payload.elements) ? payload.elements : [];
    const matchRoad = (item: OsmRoadElement) => {
      const geometry = item.geometry || [];
      if (geometry.length < 2) return {distance:Infinity, alignment:180, direction:null};
      const metersPerDegreeLat = 111320;
      const metersPerDegreeLon = 111320 * Math.cos((latitude * Math.PI) / 180);
      let closest = Number.POSITIVE_INFINITY;
      let alignment = 180;
      let direction: 'forward' | 'backward' | null = null;
      for (let index = 1; index < geometry.length; index += 1) {
        const start = geometry[index - 1]!;
        const end = geometry[index]!;
        const ax = (start.lon - longitude) * metersPerDegreeLon;
        const ay = (start.lat - latitude) * metersPerDegreeLat;
        const bx = (end.lon - longitude) * metersPerDegreeLon;
        const by = (end.lat - latitude) * metersPerDegreeLat;
        const dx = bx - ax;
        const dy = by - ay;
        const lengthSquared = dx * dx + dy * dy;
        const projection = lengthSquared > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
        const distance = Math.hypot(ax+projection*dx,ay+projection*dy);
        if(distance<closest){
          closest=distance;
          if(heading!=null){
            const bearing=(Math.atan2(dx,dy)*180/Math.PI+360)%360;
            const difference=Math.abs(((heading-bearing+540)%360)-180);
            direction=difference<=90?'forward':'backward';
            alignment=['yes','1'].includes(item.tags?.oneway||'')?difference:item.tags?.oneway==='-1'?180-difference:Math.min(difference,180-difference);
          }else alignment=0;
        }
      }
      return {distance:closest,alignment,direction};
    };

    const best = roads
      .filter(item => item.tags?.highway && (mode!=='motorbike'||item.tags.motorcycle!=='no'))
      .map(item=>({item,...matchRoad(item)}))
      .filter(match=>match.distance<=35&&match.alignment<=55)
      .sort((a, b) => {
        const distanceDifference = (a.distance+a.alignment*.18) - (b.distance+b.alignment*.18);
        if (Math.abs(distanceDifference) > 2) return distanceDifference;
        const metadataScore = (item: OsmRoadElement) => {
          const tags = item.tags || {};
          return Number(Boolean(tags['maxspeed:motorcycle'])) * 4 + Number(Boolean(tags.maxspeed)) * 3 + Number(Boolean(tags.name || tags.ref));
        };
        return metadataScore(b.item) - metadataScore(a.item);
      })[0];

    const country = roads.find(item => item.tags?.['ISO3166-1:alpha2'])?.tags?.['ISO3166-1:alpha2'] || null;
    const value = inferRoadSpeedContext(best?.item.tags || {}, mode, country, best?.direction as 'forward' | 'backward' | null);
    if(controller.signal.aborted)return fallback;
    if(memoryCache.size>=200)memoryCache.delete(memoryCache.keys().next().value!);
    memoryCache.set(cacheKey, { savedAt: Date.now(), value });
    return value;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort',abort);
  }
}
