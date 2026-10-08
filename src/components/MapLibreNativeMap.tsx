import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from '../ui/Text';
import {
  Camera,
  GeoJSONSource,
  RasterSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { env } from '../config/env';
import { DEFAULT_MAP_PROVIDER, is3DMapProvider, isOpenMapProvider, openMapStyleUrl } from '../config/mapProviders';
import {rawTraveledSegments} from '../services/traveledTrace';
import type { LeafletMapProps, LeafletMapRef } from './LeafletMap';

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function routeFeature(coordinates?: [number, number][]): GeoJSON.FeatureCollection {
  if (!coordinates || coordinates.length < 2) return EMPTY_COLLECTION;
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coordinates.map(([latitude, longitude]) => [longitude, latitude]),
      },
    }],
  };
}

function traceFeature(segments: [number,number][][]): GeoJSON.FeatureCollection {
  return {type:'FeatureCollection',features:segments.filter(s=>s.length>1).map(coordinates=>({
    type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coordinates.map(([lat,lon])=>[lon,lat])},
  }))};
}

function pointCollection(
  points: Array<{ id: string; latitude: number; longitude: number; [key: string]: unknown }>,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map(point => ({
      type: 'Feature',
      id: point.id,
      properties: { ...point },
      geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
    })),
  };
}

function polygonCollection(polygons?: [number, number][][]): GeoJSON.FeatureCollection {
  if (!polygons?.length) return EMPTY_COLLECTION;
  return {
    type: 'FeatureCollection',
    features: polygons.filter(polygon => polygon.length >= 3).map((polygon, index) => {
      const ring = polygon.map(([latitude, longitude]) => [longitude, latitude]);
      if (ring.length && (ring[0]![0] !== ring[ring.length - 1]![0] || ring[0]![1] !== ring[ring.length - 1]![1])) {
        ring.push([...ring[0]!] as [number, number]);
      }
      return {
        type: 'Feature' as const,
        id: `scratch-${index}`,
        properties: {},
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      };
    }),
  };
}

function tileUrl(provider: LeafletMapProps['tileProvider']): string {
  if (provider === 'satellite') {
    return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  }
  if ((provider === 'stadia_dark' || provider === 'carto_dark') && env.stadiaMapsKey) {
    return `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}@2x.png?api_key=${env.stadiaMapsKey}`;
  }
  if (provider === 'stadia_smooth' && env.stadiaMapsKey) {
    return `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}@2x.png?api_key=${env.stadiaMapsKey}`;
  }
  return env.osmTileUrl;
}

function mapStyle(provider: LeafletMapProps['tileProvider']): StyleSpecification | string {
  const openStyle = provider ? openMapStyleUrl(provider) : null;
  if (openStyle) return openStyle;
  if (env.mapLibreStyleUrl) return env.mapLibreStyleUrl;
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [tileUrl(provider)],
        tileSize: 256,
        maxzoom: provider === 'satellite' ? 19 : 20,
        attribution: '© OpenStreetMap contributors',
      },
      terrain: {
        type: 'raster-dem',
        url: env.mapLibreDemUrl,
        tileSize: 256,
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#020C24' } },
      { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-opacity': 1 } },
      {
        id: 'terrain-hillshade',
        type: 'hillshade',
        source: 'terrain',
        paint: {
          'hillshade-shadow-color': '#07172e',
          'hillshade-highlight-color': '#8be8ff',
          'hillshade-accent-color': '#2c6f8c',
          'hillshade-exaggeration': 0.32,
        },
      },
    ],
    terrain: { source: 'terrain', exaggeration: 1.18 },
  } as StyleSpecification;
}

