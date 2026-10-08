import {shareLocalFile} from './shareFile';
import * as FileSystem from 'expo-file-system/legacy';
import { getDb, getPhotoPins, insertLocationPointsBatch } from '../db/database';
import { getSavedPlaces } from './placeMetadata';
import type { LocationPoint } from '../types/location';

export type ExportFormat = 'json' | 'gpx' | 'geojson' | 'csv';

async function saveOrShareFile(content: string, fileName: string, mimeType: string): Promise<boolean> {
  const uri = FileSystem.cacheDirectory + fileName;
  await FileSystem.writeAsStringAsync(uri, content);
  await shareLocalFile(uri,`Xuất dữ liệu: ${fileName}`,mimeType);
  return true;
}

export async function exportLocalData(format: ExportFormat = 'json'): Promise<boolean> {
  const [db, photos, places] = await Promise.all([getDb(), getPhotoPins(), getSavedPlaces()]);
  const points = await db.getAllAsync<LocationPoint>('SELECT * FROM location_points ORDER BY timestamp ASC');
  const dateStr = new Date().toISOString().slice(0, 10);

  if (format === 'json') {
    const json = JSON.stringify({
      app: 'MyMap',
      version: '1.0.2',
      exportedAt: new Date().toISOString(),
      locationPoints: points,
      photoPins: photos,
      savedPlaces: places,
    }, null, 2);
    return saveOrShareFile(json, `MyMap-${dateStr}.json`, 'application/json');
  }

  if (format === 'gpx') {
    const trkpts = points.map(p => {
      const timeStr = new Date(p.timestamp).toISOString();
      const ele = p.altitude != null ? `\n        <ele>${p.altitude.toFixed(1)}</ele>` : '';
      return `      <trkpt lat="${p.latitude.toFixed(6)}" lon="${p.longitude.toFixed(6)}">${ele}\n        <time>${timeStr}</time>\n      </trkpt>`;
    }).join('\n');

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MyMap App 1.0.2" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>MyMap Track Export</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>Hành trình MyMap</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
    return saveOrShareFile(gpx, `MyMap-${dateStr}.gpx`, 'application/gpx+xml');
  }

  if (format === 'geojson') {
    const lineCoords = points.map(p => [p.longitude, p.latitude, p.altitude ?? 0]);
    const geojson = {
      type: 'FeatureCollection',
      metadata: { app: 'MyMap', exportedAt: new Date().toISOString() },
      features: [
        {
          type: 'Feature',
          properties: { name: 'Đường đi MyMap', totalPoints: points.length },
          geometry: {
            type: 'LineString',
            coordinates: lineCoords,
          },
        },
        ...photos.map(pin => ({
          type: 'Feature',
          properties: {
            name: pin.title || pin.placeName || 'Kỷ niệm',
            capturedAt: pin.capturedAt,
            note: pin.note,
          },
          geometry: {
            type: 'Point',
            coordinates: [pin.longitude, pin.latitude],
          },
        })),
      ],
    };
    return saveOrShareFile(JSON.stringify(geojson, null, 2), `MyMap-${dateStr}.geojson`, 'application/geo+json');
  }

  if (format === 'csv') {
    const header = 'timestamp,datetime,latitude,longitude,altitude,accuracy,speed,heading\n';
    const rows = points.map(p =>
      `${p.timestamp},"${new Date(p.timestamp).toISOString()}",${p.latitude},${p.longitude},${p.altitude ?? ''},${p.accuracy ?? ''},${p.speed ?? ''},${p.heading ?? ''}`
    ).join('\n');
    return saveOrShareFile(header + rows, `MyMap-${dateStr}.csv`, 'text/csv');
  }

  return false;
}

export async function importGpxOrGeoJson(rawContent: string): Promise<number> {
  const points: LocationPoint[] = [];

  // Try parsing as GeoJSON first
  try {
    const data = JSON.parse(rawContent);
    if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
      for (const f of data.features) {
        if (f.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates)) {
          let t = Date.now() - f.geometry.coordinates.length * 15000;
          for (const c of f.geometry.coordinates) {
            points.push({
              latitude: Number(c[1]),
              longitude: Number(c[0]),
              altitude: c[2] ? Number(c[2]) : null,
              accuracy: 10,
              speed: null,
              heading: null,
              timestamp: t,
            });
            t += 15000;
          }
        }
      }
    }
  } catch {
    // If not JSON, parse as GPX XML
    const trkptRegex = /<trkpt\s+[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
    let match: RegExpExecArray | null;
    let fallbackTime = Date.now() - 100000;
    while ((match = trkptRegex.exec(rawContent)) !== null) {
      const latStr = match[1];
      const lonStr = match[2];
      if (!latStr || !lonStr) continue;
      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);
      const inner = match[3] || '';
      const timeMatch = /<time>([^<]+)<\/time>/i.exec(inner);
      const eleMatch = /<ele>([^<]+)<\/ele>/i.exec(inner);

      const timestamp = timeMatch && timeMatch[1] ? new Date(timeMatch[1]).getTime() : fallbackTime;
      fallbackTime += 10000;

      if (!isNaN(lat) && !isNaN(lon)) {
        points.push({
          latitude: lat,
          longitude: lon,
          altitude: eleMatch && eleMatch[1] ? parseFloat(eleMatch[1]) : null,
          accuracy: 10,
          speed: null,
          heading: null,
          timestamp,
        });
      }
    }
  }

  if (points.length > 0) {
    await insertLocationPointsBatch(points);
  }
  return points.length;
}
