import type {LocationPoint} from '../types/location';
import {distanceMeters} from './geo';
export type DrivingEvent = {kind: 'acceleration'|'braking'|'stop'; at: number; latitude: number; longitude: number; durationSeconds?: number; acceleration?: number};
export type DrivingInsights = {distanceKm: number; observedMinutes: number; movingMinutes: number; stoppedMinutes: number; maxSpeedKmh: number|null; averageMovingKmh: number|null; events: DrivingEvent[]; acceptedPoints: number; excludedPoints: number; gaps: number; smoothness: number|null};
/** GPS-derived observations, not a legal speed judgement or an accident detector. */
export function analyzeDriving(points: readonly LocationPoint[]): DrivingInsights {
  const out: DrivingInsights = {distanceKm: 0, observedMinutes: 0, movingMinutes: 0, stoppedMinutes: 0, maxSpeedKmh: null, averageMovingKmh: null, events: [], acceptedPoints: 0, excludedPoints: 0, gaps: 0, smoothness: null};
  let previous: LocationPoint|null = null, previousSpeed: number|null = null;
  let stop: {point: LocationPoint; last: number}|null = null, lastAcceleration = -Infinity, lastBraking = -Infinity;
  let movingMeters = 0;
  function closeStop() {
    if (stop && stop.last - stop.point.timestamp >= 180000) out.events.push({kind: 'stop', at: stop.point.timestamp, latitude: stop.point.latitude, longitude: stop.point.longitude, durationSeconds: (stop.last-stop.point.timestamp)/1000});
    stop = null;
  }
  for (const p of [...points].sort((a,b) => a.timestamp-b.timestamp)) {
    if (!Number.isFinite(p.timestamp) || p.timestamp <= 0 || !Number.isFinite(p.latitude) || Math.abs(p.latitude)>90 || !Number.isFinite(p.longitude) || Math.abs(p.longitude)>180 || p.accuracy == null || !Number.isFinite(p.accuracy) || p.accuracy<0 || p.accuracy>25) { out.excludedPoints++; closeStop(); previous = null; previousSpeed = null; continue; }
    if (previous && p.timestamp <= previous.timestamp) { out.excludedPoints++; continue; }
    out.acceptedPoints++;
    if (!previous) { previous = p; continue; }
    const seconds = (p.timestamp-previous.timestamp)/1000, meters = distanceMeters(previous,p), inferred = meters/seconds;
    if (seconds>30 || inferred>220/3.6) { out.gaps++; closeStop(); previous = p; previousSpeed = null; continue; }
    // A reported GPS speed is used only when it agrees reasonably with movement.
    const reported = p.speed;
    const speed = reported != null && Number.isFinite(reported) && reported>=0 && reported<=220/3.6 && Math.abs(reported-inferred)<=Math.max(4, inferred*.5) ? reported : inferred;
    out.distanceKm += meters/1000; out.observedMinutes += seconds/60;
    out.maxSpeedKmh = Math.max(out.maxSpeedKmh ?? 0, speed*3.6);
    if (speed>=2) { out.movingMinutes += seconds/60; movingMeters += meters; closeStop(); }
    else {
      out.stoppedMinutes += seconds/60;
      if (stop && distanceMeters(stop.point,p)>60) closeStop();
      if (!stop) stop = {point: previous, last: p.timestamp}; else stop.last = p.timestamp;
    }
    if (previousSpeed != null && seconds>=2 && seconds<=8 && Math.max(speed,previousSpeed)>=5) {
      const acceleration = (speed-previousSpeed)/seconds;
      if (acceleration>=2.5 && p.timestamp-lastAcceleration>=20000) { out.events.push({kind:'acceleration',at:p.timestamp,latitude:p.latitude,longitude:p.longitude,acceleration});lastAcceleration=p.timestamp; }
      if (acceleration<=-3 && p.timestamp-lastBraking>=20000) { out.events.push({kind:'braking',at:p.timestamp,latitude:p.latitude,longitude:p.longitude,acceleration});lastBraking=p.timestamp; }
    }
    previous = p; previousSpeed = speed;
  }
  closeStop();
  if (out.movingMinutes>0) out.averageMovingKmh = movingMeters/out.movingMinutes*.06;
  if (out.movingMinutes>=10 && out.distanceKm>=1 && out.acceptedPoints>=30) {
    const abrupt = out.events.filter(e=>e.kind!=='stop').length;
    out.smoothness = Math.max(0, Math.round(100-100*abrupt/Math.max(10,out.distanceKm*2)));
  }
  return out;
}
