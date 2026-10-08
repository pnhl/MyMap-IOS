import React,{useMemo}from'react';
import{Image,StyleSheet,View,useWindowDimensions}from'react-native';
import{getOpenStreetMapTileUrl}from'../maps';

const TILE=256;
const headers={'User-Agent':'MyMap/0.6.1 (com.pnhl.vibecoding)','X-Requested-With':'com.pnhl.vibecoding'};
function worldPixel(latitude:number,longitude:number,zoom:number){
 const scale=TILE*2**zoom;const lat=Math.max(-85.0511,Math.min(85.0511,latitude));const sin=Math.sin(lat*Math.PI/180);
 return{x:(longitude+180)/360*scale,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale};
}
export function OsmTileBackdrop({latitude,longitude,zoom}:{latitude:number;longitude:number;zoom:number}){
 const{width,height}=useWindowDimensions();
 const tiles=useMemo(()=>{
  const safeZoom=Math.max(1,Math.min(19,Math.round(zoom))),count=2**safeZoom,center=worldPixel(latitude,longitude,safeZoom);
  const left=center.x-width/2,top=center.y-height/2,startX=Math.floor(left/TILE),endX=Math.floor((left+width)/TILE),startY=Math.floor(top/TILE),endY=Math.floor((top+height)/TILE),out:{key:string;uri:string;left:number;top:number}[]=[];
  for(let y=startY;y<=endY;y++){if(y<0||y>=count)continue;for(let x=startX;x<=endX;x++){const wrapped=((x%count)+count)%count;out.push({key:`${safeZoom}:${wrapped}:${y}`,uri:getOpenStreetMapTileUrl(safeZoom,wrapped,y),left:x*TILE-left,top:y*TILE-top});}}
  return out;
 },[latitude,longitude,zoom,width,height]);
 return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>{tiles.map(tile=><Image key={tile.key} source={{uri:tile.uri,headers}} fadeDuration={0} style={[s.tile,{left:tile.left,top:tile.top}]}/>)}</View>;
}
const s=StyleSheet.create({tile:{position:'absolute',width:TILE+.5,height:TILE+.5}});
