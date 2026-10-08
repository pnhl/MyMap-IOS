import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { View, Switch } from 'react-native';
import { Text } from '../ui/Text';
import { GlassSurface } from '../ui/glass';
import { useAppTheme } from '../ui/theme';
import { env } from '../config/env';
import { MAP_FEATURES, getMapFeatureSnapshot, subscribeMapFeatures, initializeMapFeatures, setMapFeature, type MapFeature } from '../services/mapFeaturePreferences';
export function useMapFeatures() {
  const preferences = useSyncExternalStore(subscribeMapFeatures, getMapFeatureSnapshot, getMapFeatureSnapshot);
  useEffect(() => { void initializeMapFeatures(); }, []);
  return preferences;
}
export function MapFeatureSettings() {
  const preferences = useMapFeatures(), { theme } = useAppTheme();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <GlassSurface style={{ padding: 17, gap: 8 }}>
    <Text style={{ fontSize: 20, fontWeight: '800' }}>Bản đồ mở rộng</Text>
    <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Mặc định tắt. Chỉ tải dữ liệu cho những lớp bạn bật.</Text>
    {(Object.keys(MAP_FEATURES) as MapFeature[]).map(key => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1 }}><Text style={{ fontWeight: '700' }}>{MAP_FEATURES[key][0]}</Text><Text style={{ color: theme.colors.muted, fontSize: 12, lineHeight: 18 }}>{MAP_FEATURES[key][1]}</Text></View>
      <Switch accessibilityLabel={MAP_FEATURES[key][0]} value={preferences[key]} disabled={busy} onValueChange={value => { setBusy(true); setError(''); void setMapFeature(key, value).catch(() => setError('Chưa lưu được lựa chọn. Hãy thử lại.')).finally(() => setBusy(false)); }} />
    </View>)}
    {!env.mapillaryToken && <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Ảnh, lịch sử và phân tích Mapillary chưa sẵn sàng trên bản này. Biển báo OSM vẫn sử dụng được.</Text>}
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
  </GlassSurface>;
}
