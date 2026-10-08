export type TracePoint = {latitude: number; longitude: number; timestamp?: number; accuracy?: number | null};
export type TraveledSegments = [number, number][][];

export function traceDistance(a: TracePoint, b: TracePoint): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude-a.latitude)*rad/2)**2
    + Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin((b.longitude-a.longitude)*rad/2)**2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1,h)));
}

/** Missing fixes must leave a gap instead of drawing a chord across the map. */
export function splitTraveledTrace(points: TracePoint[]): TracePoint[][] {
  const segments: TracePoint[][] = [];
  let current: TracePoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
      || Math.abs(point.latitude)>90 || Math.abs(point.longitude)>180) {
      if (current.length>1) segments.push(current);
      current=[];
      continue;
    }
    const previous=current[current.length-1];
    if (previous) {
      const distance=traceDistance(previous,point);
      const timed=Number.isFinite(previous.timestamp) && Number.isFinite(point.timestamp);
      const seconds=timed ? (point.timestamp!-previous.timestamp!)/1000 : null;
      if (distance<0.2) continue;
      // Preserve capture order. Out-of-order fixes are not new travel.
      if (seconds!=null && seconds<=0) continue;
      const gap=seconds!=null ? seconds>180 || distance/seconds>100 : distance>1000;
      if (gap) {
        if (current.length>1) segments.push(current);
        current=[];
      }
    }
    current.push(point);
  }
  if(current.length>1)segments.push(current);
  return segments;
}

export function rawTraveledSegments(points: TracePoint[]): TraveledSegments {
  return splitTraveledTrace(points).map(segment=>segment.map(p=>[p.latitude,p.longitude]));
}
