import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassSurface, type IconName } from '../ui/glass';
import { Text } from '../ui/Text';
import { weatherLabel, type WeatherSnapshot } from '../services/weather';
import type { RouteGuidance } from '../services/roadRouting';
import { formatNavigationDistance } from '../utils/navigation';
import { PortraitNavigationHud } from './PortraitNavigationHud';
import {LaneGuidance} from './LaneGuidance';

export type NavigationHudProps = {
  isLandscape: boolean;
  width: number;
  top: number;
  bottom: number;
  destinationName: string;
  routeSummary: string | null;
  travelMode: 'motorbike' | 'car' | 'foot' | 'bike';
  onToggleTravelMode: () => void;
  onClose: () => void;
  onRecenter?: () => void;
  following?: boolean;
  guidance: RouteGuidance | null;
  voiceNotice?: string | null;
  speedKmh: number | null;
  speedLimitKmh: number | null;
  roadName?: string | null;
  roadDescription?: string;
  speedSource?: 'osm' | 'estimated' | 'unknown';
  destinationWeather: WeatherSnapshot | null;
  aheadWeather: WeatherSnapshot | null;
  aheadDistanceMeters: number;
  weatherUpdatedAt: number | null;
  musicPlaying?: boolean;
  musicStationName?: string;
  onToggleMusic?: () => void;
  onNextStation?: () => void;
  etaMinutes?: number | null;
  remainingDistanceText?: string | null;
  onShareTrip?: () => void;
  onEndTrip?: () => void;
  onTopHeightChange?: (height: number) => void;
  onBottomHeightChange?: (height: number) => void;
  onSos?: () => void;
};

function maneuverIcon(guidance: RouteGuidance | null): IconName {
  const modifier = guidance?.modifier || '';
  if (guidance?.type === 'roundabout') return 'rotate-right';
  if (guidance?.type === 'arrive') return 'map-marker-check-outline';
  if (modifier.includes('left')) return 'arrow-left-top';
  if (modifier.includes('right')) return 'arrow-right-top';
  return 'arrow-up';
}

function WeatherMetric({ label, weather, detail }: { label: string; weather: WeatherSnapshot | null; detail: string }) {
  const temperature = weather?.current?.temperature_2m;
  const rain = weather?.daily?.precipitation_probability_max?.[0];
  return <View style={s.weatherMetric}>
    <MaterialCommunityIcons name={rain != null && rain >= 45 ? 'weather-rainy' : 'weather-partly-cloudy'} size={22} color="#8EEAFF" />
    <View style={s.weatherCopy}>
      <Text style={s.weatherLabel}>{label}</Text>
      <Text style={s.weatherValue}>{temperature == null ? 'Đang tải…' : `${Math.round(temperature)}° · ${weatherLabel(weather?.current?.weather_code)}`}</Text>
      <Text style={s.weatherDetail}>{temperature == null ? detail : `${detail}${rain == null ? '' : ` · mưa ${rain}%`}`}</Text>
    </View>
  </View>;
}

