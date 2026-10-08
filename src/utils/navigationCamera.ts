type Position={latitude:number;longitude:number};
export function navigationCamera(position:Position,speedKmh:number|null,width:number,visibleHeight:number,tileSize=512){
 const fast=speedKmh!=null&&Number.isFinite(speedKmh)&&speedKmh>=30;
 const span=fast?1100:320; // At least 500 m ahead in any heading, including north-up maps.
 const pixels=Math.max(80,Math.min(width-48,visibleHeight-40));
 const zoom=Math.max(11,Math.min(18,Math.log2(40075016.686*Math.cos(position.latitude*Math.PI/180)*pixels/(tileSize*span))));
 return {...position,zoom,pitch:0,latitudeDelta:span/111320,longitudeDelta:span/(111320*Math.max(.01,Math.cos(position.latitude*Math.PI/180)))};
}