export const MapLibreNativeMap = forwardRef<LeafletMapRef, LeafletMapProps>(function MapLibreNativeMap(
  {
    currentPosition,
    initialRegion,
    tileProvider = DEFAULT_MAP_PROVIDER,
    friends = [],
    photos = [],
    partyGroups = [],
    mapChatMessages = [],
    todayPoints = [],
    todayRoadRoute,
    todayRoadSegments,
    showRoute = true,
    destination,
    destinationRoadRoute,
    routeAlternatives=[],selectedRouteIndex=0,trafficSegments=[],roadLines=[],trafficTileUrl='',places=[],onPlacePress,onRouteChoice,onViewportChange,scaleBarTop=120,
    footprintsFriend,
    scratchHexagons,
    onFriendPress,
    onMapClick,
    onMapReady,
    onMapGesture,
    onMapError,
    attributionBottom = 6,
  },
  ref,
) {
  const camera = useRef<CameraRef>(null);
  const ready=useRef(false);
  const queuedCamera=useRef<(()=>Promise<void>)|null>(null);
  const loadTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  function moveCamera(work:()=>Promise<void>){
    if(!ready.current){queuedCamera.current=work;return;}
    void work().catch(()=>onMapError?.('Chưa di chuyển được bản đồ. Hãy thử định vị lại.'));
  }
  const threeD = is3DMapProvider(tileProvider);
  useEffect(()=>{if(ready.current)void camera.current?.setStop({pitch:threeD?55:0,...(threeD?{zoom:16}:{}),duration:650,easing:'ease'}).catch(()=>{});},[threeD]);
  const initialCenter: [number, number] = [
    initialRegion?.longitude ?? currentPosition?.longitude ?? 105.854167,
    initialRegion?.latitude ?? currentPosition?.latitude ?? 21.028511,
  ];

  const style = useMemo(() => mapStyle(tileProvider), [tileProvider]);
  useEffect(()=>{
    ready.current=false;onMapError?.(null);
    loadTimer.current=setTimeout(()=>onMapError?.(isOpenMapProvider(tileProvider||'') ? 'OpenFreeMap tải quá chậm hoặc mất mạng (tile/sprite/glyph). Chạm để đổi sang OSM dự phòng.' : 'Bản đồ tải chậm. Bấm để đổi lớp bản đồ hoặc kiểm tra kết nối.'),15000);
    return()=>{if(loadTimer.current)clearTimeout(loadTimer.current);};
  },[style,tileProvider,onMapError]);
  const todayLine = useMemo(
    () => traceFeature(todayRoadSegments ?? (todayRoadRoute ? [todayRoadRoute] : rawTraveledSegments(todayPoints))),
    [todayPoints, todayRoadRoute, todayRoadSegments],
  );
  const destinationLine = useMemo(() => routeFeature(destinationRoadRoute), [destinationRoadRoute]);
  const friendFeatures = useMemo(
    () => pointCollection(friends.map(friend => ({
      id: friend.id,
      latitude: friend.latitude,
      longitude: friend.longitude,
      name: friend.displayName,
    }))),
    [friends],
  );
  const partyFeatures = useMemo(
    () => pointCollection(partyGroups.map((group, index) => ({
      id: group.id || `party-${index}`,
      latitude: group.centerLat,
      longitude: group.centerLon,
      count: group.friends.length,
    }))),
    [partyGroups],
  );
  const photoFeatures = useMemo(
    () => pointCollection(photos.map(photo => ({
      id: String(photo.id),
      latitude: photo.latitude,
      longitude: photo.longitude,
    }))),
    [photos],
  );
  const chatFeatures = useMemo(
    () => pointCollection(mapChatMessages.map(message => ({
      id: message.id,
      latitude: message.latitude,
      longitude: message.longitude,
    }))),
    [mapChatMessages],
  );
  const scratchFeatures = useMemo(() => polygonCollection(scratchHexagons), [scratchHexagons]);

  useImperativeHandle(ref, () => ({
    animateToRegion(coords, duration = 700) {
      moveCamera(async()=>{await camera.current?.easeTo({
        center: [coords.longitude, coords.latitude],
        zoom: coords.zoom ?? 15,
        pitch: coords.pitch ?? (threeD?55:0),
        duration,
      });});
    },
    centerOnUser() {
      if (!currentPosition) return;
      moveCamera(async()=>{await camera.current?.easeTo({ center: [currentPosition.longitude, currentPosition.latitude], zoom: 16, pitch:threeD?55:0,duration: 650 });});
    },
    fitToCoordinates(coords, options) {
      if (!coords.length) return;
      const longitudes = coords.map(point => point.longitude);
      const latitudes = coords.map(point => point.latitude);
      moveCamera(async()=>{await camera.current?.fitBounds(
        [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)],
        {
          padding: {
            top: options?.edgePadding?.top ?? 70,
            right: options?.edgePadding?.right ?? 50,
            bottom: options?.edgePadding?.bottom ?? 100,
            left: options?.edgePadding?.left ?? 50,
          },
          duration: 750,
          pitch: threeD?55:0,
        },
      );});
    },
  }), [currentPosition,threeD]);

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={style}
      attribution
      attributionPosition={{ bottom: attributionBottom, left: 8 }}
      logo={false}
      compass
      compassPosition={{ top: 72, right: 16 }}
      scaleBar={false}
      touchPitch
      onRegionWillChange={event=>{if(event.nativeEvent.userInteraction)onMapGesture?.();}}
      onRegionDidChange={event=>{const state=event.nativeEvent;onViewportChange?.({latitude:state.center[1],longitude:state.center[0],zoom:state.zoom});}}
      onDidFailLoadingMap={()=>onMapError?.(isOpenMapProvider(tileProvider||'') ? 'OpenFreeMap không phản hồi hoặc tải lỗi (tile/sprite/glyph). Hãy đổi sang nguồn dự phòng.' : 'Chưa tải được bản đồ. Bấm để chọn lớp bản đồ khác.')}
      onDidFinishRenderingMapFully={()=>{if(loadTimer.current)clearTimeout(loadTimer.current);onMapError?.(null);}}
      onDidFinishLoadingStyle={()=>{ready.current=true;void camera.current?.setStop({pitch:threeD?55:0,...(threeD?{zoom:16}:{}),duration:450,easing:'ease'}).catch(()=>{});const command=queuedCamera.current;queuedCamera.current=null;if(command)moveCamera(command);onMapReady?.();}}
      onPress={event => {
        const [longitude, latitude] = event.nativeEvent.lngLat;
        onMapClick?.({ latitude, longitude });
      }}
    >
      <Camera
        ref={camera}
        initialViewState={{ center: initialCenter, zoom: threeD?16:(initialRegion?.zoom ?? 14), pitch: threeD?55:0 }}
        minZoom={2}
        maxZoom={20}
      />

      {showRoute && todayLine.features.length>0 && <GeoJSONSource id="today-route-source" data={todayLine}>
        <Layer id="today-route-shadow" type="line" paint={{ 'line-color': '#031333', 'line-width': 8, 'line-opacity': 0.72 }} />
        <Layer id="today-route" type="line" paint={{ 'line-color': '#32D7FF', 'line-width': 4.5, 'line-opacity': 0.96 }} />
      </GeoJSONSource>}

      {routeAlternatives.length>1&&<GeoJSONSource id="alternative-routes-source" data={{type:'FeatureCollection',features:routeAlternatives.flatMap((coordinates,index)=>index===selectedRouteIndex?[]:[{type:'Feature' as const,properties:{index},geometry:{type:'LineString' as const,coordinates:coordinates.map(([lat,lon])=>[lon,lat])}}])}} onPress={event=>{const index=Number(event.nativeEvent.features?.[0]?.properties?.index);if(Number.isInteger(index))onRouteChoice?.(index);}}><Layer id="alternative-routes" type="line" paint={{'line-color':'#7187AF','line-width':8,'line-opacity':.8}}/></GeoJSONSource>}
      {destinationLine.features.length>0&&<GeoJSONSource id="destination-route-source" data={destinationLine}>
        <Layer id="destination-route" type="line" paint={{ 'line-color': '#00F5D4', 'line-width': 5.5, 'line-opacity': 0.95 }} />
      </GeoJSONSource>}

      {roadLines.length>0&&<GeoJSONSource id="road-infrastructure-source" data={traceFeature(roadLines)}><Layer id="road-infrastructure" type="line" paint={{'line-color':'#C084FC','line-width':3,'line-opacity':.55}}/></GeoJSONSource>}
      {!!trafficTileUrl&&<RasterSource id="traffic-flow-tiles" tiles={[trafficTileUrl]} tileSize={256} maxzoom={18} attribution="© TomTom"><Layer id="traffic-flow-layer" type="raster" paint={{'raster-opacity':.85}}/></RasterSource>}
      {trafficSegments.length>0&&<GeoJSONSource id="traffic-route-source" data={traceFeature(trafficSegments)}><Layer id="traffic-route" type="line" paint={{'line-color':'#EF4444','line-width':7,'line-opacity':1}}/></GeoJSONSource>}
      {places.slice(0,40).map(place=><Marker key={`poi-${place.provider||'osm'}-${place.placeId}`} id={`poi-${place.provider||'osm'}-${place.placeId}`} lngLat={[place.longitude,place.latitude]} anchor="bottom" onPress={()=>onPlacePress?.(place)}><View style={{backgroundColor:'#FFFFFFF2',paddingHorizontal:7,paddingVertical:4,borderRadius:10,borderWidth:1,borderColor:'#C4CCD8',maxWidth:128}} accessibilityLabel={place.displayName}><Text numberOfLines={1} style={{fontSize:10,color:'#253550',fontWeight:'700'}}>{place.kind==='road_report'?'🔴':place.kind==='traffic_sign'?'⚠':place.kind==='street_image'?'📷':place.kind==='dead_end'?'⊥':place.kind==='infrastructure'?'▤':place.kind==='parking'?'P':place.kind==='charging_station'?'⚡':place.kind==='fuel'?'⛽':place.kind==='cafe'?'☕':place.kind==='restaurant'?'🍴':'✚'} {place.displayName.split(',')[0]}</Text></View></Marker>)}

      <GeoJSONSource
        id="friends-source"
        data={friendFeatures}
        onPress={event => {
          const id = String(event.nativeEvent.features?.[0]?.properties?.id ?? '');
          const friend = friends.find(item => item.id === id);
          if (friend) onFriendPress?.(friend);
        }}
      >
        <Layer id="friends-halo" type="circle" paint={{ 'circle-radius': 28, 'circle-color': '#4464F6', 'circle-opacity': 0.1 }} />
      </GeoJSONSource>

      {friends.slice(0,100).map(friend => <Marker key={friend.id} id={`friend-avatar-${friend.id}`}
        lngLat={[friend.longitude,friend.latitude]} anchor="bottom" onPress={()=>onFriendPress?.(friend)}>
        <View style={styles.friendPin} accessibilityLabel={`Xem ${friend.displayName} trên bản đồ`}>
          <View style={[styles.friendAvatar,friend.isOnline===false&&styles.friendOffline]}>
            {friend.avatarUrl ? <Image source={{uri:friend.avatarUrl}} style={styles.friendImage}/> :
              <Text style={styles.friendInitial}>{friend.displayName.slice(0,1).toUpperCase()}</Text>}
          </View>
          <View style={styles.friendLabel}><Text numberOfLines={1} style={styles.friendName}>{friend.displayName}</Text>
            <Text style={styles.friendBattery}>{friend.isCharging?'⚡ ':''}{Math.round(friend.batteryLevel)}%</Text></View>
          <View style={styles.friendTip}/>
        </View>
      </Marker>)}

      <GeoJSONSource id="parties-source" data={partyFeatures}>
        <Layer id="parties" type="circle" paint={{ 'circle-radius': 9, 'circle-color': '#FF3B80', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 }} />
      </GeoJSONSource>

      <GeoJSONSource id="photos-source" data={photoFeatures}>
        <Layer id="photos-halo" type="circle" paint={{ 'circle-radius': 10, 'circle-color': '#9D5CFF', 'circle-opacity': 0.9, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 }} />
        <Layer id="photos-core" type="circle" paint={{ 'circle-radius': 3, 'circle-color': '#FFFFFF' }} />
      </GeoJSONSource>

      <GeoJSONSource id="chats-source" data={chatFeatures}>
        <Layer id="chats" type="circle" paint={{ 'circle-radius': 7, 'circle-color': '#9D5CFF', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.5 }} />
      </GeoJSONSource>

      <GeoJSONSource id="scratch-source" data={scratchFeatures}>
        <Layer id="scratch-fill" type="fill" paint={{ 'fill-color': '#00F5D4', 'fill-opacity': 0.2, 'fill-outline-color': '#52E3FF' }} />
      </GeoJSONSource>

      {currentPosition && <Marker id="current-position" lngLat={[currentPosition.longitude, currentPosition.latitude]}>
        <View style={styles.userMarker}><View style={styles.userPulse} /><View style={styles.userDot} /></View>
      </Marker>}
      {destination && <Marker id="destination" lngLat={[destination.longitude, destination.latitude]} anchor="bottom">
        <View style={styles.destinationMarker}><View style={styles.destinationCore} /><View style={styles.destinationStem} /></View>
      </Marker>}
      {footprintsFriend && <Marker id="footprints-friend" lngLat={[footprintsFriend.longitude, footprintsFriend.latitude]}>
        <View style={styles.footprint}><View style={styles.footprintDot} /></View>
      </Marker>}
    </Map>
  );
});