export function NavigationHud(props: NavigationHudProps) {
  if (!props.isLandscape) return <PortraitNavigationHud {...props} maneuverIcon={maneuverIcon(props.guidance)} />;
  const panelWidth = Math.min(250, Math.max(185, props.width * 0.28));
  const weatherWidth = Math.min(205, Math.max(160, props.width * 0.21));
  const speedOver = props.speedKmh != null && props.speedLimitKmh != null && props.speedKmh > props.speedLimitKmh;
  const updatedText = props.weatherUpdatedAt
    ? new Date(props.weatherUpdatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : 'đang đồng bộ';

  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {!!props.onRecenter&&<Pressable accessibilityRole="button" accessibilityLabel="Về giữa và bám vị trí" onPress={props.onRecenter} style={{position:'absolute',right:106,bottom:props.bottom+12,minHeight:48,borderRadius:24,backgroundColor:'#FFFFFF',paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:8}}><MaterialCommunityIcons name="crosshairs-gps" size={21} color="#4464F6"/><Text style={{color:'#263659',fontWeight:'700'}}>{props.following?'Đang bám vị trí':'Về giữa'}</Text></Pressable>}
    <GlassSurface style={[
      s.routeHeader,
      props.isLandscape
        ? { top: props.top, left: 68, width: panelWidth, minHeight:54,padding:6 }
        : { top: props.top, left: 12, right: 12 },
    ]}>
      <View style={s.routeMark}><MaterialCommunityIcons name="navigation-variant" size={22} color="#EAFDFF" /></View>
      <View style={s.headerCopy}>
        <Text style={s.eyebrow}>ĐANG DẪN ĐƯỜNG</Text>
        <Text style={s.destination} numberOfLines={1}>{props.destinationName}</Text>
        <Text style={s.routeSummary} numberOfLines={1}>{props.routeSummary || 'Đang tính lộ trình đường bộ…'}</Text>
        {!!props.voiceNotice&&<Text style={{fontSize:10,color:'#FFD18A'}} numberOfLines={2}>{props.voiceNotice}</Text>}
      </View>
      <Pressable accessibilityRole="button" onPress={props.onToggleTravelMode} style={s.modeButton}>
        <MaterialCommunityIcons name={{motorbike:'motorbike',car:'car',foot:'walk',bike:'bike'}[props.travelMode] as IconName} size={17} color="#8EEAFF" />
        <Text style={s.modeText}>{{motorbike:'Xe máy',car:'Ô tô',foot:'Đi bộ',bike:'Xe đạp'}[props.travelMode]}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng chỉ đường" onPress={props.onClose} style={s.closeButton}>
        <MaterialCommunityIcons name="close" size={23} color="#D9E9F5" />
      </Pressable>
    </GlassSurface>

    <GlassSurface tone="cyan" style={[
      s.guidance,
      props.isLandscape
        ? { top: props.top + 62, left: 68, width: panelWidth,minHeight:76,padding:8,gap:8 }
        : { top: props.top + 78, left: 12, right: 12 },
    ]}>
      <View style={[s.maneuverIcon,props.isLandscape&&{width:38,height:45,borderRadius:12}]}>
        <MaterialCommunityIcons name={maneuverIcon(props.guidance)} size={props.isLandscape?27:42} color="#F3FEFF" />
      </View>
      <View style={s.guidanceCopy}>
        <View style={s.distanceRow}>
          <Text style={s.distance}>{formatNavigationDistance(props.guidance?.distanceMeters)}</Text>
          {!props.isLandscape&&<View style={s.junctionBadge}>
            <MaterialCommunityIcons name="source-branch" size={12} color="#45EBC0" />
            <Text style={s.junctionText}>Nút giao tiếp theo</Text>
          </View>}
        </View>
        <Text style={s.instruction} numberOfLines={2}>{props.guidance?.instruction || 'Đang nhận dữ liệu lối rẽ…'}</Text>
        <LaneGuidance lanes={props.guidance?.lanes}/>
        <Text style={s.following} numberOfLines={1}>
          {props.guidance?.followingInstruction ? `Sau đó · ${props.guidance.followingInstruction}` : 'Giữ đúng tuyến đường đang hiển thị'}
        </Text>
      </View>
    </GlassSurface>

    <GlassSurface style={[
      s.weatherPanel,
      props.isLandscape
        ? { top: props.top, right: 104, width: weatherWidth,padding:8 }
        : { top: props.top + 196, left: 12, right: 12 },
    ]}>
      <View style={s.weatherHeader}>
        <Text style={s.weatherTitle}>Thời tiết hành trình</Text>
        <Text style={s.weatherUpdated}>5 phút/lần · {updatedText}</Text>
      </View>
      <WeatherMetric label="Điểm đến" weather={props.destinationWeather} detail="Dự báo tại đích" />
      <View style={s.weatherDivider} />
      <WeatherMetric
        label={props.aheadDistanceMeters >= 4_900 ? 'Phía trước 5 km' : 'Gần điểm đến'}
        weather={props.aheadWeather}
        detail="Theo tuyến đang đi"
      />
    </GlassSurface>

    {props.musicStationName && (
      <GlassSurface style={[
        s.musicPanel,
        props.isLandscape
          ? { bottom: 12, right: 104, width: weatherWidth, padding: 6 }
          : { top: props.top + 338, left: 12, right: 12 },
      ]}>
        <View style={s.musicMark}>
          <MaterialCommunityIcons name="radio" size={20} color="#7DF3FF" />
        </View>
        <View style={s.musicCopy}>
          <Text style={s.musicEyebrow}>ÂM NHẠC HÀNH TRÌNH</Text>
          <Text style={s.musicTitle} numberOfLines={1}>{props.musicStationName}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.musicPlaying ? 'Tạm dừng nhạc' : 'Phát nhạc'}
          onPress={props.onToggleMusic}
          style={s.musicBtn}
        >
          <MaterialCommunityIcons
            name={props.musicPlaying ? 'pause' : 'play'}
            size={20}
            color="#FFFFFF"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bài tiếp theo"
          onPress={props.onNextStation}
          style={s.musicNextBtn}
        >
          <MaterialCommunityIcons name="skip-next" size={20} color="#8EEAFF" />
        </Pressable>
      </GlassSurface>
    )}

    {<GlassSurface style={[
      s.speedPanel,
      props.isLandscape
        ? { left: 68, bottom: 12, width: panelWidth,padding:6 }
        : { left: 12, bottom: props.bottom, right: 72 },
    ]}>
      <View style={s.currentSpeedCircle}>
        <Text style={[s.speedValue, speedOver && s.speedOver]}>{props.speedKmh == null ? '—' : Math.round(props.speedKmh)}</Text>
        <Text style={s.speedUnit}>km/h</Text>
      </View>
      <View
        accessible
        accessibilityLabel={`Tốc độ tối đa: ${props.speedLimitKmh ?? 'Chưa xác định'}${props.speedSource !== 'osm' ? ' (ước tính)' : ''}`}
        style={[s.limitSign, props.speedSource !== 'osm' && s.unconfirmedLimit]}
      >
        <Text style={s.limitValue}>{props.speedLimitKmh ?? '—'}</Text>
        <Text style={s.limitCaption}>TỐI ĐA</Text>
      </View>
      <View style={s.roadCopy}>
        <Text style={s.roadTitle} numberOfLines={1}>{props.roadName || 'Đoạn đường hiện tại'}</Text>
        <Text style={s.roadMeta} numberOfLines={1}>{props.roadDescription || 'Đang nhận diện đoạn đường…'}</Text>
        <Text style={s.speedNote}>{props.speedSource === 'osm' ? 'Dữ liệu biển báo OSM' : props.speedLimitKmh == null ? 'Chưa xác định · xem biển báo' : 'Ước tính · ưu tiên biển báo thực tế'}</Text>
      </View>
    </GlassSurface>}
  </View>;
}

