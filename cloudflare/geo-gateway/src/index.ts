interface Env {
  ALLOWED_ORIGINS?: string;
  ROUTING_PROVIDERS?: string;
  OSRM_URL?: string;
  VALHALLA_URL?: string;
  GRAPHHOPPER_URL?: string;
  GRAPHHOPPER_KEY?: string;
}

type Mode = 'car' | 'motorbike' | 'bike' | 'foot';
type Provider = 'osrm' | 'valhalla' | 'graphhopper';
type Coordinate = { latitude: number; longitude: number };

type RouteResult = {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  provider: Provider;
};

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(value => value.trim());
  const matched = !origin || allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': matched,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(request: Request, env: Env, value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, env) },
  });
}

function normalizedBase(value: string | undefined, fallback: string): string {
  return (value || fallback).replace(/\/+$/, '');
}

function validCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== 'object') return false;
  const coordinate = value as Coordinate;
  return Number.isFinite(coordinate.latitude)
    && Number.isFinite(coordinate.longitude)
    && Math.abs(coordinate.latitude) <= 90
    && Math.abs(coordinate.longitude) <= 180;
}

function lonLatToLatLon(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => Array.isArray(item) && item.length >= 2 && Number.isFinite(item[0]) && Number.isFinite(item[1]))
    .map(item => [item[1], item[0]]);
}

async function upstreamJson(url: string, init?: RequestInit): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'MyMap-Geo-Gateway/0.1',
        ...(init?.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function osrmProfile(mode: Mode): string {
  return mode === 'foot' ? 'foot' : mode === 'bike' ? 'bike' : 'driving';
}

async function routeOsrm(origin: Coordinate, destination: Coordinate, mode: Mode, env: Env): Promise<RouteResult> {
  const base = normalizedBase(env.OSRM_URL, 'https://router.project-osrm.org');
  const points = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const data = await upstreamJson(`${base}/route/v1/${osrmProfile(mode)}/${points}?overview=full&geometries=geojson&steps=false`);
  const route = data?.code === 'Ok' ? data.routes?.[0] : null;
  const coordinates = lonLatToLatLon(route?.geometry?.coordinates);
  if (!route || coordinates.length < 2) throw new Error('OSRM did not return a route');
  return { coordinates, distanceMeters: Math.round(route.distance), durationSeconds: Math.round(route.duration), provider: 'osrm' };
}

function graphHopperProfile(mode: Mode): string {
  if (mode === 'motorbike') return 'motorcycle';
  if (mode === 'bike') return 'bike';
  if (mode === 'foot') return 'foot';
  return 'car';
}

async function routeGraphHopper(origin: Coordinate, destination: Coordinate, mode: Mode, env: Env): Promise<RouteResult> {
  if (!env.GRAPHHOPPER_KEY) throw new Error('GraphHopper is not configured');
  const params = new URLSearchParams({
    profile: graphHopperProfile(mode),
    locale: 'vi',
    points_encoded: 'false',
    key: env.GRAPHHOPPER_KEY,
  });
  params.append('point', `${origin.latitude},${origin.longitude}`);
  params.append('point', `${destination.latitude},${destination.longitude}`);
  const data = await upstreamJson(`${normalizedBase(env.GRAPHHOPPER_URL, 'https://graphhopper.com/api/1')}/route?${params}`);
  const path = data?.paths?.[0];
  const coordinates = lonLatToLatLon(path?.points?.coordinates);
  if (!path || coordinates.length < 2) throw new Error('GraphHopper did not return a route');
  return { coordinates, distanceMeters: Math.round(path.distance), durationSeconds: Math.round(path.time / 1000), provider: 'graphhopper' };
}

function decodePolyline6(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let latitude = 0;
  let longitude = 0;
  let index = 0;
  while (index < encoded.length) {
    const decode = () => {
      let result = 0;
      let shift = 0;
      let byte = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index <= encoded.length);
      return result & 1 ? ~(result >> 1) : result >> 1;
    };
    latitude += decode();
    longitude += decode();
    coordinates.push([latitude / 1e6, longitude / 1e6]);
  }
  return coordinates;
}

function valhallaCosting(mode: Mode): string {
  if (mode === 'motorbike') return 'motor_scooter';
  if (mode === 'bike') return 'bicycle';
  if (mode === 'foot') return 'pedestrian';
  return 'auto';
}

async function routeValhalla(origin: Coordinate, destination: Coordinate, mode: Mode, env: Env): Promise<RouteResult> {
  const data = await upstreamJson(`${normalizedBase(env.VALHALLA_URL, 'https://valhalla.openstreetmap.de')}/route`, {
    method: 'POST',
    body: JSON.stringify({
      locations: [{ lat: origin.latitude, lon: origin.longitude }, { lat: destination.latitude, lon: destination.longitude }],
      costing: valhallaCosting(mode),
      units: 'kilometers',
      shape_format: 'geojson',
      directions_options: { language: 'vi-VN', units: 'kilometers' },
    }),
  });
  const coordinates = (data?.trip?.legs || []).flatMap((leg: any) => {
    if (Array.isArray(leg?.shape?.coordinates)) return lonLatToLatLon(leg.shape.coordinates);
    return typeof leg?.shape === 'string' ? decodePolyline6(leg.shape) : [];
  });
  if (coordinates.length < 2) throw new Error('Valhalla did not return a route');
  return {
    coordinates,
    distanceMeters: Math.round(Number(data.trip.summary?.length || 0) * 1000),
    durationSeconds: Math.round(Number(data.trip.summary?.time || 0)),
    provider: 'valhalla',
  };
}

async function handleRoute(request: Request, env: Env): Promise<RouteResult> {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 16_384) throw new HttpError(413, 'Request body is too large');
  const body = await request.json() as { origin?: unknown; destination?: unknown; mode?: unknown };
  if (!validCoordinate(body.origin) || !validCoordinate(body.destination)) throw new HttpError(400, 'Valid origin and destination coordinates are required');
  const mode: Mode = body.mode === 'motorbike' || body.mode === 'bike' || body.mode === 'foot' ? body.mode : 'car';
  const configured = (env.ROUTING_PROVIDERS || 'osrm,valhalla,graphhopper').split(',').map(value => value.trim().toLowerCase());
  const providers = configured.filter((value): value is Provider => value === 'osrm' || value === 'valhalla' || value === 'graphhopper');
  for (const provider of providers) {
    try {
      if (provider === 'osrm') return await routeOsrm(body.origin, body.destination, mode, env);
      if (provider === 'graphhopper') return await routeGraphHopper(body.origin, body.destination, mode, env);
      return await routeValhalla(body.origin, body.destination, mode, env);
    } catch {
      // Try the next configured routing provider.
    }
  }
  throw new HttpError(502, 'No routing provider returned a usable route');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!cors['Access-Control-Allow-Origin']) return json(request, env, { error: 'Origin is not allowed' }, 403);
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return json(request, env, { ok: true, service: 'mymap-geo-gateway' });
      }
      if (request.method === 'POST' && url.pathname === '/route') {
        return json(request, env, await handleRoute(request, env));
      }
      return json(request, env, { error: 'Not found' }, 404);
    } catch (error) {
      if (error instanceof HttpError) return json(request, env, { error: error.message }, error.status);
      return json(request, env, { error: 'Routing is temporarily unavailable' }, 502);
    }
  },
};
