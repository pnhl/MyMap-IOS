import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassSurface, type IconName } from './glass';
import { Text } from './Text';
import { useAppTheme } from './theme';
import { weatherLabel, type WeatherSnapshot } from '../services/weather';

export function WeatherCard({ weather, place = 'Tại vị trí đã lưu', unavailable = 'Chưa có dữ liệu thời tiết' }: { weather: WeatherSnapshot|null; place?: string; unavailable?: string }) {
  const { theme } = useAppTheme();
  const c = weather?.current; const code = c?.weather_code;
  const icon: IconName = code === 0 ? 'weather-sunny' : code != null && code >= 95 ? 'weather-lightning-rainy' : code != null && code >= 71 && code <= 86 ? 'weather-snowy' : code != null && code >= 51 ? 'weather-rainy' : 'weather-partly-cloudy';
  const number = (n: number|undefined, suffix: string) => typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n)}${suffix}` : '—';
  return <GlassSurface style={s.card}>
    <Text numberOfLines={2} style={[s.place, { color: theme.colors.muted }]}>{place}</Text>
    <View style={s.weather}><Text style={s.temperature}>{number(c?.temperature_2m, '°')}</Text>
      <View style={s.copy}><Text style={s.description}>{weather ? weatherLabel(code) : unavailable}</Text>{weather && <Text style={[s.detail, { color: theme.colors.muted }]}>Cảm giác như {number(c?.apparent_temperature, '°')}</Text>}</View>
      <MaterialCommunityIcons name={weather ? icon : 'weather-cloudy-alert'} size={38} color={weather ? '#DDC88F' : theme.colors.faint} />
    </View>
    {weather && <View style={[s.details, { borderTopColor: theme.colors.border }]}>
      <View style={s.line}><MaterialCommunityIcons name="water-outline" size={16} color={theme.colors.muted} /><Text style={[s.detail, { color: theme.colors.muted }]}>Độ ẩm {number(c?.relative_humidity_2m, '%')}</Text></View>
      <View style={s.line}><MaterialCommunityIcons name="weather-windy" size={16} color={theme.colors.muted} /><Text style={[s.detail, { color: theme.colors.muted }]}>Gió {number(c?.wind_speed_10m, ' km/h')}</Text></View>
    </View>}
  </GlassSurface>;
}
const s = StyleSheet.create({
  card: { padding: 18, gap: 8 },
  place: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  weather: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  copy: { flex: 1, gap: 4 },
  temperature: { fontSize: 42, lineHeight: 50, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  description: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  detail: { fontSize: 12, lineHeight: 18 },
  details: { borderTopWidth: 1, paddingTop: 10, marginTop: 3, flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
