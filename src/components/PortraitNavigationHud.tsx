import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from '../ui/Text';
import type { IconName } from '../ui/glass';
import type { NavigationHudProps } from './NavigationHud';
import { weatherLabel, type WeatherSnapshot } from '../services/weather';
import { formatNavigationDistance } from '../utils/navigation';
import {LaneGuidance} from './LaneGuidance';

type Props = NavigationHudProps & { maneuverIcon: IconName };

function Forecast({ label, weather }: { label: string; weather: WeatherSnapshot | null }) {
  const temperature = weather?.current?.temperature_2m;
  const rain = weather?.daily?.precipitation_probability_max?.[0];
  return <View style={s.forecast}>
    <MaterialCommunityIcons name={rain != null && rain >= 45 ? 'weather-rainy' : 'weather-partly-cloudy'} size={24} color="#8AD9E8" />
    <View style={s.flex}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{temperature == null ? 'Đang tải…' : `${Math.round(temperature)}° · ${weatherLabel(weather?.current?.weather_code)}`}</Text>
      {rain != null && <Text style={s.muted}>mưa {rain}%</Text>}
    </View>
  </View>;
}

export function PortraitNavigationHud(props: Props) {
  const { height } = useWindowDimensions();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [topHeight, setTopHeight] = useState(190);
  const [bottomHeight, setBottomHeight] = useState(138);
  const speedOver = props.speedKmh != null && props.speedLimitKmh != null && props.speedKmh > props.speedLimitKmh;
  const temperature = props.aheadWeather?.current?.temperature_2m;
  const rain = props.aheadWeather?.daily?.precipitation_probability_max?.[0];
  const aheadLabel = props.aheadDistanceMeters >= 4_900 ? 'Phía trước 5 km' : 'Gần điểm đến';
  const weatherSummary = temperature == null ? 'Đang tải…' : `${Math.round(temperature)}°${rain == null ? '' : ` · mưa ${rain}%`}`;
  // Expanded details scroll inside the remaining space instead of covering the next turn.
  const detailHeight = Math.max(64, Math.min(270, height - props.top - topHeight - props.bottom - bottomHeight - 24));
  const arrival = props.etaMinutes == null ? null : new Date(Date.now() + props.etaMinutes * 60_000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const speedNote = props.speedSource === 'osm' ? 'Dữ liệu biển báo OSM' : props.speedLimitKmh == null ? 'Chưa xác định · xem biển báo' : 'Ước tính · ưu tiên biển báo thực tế';

  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <View style={[s.topStack, { top: props.top }]} onLayout={event => {
      const measured = Math.ceil(event.nativeEvent.layout.height);
      setTopHeight(measured);
      props.onTopHeightChange?.(measured);
    }}>
      <View style={s.turnCard}>
        <View style={s.destinationRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={17} color="#A6BDCA" />
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={s.destination}>{props.destinationName}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={{motorbike:'Xe máy',car:'Ô tô',foot:'Đi bộ',bike:'Xe đạp'}[props.travelMode]} onPress={props.onToggleTravelMode} style={({ pressed }) => [s.iconButton, pressed && s.pressed]}>
            <MaterialCommunityIcons name={props.travelMode==='foot'?'walk':props.travelMode==='bike'?'bike':props.travelMode === 'motorbike' ? 'motorbike' : 'car'} size={21} color="#A1E3EB" />
          </Pressable>
        </View>
        <View style={s.turnRow}>
          <View style={s.directionTile}><MaterialCommunityIcons name={props.maneuverIcon} size={36} color="#FFFFFF" /></View>
          <View style={s.flex}>
            <Text maxFontSizeMultiplier={1.3} style={s.turnDistance}>{formatNavigationDistance(props.guidance?.distanceMeters)}</Text>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={s.instruction}>{props.guidance?.instruction || 'Đang nhận dữ liệu lối rẽ…'}</Text>
            <LaneGuidance lanes={props.guidance?.lanes}/>
          </View>
        </View>
        {!!props.guidance?.followingInstruction && <View style={s.followingRow}>
          <MaterialCommunityIcons name="subdirectory-arrow-right" size={15} color="#9DB6C7" />
          <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={s.following}>Sau đó · {props.guidance.followingInstruction}</Text>
        </View>}
        {!!props.voiceNotice&&<Text style={{fontSize:11,color:'#FFD18A',marginTop:8}}>{props.voiceNotice}</Text>}
      </View>
      <View style={s.quickRow}>
        {!!props.onRecenter&&<Pressable accessibilityRole="button" accessibilityLabel="Về giữa và bám vị trí" onPress={props.onRecenter} style={{minWidth:48,minHeight:48,paddingHorizontal:12,borderRadius:24,backgroundColor:'#FFFFFF',flexDirection:'row',alignItems:'center',gap:6}}><MaterialCommunityIcons name="crosshairs-gps" size={22} color="#4464F6"/>{!props.following&&<Text style={{color:'#263659',fontWeight:'700'}}>Về giữa</Text>}</Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="Thời tiết hành trình" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen(open => !open)} style={({ pressed }) => [s.weatherButton, pressed && s.pressed]}>
          <MaterialCommunityIcons name={rain != null && rain >= 45 ? 'weather-rainy' : 'weather-partly-cloudy'} size={21} color="#8AD9E8" />
          <View style={s.flex}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={s.weatherLabel}>{aheadLabel}</Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={s.weatherValue}>{weatherSummary}</Text>
          </View>
          <MaterialCommunityIcons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#A6BDCA" />
        </Pressable>
        {!!props.musicStationName && <Pressable accessibilityRole="button" accessibilityLabel={props.musicPlaying ? 'Tạm dừng nhạc' : 'Phát nhạc'} onPress={props.onToggleMusic} style={({ pressed }) => [s.radioButton, props.musicPlaying && s.radioActive, pressed && s.pressed]}>
          <MaterialCommunityIcons name={props.musicPlaying ? 'pause' : 'play'} size={20} color="#D9F5F6" />
        </Pressable>}
        {!!props.onSos && <Pressable accessibilityRole="button" accessibilityLabel="Khẩn cấp SOS" onPress={props.onSos} style={({ pressed }) => [s.sosButton, pressed && s.pressed]}><MaterialCommunityIcons name="alert-octagon" size={21} color="#CC4B69" /></Pressable>}
      </View>
    </View>

    <View style={[s.tripCard, { bottom: props.bottom }]} onLayout={event => {
      if (!detailsOpen) {
        const measured = Math.ceil(event.nativeEvent.layout.height);
        setBottomHeight(measured);
        props.onBottomHeightChange?.(measured);
      }
    }}>
      <View style={s.tripRow}>
        <View style={s.etaColumn}>
          <View style={s.numberRow}><Text maxFontSizeMultiplier={1.3} style={s.eta}>{props.etaMinutes ?? '—'}</Text><Text maxFontSizeMultiplier={1.2} style={s.unit}>phút</Text></View>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={s.muted}>{arrival || 'Đang tính lộ trình đường bộ…'}</Text>
        </View>
        <View style={s.distanceColumn}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={s.remaining}>{props.remainingDistanceText ? `${props.remainingDistanceText} km` : '— km'}</Text>
          <Text maxFontSizeMultiplier={1.2} style={s.muted}>Còn lại</Text>
        </View>
        {!!props.onShareTrip && <Pressable accessibilityRole="button" accessibilityLabel="Chia sẻ chuyến đi" onPress={props.onShareTrip} style={({ pressed }) => [s.iconButton, pressed && s.pressed]}><MaterialCommunityIcons name="share-variant-outline" size={22} color="#B8D6E0" /></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="Kết thúc chỉ đường" onPress={props.onEndTrip || props.onClose} style={({ pressed }) => [s.endButton, pressed && s.pressed]}><MaterialCommunityIcons name="close" size={24} color="#FFB8BE" /></Pressable>
      </View>
      <View style={s.speedRow}>
        <View style={[s.currentSpeed, speedOver && s.currentSpeedOver]}>
          <Text maxFontSizeMultiplier={1.15} style={[s.speedValue, speedOver && s.speedOver]}>{props.speedKmh == null ? '—' : Math.round(props.speedKmh)}</Text>
          <Text maxFontSizeMultiplier={1.15} style={s.speedUnit}>km/h</Text>
        </View>
        <View accessible accessibilityLabel={`Tốc độ tối đa: ${props.speedLimitKmh ?? 'Chưa xác định'}`} style={[s.limitSign, props.speedSource !== 'osm' && s.unconfirmedLimit]}>
          <Text maxFontSizeMultiplier={1.15} style={s.limitValue}>{props.speedLimitKmh ?? '—'}</Text>
          <Text maxFontSizeMultiplier={1} style={s.limitCaption}>TỐI ĐA</Text>
        </View>
        <View style={s.flex}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={s.roadName}>{props.roadName || 'Đoạn đường hiện tại'}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={s.roadNote}>{speedNote}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={detailsOpen ? 'Thu gọn thông tin hành trình' : 'Xem thông tin hành trình'} accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen(open => !open)} style={({ pressed }) => [s.iconButton, pressed && s.pressed]}><MaterialCommunityIcons name={detailsOpen ? 'chevron-down' : 'chevron-up'} size={24} color="#B8D6E0" /></Pressable>
      </View>
      {detailsOpen && <ScrollView style={{ maxHeight: detailHeight }} contentContainerStyle={s.details} showsVerticalScrollIndicator>
        {!!props.guidance?.instruction && <Text style={s.detailValue}>{props.guidance.instruction}</Text>}
        <Text style={s.detailLabel}>{props.routeSummary || 'Đang tính lộ trình đường bộ…'}</Text>
        <Text style={s.muted}>{speedNote}</Text>
        {!!props.roadDescription && <Text style={s.muted}>{props.roadDescription}</Text>}
        <Forecast label={aheadLabel} weather={props.aheadWeather} />
        <Forecast label="Điểm đến" weather={props.destinationWeather} />
        <Text style={s.muted}>5 phút/lần · {props.weatherUpdatedAt ? new Date(props.weatherUpdatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'đang đồng bộ'}</Text>
        {!!props.musicStationName && <View style={s.musicRow}>
          <MaterialCommunityIcons name="radio" size={23} color="#8AD9E8" />
          <View style={s.flex}><Text style={s.detailLabel}>Âm nhạc</Text><Text numberOfLines={1} style={s.detailValue}>{props.musicStationName}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={props.musicPlaying ? 'Tạm dừng nhạc' : 'Phát nhạc'} onPress={props.onToggleMusic} style={({ pressed }) => [s.iconButton, pressed && s.pressed]}><MaterialCommunityIcons name={props.musicPlaying ? 'pause' : 'play'} size={23} color="#D9F5F6" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Bài tiếp theo" onPress={props.onNextStation} style={({ pressed }) => [s.iconButton, pressed && s.pressed]}><MaterialCommunityIcons name="skip-next" size={23} color="#D9F5F6" /></Pressable>
        </View>}
      </ScrollView>}
    </View>
  </View>;
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  topStack: { position: 'absolute', left: 12, right: 12, gap: 8, zIndex: 31 },
  turnCard: { backgroundColor: '#172A35', borderRadius: 20, paddingHorizontal: 14, paddingBottom: 12, borderWidth: 1, borderColor: '#2B4653' },
  destinationRow: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44 },
  destination: { flex: 1, color: '#C4D7E1', fontSize: 12, fontWeight: '600' },
  turnRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  directionTile: { width: 54, height: 60, borderRadius: 15, backgroundColor: '#285B63', alignItems: 'center', justifyContent: 'center' },
  turnDistance: { color: '#FFFFFF', fontSize: 30, lineHeight: 35, fontWeight: '800', fontVariant: ['tabular-nums'] },
  instruction: { color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '700' },
  followingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 9 },
  following: { flex: 1, color: '#A6BECC', fontSize: 11, lineHeight: 15 },
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weatherButton: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: 14, backgroundColor: '#172A35', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10 },
  weatherLabel: { color: '#BED5DE', fontSize: 10, lineHeight: 13, fontWeight: '600' },
  weatherValue: { color: '#F1F8FA', fontSize: 11, lineHeight: 14, fontWeight: '700' },
  radioButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#172A35', alignItems: 'center', justifyContent: 'center' },
  radioActive: { backgroundColor: '#285B63' },
  sosButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFF0F3', alignItems: 'center', justifyContent: 'center' },
  tripCard: { position: 'absolute', left: 12, right: 12, zIndex: 31, backgroundColor: '#172A35', borderRadius: 20, padding: 10, borderWidth: 1, borderColor: '#2B4653' },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 10 },
  etaColumn: { flex: 1, minWidth: 0, paddingLeft: 3 },
  numberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  eta: { color: '#C4F3D9', fontSize: 26, lineHeight: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  unit: { color: '#C4F3D9', fontSize: 12, fontWeight: '600' },
  distanceColumn: { flex: 1, minWidth: 0 },
  remaining: { color: '#F1F8FA', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  muted: { color: '#9DB6C7', fontSize: 11, lineHeight: 16 },
  iconButton: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  endButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#453038', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: .7 },
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: '#2B4653', paddingTop: 9 },
  currentSpeed: { width: 54, height: 54, borderRadius: 15, backgroundColor: '#0E202B', alignItems: 'center', justifyContent: 'center' },
  currentSpeedOver: { backgroundColor: '#453038' },
  speedValue: { color: '#FFFFFF', fontSize: 25, lineHeight: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  speedOver: { color: '#FF899B' },
  speedUnit: { color: '#B2CCD8', fontSize: 9, lineHeight: 12, fontWeight: '600' },
  limitSign: { width: 48, height: 48, borderRadius: 24, borderWidth: 4, borderColor: '#E64A59', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  unconfirmedLimit: { borderColor: '#AAB8C2' },
  limitValue: { color: '#18242C', fontSize: 19, lineHeight: 21, fontWeight: '800', fontVariant: ['tabular-nums'] },
  limitCaption: { color: '#5D6870', fontSize: 6, fontWeight: '700' },
  roadName: { color: '#D9E8EF', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  roadNote: { color: '#9DB6C7', fontSize: 9, lineHeight: 13 },
  details: { paddingTop: 12, paddingBottom: 2, gap: 9 },
  detailLabel: { color: '#BBD1DE', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  detailValue: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  forecast: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  musicRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#2B4653' },
});
