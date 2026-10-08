import type { RoadFeature, Coordinate } from './roadExplorer';
type Projection = { along: number; offset: number; ambiguous: boolean };
const radians = Math.PI / 180;
export function projectOntoRoute(point: Coordinate, route: [number, number][]): Projection | null {
  if (route.length < 2 || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;
  const xScale = 111320 * Math.cos(point.latitude*radians), yScale = 111320;
  let along = 0, best: Projection | null = null;
  for (let i=1; i<route.length; i++) {
    const a=route[i-1]!, b=route[i]!;
    if (![...a,...b].every(Number.isFinite)) return null;
    const ax=(a[1]-point.longitude)*xScale, ay=(a[0]-point.latitude)*yScale, dx=(b[1]-a[1])*xScale, dy=(b[0]-a[0])*yScale, length=Math.hypot(dx,dy);
    if (!length) continue;
    const fraction=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(length*length))), offset=Math.hypot(ax+fraction*dx,ay+fraction*dy), candidateAlong=along+fraction*length;
    if (!best || offset < best.offset-3) best={along:candidateAlong,offset,ambiguous:false};
    else if (Math.abs(offset-best.offset)<=3 && Math.abs(candidateAlong-best.along)>100) best.ambiguous=true;
    along+=length;
  }
  return best;
}
export function upcomingRoadSigns(route: [number, number][], position: Coordinate | null, signs: RoadFeature[], accuracy: number | null, fixAt: number, now=Date.now()): Array<{ sign: RoadFeature; meters: number }> {
  if (!position || accuracy == null || accuracy > 30 || accuracy < 0 || now-fixAt > 15000 || now<fixAt) return [];
  const current=projectOntoRoute(position,route);
  if (!current || current.ambiguous || current.offset>35) return [];
  return signs.flatMap(sign=>{
    if (sign.kind!=='traffic_sign') return [];
    const projected=projectOntoRoute(sign,route);
    if (!projected || projected.ambiguous || projected.offset>12) return [];
    const meters=projected.along-current.along;
    return meters>15 && meters<=1000 ? [{sign,meters:Math.round(meters/5)*5}] : [];
  }).sort((a,b)=>a.meters-b.meters).slice(0,3);
}
