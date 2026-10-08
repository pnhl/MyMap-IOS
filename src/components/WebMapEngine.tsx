import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { env } from '../config/env';
import { is3DMapProvider, openMapStyleUrl } from '../config/mapProviders';
import {rawTraveledSegments} from '../services/traveledTrace';
import type { LeafletMapProps, LeafletMapRef } from './LeafletMap';

export type WebMapEngineName = 'maplibre_gl' | 'openlayers' | 'cesium';

type Props = LeafletMapProps & { engine: WebMapEngineName };

type WebPayload = {
  alternatives: [number,number][][];
  selectedRouteIndex:number;
  traffic: [number,number][][];
  roadLines: [number,number][][];
  trafficTileUrl: string;
  places:Array<{id:number;name:string;coordinate:[number,number]}>;
  scaleBarTop:number;
  center: [number, number];
  zoom: number;
  pitch: number;
  tileUrl: string;
  demUrl: string;
  ionToken: string;
  vectorStyleUrl: string | null;
  attributionBottom: number;
  todaySegments: [number,number][][];
  destinationRoute: [number, number][];
  current: [number, number] | null;
  destination: [number, number] | null;
  friends: Array<{ id: string; name: string; coordinate: [number, number] }>;
};

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function tileUrl(provider: LeafletMapProps['tileProvider']): string {
  if (provider === 'satellite') return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  if ((provider === 'stadia_dark' || provider === 'carto_dark') && env.stadiaMapsKey) {
    return `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}@2x.png?api_key=${env.stadiaMapsKey}`;
  }
  if (provider === 'stadia_smooth' && env.stadiaMapsKey) {
    return `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}@2x.png?api_key=${env.stadiaMapsKey}`;
  }
  return env.osmTileUrl;
}

function shell(title: string, cssUrl: string, scriptUrl: string, body: string, attributionBottom = 6): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/><title>${title}</title><link rel="stylesheet" href="${cssUrl}"/><style>html,body,#map{width:100%;height:100%;margin:0;background:#020c24;overflow:hidden}.loading{position:fixed;inset:0;display:grid;place-items:center;color:#9de8ff;font:600 13px system-ui;background:#020c24}.maplibregl-ctrl-bottom-right,.maplibregl-ctrl-bottom-left{bottom:${attributionBottom}px}.ol-attribution,.cesium-widget-credits{bottom:${attributionBottom}px!important}.maplibregl-ctrl-attrib,.ol-attribution{font-size:9px!important;opacity:.78}</style></head><body><div id="map"></div><div id="loading" class="loading">Đang tải ${title}…</div><script src="${scriptUrl}"></script><script>${body}</script></body></html>`;
}

function bridgePrelude(payload: WebPayload): string {
  return `const payload=${safeJson(payload)};const send=(type,data={})=>{try{window.ReactNativeWebView.postMessage(JSON.stringify({type,...data}))}catch(_){}};const ready=()=>{const el=document.getElementById('loading');if(el)el.remove();send('ready')};const routeGeoJSON=(coords)=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});window.onerror=(message)=>send('error',{message:String(message)});document.getElementById('map').addEventListener('touchmove',()=>send('gesture'),{passive:true});document.getElementById('map').addEventListener('wheel',()=>send('gesture'),{passive:true});`;
}

