import React, { useRef, useImperativeHandle, forwardRef, useEffect, useCallback, useState } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { LEAFLET_CSS, LEAFLET_JS, LEAFLET_HEAT_JS } from './leafletBundle';
import { env } from '../config/env';

const stadiaKey = env.stadiaMapsKey;
const HEATMAP_TILE_URL = stadiaKey
  ? `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${stadiaKey}`
  : 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

export interface LeafletHeatmapRef {
  animateToRegion: (coords: { latitude: number; longitude: number; zoom?: number; latitudeDelta?: number; longitudeDelta?: number }) => void;
  fitBounds: (coords?: { latitude: number; longitude: number }[]) => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

export interface HeatmapObservation {
  id: string | number;
  latitude: number;
  longitude: number;
  count?: number;
  label?: string;
}

interface Props {
  observations: HeatmapObservation[];
  maxCount?: number;
  onMapReady?: () => void;
  autoFit?: boolean;
  hexagons?: [number, number][][];
}

function generateHeatmapHtml(): string {
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
  <script>
    ${LEAFLET_HEAT_JS}
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
    .leaflet-control-zoom { display: none !important; }
    .leaflet-control-attribution {font:9px sans-serif;background:#10253bcc;color:#cbd5e1;}

    /* Modern Glassmorphic Popups */
    .leaflet-popup-content-wrapper {
      background: rgba(4, 22, 58, 0.92) !important;
      border: 1px solid rgba(82, 227, 255, 0.45) !important;
      border-radius: 14px !important;
      color: #fff !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7) !important;
      padding: 2px !important;
    }
    .leaflet-popup-content {
      margin: 8px 12px !important;
      line-height: 1.4 !important;
    }
    .leaflet-popup-tip {
      background: rgba(4, 22, 58, 0.92) !important;
    }
    .leaflet-popup-close-button {
      color: #8EB8E5 !important;
      padding: 6px 8px 0 0 !important;
    }

    /* Pulse dot styling */
    .pulse-dot {
      border-radius: 50%;
      box-shadow: 0 0 14px rgba(0, 255, 204, 0.9);
      animation: neonPulse 2.5s infinite ease-in-out;
    }
    @keyframes neonPulse {
      0% { opacity: 0.85; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.15); }
      100% { opacity: 0.85; transform: scale(1); }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map;
    var heatLayer = null;
    var markers = [];
    var hexLayers = [];
    var currentObs = [];
    var currentMax = 1;

    function escapeHtml(str) {
      if (str == null) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function initMap() {
      if(map)return;
      try {
        map = L.map('map', {
          center: [20, 0],
          zoom: 2,
          minZoom: 1,
          maxZoom: 18,
          zoomControl: false,
          attributionControl: true,
          worldCopyJump: true
        });

        L.tileLayer('${HEATMAP_TILE_URL}', {
          maxZoom: 20,
          attribution: '&copy; OpenStreetMap contributors &copy; '+${JSON.stringify(stadiaKey?'Stadia Maps':'CARTO')}
        }).addTo(map);

        // Notify React Native that Leaflet map is fully ready
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
        }
      } catch (err) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', error: String(err) }));
        }
      }
    }

    function renderObservations(obs, maxVal, autoFit, hexagons) {
      if (!map) return;
      currentObs = obs || [];
      currentMax = maxVal || 1;

      // 1. Remove previous markers, heat layers and hexagon layers
      if (heatLayer) {
        map.removeLayer(heatLayer);
        heatLayer = null;
      }
      markers.forEach(function(m) { map.removeLayer(m); });
      markers = [];
      hexLayers.forEach(function(h) { map.removeLayer(h); });
      hexLayers = [];

      // Render scratch hexagons if provided
      if (hexagons && hexagons.length) {
        hexagons.forEach(function(poly) {
          var h = L.polygon(poly, {
            color: '#00F5D4',
            weight: 1.5,
            fillColor: '#00BBF9',
            fillOpacity: 0.28
          }).addTo(map);
          hexLayers.push(h);
        });
      }

      if (!currentObs.length && (!hexagons || !hexagons.length)) return;

      // 2. Build heat density points for leaflet-heat
      var heatPoints = currentObs.map(function(o) {
        var ratio = (o.count || 1) / currentMax;
        var intensity = Math.max(0.4, Math.min(1.0, 0.35 + ratio * 0.7));
        return [o.latitude, o.longitude, intensity];
      });

      if (typeof L.heatLayer === 'function' && heatPoints.length) {
        try {
          heatLayer = L.heatLayer(heatPoints, {
            radius: 30,
            blur: 18,
            maxZoom: 14,
            max: 1.0,
            gradient: {
              0.15: '#00F5D4',
              0.35: '#00BBF9',
              0.55: '#FEE440',
              0.75: '#F15BB5',
              1.0: '#FF0054'
            }
          }).addTo(map);
        } catch (e) {}
      }

      // 3. Render glowing circle markers for distinct crisp interaction at all zoom levels
      currentObs.forEach(function(o) {
        var ratio = (o.count || 1) / currentMax;
        var r = Math.max(7, Math.min(22, 6 + Math.sqrt(ratio) * 15));
        var fillColor = ratio > 0.65 ? '#FF2A6D' : ratio > 0.3 ? '#FFE043' : '#05D5FF';
        var strokeColor = ratio > 0.65 ? '#FFB2C8' : ratio > 0.3 ? '#FFF099' : '#A6EFFF';

        var circle = L.circleMarker([o.latitude, o.longitude], {
          radius: r,
          fillColor: fillColor,
          fillOpacity: 0.82,
          color: strokeColor,
          weight: 1.5
        }).addTo(map);

        var title = escapeHtml(o.label || 'Khu vực khám phá');
        var count = o.count || 1;
        var latStr = Number(o.latitude).toFixed(4);
        var lngStr = Number(o.longitude).toFixed(4);

        var popupHtml = '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;min-width:130px;">' +
          '<div style="font-weight:800;color:#52E3FF;font-size:12px;margin-bottom:3px;">' + title + '</div>' +
          '<div style="color:#FFF;font-size:11px;">Hoạt động: <strong>' + count + ' điểm GPS</strong></div>' +
          '<div style="color:#8EB8E5;font-size:9.5px;margin-top:2px;">' + latStr + ', ' + lngStr + '</div>' +
        '</div>';
        circle.bindPopup(popupHtml);
        markers.push(circle);
      });

      // 4. Auto fit bounds if requested
      if (autoFit && (currentObs.length > 0 || (hexagons && hexagons.length > 0))) {
        fitBoundsToData();
      }
    }

