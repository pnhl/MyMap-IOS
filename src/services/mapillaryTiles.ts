import {VectorTile} from '@mapbox/vector-tile';
import {PbfReader} from 'pbf';
import {env} from '../config/env';
export type MapillaryTileImage={id:string;latitude:number;longitude:number;capturedAt:number};
type Tile={x:number;y:number;z:number};
const cache=new Map<string,{at:number;images:MapillaryTileImage[]}>();
let unavailableUntil=0;
export function coverageTiles(latitude:number,longitude:number,radiusMeters:number):Tile[]{
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>85||Math.abs(longitude)>180||!Number.isFinite(radiusMeters)||radiusMeters<=0||radiusMeters>1000)return[];
  const z=14,n=2**z,dLat=radiusMeters/111320,dLon=dLat/Math.max(.1,Math.cos(latitude*Math.PI/180));
  const x=(lon:number)=>Math.floor((Math.max(-180,Math.min(179.99999,lon))+180)/360*n);
  const y=(lat:number)=>{const r=Math.max(-85,Math.min(85,lat))*Math.PI/180;return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n);};
  const tiles:Tile[]=[];for(let tx=x(longitude-dLon);tx<=x(longitude+dLon);tx++)for(let ty=y(latitude+dLat);ty<=y(latitude-dLat);ty++)tiles.push({x:tx,y:ty,z});
  return tiles.slice(0,4);
}
export function decodeCoverage(bytes:Uint8Array,tile:Tile):MapillaryTileImage[]{
  const data=new VectorTile(new PbfReader(bytes)),layer=data.layers.image,images:MapillaryTileImage[]=[];
  if(!layer)return[];
  for(let i=0;i<Math.min(layer.length,10000);i++){
    const raw=layer.feature(i),item=raw.toGeoJSON(tile.x,tile.y,tile.z),id=raw.properties.id??raw.id;
    if(item.geometry.type!=='Point'||(typeof id==='number'&&!Number.isSafeInteger(id))||!/^\d+$/.test(String(id)))continue;
    const [longitude,latitude]=item.geometry.coordinates,capturedAt=Number(raw.properties.captured_at)||0;
    if(latitude==null||longitude==null||!Number.isFinite(latitude)||!Number.isFinite(longitude))continue;
    images.push({id:String(id),latitude,longitude,capturedAt});
  }
  return images;
}
async function fetchCoverage(tile:Tile,signal?:AbortSignal):Promise<MapillaryTileImage[]>{
  if(signal?.aborted)throw new Error('Đã hủy tải ảnh.');
  const key=`${tile.z}/${tile.x}/${tile.y}`,saved=cache.get(key);
  if(saved&&Date.now()-saved.at<1800000)return saved.images;
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,6000);
  try{
    const response=await fetch(`https://tiles.mapillary.com/maps/vtp/mly1_public/2/${key}?access_token=${encodeURIComponent(env.mapillaryToken)}`,{signal:controller.signal});
    if(!response.ok)throw new Error('Ảnh đường chưa sẵn sàng.');
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(controller.signal.aborted)throw new Error('Đã hủy tải ảnh.');
    const images=decodeCoverage(bytes,tile);cache.set(key,{at:Date.now(),images});if(cache.size>12)cache.delete(cache.keys().next().value!);return images;
  }catch{throw new Error('Chưa tải được lớp phủ ảnh Mapillary.');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function nearbyImageIds(latitude:number,longitude:number,radiusMeters:number,signal?:AbortSignal,history=false):Promise<string[]>{
  if(!env.mapillaryToken)return[];
  if(Date.now()<unavailableUntil)throw new Error('Lớp phủ ảnh tạm thời chưa sẵn sàng.');
  const tiles=coverageTiles(latitude,longitude,radiusMeters),responses=await Promise.allSettled(tiles.map(tile=>fetchCoverage(tile,signal)));
  if(signal?.aborted)throw new Error('Đã hủy tải ảnh.');
  if(responses.length&&responses.every(r=>r.status==='rejected')){unavailableUntil=Date.now()+120000;throw new Error('Chưa tải được lớp phủ ảnh Mapillary.');}
  const distance=(p:MapillaryTileImage)=>Math.hypot((p.latitude-latitude)*111320,(p.longitude-longitude)*111320*Math.cos(latitude*Math.PI/180));
  const images=responses.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(p=>distance(p)<=radiusMeters).sort((a,b)=>distance(a)-distance(b));
  const seen=new Set<string>(),days=new Set<string>(),selected:string[]=[];
  if(history)for(const image of images){const day=image.capturedAt?new Date(image.capturedAt).toISOString().slice(0,10):'';if(day&&!days.has(day)&&!seen.has(image.id)){days.add(day);seen.add(image.id);selected.push(image.id);if(selected.length>=12)break;}}
  for(const image of images){if(selected.length>=12)break;if(!seen.has(image.id)){seen.add(image.id);selected.push(image.id);}}
  return selected;
}
