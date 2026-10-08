import React, { forwardRef } from 'react';
import { LeafletMap, type LeafletMapProps, type LeafletMapRef } from './LeafletMap';
import { MapLibreNativeMap } from './MapLibreNativeMap';
import { WebMapEngine } from './WebMapEngine';
import { isOpenMapProvider } from '../config/mapProviders';

export type MapRendererEngine = 'maplibre_native' | 'leaflet' | 'maplibre_gl' | 'openlayers' | 'cesium';
export type MapRendererRef = LeafletMapRef;

export const MAP_RENDERER_LABELS: Record<MapRendererEngine, string> = {
  maplibre_native: 'MapLibre Native 3D',
  leaflet: 'Leaflet ổn định',
  maplibre_gl: 'MapLibre GL JS 3D',
  openlayers: 'OpenLayers',
  cesium: 'CesiumJS Globe 3D',
};

export const MAP_RENDERER_ENGINES = Object.keys(MAP_RENDERER_LABELS) as MapRendererEngine[];

export function isMapRendererEngine(value: string | null): value is MapRendererEngine {
  return Boolean(value && Object.hasOwn(MAP_RENDERER_LABELS, value));
}

type Props = LeafletMapProps & { engine: MapRendererEngine };

export const MapRenderer = forwardRef<MapRendererRef, Props>(function MapRenderer({ engine, ...props }, ref) {
  // Vector styles need MapLibre; don't silently replace the selected provider with raster tiles.
  if (isOpenMapProvider(props.tileProvider || '') && engine !== 'maplibre_gl') return <MapLibreNativeMap ref={ref} {...props} />;
  if (engine === 'maplibre_native') return <MapLibreNativeMap ref={ref} {...props} />;
  if (engine === 'leaflet') return <LeafletMap ref={ref} {...props} />;
  return <WebMapEngine ref={ref} engine={engine} {...props} />;
});
