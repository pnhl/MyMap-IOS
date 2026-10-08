import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '../config/env';

export interface OfflineTilePack {
  id: string;
  name: string;
  centerLat: number;
  centerLon: number;
  tileCount: number;
  sizeBytes: number;
  downloadedAt: number;
  sourceHash?: string;
  tiles?: Array<{z:number;x:number;y:number}>;
}

const OFFLINE_PACKS_KEY = 'mymap.offline_packs.v1';
const TILES_DIR = `${FileSystem.documentDirectory || ''}offline_tiles/`;
function imageMime(data:string) {
  let header:string;try{header=atob(data.slice(0,32));}catch{return null;}
  if(header.startsWith('\x89PNG\r\n\x1a\n'))return 'image/png';
  if(header.startsWith('\xff\xd8\xff'))return 'image/jpeg';
  if(header.startsWith('RIFF')&&header.slice(8,12)==='WEBP')return 'image/webp';
  return null;
}
async function validatedTile(uri:string){
 const info=await FileSystem.getInfoAsync(uri);if(!info.exists||!info.size||info.size>2*1024*1024)throw new Error('Ô bản đồ bị thiếu hoặc quá lớn.');
 const data=await FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64});const mime=imageMime(data);
 if(!mime)throw new Error('Nguồn ngoại tuyến không trả về ảnh PNG, JPEG hoặc WebP.');
 return{size:info.size,data:`data:${mime};base64,${data}`};
}

export const PRESET_CITIES = [
  { id: 'hanoi', name: 'Hà Nội', lat: 21.0285, lon: 105.8542 },
  { id: 'danang', name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022 },
  { id: 'hcmc', name: 'TP. Hồ Chí Minh', lat: 10.8231, lon: 106.6297 },
];

function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

export async function getDownloadedPacks(): Promise<OfflineTilePack[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_PACKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function downloadCityOfflinePack(
  cityId: string,
  onProgress?: (progressPercent: number) => void
): Promise<OfflineTilePack> {
  const city = PRESET_CITIES.find(c => c.id === cityId);
  if (!city) {
    throw new Error('Thành phố không hợp lệ');
  }

  const template = env.offlineTileUrl;
  if (!template) throw new Error('Tải ngoại tuyến chưa được cấu hình. Cần nguồn bản đồ cho phép tải khu vực; hiện bạn có thể xem bản đồ khi có mạng.');
  let source: URL;
  try { source = new URL(template); } catch { throw new Error('Địa chỉ máy chủ bản đồ ngoại tuyến không hợp lệ.'); }
  if (!['https:', 'http:'].includes(source.protocol) || !['{z}', '{x}', '{y}'].every(token => template.includes(token))) throw new Error('Nguồn ngoại tuyến phải là URL ô bản đồ có {z}, {x} và {y}.');
  if (source.hostname === 'tile.openstreetmap.org' || source.hostname.endsWith('.tile.openstreetmap.org')) throw new Error('Máy chủ OSM công cộng không cho phép tải khu vực ngoại tuyến. Hãy dùng nguồn có quyền tải ngoại tuyến.');
  // Isolate caches when changing providers, including any historical OSM downloads.
  let sourceHash = 2166136261;
  for (const char of template) sourceHash = Math.imul(sourceHash ^ char.charCodeAt(0), 16777619);
  const sourceId=(sourceHash >>> 0).toString(16).padStart(8,'0');
  const packDir = `${TILES_DIR}${sourceId}/`;

  // Ensure tiles directory exists
  const dirInfo = await FileSystem.getInfoAsync(packDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(packDir, { intermediates: true });
  }

  // Generate tiles for zoom 12 and 13 (covering the metropolitan area efficiently)
  const zoomLevels = [12, 13];
  const tileUrls: { z: number; x: number; y: number; url: string; localPath: string }[] = [];

  for (const z of zoomLevels) {
    const centerX = lon2tile(city.lon, z);
    const centerY = lat2tile(city.lat, z);

    // 3x3 grid around center tile for compact offline coverage
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = centerX + dx;
        const y = centerY + dy;
        const url = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
        const localPath = `${packDir}${z}_${x}_${y}.png`;
        tileUrls.push({ z, x, y, url, localPath });
      }
    }
  }

  let downloadedCount = 0;
  let totalBytes = 0;

  for (let i = 0; i < tileUrls.length; i++) {
    const item = tileUrls[i];
    if (!item) continue;
    try {
      let cached:Awaited<ReturnType<typeof validatedTile>>|null=null;
      try{cached=await validatedTile(item.localPath);}catch{await FileSystem.deleteAsync(item.localPath,{idempotent:true});}
      if (cached) {
        totalBytes += cached.size;
        downloadedCount++;
      } else {
        const res = await FileSystem.downloadAsync(item.url, item.localPath, {
          headers: { 'User-Agent': 'MyMap-Offline-Sync/1.0.0' },
        });
        if (res.status === 200) {
          try{const tile=await validatedTile(item.localPath);totalBytes+=tile.size;downloadedCount++;}
          catch{await FileSystem.deleteAsync(item.localPath,{idempotent:true});}
        } else {
          await FileSystem.deleteAsync(item.localPath, { idempotent: true });
        }
      }
    } catch {
      // Ignore individual tile failure (e.g. offline or rate limit)
    }

    if (onProgress) {
      onProgress(Math.round(((i + 1) / tileUrls.length) * 100));
    }
  }

  if (downloadedCount !== tileUrls.length) throw new Error(`Chưa tải đủ bản đồ (${downloadedCount}/${tileUrls.length} ô). Kiểm tra mạng và thử lại.`);

  const newPack: OfflineTilePack = {
    id: city.id,
    name: city.name,
    centerLat: city.lat,
    centerLon: city.lon,
    tileCount: downloadedCount,
    sizeBytes: totalBytes,
    downloadedAt: Date.now(),
    sourceHash:sourceId,
    tiles:tileUrls.map(({z,x,y})=>({z,x,y})),
  };

  const currentPacks = await getDownloadedPacks();
  const filtered = currentPacks.filter(p => p.id !== city.id);
  filtered.push(newPack);
  await AsyncStorage.setItem(OFFLINE_PACKS_KEY, JSON.stringify(filtered));

  return newPack;
}

export async function readOfflineTiles(pack:OfflineTilePack){
 if(!pack.sourceHash||!/^[a-f0-9]{8}$/.test(pack.sourceHash)||!pack.tiles?.length||pack.tiles.length>100)throw new Error('Gói cũ chưa có danh mục ô bản đồ. Hãy tải lại khu vực.');
 const result:Array<{z:number;x:number;y:number;data:string}>=[];
 for(const tile of pack.tiles){
  if(![12,13].includes(tile.z)||![tile.x,tile.y].every(n=>Number.isInteger(n)&&n>=0&&n<2**tile.z))throw new Error('Danh mục bản đồ không hợp lệ.');
  const uri=`${TILES_DIR}${pack.sourceHash}/${tile.z}_${tile.x}_${tile.y}.png`;
  const image=await validatedTile(uri);
  result.push({...tile,data:image.data});
 }
 return result;
}

export async function clearOfflinePacks(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(TILES_DIR);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(TILES_DIR, { idempotent: true });
    }
    await AsyncStorage.removeItem(OFFLINE_PACKS_KEY);
}