function mapLibreHtml(payload: WebPayload): string {
  const body = `${bridgePrelude(payload)}
  const style={version:8,sources:{osm:{type:'raster',tiles:[payload.tileUrl],tileSize:256,maxzoom:20,attribution:'© OpenStreetMap contributors'},terrain:{type:'raster-dem',url:payload.demUrl,tileSize:256}},layers:[{id:'background',type:'background',paint:{'background-color':'#020c24'}},{id:'osm',type:'raster',source:'osm'},{id:'hillshade',type:'hillshade',source:'terrain',paint:{'hillshade-exaggeration':0.35,'hillshade-shadow-color':'#07172e','hillshade-highlight-color':'#8be8ff'}}],terrain:{source:'terrain',exaggeration:1.2}};
  const map=new maplibregl.Map({container:'map',style:payload.vectorStyleUrl||style,center:payload.center,zoom:payload.zoom,pitch:payload.pitch,bearing:0,attributionControl:false});
  map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-left');const scale=new maplibregl.ScaleControl({maxWidth:85,unit:'metric'});map.addControl(scale,'top-left');scale.getContainer().style.marginTop=payload.scaleBarTop+'px';map.on('moveend',()=>{const c=map.getCenter();send('viewport',{latitude:c.lat,longitude:c.lng,zoom:map.getZoom()})});
  let overlayIds=[];const addLine=(id,coords,color,width)=>{if(coords.length<2)return;overlayIds.push(id);map.addSource(id,{type:'geojson',data:routeGeoJSON(coords)});map.addLayer({id,type:'line',source:id,paint:{'line-color':color,'line-width':width,'line-opacity':.95}})};
  const addPoints=()=>{const features=[];if(payload.current)features.push({type:'Feature',properties:{kind:'current'},geometry:{type:'Point',coordinates:payload.current}});if(payload.destination)features.push({type:'Feature',properties:{kind:'destination'},geometry:{type:'Point',coordinates:payload.destination}});payload.places.forEach(p=>features.push({type:'Feature',properties:{kind:'poi',id:p.id,name:p.name},geometry:{type:'Point',coordinates:p.coordinate}}));payload.friends.forEach(f=>features.push({type:'Feature',properties:{kind:'friend',id:f.id,name:f.name},geometry:{type:'Point',coordinates:f.coordinate}}));map.addSource('points',{type:'geojson',data:{type:'FeatureCollection',features}});map.addLayer({id:'points-halo',type:'circle',source:'points',paint:{'circle-radius':['match',['get','kind'],'current',12,'destination',11,9],'circle-color':['match',['get','kind'],'current','#00f5d4','destination','#ff355e','#52e3ff'],'circle-opacity':.88,'circle-stroke-color':'#fff','circle-stroke-width':2}});map.addLayer({id:'points-labels',type:'symbol',source:'points',filter:['==',['get','kind'],'poi'],layout:{'text-field':['get','name'],'text-size':11,'text-offset':[0,1.5]},paint:{'text-color':'#24324A','text-halo-color':'#FFFFFF','text-halo-width':2}})};
  let trafficTileTemplate='';const syncTraffic=()=>{if((payload.trafficTileUrl||'')===trafficTileTemplate)return;trafficTileTemplate=payload.trafficTileUrl||'';const current=map.getSource('traffic-flow');if(current){map.removeLayer('traffic-flow-layer');map.removeSource('traffic-flow');}if(payload.trafficTileUrl){map.addSource('traffic-flow',{type:'raster',tiles:[payload.trafficTileUrl],tileSize:256,maxzoom:18,attribution:'© TomTom'});map.addLayer({id:'traffic-flow-layer',type:'raster',source:'traffic-flow',paint:{'raster-opacity':.85}});}};
  const refresh=()=>{if(!map.isStyleLoaded())return;syncTraffic();overlayIds.forEach(id=>{if(map.getLayer(id))map.removeLayer(id);if(map.getSource(id))map.removeSource(id)});overlayIds=[];(payload.roadLines||[]).forEach((line,i)=>addLine('road-'+i,line,'#C084FC',3));scale.getContainer().style.marginTop=payload.scaleBarTop+'px';if(map.getLayer('points-labels'))map.removeLayer('points-labels');if(map.getLayer('points-halo'))map.removeLayer('points-halo');if(map.getSource('points'))map.removeSource('points');payload.todaySegments.forEach((s,i)=>addLine('today-route-'+i,s,'#32d7ff',4));payload.alternatives.forEach((line,i)=>{if(i!==payload.selectedRouteIndex)addLine('choice-'+i,line,'#7187AF',8)});addLine('destination-route',payload.destinationRoute,'#00f5d4',5);payload.traffic.forEach((line,i)=>addLine('traffic-'+i,line,'#EF4444',7));addPoints()};map.on('load',()=>{refresh();ready()});map.on('dragstart',()=>send('gesture'));map.on('click',e=>{const hit=map.queryRenderedFeatures(e.point,{layers:['points-halo',...overlayIds.filter(id=>id.startsWith('choice-'))]})[0];if(hit?.properties.kind==='poi'){send('placeChoice',{id:hit.properties.id});return;}if(hit?.layer.id.startsWith('choice-')){send('routeChoice',{index:Number(hit.layer.id.slice(7))});return;}send('mapClick',{latitude:e.lngLat.lat,longitude:e.lngLat.lng});});window.myMapBridge={update:(p)=>{Object.assign(payload,p);refresh()},animate:(c)=>map.easeTo({center:[c.longitude,c.latitude],zoom:c.zoom||15,pitch:c.pitch??payload.pitch,duration:c.duration??700}),fit:(coords)=>{if(!coords.length)return;const bounds=coords.reduce((b,c)=>b.extend([c.longitude,c.latitude]),new maplibregl.LngLatBounds());map.fitBounds(bounds,{padding:60,duration:700})}};`;
  return shell('MapLibre GL 3D', 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css', 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js', body, payload.attributionBottom);
}