    function fitBoundsToData() {
      if (!map) return;
      var latLngs = currentObs.map(function(o) { return [o.latitude, o.longitude]; });
      if (hexLayers.length) {
        hexLayers.forEach(function(h) {
          latLngs = latLngs.concat(h.getLatLngs()[0]);
        });
      }
      if (!latLngs.length) return;
      var bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 12 });
    }

    function setView(lat, lng, zoom) {
      if (map) {
        map.setView([lat, lng], zoom || 16, { animate: true, duration: 0.8 });
        if(!window.userPositionMarker)window.userPositionMarker=L.circleMarker([lat,lng],{radius:7,color:'#fff',weight:3,fillColor:'#4464f6',fillOpacity:1}).addTo(map);
        else window.userPositionMarker.setLatLng([lat,lng]);
      }
    }

    function zoomMap(delta) {
      if (map) map.setZoom(map.getZoom() + delta);
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

const HTML_SOURCE = { html: generateHeatmapHtml(), baseUrl: 'https://tiles.stadiamaps.com' };

export const LeafletHeatmap = forwardRef<LeafletHeatmapRef, Props>(function LeafletHeatmap(
  { observations, maxCount = 1, onMapReady, autoFit = false, hexagons },
  ref
) {
  const webViewRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const isReadyRef = useRef(false);
  const pendingView = useRef<{latitude:number;longitude:number;zoom:number}|null>(null);
  const latestDataRef = useRef({ observations, maxCount, autoFit, hexagons });
  latestDataRef.current = { observations, maxCount, autoFit, hexagons };

  const sendData = useCallback((obs: HeatmapObservation[], max: number, fit: boolean, hexs?: [number, number][][]) => {
    if (!webViewRef.current || !isReadyRef.current) return;
    const jsonObs = JSON.stringify(obs || []);
    const jsonHex = JSON.stringify(hexs || []);
    const js = `if (typeof renderObservations === 'function') { renderObservations(${jsonObs}, ${max || 1}, ${fit}, ${jsonHex}); } true;`;
    webViewRef.current.injectJavaScript(js);
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapReady') {
        isReadyRef.current = true;
        setIsReady(true);
        if (onMapReady) onMapReady();
        const cur = latestDataRef.current;
        sendData(cur.observations, cur.maxCount, cur.autoFit, cur.hexagons);
        if(pendingView.current){const p=pendingView.current;webViewRef.current?.injectJavaScript(`setView(${p.latitude},${p.longitude},${p.zoom});true;`);pendingView.current=null;}
      }
    } catch {}
  }, [onMapReady, sendData]);

  useEffect(() => {
    if (isReady) {
      sendData(observations, maxCount, autoFit, hexagons);
    }
  }, [observations, maxCount, autoFit, hexagons, isReady, sendData]);

  useImperativeHandle(ref, () => ({
    animateToRegion: ({ latitude, longitude, zoom, latitudeDelta }) => {
      let targetZoom = zoom || 8;
      if (!zoom && latitudeDelta) {
        targetZoom = Math.min(16, Math.max(3, Math.round(Math.log(360 / latitudeDelta) / Math.LN2)));
      }
      if (webViewRef.current && isReadyRef.current) {
        const js = `if (typeof setView === 'function') { setView(${latitude}, ${longitude}, ${targetZoom}); } true;`;
        webViewRef.current.injectJavaScript(js);
      } else pendingView.current={latitude,longitude,zoom:targetZoom};
    },
    fitBounds: (coords) => {
      if (webViewRef.current && isReadyRef.current) {
        if (coords && coords.length) {
          const latLngs = JSON.stringify(coords.map(c => [c.latitude, c.longitude]));
          const js = `if (map) { map.fitBounds(${latLngs}, { padding: [35, 35], maxZoom: 12 }); } true;`;
          webViewRef.current.injectJavaScript(js);
        } else {
          const js = `if (typeof fitBoundsToData === 'function') { fitBoundsToData(); } true;`;
          webViewRef.current.injectJavaScript(js);
        }
      }
    },
    zoomIn: () => {
      if (webViewRef.current && isReadyRef.current) {
        webViewRef.current.injectJavaScript(`if (typeof zoomMap === 'function') { zoomMap(1); } true;`);
      }
    },
    zoomOut: () => {
      if (webViewRef.current && isReadyRef.current) {
        webViewRef.current.injectJavaScript(`if (typeof zoomMap === 'function') { zoomMap(-1); } true;`);
      }
    },
  }));

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={HTML_SOURCE}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        scrollEnabled={false}
      />
      {!isReady && (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#48E3FF" />
        </View>
      )}
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
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2,12,36,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
