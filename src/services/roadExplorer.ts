import { env } from '../config/env';
import type { MapPlace } from './mapPlaces';
import {nearbyImageIds} from './mapillaryTiles';
export type Coordinate = { latitude: number; longitude: number };
export type RoadFeature = MapPlace & { details: string; observedAt?: number; speedKmh?: number; image?: StreetImage };
export type StreetImage = Coordinate & { id: string; capturedAt: number; thumbnail: string; creator: string };
export type RoadData = { features: RoadFeature[]; lines: [number, number][][] };
const cache = new Map<string, { at: number; data: any }>();
let mapillaryBlockedUntil = 0;
export function validCoordinate(point: Coordinate) { return Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180; }
export function annotationId(value: string) { let hash = 2166136261; for (const c of value) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619); return -5000000000 - (hash >>> 0); }
export async function explorerRequest(url: string, signal?: AbortSignal, options?: RequestInit, ttl = 300000): Promise<any> {
  if (signal?.aborted) throw new Error('Đã hủy tải dữ liệu.');
  const key = url + (options?.body || ''), saved = cache.get(key);
  if (saved && Date.now() - saved.at < ttl) return saved.data;
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 20000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      if (url.startsWith('https://graph.mapillary.com/') && [401,403,429].includes(response.status)) mapillaryBlockedUntil = Date.now() + 300000;
      throw new Error('Nguồn dữ liệu chưa sẵn sàng. Hãy thử lại sau.');
    }
    const data = await response.json();
    if (controller.signal.aborted) throw new Error('Đã hủy tải dữ liệu.');
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 30) cache.delete(cache.keys().next().value!);
    return data;
  } catch { throw new Error('Chưa tải được dữ liệu. Kiểm tra kết nối hoặc thử lại sau.'); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export function signDescription(value: string, maxspeed?: string): { label: string; speedKmh?: number } {
  const numeric = maxspeed && /^\d{1,3}(?:\s*(?:km\/h|kph))?$/.test(maxspeed.trim()) ? Number(maxspeed.match(/\d+/)![0]) : undefined;
  const recognized = /maximum-speed-limit-(\d+)(?:--|$)/.exec(value);
  const speed = numeric;
  if (speed != null && speed >= 5 && speed <= 160) return { label: `Biển tốc độ ${speed} km/h`, speedKmh: speed };
  if (recognized) return { label: `Biển tốc độ ${recognized[1]} · kiểm tra đơn vị` };
  if (/stop|VN:R\.122/i.test(value)) return { label: 'Dừng lại' };
  if (/yield|give-way|VN:W\.208/i.test(value)) return { label: 'Nhường đường' };
  if (/no-entry|VN:P\.102/i.test(value)) return { label: 'Cấm đi vào' };
  if (/pedestrian-crossing/i.test(value)) return { label: 'Người đi bộ qua đường' };
  if (/no-parking/i.test(value)) return { label: 'Cấm đỗ xe' };
  if (/no-stopping/i.test(value)) return { label: 'Cấm dừng xe' };
  if (/speed-limit/i.test(value)) return { label: 'Biển tốc độ · kiểm tra đơn vị' };
  return { label: `Biển báo · ${value.replace(/--/g, ' ').slice(0, 90)}` };
}
function feature(id: string, position: Coordinate, name: string, kind: MapPlace['kind'], details: string, provider: 'osm' | 'mapillary' = 'osm'): RoadFeature {
  return { ...position, placeId: annotationId(id), osmId: 0, osmType: 'node', provider, providerId: id, kind, displayName: name, category: kind, type: kind, address: { name }, details };
}
export function parseOsmRoadData(data: any): RoadData {
  const features: RoadFeature[] = [], lines: [number, number][][] = [];
  for (const element of Array.isArray(data?.elements) ? data.elements : []) {
    const tags = element.tags || {}, position = { latitude: element.lat ?? element.center?.lat, longitude: element.lon ?? element.center?.lon };
    if (!validCoordinate(position)) continue;
    const details = [tags.name, tags.highway && `Loại đường: ${tags.highway}`, tags.lanes && `Số làn: ${tags.lanes}`, tags.surface && `Mặt đường: ${tags.surface}`, tags.width && `Rộng: ${tags.width} m`, tags.lit && `Chiếu sáng: ${tags.lit}`, tags.sidewalk && `Vỉa hè: ${tags.sidewalk}`, tags.access && `Tiếp cận: ${tags.access}`].filter(Boolean).join('\n');
    if (element.type === 'way' && tags.highway) {
      const line: [number, number][] = (element.geometry || []).filter((p: any) => validCoordinate({ latitude: p.lat, longitude: p.lon })).map((p: any) => [p.lat, p.lon]);
      if (line.length >= 2) lines.push(line);
      features.push(feature(`way:${element.id}`, position, tags.name || 'Thông tin đường', 'infrastructure', details));
    } else if (tags.traffic_sign || tags.highway === 'stop' || tags.highway === 'give_way') {
      const sign = signDescription(tags.traffic_sign || (tags.highway === 'give_way' ? 'yield' : 'stop'), tags.maxspeed);
      features.push({ ...feature(`sign:${element.id}`, position, sign.label, 'traffic_sign', `${tags.traffic_sign || tags.highway}\n© OpenStreetMap contributors\nHướng áp dụng: ${tags.direction || tags['traffic_sign:direction'] || 'chưa xác định'}`), speedKmh: sign.speedKmh });
    } else if (tags.noexit === 'yes') features.push(feature(`noexit:${element.id}`, position, 'Đường cụt', 'dead_end', 'Đường cụt được đánh dấu trong OpenStreetMap.'));
    else if (tags.highway) features.push(feature(`node:${element.id}`, position, tags.highway === 'traffic_signals' ? 'Đèn tín hiệu' : 'Điểm qua đường', 'infrastructure', details));
  }
  return { features: features.slice(0, 160), lines: lines.slice(0, 70) };
}
export async function fetchOsmRoadData(point: Coordinate, flags: { signs: boolean; infrastructure: boolean; deadEnds: boolean }, signal?: AbortSignal): Promise<RoadData> {
  if (!validCoordinate(point) || !Object.values(flags).some(Boolean)) return { features: [], lines: [] };
  // Round the query itself so a cached tile always covers the same area.
  const lat = point.latitude.toFixed(3), lon = point.longitude.toFixed(3), around = `around:1400,${lat},${lon}`;
  const clauses = [flags.signs && `node(${around})[traffic_sign];node(${around})[highway~"^(stop|give_way)$"];`, flags.deadEnds && `node(${around})[noexit=yes];`, flags.infrastructure && `way(${around})[highway~"^(motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|living_street)$"];node(${around})[highway~"^(traffic_signals|crossing)$"];`].filter(Boolean).join('');
  const query = `[out:json][timeout:9];(${clauses});out center geom 180;`;
  return parseOsmRoadData(await explorerRequest(env.osmOverpassUrl, signal, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent':'MyMap/1.0.2 (road explorer)' }, body: new URLSearchParams({ data: query }).toString() }));
}
export function nearbyBbox(point: Coordinate, radiusMeters = 700) {
  if (!validCoordinate(point)) throw new Error('Vị trí không hợp lệ.');
  const lat = Number(point.latitude.toFixed(3)), lon = Number(point.longitude.toFixed(3));
  const delta = radiusMeters / 111320, lngDelta = delta / Math.max(.1, Math.cos(lat * Math.PI / 180));
  return [Math.max(-180, lon-lngDelta), Math.max(-90, lat-delta), Math.min(180, lon+lngDelta), Math.min(90, lat+delta)].join(',');
}
async function mapillary(path: string, parameters: Record<string, string>, signal?: AbortSignal) {
  if (!env.mapillaryToken) throw new Error('Ảnh Mapillary chưa được cấu hình trên bản này.');
  if (Date.now() < mapillaryBlockedUntil) throw new Error('Mapillary chưa sẵn sàng. Hãy thử lại sau.');
  return explorerRequest(`https://graph.mapillary.com/${path}?${new URLSearchParams(parameters)}`, signal, { headers: { Authorization: `OAuth ${env.mapillaryToken}` } });
}
export function parseStreetImages(data: any): StreetImage[] {
  return (Array.isArray(data?.data) ? data.data : []).flatMap((item: any) => {
    const coordinates = (item.computed_geometry || item.geometry)?.coordinates, position = { latitude: coordinates?.[1], longitude: coordinates?.[0] }, capturedAt = Number(item.captured_at);
    if (!validCoordinate(position) || !/^\d+$/.test(String(item.id)) || !Number.isFinite(capturedAt) || capturedAt <= 0 || capturedAt > Date.now()+86400000 || typeof item.thumb_1024_url !== 'string' || !item.thumb_1024_url.startsWith('https://')) return [];
    return [{ ...position, id: String(item.id), capturedAt, thumbnail: item.thumb_1024_url, creator: String(item.creator?.username || 'Cộng đồng Mapillary') }];
  }).sort((a: StreetImage, b: StreetImage) => b.capturedAt-a.capturedAt).slice(0, 40);
}
export async function fetchStreetImages(point: Coordinate, signal?: AbortSignal, history = false, reference?:StreetImage) {
  if (!env.mapillaryToken) throw new Error('Ảnh Mapillary chưa được cấu hình trên bản này.');
  if (Date.now()<mapillaryBlockedUntil) throw new Error('Mapillary chưa sẵn sàng. Hãy thử lại sau.');
  const radius=history?100:1000;
  let ids:string[]=[];
  try { ids=await nearbyImageIds(point.latitude,point.longitude,radius,signal,history); }
  catch {
    if(signal?.aborted)throw new Error('Đã hủy tải ảnh.');
    // The imagery tile host may be unreachable while Graph remains available.
    // Use real image associations of nearby detected features as a fallback.
    const features=await fetchMapillaryFeatures(point,signal);
    const distance=(p:Coordinate)=>Math.hypot((p.latitude-point.latitude)*111320,(p.longitude-point.longitude)*111320*Math.cos(point.latitude*Math.PI/180));
    const nearby=features.filter(feature=>distance(feature)<=Math.max(radius,300)).sort((a,b)=>distance(a)-distance(b)).slice(0,3);
    const associations=await Promise.allSettled(nearby.map(feature=>mapillary(feature.providerId!.replace('feature:',''),{fields:'id,images'},signal)));
    const candidates=associations.flatMap(result=>result.status==='fulfilled'?(result.value.images?.data||[]):[]);
    ids=[...new Set<string>(candidates.filter((item:any)=>/^\d+$/.test(String(item.id))&&Array.isArray(item.geometry?.coordinates)&&distance({latitude:item.geometry.coordinates[1],longitude:item.geometry.coordinates[0]})<=radius).map((item:any)=>String(item.id)))].slice(0,12);
    if(nearby.length&&associations.every(result=>result.status==='rejected'))throw new Error('Chưa tải được liên kết ảnh Mapillary.');
  }
  if(history && reference && /^\d+$/.test(reference.id)) ids=[...new Set([reference.id,...ids])].slice(0,12);
  const items:any[]=[];
  // Limit parallel entity requests and total thumbnails per viewport.
  for(let i=0;i<ids.length;i+=4){
    const results=await Promise.allSettled(ids.slice(i,i+4).map(id=>mapillary(id,{fields:'id,geometry,computed_geometry,captured_at,thumb_1024_url,creator'},signal)));
    if(signal?.aborted)throw new Error('Đã hủy tải ảnh.');
    items.push(...results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]));
  }
  if(ids.length&&!items.length)throw new Error('Chưa tải được thông tin ảnh Mapillary.');
  return parseStreetImages({data:items}).filter(image=>Math.hypot((image.latitude-point.latitude)*111320,(image.longitude-point.longitude)*111320*Math.cos(point.latitude*Math.PI/180))<=radius);
}
export function imageAnnotation(image: StreetImage): RoadFeature { return { ...feature(`image:${image.id}`, image, 'Ảnh đường phố', 'street_image', `Ảnh ngày ${new Date(image.capturedAt).toLocaleDateString('vi-VN')}`, 'mapillary'), image, observedAt: image.capturedAt }; }
export function prioritizeRoadMarkers(features:RoadFeature[],point:Coordinate|null,maximum=20):RoadFeature[]{
  const distance=(feature:RoadFeature)=>point?Math.hypot((feature.latitude-point.latitude)*111320,(feature.longitude-point.longitude)*111320*Math.cos(point.latitude*Math.PI/180)):0;
  const groups=['traffic_sign','street_image','dead_end','infrastructure'].map(kind=>features.filter(feature=>feature.kind===kind).sort((a,b)=>distance(a)-distance(b)));
  const selected:RoadFeature[]=[];
  for(let index=0;selected.length<maximum&&groups.some(group=>index<group.length);index++)for(const group of groups){if(group[index]&&selected.length<maximum)selected.push(group[index]!);}
  return selected;
}
export function roadObjectDescription(value:string):string {
  if(/traffic.?sign|regulatory--|warning--|information--/.test(value))return signDescription(value).label;
  const names:Array<[RegExp,string]>=[[/traffic-light/,'Đèn giao thông'],[/street-light/,'Đèn đường'],[/utility-pole/,'Cột điện'],[/fire-hydrant/,'Trụ cứu hỏa'],[/bench/,'Ghế bên đường'],[/trash-can/,'Thùng rác'],[/barrier|guard-rail|fence/,'Rào chắn'],[/crosswalk|pedestrian-crossing/,'Vạch qua đường'],[/pole/,'Cột bên đường'],[/bike-rack/,'Giá để xe đạp'],[/parking-meter/,'Máy thu phí đỗ xe']];
  return names.find(([pattern])=>pattern.test(value))?.[1]||value.replace(/--/g,' ');
}
export function parseMapillaryFeatures(data: any): RoadFeature[] {
  return (Array.isArray(data?.data) ? data.data : []).flatMap((item: any) => {
    const coordinates = item.geometry?.coordinates, position = { latitude: coordinates?.[1], longitude: coordinates?.[0] };
    if (!validCoordinate(position) || !/^\d+$/.test(String(item.id)) || typeof item.object_value !== 'string') return [];
    const isSign = /traffic.?sign/i.test(item.object_type || ''), sign = signDescription(item.object_value);
    return [{ ...feature(`feature:${item.id}`, position, isSign ? sign.label : roadObjectDescription(item.object_value), isSign ? 'traffic_sign' : 'infrastructure', `Mapillary · nhận diện từ ảnh\n${item.object_value}\nVị trí ước tính; cần kiểm tra hướng áp dụng.`, 'mapillary'), observedAt: Number(item.last_seen_at) || undefined, speedKmh: isSign ? sign.speedKmh : undefined }];
  }).slice(0, 100);
}
export async function fetchMapillaryFeatures(point: Coordinate, signal?: AbortSignal) {
  return parseMapillaryFeatures(await mapillary('map_features', { bbox: nearbyBbox(point,1000), fields: 'id,geometry,object_value,object_type,first_seen_at,last_seen_at', limit: '100' }, signal));
}
export async function fetchImageAnalysis(id: string, signal?: AbortSignal): Promise<{ value: string; count: number }[]> {
  if (!/^\d+$/.test(id)) throw new Error('Ảnh không hợp lệ.');
  const data = await mapillary(`${id}/detections`, { fields: 'id,value', limit: '100' }, signal), counts = new Map<string, number>();
  for (const item of Array.isArray(data?.data) ? data.data : []) if (typeof item.value === 'string') counts.set(item.value, (counts.get(item.value) || 0)+1);
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count-a.count);
}