function openLayersHtml(payload: WebPayload): string {
  const body = `${bridgePrelude(payload)}
  const from=ol.proj.fromLonLat;let features=[];const line=(coords,color,width,index)=>{if(coords.length<2)return;const f=new ol.Feature(new ol.geom.LineString(coords).transform('EPSG:4326','EPSG:3857'));if(index!=null)f.set('routeIndex',index);f.setStyle(new ol.style.Style({stroke:new ol.style.Stroke({color,width})}));features.push(f)};(payload.roadLines||[]).forEach(s=>line(s,'#C084FC',3));payload.todaySegments.forEach(s=>line(s,'#32d7ff',4));payload.alternatives.forEach((lineCoords,i)=>{if(i!==payload.selectedRouteIndex)line(lineCoords,'#7187AF',8,i)});line(payload.destinationRoute,'#00f5d4',5);payload.traffic.forEach(coords=>line(coords,'#EF4444',7));
  const point=(coord,color,radius,place)=>{if(!coord)return;const f=new ol.Feature(new ol.geom.Point(from(coord)));if(place)f.set('placeId',place.id);f.setStyle(new ol.style.Style({text:place?new ol.style.Text({text:place.name,offsetY:18,font:'11px sans-serif',fill:new ol.style.Fill({color:'#24324A'}),stroke:new ol.style.Stroke({color:'white',width:3})}):undefined,image:new ol.style.Circle({radius,fill:new ol.style.Fill({color}),stroke:new ol.style.Stroke({color:'#fff',width:2})})}));features.push(f)};point(payload.current,'#00f5d4',8);point(payload.destination,'#ff355e',9);payload.friends.forEach(f=>point(f.coordinate,'#52e3ff',7));payload.places.forEach(p=>point(p.coordinate,'#FFFFFF',7,p));
  const map=new ol.Map({target:'map',layers:[new ol.layer.Tile({source:new ol.source.XYZ({url:payload.tileUrl,attributions:'© OpenStreetMap contributors',crossOrigin:'anonymous'})}),new ol.layer.Vector({source:new ol.source.Vector({features})})],view:new ol.View({center:from(payload.center),zoom:payload.zoom})});const trafficTileLayer=new ol.layer.Tile({opacity:.85,zIndex:0.5});map.getLayers().item(1).setZIndex(1);map.addLayer(trafficTileLayer);let trafficTileTemplate='';const syncTraffic=()=>{if((payload.trafficTileUrl||'')!==trafficTileTemplate){trafficTileTemplate=payload.trafficTileUrl||'';trafficTileLayer.setSource(trafficTileTemplate?new ol.source.XYZ({url:trafficTileTemplate,maxZoom:18,attributions:'© TomTom',crossOrigin:'anonymous'}):null);}trafficTileLayer.setVisible(!!trafficTileTemplate);};syncTraffic();const scale=new ol.control.ScaleLine({units:'metric',minWidth:60});map.addControl(scale);scale.element.style.top=payload.scaleBarTop+'px';scale.element.style.bottom='auto';map.on('moveend',()=>{const c=ol.proj.toLonLat(map.getView().getCenter());send('viewport',{latitude:c[1],longitude:c[0],zoom:map.getView().getZoom()})});map.once('rendercomplete',ready);map.on('click',e=>{const hit=map.forEachFeatureAtPixel(e.pixel,f=>f);if(hit?.get('placeId')!=null){send('placeChoice',{id:hit.get('placeId')});return;}if(hit?.get('routeIndex')!=null){send('routeChoice',{index:hit.get('routeIndex')});return;}const c=ol.proj.toLonLat(e.coordinate);send('mapClick',{latitude:c[1],longitude:c[0]})});map.on('pointerdrag',()=>send('gesture'));window.myMapBridge={update:(p)=>{Object.assign(payload,p);scale.element.style.top=payload.scaleBarTop+'px';syncTraffic();features=[];(payload.roadLines||[]).forEach(s=>line(s,'#C084FC',3));payload.todaySegments.forEach(s=>line(s,'#32d7ff',4));payload.alternatives.forEach((coords,i)=>{if(i!==payload.selectedRouteIndex)line(coords,'#7187AF',8,i)});line(payload.destinationRoute,'#00f5d4',5);payload.traffic.forEach(coords=>line(coords,'#EF4444',7));point(payload.current,'#00f5d4',8);point(payload.destination,'#ff355e',9);payload.friends.forEach(f=>point(f.coordinate,'#52e3ff',7));payload.places.forEach(p=>point(p.coordinate,'#FFFFFF',7,p));const source=map.getLayers().item(1).getSource();source.clear();source.addFeatures(features)},animate:(c)=>map.getView().animate({center:from([c.longitude,c.latitude]),zoom:c.zoom||15,duration:c.duration||700}),fit:(coords)=>{if(!coords.length)return;const extent=ol.extent.boundingExtent(coords.map(c=>from([c.longitude,c.latitude])));map.getView().fit(extent,{padding:[60,60,60,60],duration:700,maxZoom:17})}};`;
  return shell('OpenLayers', 'https://cdn.jsdelivr.net/npm/ol@10.10.0/ol.css', 'https://cdn.jsdelivr.net/npm/ol@10.10.0/dist/ol.js', body, payload.attributionBottom);
}

