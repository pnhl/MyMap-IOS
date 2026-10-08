import { NativeModule, requireOptionalNativeModule } from 'expo';

export type NativeIncidentType = 'possible_crash' | 'possible_fall';

export type NativeIncidentEvent = {
  type: NativeIncidentType;
  peakG: number;
  timestamp: number;
  platform: 'android' | 'ios';
  hadFreeFall?: boolean;
  hadHighRotation?: boolean;
  hadHeightDrop?: boolean;
  gyroRadPerSec?: number;
  rotSpeed?: number;
};

export type NativeActivityEvent = {
  activity: 'STILL' | 'WALKING' | 'RUNNING' | 'ON_BICYCLE' | 'IN_VEHICLE';
  timestamp: number;
};

export type NativeVisitEvent = {
  latitude: number;
  longitude: number;
  accuracy: number;
  arrivalDate: number;
  departureDate?: number | null;
};

export type NativeRegionEvent = {
  state: 'entered' | 'exited';
  identifier: string;
};

type MyMapSafetyEvents = {
  onIncidentDetected(event: NativeIncidentEvent): void;
  onActivityChanged(event: NativeActivityEvent): void;
  onVisitDetected(event: NativeVisitEvent): void;
  onRegionStateChanged(event: NativeRegionEvent): void;
  onWatchSosTriggered(event: { source: string; timestamp: number }): void;
};

declare class MyMapSafetyNativeModule extends NativeModule<MyMapSafetyEvents> {
  isAvailable(): Promise<boolean>;
  getAvailableSensors(): Promise<Record<string, boolean>>;
  startDetection(
    crashThresholdG: number,
    fallThresholdG: number,
    cooldownMs: number,
  ): Promise<boolean>;
  stopDetection(): Promise<void>;

  // Android Tier B Native Methods
  isIgnoringBatteryOptimizations?(): Promise<boolean>;
  requestIgnoreBatteryOptimizations?(): Promise<boolean>;
  startForegroundTracking?(): Promise<boolean>;
  stopForegroundTracking?(): Promise<boolean>;
  scheduleOfflineSync?(): Promise<boolean>;
  getDetectedActivity?(): Promise<string>;
  compressImageToWebP?(sourceUriString: String, quality: number): Promise<string>;
  writeGeoExif?(filePath: string, lat: number, lon: number, altitude?: number | null, timestampMs?: number | null): Promise<boolean>;
  readGeoExif?(filePath: string): Promise<{ hasLocation: boolean; latitude?: number; longitude?: number; altitude?: number }>;
  notifyWearDevice?(type: string, message: string): Promise<boolean>;

  // iOS Tier C Native Methods
  startSignificantLocationMonitoring?(): Promise<boolean>;
  stopSignificantLocationMonitoring?(): Promise<boolean>;
  startMonitoringRegion?(identifier: string, latitude: number, longitude: number, radiusMeters: number): Promise<boolean>;
  setupWatchConnectivity?(): Promise<boolean>;
  sendGeofenceHapticToWatch?(regionName: string): Promise<boolean>;
  savePhotoToNativeAlbum?(sourceUriString: string, albumName: string): Promise<boolean>;
  getBatteryStatus?(): Promise<{ level: number; isCharging: boolean }>;
}

export default requireOptionalNativeModule<MyMapSafetyNativeModule>('MyMapSafety');
