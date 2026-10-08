import AsyncStorage from '@react-native-async-storage/async-storage';
import {getNavigationPreferences, type NavigationPreferences} from './navigationPreferences';
import {splitTraveledTrace, traceDistance, type TracePoint, type TraveledSegments} from './traveledTrace';

export type RoutingProvider = 'gateway' | 'osrm' | 'graphhopper' | 'valhalla' | 'tomtom';
export type RoutingMode = 'car' | 'motorbike' | 'bike' | 'foot';
export type RouteLane = { indications: string[]; valid: boolean };
export function valhallaLanes(lanes: any): RouteLane[] {
  if(!Array.isArray(lanes))return [];
  const directions: [number,string][]=[[2,'straight'],[4,'sharp left'],[8,'left'],[16,'slight left'],[32,'slight right'],[64,'right'],[128,'sharp right'],[256,'uturn'],[512,'left'],[1024,'right']];
  return lanes.map(lane=>({indications:directions.filter(([mask])=>(Number(lane.directions)&mask)!==0).map(([,name])=>name),valid:Number(lane.active)>0||Number(lane.valid)>0}));
}

export type RouteStep = {
  lanes?: RouteLane[];
  distanceMeters: number;
  instruction: string;
  roadName: string | null;
  type: string;
  modifier: string | null;
  position: [number, number] | null;
};

export type RouteGuidance = {
  lanes?: RouteLane[];
  distanceMeters: number;
  instruction: string;
  followingInstruction: string | null;
  roadName: string | null;
  type: string;
  modifier: string | null;
  position: [number, number] | null;
};

export interface RoadRouteResult {
  trafficUpdatedAt?: number;
  trafficDelaySeconds?: number;
  trafficSegments?: [number,number][][];
  hasTolls?: boolean;
  alternatives?: RoadRouteResult[];
  coordinates: [number, number][]; // [latitude, longitude]
  distanceMeters: number;
  durationSeconds: number;
  provider: RoutingProvider;
  steps: RouteStep[];
}

type Coordinate = { latitude: number; longitude: number };

const ROUTE_CACHE_PREFIX = 'mymap.road_route.v5.';
const memoryCache = new Map<string, RoadRouteResult>();
const value = (input: string | undefined) => input?.trim() ?? '';

const config = {
  tomTomKey: value(process.env.EXPO_PUBLIC_TOMTOM_TRAFFIC_KEY),
  gatewayUrl: value(process.env.EXPO_PUBLIC_ROUTING_GATEWAY_URL),
  providers: value(process.env.EXPO_PUBLIC_ROUTING_PROVIDERS) || 'osrm,valhalla,graphhopper',
  osrmUrl: value(process.env.EXPO_PUBLIC_OSRM_URL) || 'https://router.project-osrm.org',
  valhallaUrl: value(process.env.EXPO_PUBLIC_VALHALLA_URL) || 'https://valhalla1.openstreetmap.de',
  graphHopperUrl: value(process.env.EXPO_PUBLIC_GRAPHHOPPER_URL) || 'https://graphhopper.com/api/1',
  graphHopperKey: value(process.env.EXPO_PUBLIC_GRAPHHOPPER_KEY),
};

