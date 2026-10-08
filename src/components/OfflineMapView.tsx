import React,{useMemo} from 'react';
import {WebView} from 'react-native-webview';
import {LEAFLET_JS,LEAFLET_CSS} from './leafletBundle';
export function offlineMapHTML(tiles:Array<{z:number;x:number;y:number;data:string}>,center:{latitude:number;longitude:number},attribution:string,position?:{latitude:number;longitude:number}|null,route?:Array<[number,number]>){
 const safe=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c');
 const cells=Object.fromEntries(tiles.map(t=>[`${t.z}/${t.x}/${t.y}`,t.data]));
 return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><style>${LEAFLET_CSS}html,body,#map{height:100%;width:100%;margin:0;background:#1A2538}.leaflet-container{background:#1A2538}</style></head><body><div id="map"></div><script>${LEAFLET_JS}</script><script>
 const tiles=${safe(cells)},center=${safe(center)},position=${safe(position||null)},route=${safe(route||[])};
 const map=L.map('map',{zoomControl:true,minZoom:${tiles.length?12:2},maxZoom:17}).setView([center.latitude,center.longitude],13);
 const Offline=L.GridLayer.extend({createTile:function(coords){const image=document.createElement('img');image.src=tiles[coords.z+'/'+coords.x+'/'+coords.y]||'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';image.width=256;image.height=256;return image;}});
 new Offline({tileSize:256,maxNativeZoom:13,minNativeZoom:12,attribution:${safe(attribution)}}).addTo(map);
 L.control.scale({imperial:false,maxWidth:100}).addTo(map);
 if(route.length>1){const line=L.polyline(route,{color:'#849CFF',weight:6}).addTo(map);map.fitBounds(line.getBounds(),{padding:[28,28]});L.circleMarker(route[0],{radius:5,color:'#fff'}).addTo(map);L.circleMarker(route[route.length-1],{radius:6,color:'#F58BC2'}).addTo(map);}
 if(position){L.circleMarker([position.latitude,position.longitude],{radius:8,color:'#fff',weight:3,fillColor:'#4464F6',fillOpacity:1}).addTo(map);}
 </script></body></html>`;
}
export function OfflineMapView({tiles,center,attribution,position,route}:{tiles:Parameters<typeof offlineMapHTML>[0];center:Parameters<typeof offlineMapHTML>[1];attribution:string;position?:Parameters<typeof offlineMapHTML>[3];route?:Array<[number,number]>}){
 const html=useMemo(()=>offlineMapHTML(tiles,center,attribution,position,route),[tiles,center,attribution,position,route]);
 return <WebView source={{html}} style={{height:400,borderRadius:18}} originWhitelist={['about:blank']} onShouldStartLoadWithRequest={request=>request.url==='about:blank'} javaScriptEnabled domStorageEnabled={false} allowFileAccess={false} mixedContentMode="never"/>;
}
