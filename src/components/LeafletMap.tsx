import React, { useRef, useImperativeHandle, forwardRef, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { RealtimeFriend, RealtimePartyGroup, MapChatMessage } from '../services/realtimeFriends';
import type { PhotoPin } from '../types/photo';
import { env } from '../config/env';
import type { MapTileProvider } from '../config/mapProviders';
import {rawTraveledSegments, type TracePoint} from '../services/traveledTrace';
import { LEAFLET_CSS, LEAFLET_JS } from './leafletBundle';

export type LeafletTileProvider = MapTileProvider;

export interface LeafletMapRef {
  animateToRegion: (coords: { latitude: number; longitude: number; zoom?: number; pitch?:number; latitudeDelta?: number; longitudeDelta?: number }, duration?: number) => void;
  centerOnUser: () => void;
  fitToCoordinates: (coords: { latitude: number; longitude: number }[], options?: any) => void;
}

export interface LeafletMapProps {
  currentPosition: { latitude: number; longitude: number } | null;
  initialRegion?: { latitude: number; longitude: number; zoom?: number };
  tileProvider?: LeafletTileProvider;
  friends?: RealtimeFriend[];
  photos?: PhotoPin[];
  partyGroups?: RealtimePartyGroup[];
  mapChatMessages?: MapChatMessage[];
  todayPoints?: TracePoint[];
  todayRoadRoute?: [number, number][];
  todayRoadSegments?: [number, number][][];
  showRoute?: boolean;
  destination?: { latitude: number; longitude: number; name?: string } | null;
  destinationRoadRoute?: [number, number][];
  routeAlternatives?: [number,number][][];
  selectedRouteIndex?:number;
  trafficSegments?:[number,number][][];
  roadLines?:[number,number][][];
  trafficTileUrl?:string;
  places?:import('../services/mapPlaces').MapPlace[];
  onPlacePress?:(place:import('../services/mapPlaces').MapPlace)=>void;
  onRouteChoice?:(index:number)=>void;
  onViewportChange?:(viewport:{latitude:number;longitude:number;zoom:number})=>void;
  scaleBarTop?:number;
  footprintsFriend?: RealtimeFriend | null;
  scratchHexagons?: [number, number][][];
  onFriendPress?: (friend: RealtimeFriend) => void;
  onMapClick?: (coords: { latitude: number; longitude: number }) => void;
  onMapReady?: () => void;
  onMapGesture?: () => void;
  onMapError?: (message: string | null) => void;
  attributionBottom?: number;
}

const stadiaKey = env.stadiaMapsKey;

const TILE_URLS = {
  stadia_dark: {
    url: stadiaKey
      ? `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${stadiaKey}`
      : 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    maxZoom: 20,
    attr: '&copy; OpenStreetMap contributors',
  },
  carto_dark: {
    url: stadiaKey
      ? `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${stadiaKey}`
      : 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    maxZoom: 20,
    attr: '&copy; OpenStreetMap contributors',
  },
  osm: {
    url: env.osmTileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attr: '&copy; OpenStreetMap contributors',
  },
  stadia_smooth: {
    url: stadiaKey
      ? `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${stadiaKey}`
      : (env.osmTileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
    maxZoom: 20,
    attr: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attr: '&copy; Esri World Imagery',
  },
};

function generateHtml(initialLat: number, initialLng: number, initialZoom: number, tileProv: LeafletTileProvider, attributionBottom: number): string {
  const tileConfig = TILE_URLS[tileProv as keyof typeof TILE_URLS] || TILE_URLS.stadia_dark;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    ${LEAFLET_CSS}
  </style>
  <script>
    ${LEAFLET_JS}
  </script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #020C24; overflow: hidden; }
    #map {
      width: 100%;
      height: 100%;
      background-color: #020C24;
      background-image:
        radial-gradient(circle at 50% 50%, rgba(82, 227, 255, 0.08) 0%, transparent 70%),
        linear-gradient(rgba(82, 227, 255, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(82, 227, 255, 0.05) 1px, transparent 1px);
      background-size: 100% 100%, 36px 36px, 36px 36px;
      overflow: hidden;
    }
    .leaflet-control-attribution { display: block; font-size: 9px; background: rgba(255,255,255,.88); }
    .leaflet-bottom { bottom: ${attributionBottom}px; }
    .leaflet-control-zoom { display: none !important; }

    /* Pulsing user radar marker */
    .user-marker {
      position: relative;
      width: 32px;
      height: 32px;
    }
    .user-pulse {
      position: absolute;
      top: 0; left: 0;
      width: 32px; height: 32px;
      border-radius: 50%;
      background: rgba(0, 255, 204, 0.4);
      animation: radarPulse 2s infinite ease-out;
    }
    .user-dot {
      position: absolute;
      top: 9px; left: 9px;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: #00FFCC;
      border: 2.5px solid #FFFFFF;
      box-shadow: 0 0 10px rgba(0, 255, 204, 0.8);
    }
    @keyframes radarPulse {
      0% { transform: scale(0.6); opacity: 1; }
      100% { transform: scale(2.2); opacity: 0; }
    }

    /* Friend avatar marker */
    .friend-marker {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      transform: translate(-50%, -50%);
    }
    .friend-avatar-wrap {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      border: 2px solid #52E3FF;
      background: #092147;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    }
    .friend-avatar-img {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      object-fit: cover;
    }
    .friend-initials {
      color: #FFF;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px;
      font-weight: 800;
    }
    .friend-status-badge {
      position: absolute;
      bottom: -3px;
      right: -3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #041738;
      border: 1.5px solid #52E3FF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
    }
    .friend-pill {
      background: rgba(3, 17, 48, 0.88);
      border: 1px solid rgba(82, 227, 255, 0.35);
      border-radius: 10px;
      padding: 2px 6px;
      margin-top: 3px;
      display: flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }
    .friend-pill-text {
      color: #FFF;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10px;
      font-weight: 700;
    }

    /* Destination pin */
    .dest-pin {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: #E02020;
      border: 2px solid #FFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      box-shadow: 0 4px 10px rgba(224, 32, 32, 0.6);
      cursor: pointer;
    }

    /* Party badge */
    .party-pin {
      background: #FF0055;
      border: 2px solid #FFF;
      border-radius: 16px;
      padding: 3px 8px;
      color: #FFF;
      font-family: sans-serif;
      font-size: 11px;
      font-weight: 900;
      display: flex;
      align-items: center;
      gap: 3px;
      box-shadow: 0 0 12px rgba(255, 0, 85, 0.8);
      animation: bounceParty 1.5s infinite;
    }
    @keyframes bounceParty {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }

    /* Map Chat bubble */
    .chat-bubble {
      background: rgba(4, 22, 60, 0.92);
      border: 1px solid #52E3FF;
      border-radius: 12px;
      padding: 4px 8px;
      color: #FFF;
      font-family: sans-serif;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
      max-width: 150px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Dwell stop pin */
    .stop-badge {
      background: #FF6BD6;
      border: 1.5px solid #FFF;
      border-radius: 8px;
      padding: 2px 5px;
      color: #FFF;
      font-family: sans-serif;
      font-size: 10px;
      font-weight: 800;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    }

    /* Music Vinyl spinning badge */
    .vinyl-disk {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #111;
      border: 1.5px solid #52E3FF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      animation: spinVinyl 3s linear infinite;
    }
    @keyframes spinVinyl {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <script>
    var map = null;
    var currentTileLayer = null;
    var hasCenteredUser = false;
    var userMarker = null;
    var friendMarkers = {};
    var photoMarkers = {};
    var partyMarkers = [];
    var chatMarkers = [];
    var routePolyline = null;
    var destPolyline = null;var choiceLayers=null,trafficLayers=null,poiLayers=null,scaleControl=null;
    var destMarker = null;
    var footprintsPolyline = null;
    var stopMarkers = [];
    var scratchPolygons = [];

    window.onerror = function(message, source, lineno, colno, error) {
      sendToRN({ type: 'MAP_ERROR', message: String(message) + ' (line ' + lineno + ')' });
    };

    var tileProviders = {
      stadia_dark: {
        url: '${TILE_URLS.stadia_dark.url}',
        subdomains: '',
        maxZoom: 20
      },
      carto_dark: {
        url: '${TILE_URLS.carto_dark.url}',
        subdomains: '',
        maxZoom: 20
      },
      osm: {
        url: '${TILE_URLS.osm.url}',
        subdomains: '',
        maxZoom: 19
      },
      stadia_smooth: {
        url: '${TILE_URLS.stadia_smooth.url}',
        subdomains: '',
        maxZoom: 20
      },
      satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        subdomains: '',
        maxZoom: 19
      }
    };

    function initMap() {
      if (map) return;
      try {
        if (typeof L === 'undefined') {
          sendToRN({ type: 'MAP_ERROR', message: 'Leaflet library missing' });
          return;
        }
        map = L.map('map', {
          center: [${initialLat}, ${initialLng}],
          zoom: ${initialZoom},
          zoomControl: false,
          attributionControl: true
        });

        setTileLayer('${tileProv}');
        map.createPane('choices');map.getPane('choices').style.zIndex=390;
        map.createPane('traffic');map.getPane('traffic').style.zIndex=450;map.getPane('traffic').style.pointerEvents='none';
        choiceLayers=L.layerGroup().addTo(map);trafficLayers=L.layerGroup().addTo(map);poiLayers=L.layerGroup().addTo(map);
        scaleControl=L.control.scale({position:'topleft',imperial:false,maxWidth:85}).addTo(map);
        const report=()=>{const center=map.getCenter();sendToRN({type:'VIEWPORT',latitude:center.lat,longitude:center.lng,zoom:map.getZoom()});};map.on('moveend',report);report();
        map.on('dragstart zoomstart', function(e) { if(e.type==='dragstart'||e.originalEvent) sendToRN({type:'MAP_GESTURE'}); });
        map.getContainer().addEventListener('touchmove',function(){sendToRN({type:'MAP_GESTURE'});},{passive:true});

        map.on('click', function(e) {
          sendToRN({ type: 'MAP_CLICK', latitude: e.latlng.lat, longitude: e.latlng.lng });
        });

        sendToRN({ type: 'MAP_READY' });
      } catch (err) {
        sendToRN({ type: 'MAP_ERROR', message: err ? err.message : 'Map init exception' });
      }
    }

    function setTileLayer(provKey) {
      if (!map) return;
      var cfg = tileProviders[provKey] || tileProviders.carto_dark;
      if (currentTileLayer) {
        map.removeLayer(currentTileLayer);
      }
      var options = {
        maxZoom: cfg.maxZoom,
        attribution: ${JSON.stringify(Object.fromEntries(Object.entries(TILE_URLS).map(([key, value]) => [key, value.attr])))}[provKey] || '&copy; OpenStreetMap contributors',
        errorTileUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="%23020C24"/><path d="M0 0h256v256H0z" fill="none" stroke="%2352E3FF" stroke-width="0.5" stroke-opacity="0.2"/></svg>'
      };
      if (cfg.subdomains) options.subdomains = cfg.subdomains;
      currentTileLayer = L.tileLayer(cfg.url, options).addTo(map);
    }

    function escapeHtml(str) {
      if (str == null) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function escapeAttr(str) {
      return escapeHtml(str);
    }

    window.handleFriendClick = function(el) {
      var fid = el.getAttribute('data-friend-id');
      if (fid) {
        sendToRN({ type: 'SELECT_FRIEND', friendId: fid });
      }
    };

    function sendToRN(payload) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }

    // Camera APIs
    function setView(lat, lng, zoom) {
      if (!map) return;
      map.setView([lat, lng], zoom || map.getZoom(), { animate: true, duration: 0.8 });
    }

    function fitBounds(coords) {
      if (!map || !coords || coords.length === 0) return;
      var latLngs = coords.map(function(c) { return [c.latitude, c.longitude]; });
      map.fitBounds(latLngs, { padding: [50, 50], animate: true });
    }

    // Dynamic Updates
    var trafficTileLayer=null,trafficTileTemplate="";
    function updateMapState(state) {
      if (!map) return;

      choiceLayers.clearLayers();trafficLayers.clearLayers();poiLayers.clearLayers();
      if((state.trafficTileUrl||'')!==trafficTileTemplate){if(trafficTileLayer)map.removeLayer(trafficTileLayer);trafficTileLayer=null;trafficTileTemplate=state.trafficTileUrl||'';if(trafficTileTemplate)trafficTileLayer=L.tileLayer(trafficTileTemplate,{opacity:.85,maxNativeZoom:18,maxZoom:20,attribution:'© TomTom'}).addTo(map);}
      (state.roadLines||[]).forEach(function(line){if(line.length>1)L.polyline(line,{pane:'choices',color:'#C084FC',weight:3,opacity:.55,interactive:false}).addTo(choiceLayers);});
      scaleControl.getContainer().style.marginTop=(state.scaleBarTop||126)+'px';
      (state.routeAlternatives||[]).forEach(function(line,index){if(index===state.selectedRouteIndex||line.length<2)return;L.polyline(line,{pane:'choices',color:'#7187AF',weight:8}).on('click',function(e){L.DomEvent.stopPropagation(e);sendToRN({type:'ROUTE_CHOICE',index:index});}).addTo(choiceLayers);});
      (state.trafficSegments||[]).forEach(function(line){if(line.length>1)L.polyline(line,{pane:'traffic',color:'#EF4444',weight:7,interactive:false}).addTo(trafficLayers);});
      (state.places||[]).slice(0,30).forEach(function(place){const icon=place.kind==='road_report'?'🔴':place.kind==='traffic_sign'?'⚠':place.kind==='street_image'?'📷':place.kind==='dead_end'?'⊥':place.kind==='infrastructure'?'▤':place.kind==='fuel'?'⛽':place.kind==='parking'?'P':place.kind==='charging_station'?'⚡':place.kind==='cafe'?'☕':place.kind==='restaurant'?'🍴':'✚';const div=L.divIcon({className:'poi-icon',html:'<div style="background:white;color:#24324A;border-radius:12px;padding:5px;font:600 11px system-ui;white-space:nowrap">'+icon+' '+escapeHtml(place.displayName.split(',')[0].slice(0,24))+'</div>',iconSize:[100,24],iconAnchor:[50,12]});L.marker([place.latitude,place.longitude],{icon:div}).on('click',function(e){L.DomEvent.stopPropagation(e);sendToRN({type:'POI_CHOICE',id:place.placeId});}).addTo(poiLayers);});
      // 1. Current user marker & auto-center on first position
      if (state.currentPosition) {
        var uLat = state.currentPosition.latitude;
        var uLng = state.currentPosition.longitude;
        if (!hasCenteredUser) {
          hasCenteredUser = true;
          map.setView([uLat, uLng], Math.max(map.getZoom(), 15), { animate: true });
        }
        if (!userMarker) {
          var userIcon = L.divIcon({
            className: 'user-div-icon',
            html: '<div class="user-marker"><div class="user-pulse"></div><div class="user-dot"></div></div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });
          userMarker = L.marker([uLat, uLng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
        } else {
          userMarker.setLatLng([uLat, uLng]);
        }
      }

      // 2. Friends markers
      if (state.friends) {
        var activeIds = {};
        state.friends.forEach(function(f) {
          activeIds[f.id] = true;
          var safeId = escapeAttr(f.id);
          var safeName = escapeHtml(f.displayName || 'Bạn bè');
          var firstInitial = escapeHtml((f.displayName || '?')[0].toUpperCase());
          var safeAvatar = f.avatarUrl ? escapeAttr(f.avatarUrl) : '';
          var safeMusic = f.musicTitle ? escapeAttr(f.musicTitle) : '';
          var safeEmoji = escapeHtml(f.statusEmoji || '📍');
          var batteryHtml = f.batteryLevel != null ? '<span class="friend-pill-text" style="color:#59F3B3;"> ⚡' + Math.round(f.batteryLevel) + '%</span>' : '';

          var iconHtml = '<div class="friend-marker" data-friend-id="' + safeId + '" onclick="window.handleFriendClick(this)">' +
            '<div class="friend-avatar-wrap">' +
              (safeAvatar ? '<img class="friend-avatar-img" src="' + safeAvatar + '" />' : '<span class="friend-initials">' + firstInitial + '</span>') +
              (safeMusic ? '<div class="vinyl-disk" title="' + safeMusic + '">🎵</div>' : '') +
              '<div class="friend-status-badge">' + safeEmoji + '</div>' +
            '</div>' +
            '<div class="friend-pill">' +
              '<span class="friend-pill-text">' + safeName + '</span>' +
              batteryHtml +
            '</div>' +
          '</div>';

          var fIcon = L.divIcon({
            className: 'f-div-icon',
            html: iconHtml,
            iconSize: [80, 70],
            iconAnchor: [40, 35]
          });

          if (friendMarkers[f.id]) {
            friendMarkers[f.id].setLatLng([f.latitude, f.longitude]);
            friendMarkers[f.id].setIcon(fIcon);
          } else {
            friendMarkers[f.id] = L.marker([f.latitude, f.longitude], { icon: fIcon, zIndexOffset: 800 }).addTo(map);
          }
        });

        // Remove old friends
        Object.keys(friendMarkers).forEach(function(fid) {
          if (!activeIds[fid]) {
            map.removeLayer(friendMarkers[fid]);
            delete friendMarkers[fid];
          }
        });
      }

      // 3. Photo memory markers
      if (state.photos) {
        var activePhotoIds = {};
        state.photos.forEach(function(photo) {
          activePhotoIds[photo.id] = true;
          if (photoMarkers[photo.id]) {
            photoMarkers[photo.id].setLatLng([photo.latitude, photo.longitude]);
          } else {
            var photoIcon = L.divIcon({
              className: 'photo-div-icon',
              html: '<div style="width:28px;height:28px;border-radius:14px;background:#9D5CFF;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.45)">📷</div>',
              iconSize: [28, 28],
              iconAnchor: [14, 14]
            });
            photoMarkers[photo.id] = L.marker([photo.latitude, photo.longitude], { icon: photoIcon, zIndexOffset: 650 }).addTo(map);
          }
        });
        Object.keys(photoMarkers).forEach(function(pid) {
          if (!activePhotoIds[pid]) {
            map.removeLayer(photoMarkers[pid]);
            delete photoMarkers[pid];
          }
        });
      }

      // 4. Today tracked route (snapped to real roads)
      if (state.showRoute && state.todayRoadSegments && state.todayRoadSegments.length) {
        var routeCoords = state.todayRoadSegments;
        if (!routePolyline) {
          routePolyline = L.polyline(routeCoords, {
            color: '#00F5D4',
            weight: 5,
            opacity: 0.9,
            lineJoin: 'round',
            lineCap: 'round'
          }).addTo(map);
        } else {
          routePolyline.setLatLngs(routeCoords);
        }
      } else if (routePolyline) {
        map.removeLayer(routePolyline);
        routePolyline = null;
      }

      // 4. Destination & route to destination (following real streets)
      if (state.destination) {
        var dLat = state.destination.latitude;
        var dLng = state.destination.longitude;
        if (!destMarker) {
          var destIcon = L.divIcon({
            className: 'dest-div-icon',
            html: '<div class="dest-pin">🏁</div>',
            iconSize: [34, 34],
            iconAnchor: [17, 17]
          });
          destMarker = L.marker([dLat, dLng], { icon: destIcon, zIndexOffset: 950 }).addTo(map);
        } else {
          destMarker.setLatLng([dLat, dLng]);
        }

        var origin = state.currentPosition || (state.todayPoints && state.todayPoints[0]);
        if (origin && state.destinationRoadRoute && state.destinationRoadRoute.length>1) {
          var destLine = (state.destinationRoadRoute && state.destinationRoadRoute.length > 1)
            ? state.destinationRoadRoute
            : [];
          if (!destPolyline) {
            destPolyline = L.polyline(destLine, {
              color: '#52E3FF',
              weight: 5,
              opacity: 0.95,
              lineJoin: 'round',
              lineCap: 'round'
            }).addTo(map);
          } else {
            destPolyline.setLatLngs(destLine);
          }
        } else if(destPolyline){map.removeLayer(destPolyline);destPolyline=null;}
      } else {
        if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
        if (destPolyline) { map.removeLayer(destPolyline); destPolyline = null; }
      }

      // 5. Footprints of selected friend
      if (state.footprintsFriend && state.footprintsFriend.footprints && state.footprintsFriend.footprints.length > 1) {
        var fpCoords = state.footprintsFriend.footprints.map(function(p) { return [p.latitude, p.longitude]; });
        if (!footprintsPolyline) {
          footprintsPolyline = L.polyline(fpCoords, {
            color: '#FF6BD6',
            weight: 4,
            dashArray: '6, 6',
            opacity: 0.95
          }).addTo(map);
        } else {
          footprintsPolyline.setLatLngs(fpCoords);
        }

        // Stops
        stopMarkers.forEach(function(m) { map.removeLayer(m); });
        stopMarkers = [];
        state.footprintsFriend.footprints.forEach(function(fp) {
          if (fp.dwellMinutes && fp.dwellMinutes > 0) {
            var timeStr = fp.dwellMinutes >= 60 ? Math.round(fp.dwellMinutes / 60) + 'h' : fp.dwellMinutes + 'p';
            var sIcon = L.divIcon({
              className: 's-div-icon',
              html: '<div class="stop-badge">⏱ ' + timeStr + '</div>',
              iconSize: [46, 20],
              iconAnchor: [23, 10]
            });
            var sm = L.marker([fp.latitude, fp.longitude], { icon: sIcon, zIndexOffset: 850 }).addTo(map);
            stopMarkers.push(sm);
          }
        });
      } else {
        if (footprintsPolyline) { map.removeLayer(footprintsPolyline); footprintsPolyline = null; }
        stopMarkers.forEach(function(m) { map.removeLayer(m); });
        stopMarkers = [];
      }

      // 6. Party groups
      partyMarkers.forEach(function(m) { map.removeLayer(m); });
      partyMarkers = [];
      if (state.partyGroups) {
        state.partyGroups.forEach(function(g) {
          var pIcon = L.divIcon({
            className: 'p-div-icon',
            html: '<div class="party-pin">🔥 Party (' + g.memberCount + ')</div>',
            iconSize: [90, 26],
            iconAnchor: [45, 13]
          });
          var pm = L.marker([g.latitude, g.longitude], { icon: pIcon, zIndexOffset: 900 }).addTo(map);
          partyMarkers.push(pm);
        });
      }

      // 7. Map chat messages
      chatMarkers.forEach(function(m) { map.removeLayer(m); });
      chatMarkers = [];
      if (state.mapChatMessages) {
        state.mapChatMessages.forEach(function(msg) {
          var safeEmoji = escapeHtml(msg.emoji || '💬');
          var safeMsg = escapeHtml(msg.message || '');
          var cIcon = L.divIcon({
            className: 'c-div-icon',
            html: '<div class="chat-bubble"><span>' + safeEmoji + '</span><span>' + safeMsg + '</span></div>',
            iconSize: [140, 28],
            iconAnchor: [70, 14]
          });
          var cm = L.marker([msg.latitude, msg.longitude], { icon: cIcon, zIndexOffset: 820 }).addTo(map);
          chatMarkers.push(cm);
        });
      }

      // 8. Scratch hexagons
      if (scratchPolygons) {
        scratchPolygons.forEach(function(p) { map.removeLayer(p); });
        scratchPolygons = [];
      }
      if (state.scratchHexagons && state.scratchHexagons.length) {
        scratchPolygons = [];
        state.scratchHexagons.forEach(function(poly) {
          var h = L.polygon(poly, {
            color: '#00F5D4',
            weight: 1.5,
            fillColor: '#00BBF9',
            fillOpacity: 0.28
          }).addTo(map);
          scratchPolygons.push(h);
        });
      }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(initMap, 0);
    } else {
      window.addEventListener('DOMContentLoaded', initMap);
      window.addEventListener('load', initMap);
    }
  </script>
</body>
</html>`;
}

export const LeafletMap = forwardRef<LeafletMapRef, LeafletMapProps>(function LeafletMap(
  {
    currentPosition,
    initialRegion,
    tileProvider = 'stadia_dark',
    attributionBottom = 6,
    friends = [],
    photos = [],
    partyGroups = [],
    mapChatMessages = [],
    todayPoints = [],
    todayRoadRoute,
    todayRoadSegments,
    showRoute = true,
    destination = null,
    destinationRoadRoute,
    routeAlternatives=[],selectedRouteIndex=0,trafficSegments=[],roadLines=[],trafficTileUrl='',places=[],onPlacePress,onRouteChoice,onViewportChange,scaleBarTop=126,
    footprintsFriend = null,
    scratchHexagons,
    onFriendPress,
    onMapClick,
    onMapReady,
    onMapGesture,
  },
  ref
) {
  const webViewRef = useRef<any>(null);
  const isReadyRef = useRef(false);
  const WebViewComponent = WebView as any;

  const initialLat = initialRegion?.latitude ?? currentPosition?.latitude ?? 21.028511;
  const initialLng = initialRegion?.longitude ?? currentPosition?.longitude ?? 105.854167;
  const initialZoom = initialRegion?.zoom ?? 14;

  const htmlSource = useMemo(
    () => ({
      html: generateHtml(initialLat, initialLng, initialZoom, tileProvider, attributionBottom),
      baseUrl: 'https://tiles.stadiamaps.com',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const syncState = useCallback(() => {
    if (!isReadyRef.current || !webViewRef.current) return;
    const statePayload = {
      currentPosition,
      friends,
      photos,
      partyGroups,
      mapChatMessages,
      todayPoints,
      todayRoadSegments: todayRoadSegments ?? (todayRoadRoute ? [todayRoadRoute] : rawTraveledSegments(todayPoints)),
      showRoute,
      destination,
      destinationRoadRoute,
      routeAlternatives,selectedRouteIndex,trafficSegments,roadLines,trafficTileUrl,places,scaleBarTop,
      footprintsFriend,
      scratchHexagons,
    };
    const js = `if (typeof updateMapState === 'function') { updateMapState(${JSON.stringify(statePayload)}); } true;`;
    webViewRef.current.injectJavaScript(js);
  }, [currentPosition, friends, photos, partyGroups, mapChatMessages, todayPoints, todayRoadRoute, todayRoadSegments, showRoute, destination, destinationRoadRoute, routeAlternatives,selectedRouteIndex,trafficSegments,roadLines,trafficTileUrl,places,scaleBarTop,footprintsFriend, scratchHexagons]);

  // Sync state whenever props change
  useEffect(() => {
    syncState();
  }, [syncState]);

  // Switch tile layer dynamically
  useEffect(() => {
    if (isReadyRef.current && webViewRef.current) {
      const js = `if (typeof setTileLayer === 'function') { setTileLayer('${tileProvider}'); } true;`;
      webViewRef.current.injectJavaScript(js);
    }
  }, [tileProvider]);

  useImperativeHandle(ref, () => ({
    animateToRegion: ({ latitude, longitude, zoom, latitudeDelta }: { latitude: number; longitude: number; zoom?: number; latitudeDelta?: number; longitudeDelta?: number }) => {
      let finalZoom = zoom;
      if (!finalZoom && latitudeDelta) {
        finalZoom = Math.min(18, Math.max(3, Math.round(Math.log(360 / latitudeDelta) / Math.LN2)));
      }
      if (webViewRef.current) {
        const js = `if (typeof setView === 'function') { setView(${latitude}, ${longitude}, ${finalZoom || 15}); } true;`;
        webViewRef.current.injectJavaScript(js);
      }
    },
    centerOnUser: () => {
      if (currentPosition && webViewRef.current) {
        const js = `if (typeof setView === 'function') { setView(${currentPosition.latitude}, ${currentPosition.longitude}, 16); } true;`;
        webViewRef.current.injectJavaScript(js);
      }
    },
    fitToCoordinates: coords => {
      if (webViewRef.current && coords.length > 0) {
        const js = `if (typeof fitBounds === 'function') { fitBounds(${JSON.stringify(coords)}); } true;`;
        webViewRef.current.injectJavaScript(js);
      }
    },
  }));

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'MAP_READY') {
          isReadyRef.current = true;
          onMapReady?.();
          syncState();
        } else if (data.type === 'MAP_ERROR') {
          console.warn('[LeafletMap]', data.message);
        } else if (data.type === 'SELECT_FRIEND') {
          const found = friends.find(f => f.id === data.friendId);
          if (found && onFriendPress) {
            onFriendPress(found);
          }
         } else if(data.type==='VIEWPORT'&&Number.isFinite(data.latitude)&&Number.isFinite(data.longitude)&&Number.isFinite(data.zoom)){onViewportChange?.({latitude:data.latitude,longitude:data.longitude,zoom:data.zoom});
        } else if(data.type==='ROUTE_CHOICE'&&Number.isInteger(data.index)&&data.index>=0&&data.index<routeAlternatives.length){onRouteChoice?.(data.index);
        } else if(data.type==='POI_CHOICE'){const place=places.find(place=>place.placeId===data.id);if(place)onPlacePress?.(place);
        } else if (data.type === 'MAP_GESTURE') {
          onMapGesture?.();
        } else if (data.type === 'MAP_CLICK') {
          onMapClick?.({ latitude: data.latitude, longitude: data.longitude });
        }
      } catch (err) {
        // ignore parse error
      }
    },
    [friends, onFriendPress, onMapClick, onMapReady, onMapGesture, syncState,routeAlternatives,places,onRouteChoice,onPlacePress,onViewportChange]
  );

  return (
    <View style={styles.container}>
      <WebViewComponent
        ref={webViewRef}
        originWhitelist={['*']}
        source={htmlSource}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        mixedContentMode="always"
        onMessage={handleMessage}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#52E3FF" />
          </View>
        )}
        startInLoadingState
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#020C24',
  },
  webview: {
    flex: 1,
    backgroundColor: '#020C24',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020C24',
  },
});