function normalizedBase(url: string): string {
  return url.replace(/\/+$/, '');
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function longitudeLatitudeToRoute(coordinates: unknown): [number, number][] {
  if (!Array.isArray(coordinates)) return [];
  return coordinates.filter(isCoordinate).map(([longitude, latitude]) => [latitude, longitude]);
}

function maneuverInstruction(
  type: string,
  modifier: string | null,
  roadName: string | null,
): string {
  const road = roadName ? ` · ${roadName}` : '';
  if (type === 'arrive' || type === 'finish') return 'Đến điểm đến';
  if (type === 'roundabout' || type === 'rotary') return `Đi vào vòng xuyến${road}`;
  if (type === 'merge') return `Nhập làn${road}`;
  if (type === 'fork') return modifier?.includes('left') ? `Đi theo nhánh trái${road}` : `Đi theo nhánh phải${road}`;
  if (type === 'on ramp' || type === 'off ramp') return modifier?.includes('left') ? `Đi theo lối bên trái${road}` : `Đi theo lối bên phải${road}`;
  if (type === 'uturn' || modifier === 'uturn') return 'Quay đầu khi an toàn';
  if (modifier?.includes('sharp left')) return `Rẽ gấp sang trái${road}`;
  if (modifier?.includes('slight left')) return `Chếch sang trái${road}`;
  if (modifier?.includes('left')) return `Rẽ trái${road}`;
  if (modifier?.includes('sharp right')) return `Rẽ gấp sang phải${road}`;
  if (modifier?.includes('slight right')) return `Chếch sang phải${road}`;
  if (modifier?.includes('right')) return `Rẽ phải${road}`;
  if (type === 'depart') return roadName ? `Đi theo ${roadName}` : 'Bắt đầu đi theo tuyến đường';
  return roadName ? `Tiếp tục trên ${roadName}` : 'Tiếp tục đi thẳng';
}

function routePosition(value: unknown): [number, number] | null {
  if (!isCoordinate(value)) return null;
  return [value[1], value[0]];
}

function osrmRouteSteps(route: any): RouteStep[] {
  const raw = (route?.legs ?? []).flatMap((leg: any) => leg?.steps ?? []);
  return raw.map((step: any) => {
    const type = String(step?.maneuver?.type || 'continue');
    const modifier = step?.maneuver?.modifier ? String(step.maneuver.modifier) : null;
    const roadName = String(step?.name || step?.ref || '').trim() || null;
    return {
      lanes: (step?.intersections?.[0]?.lanes ?? []).filter((lane: any)=>Array.isArray(lane.indications)).map((lane: any)=>({indications:lane.indications.filter((value:unknown)=>typeof value==='string'),valid:lane.valid===true})),
      distanceMeters: Math.max(0, Math.round(Number(step?.distance || 0))),
      instruction: maneuverInstruction(type, modifier, roadName),
      roadName,
      type,
      modifier,
      position: routePosition(step?.maneuver?.location),
    };
  });
}

function graphHopperType(sign: number): { type: string; modifier: string | null } {
  if (sign === 4 || sign === 5) return { type: 'arrive', modifier: null };
  if (sign === 6) return { type: 'roundabout', modifier: 'right' };
  if (sign <= -1) return { type: 'turn', modifier: sign <= -3 ? 'sharp left' : sign === -1 ? 'slight left' : 'left' };
  if (sign >= 1) return { type: 'turn', modifier: sign >= 3 ? 'sharp right' : sign === 1 ? 'slight right' : 'right' };
  return { type: 'continue', modifier: 'straight' };
}

function graphHopperRouteSteps(path: any, coordinates: [number, number][]): RouteStep[] {
  return (path?.instructions ?? []).map((step: any, index: number) => {
    const movement = graphHopperType(Number(step?.sign ?? 0));
    const pointIndex = Number(step?.interval?.[0] ?? 0);
    const roadName = String(step?.street_name || '').trim() || null;
    return {
      distanceMeters: Math.max(0, Math.round(Number(step?.distance || 0))),
      instruction: String(step?.text || '').trim()
        || maneuverInstruction(index === 0 ? 'depart' : movement.type, movement.modifier, roadName),
      roadName,
      type: index === 0 ? 'depart' : movement.type,
      modifier: movement.modifier,
      position: coordinates[pointIndex] ?? null,
    };
  });
}

function valhallaType(typeValue: number): { type: string; modifier: string | null } {
  if ([4, 5, 6].includes(typeValue)) return { type: 'arrive', modifier: null };
  if ([26,27].includes(typeValue)) return {type:'roundabout',modifier:'right'};
  if ([12,13].includes(typeValue)) return {type:'uturn',modifier:'uturn'};
  if ([17,18,19].includes(typeValue)) return {type:'on ramp',modifier:typeValue===19?'left':typeValue===18?'right':'straight'};
  if ([20,21].includes(typeValue)) return {type:'off ramp',modifier:typeValue===21?'left':'right'};
  if ([25,37,38].includes(typeValue)) return {type:'merge',modifier:typeValue===38?'left':typeValue===37?'right':'straight'};
  if ([22,23,24].includes(typeValue)) return {type:'fork',modifier:typeValue===24?'left':typeValue===23?'right':'straight'};
  if ([9,10,11].includes(typeValue)) return {type:'turn',modifier:typeValue===9?'slight right':typeValue===11?'sharp right':'right'};
  if ([14,15,16].includes(typeValue)) return {type:'turn',modifier:typeValue===16?'slight left':typeValue===14?'sharp left':'left'};
  return { type: 'continue', modifier: 'straight' };
}

function valhallaRouteSteps(legs: any[], coordinates: [number, number][]): RouteStep[] {
  let offset = 0;
  return legs.flatMap((leg: any, legIndex: number) => {
    const legOffset = offset;
    offset += typeof leg?.shape === 'string' ? decodePolyline6(leg.shape).length : (leg?.shape?.coordinates?.length ?? 0);
    return (leg?.maneuvers ?? []).map((step: any, index: number) => {
    const movement = valhallaType(Number(step?.type ?? 0));
    const roadName = String(step?.street_names?.[0] || '').trim() || null;
    const type = legIndex === 0 && index === 0 ? 'depart' : movement.type;
    return {
      lanes: valhallaLanes(step?.lanes),
      distanceMeters: Math.max(0, Math.round(Number(step?.length || 0) * 1000)),
      instruction: String(step?.instruction || step?.verbal_pre_transition_instruction || '').trim()
        || maneuverInstruction(type, movement.modifier, roadName),
      roadName,
      type,
      modifier: movement.modifier,
      position: coordinates[legOffset + Number(step?.begin_shape_index ?? 0)] ?? null,
    };
  });});
}

function distanceMetersCoords(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

export function getRouteGuidance(
  steps: RouteStep[] | undefined,
  currentPosition?: { latitude: number; longitude: number } | null,
): RouteGuidance | null {
  if (!steps?.length) return null;

  let targetIndex = 0;

  if (currentPosition) {
    let closestIndex = -1;
    let closestDist = Infinity;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      if (step.position) {
        const d = distanceMetersCoords(
          currentPosition.latitude,
          currentPosition.longitude,
          step.position[0],
          step.position[1],
        );
        if (d < closestDist) {
          closestDist = d;
          closestIndex = i;
        }
      }
    }

    if (closestIndex >= 0) {
      // If user is at departure point or within 25m of maneuver, advance to next step
      if (closestIndex === 0 || (closestDist < 25 && closestIndex < steps.length - 1)) {
        targetIndex = Math.min(steps.length - 1, closestIndex + 1);
      } else {
        targetIndex = closestIndex;
      }
    } else {
      const nextIndex = steps.findIndex((step, index) => index > 0 && step.type !== 'depart');
      targetIndex = nextIndex >= 0 ? nextIndex : 0;
    }
  } else {
    const nextIndex = steps.findIndex((step, index) => index > 0 && step.type !== 'depart');
    targetIndex = nextIndex >= 0 ? nextIndex : 0;
  }

  const target = steps[targetIndex] || steps[0]!;
  let distanceMeters = 0;

  if (currentPosition && target.position) {
    distanceMeters = Math.max(0, Math.round(distanceMetersCoords(
      currentPosition.latitude,
      currentPosition.longitude,
      target.position[0],
      target.position[1],
    )));
  } else {
    distanceMeters = targetIndex === 0
      ? 0
      : steps.slice(0, targetIndex).reduce((sum, step) => sum + Math.max(0, step.distanceMeters), 0);
  }

  return {
    distanceMeters,
    instruction: target.instruction,
    followingInstruction: steps[targetIndex + 1]?.instruction ?? null,
    lanes: target.lanes,
    roadName: target.roadName,
    type: target.type,
    modifier: target.modifier,
    position: target.position,
  };
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 8500): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'MyMap/1.0 (com.pnhl.vibecoding)',
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(`Routing HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function osrmProfile(mode: RoutingMode): string {
  return mode === 'foot' ? 'foot' : mode === 'bike' ? 'bike' : 'driving';
}

export function combineRouteChoices(routes: RoadRouteResult[]): RoadRouteResult {
  const seen = new Set<string>();
  const valid = routes.filter(route=>{
    if (route.coordinates.length<2 || !Number.isFinite(route.distanceMeters) || route.distanceMeters<0 || !Number.isFinite(route.durationSeconds) || route.durationSeconds<0) return false;
    const key=JSON.stringify(route.coordinates);
    if(seen.has(key))return false;
    seen.add(key);return true;
  }).slice(0,3);
  if(!valid.length)throw new Error('No valid road route');
  return {...valid[0]!,alternatives:valid.slice(1).map(({alternatives,...route})=>route)};
}

function osrmChoices(data: any): RoadRouteResult {
  if(data?.code!=='Ok')throw new Error('No OSRM route');
  return combineRouteChoices((data.routes??[]).map((route:any)=>({coordinates:longitudeLatitudeToRoute(route.geometry?.coordinates),distanceMeters:Math.round(route.distance),durationSeconds:Math.round(route.duration),provider:'osrm',steps:osrmRouteSteps(route)})));
}

function valhallaChoice(trip: any): RoadRouteResult {
  const legs=trip?.legs??[];
  const coordinates=legs.flatMap((leg:any)=>Array.isArray(leg?.shape?.coordinates)?longitudeLatitudeToRoute(leg.shape.coordinates):typeof leg?.shape==='string'?decodePolyline6(leg.shape):[]);
  return {coordinates,distanceMeters:Math.round(Number(trip?.summary?.length??0)*1000),durationSeconds:Math.round(Number(trip?.summary?.time??0)),provider:'valhalla',steps:valhallaRouteSteps(legs,coordinates)};
}

function graphHopperProfile(mode: RoutingMode): string {
  if (mode === 'motorbike') return 'motorcycle';
  if (mode === 'bike') return 'bike';
  if (mode === 'foot') return 'foot';
  return 'car';
}

function valhallaCosting(mode: RoutingMode): string {
  if (mode === 'motorbike') return 'motor_scooter';
  if (mode === 'bike') return 'bicycle';
  if (mode === 'foot') return 'pedestrian';
  return 'auto';
}

export function decodePolyline6(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let latitude = 0;
  let longitude = 0;
  let index = 0;
  while (index < encoded.length) {
    const decodeValue = () => {
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
    latitude += decodeValue();
    longitude += decodeValue();
    coordinates.push([latitude / 1e6, longitude / 1e6]);
  }
  return coordinates;
}

async function routeWithGateway(origin: Coordinate, destination: Coordinate, mode: RoutingMode, preferences: NavigationPreferences): Promise<RoadRouteResult> {
  if (!config.gatewayUrl) throw new Error('Gateway not configured');
  const data = await fetchJson(`${normalizedBase(config.gatewayUrl)}/route`, {
    method: 'POST',
    body: JSON.stringify({ origin, destination, mode, preferences }),
  });
  if (!Array.isArray(data.coordinates) || data.coordinates.length < 2) throw new Error('Invalid gateway route');
  if ((preferences.avoidFerries || preferences.avoidHighways || preferences.avoidUnpaved) && data.preferencesApplied !== true) throw new Error('Gateway did not confirm avoidance preferences');
  return {
    coordinates: data.coordinates,
    distanceMeters: Math.round(data.distanceMeters),
    durationSeconds: Math.round(data.durationSeconds),
    provider: 'gateway',
    steps: Array.isArray(data.steps) ? data.steps : [],
  };
}

async function routeWithOsrm(
  origin: Coordinate,
  destination: Coordinate,
  mode: RoutingMode,
  options?: { heading?: number | null; accuracy?: number | null },
): Promise<RoadRouteResult> {
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const baseUrl = `${normalizedBase(config.osrmUrl)}/route/v1/${osrmProfile(mode)}/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=true`;
  const heading = options?.heading != null && Number.isFinite(options.heading) && options.heading >= 0
    ? Math.round(options.heading % 360)
    : null;
  const accuracy = options?.accuracy != null && Number.isFinite(options.accuracy) && options.accuracy > 0
    ? Math.round(options.accuracy)
    : null;

  if (heading != null) {
    const radius = accuracy != null ? Math.min(50, Math.max(15, accuracy)) : 30;
    const urlWithHeading = `${baseUrl}&bearings=${heading},60;&radiuses=${radius};`;
    try {
      const data = await fetchJson(urlWithHeading);
      const route = data?.code === 'Ok' ? data.routes?.[0] : null;
      const points = longitudeLatitudeToRoute(route?.geometry?.coordinates);
      if (route && points.length >= 2) {
        return osrmChoices(data);
      }
    } catch {
      // Heading constraint may be overly strict; fall through to unconstrained query
    }
  }

  const data = await fetchJson(baseUrl);
  const route = data?.code === 'Ok' ? data.routes?.[0] : null;
  const points = longitudeLatitudeToRoute(route?.geometry?.coordinates);
  if (!route || points.length < 2) throw new Error('No OSRM route');
  return osrmChoices(data);
}

async function routeWithGraphHopper(origin: Coordinate, destination: Coordinate, mode: RoutingMode): Promise<RoadRouteResult> {
  if (!config.graphHopperKey) throw new Error('GraphHopper key not configured');
  const params = new URLSearchParams({
    algorithm: 'alternative_route',
    profile: graphHopperProfile(mode),
    locale: 'vi',
    points_encoded: 'false',
    key: config.graphHopperKey,
  });
  params.append('point', `${origin.latitude},${origin.longitude}`);
  params.append('point', `${destination.latitude},${destination.longitude}`);
  const data = await fetchJson(`${normalizedBase(config.graphHopperUrl)}/route?${params.toString()}`);
  const path = data?.paths?.[0];
  const points = longitudeLatitudeToRoute(path?.points?.coordinates);
  if (!path || points.length < 2) throw new Error('No GraphHopper route');
  return combineRouteChoices(data.paths.map((item:any)=>{const coordinates=longitudeLatitudeToRoute(item.points?.coordinates);return {coordinates,distanceMeters:Math.round(item.distance),durationSeconds:Math.round(item.time/1000),provider:'graphhopper',steps:graphHopperRouteSteps(item,coordinates)};}));
}

async function routeWithValhalla(
  origin: Coordinate,
  destination: Coordinate,
  mode: RoutingMode,
  preferences: NavigationPreferences,
  options?: { heading?: number | null; accuracy?: number | null },
): Promise<RoadRouteResult> {
  // Motor scooters inherit auto costing options. Non-motorized unpaved exclusion
  // still requires a gateway which explicitly confirms this constraint.
  if ((mode === 'bike' || mode === 'foot') && preferences.avoidUnpaved) throw new Error('This routing mode cannot guarantee unpaved-road exclusion');

  const heading = options?.heading != null && Number.isFinite(options.heading) && options.heading >= 0
    ? Math.round(options.heading % 360)
    : null;
  const accuracy = options?.accuracy != null && Number.isFinite(options.accuracy) && options.accuracy > 0
    ? Math.round(options.accuracy)
    : null;

  const originLoc: Record<string, any> = { lat: origin.latitude, lon: origin.longitude };
  if (heading != null) {
    originLoc.heading = heading;
    originLoc.heading_tolerance = 60;
  }
  if (accuracy != null) {
    originLoc.radius = Math.min(50, Math.max(15, accuracy));
  }

  const buildPayload = (loc0: Record<string, any>) => JSON.stringify({
    alternates: 2,
    turn_lanes: true,
    locations: [loc0, { lat: destination.latitude, lon: destination.longitude }],
    costing: valhallaCosting(mode),
    costing_options: {[valhallaCosting(mode)]: {
      exclude_ferries: preferences.avoidFerries,
      exclude_highways: preferences.avoidHighways,
      exclude_unpaved: preferences.avoidUnpaved,
      use_ferry: preferences.avoidFerries ? 0 : 0.5,
      ...(mode === 'car' ? {use_highways: preferences.avoidHighways ? 0 : 1} : {}),
    }},
    units: 'kilometers',
    shape_format: 'geojson',
    directions_options: { language: 'vi-VN', units: 'kilometers' },
  });

  let data: any;
  if (heading != null) {
    try {
      data = await fetchJson(`${normalizedBase(config.valhallaUrl)}/route`, {
        method: 'POST',
        body: buildPayload(originLoc),
      });
    } catch {
      data = await fetchJson(`${normalizedBase(config.valhallaUrl)}/route`, {
        method: 'POST',
        body: buildPayload({ lat: origin.latitude, lon: origin.longitude }),
      });
    }
  } else {
    data = await fetchJson(`${normalizedBase(config.valhallaUrl)}/route`, {
      method: 'POST',
      body: buildPayload({ lat: origin.latitude, lon: origin.longitude }),
    });
  }

  if ((preferences.avoidFerries || preferences.avoidHighways || preferences.avoidUnpaved) && data.warnings?.length) throw new Error('Routing service cannot enforce avoidance preferences');
  const legs = data?.trip?.legs ?? [];
  const coordinates = legs.flatMap((leg: any) => {
    if (Array.isArray(leg?.shape?.coordinates)) return longitudeLatitudeToRoute(leg.shape.coordinates);
    if (typeof leg?.shape === 'string') return decodePolyline6(leg.shape);
    return [];
  });
  if (coordinates.length < 2) throw new Error('No Valhalla route');
  return combineRouteChoices([valhallaChoice(data.trip),...(data.alternates??[]).map((alternate:any)=>valhallaChoice(alternate.trip))]);
}

export function parseTomTomRoutes(data:any,updatedAt=Date.now()):RoadRouteResult {
  const routes=(data?.routes??[]).map((route:any):RoadRouteResult=>{
    // Preserve point indexes: TomTom sections refer to the flattened, unfiltered geometry.
    const points=(route.legs??[]).flatMap((leg:any)=>leg.points??[]);
    if(points.some((point:any)=>!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude)||Math.abs(point.latitude)>90||Math.abs(point.longitude)>180))throw new Error('Invalid route geometry');
    const coordinates:[number,number][]=points.map((point:any)=>[point.latitude,point.longitude]);
    const instructions=route.guidance?.instructions??[];
    const steps:RouteStep[]=instructions.map((step:any,index:number)=>{
      const maneuver=String(step.maneuver||'STRAIGHT').toLowerCase();
      const type=maneuver.includes('arriv')?'arrive':maneuver.includes('depart')?'depart':maneuver.includes('roundabout')?'roundabout':maneuver.includes('u_turn')?'uturn':maneuver.includes('keep_')?'fork':'turn';
      const direction=maneuver.includes('left')?'left':maneuver.includes('right')?'right':'straight';
      const modifier=direction==='straight'?'straight':`${maneuver.includes('sharp')?'sharp ':maneuver.includes('bear')?'slight ':''}${direction}`;
      const roadName=String(step.street||'').trim()||null;
      return {type,modifier,roadName,instruction:maneuverInstruction(type,modifier,roadName),distanceMeters:Math.max(0,Number(instructions[index+1]?.routeOffsetInMeters??route.summary?.lengthInMeters)-Number(step.routeOffsetInMeters||0)),position:step.point?[step.point.latitude,step.point.longitude]:coordinates[step.pointIndex]??null};
    });
    const trafficSegments:[number,number][][]=(route.sections??[]).flatMap((section:any)=>{
      const start=section.startPointIndex,end=section.endPointIndex;
      if(section.sectionType!=='TRAFFIC'||!['JAM','ROAD_CLOSURE'].includes(section.simpleCategory)||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>=coordinates.length)return [];
      return [coordinates.slice(start,end+1)];
    });
    return {provider:'tomtom',coordinates,steps,distanceMeters:Number(route.summary?.lengthInMeters),durationSeconds:Number(route.summary?.travelTimeInSeconds),trafficUpdatedAt:updatedAt,trafficDelaySeconds:Math.max(0,Number(route.summary?.trafficDelayInSeconds||0)),trafficSegments,hasTolls:(route.sections??[]).some((section:any)=>section.sectionType==='TOLL_ROAD'||section.sectionType==='TOLL')};
  });
  return combineRouteChoices(routes);
}
let tomTomBlockedUntil=0;
async function routeWithTomTom(origin:Coordinate,destination:Coordinate,mode:RoutingMode,prefs:NavigationPreferences,options?:{heading?:number|null;traffic?:boolean}){
  if(Date.now()<tomTomBlockedUntil)throw new Error('Routing unavailable');
  const params=new URLSearchParams({key:config.tomTomKey,maxAlternatives:'2',traffic:options?.traffic===false?'false':'true',departAt:'now',travelMode:mode==='motorbike'?'motorcycle':mode==='bike'?'bicycle':mode==='foot'?'pedestrian':'car',instructionsType:'text',language:'vi-VN',computeTravelTimeFor:'all'});
  if(options?.traffic!==false)params.append('sectionType','traffic');params.append('sectionType','tollRoad');
  if(prefs.avoidFerries)params.append('avoid','ferries');if(prefs.avoidHighways)params.append('avoid','motorways');if(prefs.avoidUnpaved)params.append('avoid','unpavedRoads');
  if(options?.heading!=null&&Number.isFinite(options.heading)&&options.heading>=0)params.set('vehicleHeading',String(Math.round(options.heading)%360));
  try{return parseTomTomRoutes(await fetchJson(`https://api.tomtom.com/routing/1/calculateRoute/${origin.latitude},${origin.longitude}:${destination.latitude},${destination.longitude}/json?${params}`));}
  catch(error){if(/HTTP (401|403|429)/.test(String(error)))tomTomBlockedUntil=Date.now()+300000;throw error;}
}

function providerOrder(): RoutingProvider[] {
  const configured = config.providers.split(',').map(item => item.trim().toLowerCase());
  const valid = configured.filter((item): item is Exclude<RoutingProvider, 'gateway'> => item === 'osrm' || item === 'valhalla' || item === 'graphhopper');
  const defaults: Exclude<RoutingProvider, 'gateway'>[] = ['osrm', 'valhalla', 'graphhopper'];
  const providers: RoutingProvider[] = [...new Set(valid.length ? valid : defaults)];
  if (config.gatewayUrl) providers.unshift('gateway');
  if (config.tomTomKey) providers.unshift('tomtom');
  return providers;
}

/** Resolve a road route with cached, ordered fallback across OSRM, GraphHopper and Valhalla. */
export async function fetchRoadRoute(
  origin: Coordinate,
  destination: Coordinate,
  mode: RoutingMode = 'car',
  preferences?: NavigationPreferences,
  options?: { heading?: number | null; accuracy?: number | null; refresh?: boolean; traffic?: boolean },
): Promise<RoadRouteResult | null> {
  const prefs = preferences || await getNavigationPreferences();
  const avoid = prefs.avoidFerries || prefs.avoidHighways || prefs.avoidUnpaved;
  // Public OSRM's profile is car-only; never return a car route for a motorcycle.
  const order = providerOrder().filter(p => !(avoid && (p === 'osrm' || p === 'graphhopper')) && !(mode !== 'car' && p === 'osrm'));
  const headingKey = options?.heading != null && Number.isFinite(options.heading) && options.heading >= 0
    ? `|h${Math.round(options.heading / 30)}`
    : '';
  const cacheKey = `${mode}:${Number(prefs.avoidFerries)}${Number(prefs.avoidHighways)}${Number(prefs.avoidUnpaved)}:${origin.latitude.toFixed(4)},${origin.longitude.toFixed(4)}->${destination.latitude.toFixed(4)},${destination.longitude.toFixed(4)}${headingKey}${options?.traffic===false?'|traffic-off':''}`;
  const cached=memoryCache.get(cacheKey);
  if (!options?.refresh&&cached&&(!config.tomTomKey||cached.provider==='tomtom'&&Date.now()-(cached.trafficUpdatedAt||0)<120000)) return cached;
  try {
    const raw = config.tomTomKey||options?.refresh ? null : await AsyncStorage.getItem(ROUTE_CACHE_PREFIX + cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw) as RoadRouteResult;
      if (parsed.coordinates?.length > 1) {
        memoryCache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch {}

  for (const provider of order) {
    try {
      const result = provider === 'tomtom'
        ? await routeWithTomTom(origin,destination,mode,prefs,options)
        : provider === 'gateway'
        ? await routeWithGateway(origin, destination, mode, prefs)
        : provider === 'osrm'
          ? await routeWithOsrm(origin, destination, mode, options)
          : provider === 'graphhopper'
            ? await routeWithGraphHopper(origin, destination, mode)
            : await routeWithValhalla(origin, destination, mode, prefs, options);
      memoryCache.set(cacheKey, result);
      if(memoryCache.size>40)memoryCache.delete(memoryCache.keys().next().value!);
      if(result.provider!=='tomtom')void AsyncStorage.setItem(ROUTE_CACHE_PREFIX + cacheKey, JSON.stringify(result)).catch(() => {});
      return result;
    } catch {
      // Continue to the next configured provider.
    }
  }
  return null;
}


const traceCache = new Map<string, TraveledSegments>();
const traceRequests = new Map<string, Promise<TraveledSegments>>();

async function matchTraceBatch(points: TracePoint[]): Promise<TraveledSegments> {
  const coordinates = points.map(p=>`${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(';');
  const times = points.map(p=>p.timestamp ?? '').join(';');
  const radiuses = points.map(p=>Math.min(100,Math.max(10,p.accuracy ?? 25))).join(';');
  // Include the entire batch: two trips sharing a start must never share a cached tail.
  const key = `${coordinates}|${times}|${radiuses}`;
  const cached=traceCache.get(key);
  if(cached)return cached;
  const pending=traceRequests.get(key);
  if(pending)return pending;
  const request=(async()=>{
    try {
      const params=new URLSearchParams({overview:'full',geometries:'geojson',tidy:'false',gaps:'split',radiuses});
      const seconds=points.map(p=>Math.floor((p.timestamp ?? 0)/1000));
      if(seconds.every((s,i)=>s>0 && (!i || s>seconds[i-1]!)))params.set('timestamps',seconds.join(';'));
      const data=await fetchJson(`${normalizedBase(config.osrmUrl)}/match/v1/driving/${coordinates}?${params}`,undefined,9000);
      const matched: TraveledSegments=data?.code==='Ok'
        ? (data.matchings ?? []).map((m:any)=>longitudeLatitudeToRoute(m?.geometry?.coordinates)).filter((s:[number,number][])=>s.length>1)
        : [];
      if(matched.length){
        if(traceCache.size>=128)traceCache.delete(traceCache.keys().next().value!);
        traceCache.set(key,matched);
        return matched;
      }
    }catch{}
    // Offline fallback keeps every recorded bend and never bridges a missing-data interval.
    return [points.map(p=>[p.latitude,p.longitude] as [number,number])];
  })();
  traceRequests.set(key,request);
  try{return await request;}finally{traceRequests.delete(key);}
}

/** Match all fixes in overlapping batches, keeping separate trips and OSRM submatchings. */
export async function matchTraveledRouteSegments(points: TracePoint[]): Promise<TraveledSegments> {
  const result: TraveledSegments=[];
  for(const segment of splitTraveledTrace(points)){
    const batches: TracePoint[][]=[];
    for(let start=0;start<segment.length-1;start+=99)batches.push(segment.slice(start,start+100));
    const matched: TraveledSegments[]=new Array(batches.length);
    let next=0;
    await Promise.all(Array.from({length:Math.min(2,batches.length)},async()=>{
      while(next<batches.length){const index=next++;matched[index]=await matchTraceBatch(batches[index]!);}
    }));
    const continuous: TraveledSegments=[];
    for(const batch of matched){
      for(let i=0;i<batch.length;i++){
        const line=batch[i]!;
        const previous=continuous[continuous.length-1];
        const end=previous?.[previous.length-1],start=line[0];
        // Only stitch the shared boundary of adjacent batches, never submatchings within one batch.
        if(i===0 && end && start && traceDistance({latitude:end[0],longitude:end[1]},{latitude:start[0],longitude:start[1]})<1){
          continuous[continuous.length-1]=[...previous!,...line.slice(1)];
        }else continuous.push(line);
      }
    }
    result.push(...continuous);
  }
  return result;
}
