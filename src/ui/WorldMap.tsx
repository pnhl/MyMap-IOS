import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { glassColors } from './glass';
import { Text } from './Text';

export type MapObservation = { id: string|number; latitude: number; longitude: number; count?: number; uri?: string; label?: string };
export function WorldMap({ observations = [], onPress, emptyLabel, height }: { observations?: MapObservation[]; onPress?: (point: MapObservation) => void; emptyLabel?: string; height?: number }) {
  // Same equirectangular projection as assets/design/world-map.png. No synthetic activity.
  const cells = useMemo(() => observations.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && p.latitude >= -85 && p.latitude <= 85 && p.longitude >= -180 && p.longitude <= 180), [observations]);
  const maximum = Math.max(1,...cells.map(p => p.count || 1));
  return <View accessibilityLabel="Bản đồ tổng quan thế giới" style={[s.map, height ? { height } : { aspectRatio: 1800/850 }]}>
    <Image source={require('../../assets/design/world-map.png')} resizeMode="stretch" style={[StyleSheet.absoluteFill,{width:"100%",height:"100%"}]} />
    {cells.map(p => {
      const intensity = (p.count || 1) / maximum;
      const color = p.count ? intensity > .7 ? '#FF636B' : intensity > .35 ? '#FFD85D' : '#49EFCB' : glassColors.cyan;
      return <Pressable key={p.id} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={p.label || `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}${p.count ? ` · ${p.count} điểm GPS` : ''}`} onPress={onPress ? () => onPress(p) : undefined} style={[s.point,{ left: `${(p.longitude+180)/360*100}%`, top: `${(85-p.latitude)/170*100}%`, backgroundColor: color, boxShadow: `0 0 12px ${color}`, width: p.uri ? 34 : 8+intensity*8, height: p.uri ? 34 : 8+intensity*8 }]}>
        {p.uri && <Image source={{ uri: p.uri }} style={s.photo} />}
      </Pressable>;
    })}
    {!cells.length && emptyLabel && <View pointerEvents="none" style={s.empty}><Text style={s.emptyText}>{emptyLabel}</Text></View>}
    <View pointerEvents="none" style={s.source}><Text style={s.sourceText}>Natural Earth · Bản đồ tổng quan</Text></View>
  </View>;
}
const s = StyleSheet.create({ map: { width: '100%', overflow: 'hidden', backgroundColor: '#031333' }, point: { position: 'absolute', borderRadius: 20, transform: [{ translateX: -8 },{ translateY: -8 }], borderWidth: 1, borderColor: '#D3FCFF', overflow: 'hidden', minWidth: 8, minHeight: 8 }, photo: { width: '100%', height: '100%', borderRadius: 16 }, empty: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 30 }, emptyText: { color: '#C2E3FF', fontSize: 13, textAlign: 'center', padding: 12, borderRadius: 14, backgroundColor: 'rgba(3,17,51,.85)' }, source: { position: 'absolute', bottom: 5, left: 8 }, sourceText: { color: '#88B9DE', fontSize: 9 } });