function cesiumHtml(payload: WebPayload): string {
  const body = `${bridgePrelude(payload)}
  (async()=>{if(payload.ionToken)Cesium.Ion.defaultAccessToken=payload.ionToken;const terrainProvider=payload.ionToken?await Cesium.createWorldTerrainAsync():new Cesium.EllipsoidTerrainProvider();const viewer=new Cesium.Viewer('map',{terrainProvider,baseLayer:false,animation:false,timeline:false,geocoder:false,homeButton:false,sceneModePicker:false,baseLayerPicker:false,navigationHelpButton:false,fullscreenButton:false,selectionIndicator:false,infoBox:false});viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({url:payload.tileUrl,credit:'© OpenStreetMap contributors',maximumLevel:19}));viewer.scene.globe.depthTestAgainstTerrain=true;let trafficTileLayer=null,trafficTileTemplate='';const syncTraffic=()=>{if((payload.trafficTileUrl||'')===trafficTileTemplate)return;if(trafficTileLayer)viewer.imageryLayers.remove(trafficTileLayer,true);trafficTileLayer=null;trafficTileTemplate=payload.trafficTileUrl||'';if(trafficTileTemplate)trafficTileLayer=viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({url:trafficTileTemplate,credit:'© TomTom',maximumLevel:18}));};syncTraffic();
  const addLine=(coords,color,width,index)=>{if(coords.length<2)return;viewer.entities.add({properties:{routeIndex:index},polyline:{positions:Cesium.Cartesian3.fromDegreesArray(coords.flat()),width,material:color,clampToGround:true}})};(payload.roadLines||[]).forEach(s=>addLine(s,Cesium.Color.fromCssColorString('#C084FC'),3));payload.todaySegments.forEach(s=>addLine(s,Cesium.Color.fromCssColorString('#32d7ff'),4));payload.alternatives.forEach((line,i)=>{if(i!==payload.selectedRouteIndex)addLine(line,Cesium.Color.fromCssColorString('#7187AF'),8,i)});addLine(payload.destinationRoute,Cesium.Color.fromCssColorString('#00f5d4'),5);payload.traffic.forEach(line=>addLine(line,Cesium.Color.fromCssColorString('#EF4444'),7));const point=(coord,color,size,place)=>{if(!coord)return;viewer.entities.add({properties:{placeId:place?.id},label:place?{text:place.name,font:'11px sans-serif',pixelOffset:new Cesium.Cartesian2(0,18),fillColor:Cesium.Color.WHITE,showBackground:true,disableDepthTestDistance:Number.POSITIVE_INFINITY}:undefined,position:Cesium.Cartesian3.fromDegrees(coord[0],coord[1]),point:{pixelSize:size,color,outlineColor:Cesium.Color.WHITE,outlineWidth:2,heightReference:Cesium.HeightReference.CLAMP_TO_GROUND}})};point(payload.current,Cesium.Color.fromCssColorString('#00f5d4'),12);point(payload.destination,Cesium.Color.fromCssColorString('#ff355e'),13);payload.friends.forEach(f=>point(f.coordinate,Cesium.Color.fromCssColorString('#52e3ff'),10));payload.places.forEach(p=>point(p.coordinate,Cesium.Color.WHITE,10,p));viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(payload.center[0],payload.center[1],Math.max(900,24000000/Math.pow(2,payload.zoom-2))),duration:0});const scale=document.createElement('div');scale.style.cssText='position:fixed;left:12px;width:85px;border-bottom:2px solid white;background:#24324Acc;color:white;font:11px sans-serif;padding:3px;pointer-events:none';document.body.appendChild(scale);const report=()=>{scale.style.top=payload.scaleBarTop+'px';const canvas=viewer.scene.canvas,y=Math.min(canvas.clientHeight-30,payload.scaleBarTop+30),a=viewer.camera.pickEllipsoid(new Cesium.Cartesian2(12,y),viewer.scene.globe.ellipsoid),b=viewer.camera.pickEllipsoid(new Cesium.Cartesian2(97,y),viewer.scene.globe.ellipsoid);scale.textContent=a&&b?Math.round(Cesium.Cartesian3.distance(a,b))+' m':'';scale.style.display=a&&b?'block':'none';const c=viewer.camera.positionCartographic;send('viewport',{latitude:Cesium.Math.toDegrees(c.latitude),longitude:Cesium.Math.toDegrees(c.longitude),zoom:Math.log2(24000000/Math.max(1,c.height))+2})};viewer.camera.moveEnd.addEventListener(report);report();const handler=new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);handler.setInputAction(m=>{const hit=viewer.scene.pick(m.position)?.id,placeId=hit?.properties?.placeId?.getValue(),routeIndex=hit?.properties?.routeIndex?.getValue();if(placeId!=null){send('placeChoice',{id:placeId});return;}if(routeIndex!=null){send('routeChoice',{index:routeIndex});return;}const c=viewer.camera.pickEllipsoid(m.position,viewer.scene.globe.ellipsoid);if(!c)return;const d=Cesium.Cartographic.fromCartesian(c);send('mapClick',{latitude:Cesium.Math.toDegrees(d.latitude),longitude:Cesium.Math.toDegrees(d.longitude)})},Cesium.ScreenSpaceEventType.LEFT_CLICK);window.myMapBridge={update:(p)=>{Object.assign(payload,p);scale.style.top=payload.scaleBarTop+'px';syncTraffic();viewer.entities.removeAll();(payload.roadLines||[]).forEach(s=>addLine(s,Cesium.Color.fromCssColorString('#C084FC'),3));payload.todaySegments.forEach(s=>addLine(s,Cesium.Color.fromCssColorString('#32d7ff'),4));payload.alternatives.forEach((line,i)=>{if(i!==payload.selectedRouteIndex)addLine(line,Cesium.Color.fromCssColorString('#7187AF'),8,i)});addLine(payload.destinationRoute,Cesium.Color.fromCssColorString('#00f5d4'),5);payload.traffic.forEach(line=>addLine(line,Cesium.Color.fromCssColorString('#EF4444'),7));point(payload.current,Cesium.Color.fromCssColorString('#00f5d4'),12);point(payload.destination,Cesium.Color.fromCssColorString('#ff355e'),13);payload.friends.forEach(f=>point(f.coordinate,Cesium.Color.fromCssColorString('#52e3ff'),10));payload.places.forEach(p=>point(p.coordinate,Cesium.Color.WHITE,10,p))},animate:(c)=>viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(c.longitude,c.latitude,Math.max(500,24000000/Math.pow(2,(c.zoom||15)-2))),duration:(c.duration||700)/1000}),fit:(coords)=>{if(!coords.length)return;const west=Math.min(...coords.map(c=>c.longitude)),east=Math.max(...coords.map(c=>c.longitude)),south=Math.min(...coords.map(c=>c.latitude)),north=Math.max(...coords.map(c=>c.latitude));viewer.camera.flyTo({destination:Cesium.Rectangle.fromDegrees(west,south,east,north),duration:.8})}};ready()})().catch(e=>send('error',{message:String(e&&e.message||e)}));`;
  return shell('CesiumJS 3D', 'https://cesium.com/downloads/cesiumjs/releases/1.145/Build/Cesium/Widgets/widgets.css', 'https://cesium.com/downloads/cesiumjs/releases/1.145/Build/Cesium/Cesium.js', body, payload.attributionBottom);
}

