import * as SQLite from 'expo-sqlite';
import type { LocationPoint } from '../types/location';
import type { PhotoPin } from '../types/photo';

export type OfflineSosItem = {
  id?: number;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  emergency_type: string;
  trigger_method: string;
  note: string | null;
  created_at: number;
  synced: number;
};

export type PrivacyZone = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  is_active: number;
};

const DB_NAME = 'vibecoding.db';
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function initializeDb() {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  try {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS location_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT, latitude REAL NOT NULL,
        longitude REAL NOT NULL, accuracy REAL, altitude REAL, speed REAL,
        heading REAL, timestamp INTEGER NOT NULL UNIQUE
      );
      CREATE INDEX IF NOT EXISTS idx_location_timestamp ON location_points(timestamp);
      CREATE TABLE IF NOT EXISTS photo_pins (
        id INTEGER PRIMARY KEY AUTOINCREMENT, uri TEXT NOT NULL,
        latitude REAL NOT NULL, longitude REAL NOT NULL, accuracy REAL,
        capturedAt INTEGER NOT NULL, title TEXT, note TEXT, placeName TEXT,
        countryCode TEXT, timezoneOffsetMinutes INTEGER, tags TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_photo_pins_captured_at ON photo_pins(capturedAt);
      CREATE INDEX IF NOT EXISTS idx_photo_pins_coords ON photo_pins(latitude, longitude);

      CREATE TABLE IF NOT EXISTS offline_sos_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        latitude REAL,
        longitude REAL,
        accuracy_m REAL,
        emergency_type TEXT,
        trigger_method TEXT,
        note TEXT,
        created_at INTEGER NOT NULL,
        synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS privacy_zones (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        radius_m REAL NOT NULL,
        is_active INTEGER DEFAULT 1
      );
    `);

    // Migration safe check for tags in existing databases
    try {
      await db.runAsync('ALTER TABLE photo_pins ADD COLUMN tags TEXT;');
    } catch {
      // Column already exists, safe to ignore
    }

    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = initializeDb().catch(error => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

export async function insertLocationPoint(point: LocationPoint) {
  const db = await getDb();
  await db.runAsync(`INSERT OR IGNORE INTO location_points
    (latitude, longitude, accuracy, altitude, speed, heading, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, point.latitude, point.longitude,
    point.accuracy, point.altitude, point.speed, point.heading, point.timestamp);
}

export async function insertLocationPointsBatch(points: LocationPoint[]) {
  if (!points.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const point of points) {
      await db.runAsync(`INSERT OR IGNORE INTO location_points
        (latitude, longitude, accuracy, altitude, speed, heading, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, point.latitude, point.longitude,
        point.accuracy, point.altitude, point.speed, point.heading, point.timestamp);
    }
  });
}

export async function getLocationPoints(limit = 25000): Promise<LocationPoint[]> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Giới hạn điểm GPS không hợp lệ.');
  const db = await getDb();
  return db.getAllAsync<LocationPoint>(`SELECT * FROM (
    SELECT id, latitude, longitude, accuracy, altitude, speed, heading, timestamp
    FROM location_points ORDER BY timestamp DESC LIMIT ?
  ) ORDER BY timestamp ASC`, limit);
}

export async function clearLocationHistory() {
  const db = await getDb();
  await db.runAsync('DELETE FROM location_points');
}

/** Read a selected period directly; older days must not depend on the latest GPS window. */
export async function getLocationPointsInRange(start:number,end:number):Promise<LocationPoint[]> {
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=end)throw new Error('Khoảng thời gian GPS không hợp lệ.');
  const db=await getDb();
  return db.getAllAsync<LocationPoint>(`SELECT id,latitude,longitude,accuracy,altitude,speed,heading,timestamp
    FROM location_points WHERE timestamp>=? AND timestamp<? ORDER BY timestamp ASC`,start,end);
}

export async function purgeLocationPointsOlderThan(cutoffTimestamp: number): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync('DELETE FROM location_points WHERE timestamp < ?', cutoffTimestamp);
  return res.changes;
}

export async function insertPhotoPin(pin: Omit<PhotoPin, 'id'>): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(`INSERT INTO photo_pins
    (uri, latitude, longitude, accuracy, capturedAt, title, note, placeName, countryCode, timezoneOffsetMinutes, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, pin.uri, pin.latitude, pin.longitude,
    pin.accuracy, pin.capturedAt, pin.title, pin.note, pin.placeName,
    pin.countryCode, pin.timezoneOffsetMinutes ?? null, pin.tags ?? null);
  return Number(result.lastInsertRowId);
}

export async function getPhotoPins(): Promise<PhotoPin[]> {
  const db = await getDb();
  return db.getAllAsync<PhotoPin>('SELECT * FROM photo_pins ORDER BY capturedAt ASC');
}

export async function getPhotoPin(id: number): Promise<PhotoPin | null> {
  const db = await getDb();
  return db.getFirstAsync<PhotoPin>('SELECT * FROM photo_pins WHERE id = ?', id);
}

export type PhotoPinDetails = {
  title?: string | null;
  note?: string | null;
  placeName?: string | null;
  tags?: string | null;
};

export async function updatePhotoPin(id: number, details: PhotoPinDetails) {
  const db = await getDb();
  const result = await db.runAsync('UPDATE photo_pins SET title = ?, note = ?, placeName = ?, tags = ? WHERE id = ?',
    details.title?.trim() || null, details.note?.trim() || null, details.placeName?.trim() || null, details.tags?.trim() || null, id);
  if (result.changes === 0) throw new Error('Kỷ niệm này không còn tồn tại.');
}

export async function deletePhotoPin(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM photo_pins WHERE id = ?', id);
}

// --- Offline SOS Queue ---
export async function enqueueOfflineSos(item: Omit<OfflineSosItem, 'id' | 'synced'>): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO offline_sos_queue (latitude, longitude, accuracy_m, emergency_type, trigger_method, note, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    item.latitude, item.longitude, item.accuracy_m, item.emergency_type, item.trigger_method, item.note, item.created_at
  );
  return Number(result.lastInsertRowId);
}

export async function getPendingOfflineSos(): Promise<OfflineSosItem[]> {
  const db = await getDb();
  return db.getAllAsync<OfflineSosItem>('SELECT * FROM offline_sos_queue WHERE synced = 0 ORDER BY created_at ASC');
}

export async function markOfflineSosSynced(id: number) {
  const db = await getDb();
  await db.runAsync('UPDATE offline_sos_queue SET synced = 1 WHERE id = ?', id);
}

// --- Privacy Zones ---
export async function getPrivacyZones(): Promise<PrivacyZone[]> {
  const db = await getDb();
  return db.getAllAsync<PrivacyZone>('SELECT * FROM privacy_zones WHERE is_active = 1');
}

export async function savePrivacyZone(zone: PrivacyZone) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO privacy_zones (id, name, latitude, longitude, radius_m, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    zone.id, zone.name, zone.latitude, zone.longitude, zone.radius_m, zone.is_active
  );
}

export async function deletePrivacyZone(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM privacy_zones WHERE id = ?', id);
}