const styles = StyleSheet.create({
  friendPin:{alignItems:'center',maxWidth:132,paddingBottom:4},
  friendAvatar:{width:54,height:54,borderRadius:27,backgroundColor:'#4464F6',borderWidth:3,borderColor:'#fff',overflow:'hidden',alignItems:'center',justifyContent:'center'},
  friendOffline:{borderColor:'#CBD0DF',opacity:.8},friendImage:{width:48,height:48},friendInitial:{fontSize:25,color:'#fff',fontWeight:'800'},
  friendLabel:{marginTop:-4,paddingHorizontal:8,paddingVertical:3,borderRadius:12,backgroundColor:'#fff',flexDirection:'row',alignItems:'center',gap:5},
  friendName:{fontSize:10,color:'#182345',fontWeight:'800',maxWidth:80},friendBattery:{fontSize:9,color:'#526080',fontWeight:'700'},
  friendTip:{width:8,height:8,backgroundColor:'#fff',transform:[{rotate:'45deg'}],marginTop:-4},
  userMarker: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  userPulse: { position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,245,212,.28)' },
  userDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#00F5D4', borderWidth: 2.5, borderColor: '#FFFFFF' },
  destinationMarker: { width: 36, height: 48, alignItems: 'center', justifyContent: 'flex-start' },
  destinationCore: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FF355E', borderWidth: 3, borderColor: '#FFFFFF' },
  destinationStem: { width: 3, height: 14, marginTop: -2, backgroundColor: '#FF355E' },
  footprint: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(157,92,255,.28)', borderWidth: 1.5, borderColor: '#C5A3FF', alignItems: 'center', justifyContent: 'center' },
  footprintDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
});
