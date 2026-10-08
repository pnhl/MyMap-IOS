export function mapScale(latitude:number,zoom:number,tileSize=512){
 if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(zoom)||zoom<0)return null;
 const metersPerPixel=40075016.686*Math.max(.01,Math.cos(latitude*Math.PI/180))/(tileSize*2**zoom);
 const maximum=metersPerPixel*85,unit=10**Math.floor(Math.log10(maximum));
 const meters=[5,2,1].map(value=>value*unit).find(value=>value<=maximum)||unit;
 return {meters,width:meters/metersPerPixel,label:meters>=1000?`${meters/1000} km`:`${meters} m`};
}