const s = StyleSheet.create({
  routeHeader: { position: 'absolute', zIndex: 31, minHeight: 68, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 18 },
  routeMark: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(116,232,255,.12)', borderWidth: 1, borderColor: 'rgba(142,234,255,.34)' },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#5EF0C1', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  destination: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900', letterSpacing: -.2 },
  routeSummary: { color: '#83D7ED', fontSize: 10, marginTop: 1 },
  modeButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 38, paddingHorizontal: 9, borderRadius: 12, backgroundColor: 'rgba(15,83,105,.54)', borderWidth: 1, borderColor: 'rgba(105,222,255,.45)' },
  modeText: { color: '#E8FCFF', fontSize: 10, fontWeight: '800' },
  closeButton: { padding: 5 },
  guidance: { position: 'absolute', zIndex: 30, minHeight: 100, padding: 13, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 13 },
  maneuverIcon: { width: 72, height: 72, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(21,116,137,.36)', borderWidth: 1, borderColor: 'rgba(126,243,255,.48)' },
  guidanceCopy: { flex: 1, minWidth: 0 },
  distance: { color: '#F3FEFF', fontSize: 28, lineHeight: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  distanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  junctionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(69, 235, 192, 0.15)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(69, 235, 192, 0.35)' },
  junctionText: { color: '#5EF0C1', fontSize: 9, fontWeight: '800' },
  instruction: { color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontWeight: '800' },
  following: { color: '#91B8D0', fontSize: 9.5, marginTop: 4 },
  weatherPanel: { position: 'absolute', zIndex: 29, padding: 12, borderRadius: 20, gap: 8 },
  weatherHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  weatherTitle: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' },
  weatherUpdated: { color: '#789EB8', fontSize: 8.5 },
  weatherMetric: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  weatherCopy: { flex: 1, minWidth: 0 },
  weatherLabel: { color: '#83D7ED', fontSize: 9, fontWeight: '800' },
  weatherValue: { color: '#F8FCFF', fontSize: 12, fontWeight: '800', marginTop: 1 },
  weatherDetail: { color: '#789EB8', fontSize: 8.5, marginTop: 1 },
  weatherDivider: { height: 1, backgroundColor: 'rgba(138,212,234,.18)' },
  musicPanel: { position: 'absolute', zIndex: 29, padding: 10, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  musicMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(72, 227, 255, 0.14)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(72, 227, 255, 0.3)' },
  musicCopy: { flex: 1, minWidth: 0 },
  musicEyebrow: { color: '#68DBFF', fontSize: 7.5, fontWeight: '900', letterSpacing: 0.8 },
  musicTitle: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', marginTop: 1 },
  musicBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(72, 227, 255, 0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(72, 227, 255, 0.45)' },
  musicNextBtn: { padding: 5 },
  speedPanel: { position: 'absolute', zIndex: 30, minHeight: 78, borderRadius: 20, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  currentSpeedCircle: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,23,38,.92)', borderWidth: 2, borderColor: '#52E3FF' },
  speedValue: { color: '#FFFFFF', fontSize: 24, lineHeight: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  speedOver: { color: '#FF6681' },
  speedUnit: { color: '#9CC8DB', fontSize: 8, fontWeight: '800' },
  limitSign: { width: 55, height: 55, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 5, borderColor: '#E73748' },
  unconfirmedLimit: { borderColor: '#AAB8C2' },
  limitValue: { color: '#17202B', fontSize: 20, lineHeight: 21, fontWeight: '900', fontVariant: ['tabular-nums'] },
  limitCaption: { color: '#5B6572', fontSize: 6.5, fontWeight: '900' },
  roadCopy: { flex: 1, minWidth: 0 },
  roadTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  roadMeta: { color: '#9DD3E4', fontSize: 9, marginTop: 2 },
  speedNote: { color: '#718EA3', fontSize: 8, marginTop: 2 },
});