export const WebMapEngine = forwardRef<LeafletMapRef, Props>(function WebMapEngine(
  {
    engine,
    currentPosition,
    initialRegion,
    tileProvider = 'osm',
    attributionBottom = 6,
    friends = [],
    todayPoints = [],
    todayRoadRoute,
    todayRoadSegments,
    showRoute = true,
    destination,
    destinationRoadRoute,
    routeAlternatives=[],selectedRouteIndex=0,trafficSegments=[],roadLines=[],trafficTileUrl='',places=[],onPlacePress,onRouteChoice,onViewportChange,scaleBarTop=126,
    onMapClick,
    onMapReady,
    onMapGesture,
  },
  ref,
) {
  const webView = useRef<WebView>(null);
  const payload = useMemo<WebPayload>(() => ({
    alternatives:routeAlternatives.map(line=>line.map(([lat,lon])=>[lon,lat])),selectedRouteIndex,traffic:trafficSegments.map(line=>line.map(([lat,lon])=>[lon,lat])),roadLines:roadLines.map(line=>line.map(([lat,lon])=>[lon,lat])),trafficTileUrl,places:places.slice(0,30).map(place=>({id:place.placeId,name:place.displayName.split(',')[0]!,coordinate:[place.longitude,place.latitude]})),scaleBarTop,
    center: [initialRegion?.longitude ?? currentPosition?.longitude ?? 105.854167, initialRegion?.latitude ?? currentPosition?.latitude ?? 21.028511],
    zoom: is3DMapProvider(tileProvider)?16:(initialRegion?.zoom ?? 14),
    pitch: is3DMapProvider(tileProvider)?55:0,
    tileUrl: tileUrl(tileProvider),
    vectorStyleUrl: openMapStyleUrl(tileProvider || ''),
    attributionBottom,
    demUrl: env.mapLibreDemUrl,
    ionToken: env.cesiumIonToken,
    todaySegments: showRoute ? (todayRoadSegments ?? (todayRoadRoute ? [todayRoadRoute] : rawTraveledSegments(todayPoints))).map(s=>s.map(([lat,lon])=>[lon,lat])) : [],
    destinationRoute: destinationRoadRoute?.map(([latitude, longitude]) => [longitude, latitude]) ?? [],
    current: currentPosition ? [currentPosition.longitude, currentPosition.latitude] : null,
    destination: destination ? [destination.longitude, destination.latitude] : null,
    friends: friends.map(friend => ({ id: friend.id, name: friend.displayName, coordinate: [friend.longitude, friend.latitude] })),
  }), [routeAlternatives,selectedRouteIndex,trafficSegments,roadLines,trafficTileUrl,places,scaleBarTop,attributionBottom, currentPosition, destination, destinationRoadRoute, friends, initialRegion, showRoute, tileProvider, todayPoints, todayRoadRoute, todayRoadSegments]);
  const latestPayload=useRef(payload);latestPayload.current=payload;
  const readyRef=useRef(false);
  const pendingCamera=useRef<string|null>(null);
  // Recreate the document only for an engine/style change, never for a GPS tick.
  const source=useMemo(()=>({html:engine==='maplibre_gl'?mapLibreHtml(latestPayload.current):engine==='openlayers'?openLayersHtml(latestPayload.current):cesiumHtml(latestPayload.current),baseUrl:'https://app.mymap.local/'}),[engine,tileProvider]);
  useEffect(()=>{readyRef.current=false;},[source]);

  const inject = useCallback((expression: string) => {
    if(!readyRef.current){pendingCamera.current=expression;return;}
    webView.current?.injectJavaScript(`try{${expression}}catch(e){true;}true;`);
  }, []);

  useEffect(()=>{if(readyRef.current)webView.current?.injectJavaScript(`window.myMapBridge&&window.myMapBridge.update(${safeJson(payload)});true;`);},[payload]);
  useImperativeHandle(ref, () => ({
    animateToRegion(coords, duration = 700) {
      inject(`window.myMapBridge&&window.myMapBridge.animate(${safeJson({ ...coords, duration })})`);
    },
    centerOnUser() {
      if (currentPosition) inject(`window.myMapBridge&&window.myMapBridge.animate(${safeJson({ ...currentPosition, zoom: 16, duration: 650 })})`);
    },
    fitToCoordinates(coords) {
      inject(`window.myMapBridge&&window.myMapBridge.fit(${safeJson(coords)})`);
    },
  }), [currentPosition, inject]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; latitude?: number; longitude?: number; zoom?:number; index?:number; id?:number };
      if(message.type==='gesture')onMapGesture?.();
      if(message.type==='viewport'&&Number.isFinite(message.latitude)&&Number.isFinite(message.longitude)&&Number.isFinite(message.zoom))onViewportChange?.({latitude:message.latitude!,longitude:message.longitude!,zoom:message.zoom!});
      if(message.type==='routeChoice'&&Number.isInteger(message.index)&&message.index!>=0&&message.index!<routeAlternatives.length)onRouteChoice?.(message.index!);
      if(message.type==='placeChoice'){const place=places.find(p=>p.placeId===message.id);if(place)onPlacePress?.(place);}
      if (message.type === 'ready') {
        readyRef.current=true;
        webView.current?.injectJavaScript(`window.myMapBridge&&window.myMapBridge.update(${safeJson(latestPayload.current)});true;`);
        if(pendingCamera.current){inject(pendingCamera.current);pendingCamera.current=null;}
        onMapReady?.();
      }
      if (message.type === 'mapClick' && Number.isFinite(message.latitude) && Number.isFinite(message.longitude)) {
        onMapClick?.({ latitude: message.latitude!, longitude: message.longitude! });
      }
    } catch {}
  }, [onMapClick, onMapReady,onMapGesture,inject,onViewportChange,onPlacePress,onRouteChoice,places,routeAlternatives]);

  return <View style={StyleSheet.absoluteFill}>
    <WebView
      ref={webView}
      source={source}
      style={styles.webView}
      javaScriptEnabled
      domStorageEnabled
      originWhitelist={['https://*']}
      mixedContentMode="never"
      setSupportMultipleWindows={false}
      allowsInlineMediaPlayback={false}
      onMessage={onMessage}
      startInLoadingState
      renderLoading={() => <View style={styles.loading}><ActivityIndicator color="#52E3FF" /></View>}
    />
  </View>;
});

const styles = StyleSheet.create({
  webView: { flex: 1, backgroundColor: '#020C24' },
  loading: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020C24' },
});
