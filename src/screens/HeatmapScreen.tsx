import { getDeviceCurrentPosition } from '../services/platformLocation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LeafletHeatmap, type LeafletHeatmapRef, type HeatmapObservation } from '../components/LeafletHeatmap';
import * as Location from 'expo-location';
import { getLocationPoints, getPhotoPins } from '../db/database';
import { localDayKey } from '../utils/journeyStats';
import { GlassButton, GlassChip, GlassSurface, IconBadge, glassColors, useResponsiveLayout, type IconName } from '../ui/glass';
import { ScreenScaffold, EmptyGlass } from '../ui/ScreenScaffold';
import { WorldMap, type MapObservation } from '../ui/WorldMap';
import { Text } from '../ui/Text';
import { NATIVE_MAPS_ENABLED } from '../config/maps';
import { openExternalNavigation } from '../maps';
import type{LocationPoint}from'../types/location';
import type{PhotoPin}from'../types/photo';
import{processAndSaveScratchPoints,computeExplorationStats,computeCityNights,compareScratchWithFriends,hexToPolygonCoords,coordsToHex,markScratchSessionViewed,type ScratchHexCell,type ExplorationStats,type CityNights}from'../services/scratchMap';
import{getLiveFriends}from'../services/realtimeFriends';
import {buildHeatmapObservations} from '../services/heatmapData';
import { NativeAdCard } from '../components/NativeAdCard';

type Filter = 'country' | 'place' | 'time';

export default function HeatmapScreen() {
  const nav = useNavigation<any>();
  const r = useResponsiveLayout();
  const leafletMap = useRef<LeafletHeatmapRef>(null);
  const pending = useRef(false);

  const [points, setPoints] = useState<LocationPoint[]>([]);
  const [photos, setPhotos] = useState<PhotoPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [range, setRange] = useState(0);
  const [picker, setPicker] = useState<Filter | null>(null);
  const [details, setDetails] = useState<'stats' | 'achievements' | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [viewMode, setViewMode] = useState<'leaflet' | 'scratch' | 'overview'>('leaflet');
  const [scratchCells, setScratchCells] = useState<ScratchHexCell[]>([]);
  const [exploration, setExploration] = useState<ExplorationStats | null>(null);
  const [cityNights, setCityNights] = useState<CityNights[]>([]);
  const [friendScratch, setFriendScratch] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void Promise.all([getLocationPoints(), getPhotoPins(), getLiveFriends().catch(()=>[])])
        .then(async ([p, m, liveFriends]) => {
          if (active) {
            setPoints(p);
            setPhotos(m);
            setError(null);
          }
          const scratchRes = await processAndSaveScratchPoints(p);
          if (active) {
            setScratchCells(scratchRes.allCells);
            const expStats = computeExplorationStats(scratchRes.allCells);
            setExploration(expStats);
            await markScratchSessionViewed();
            const nights = computeCityNights(p,m);
            setCityNights(nights);
            const compare = compareScratchWithFriends(scratchRes.allCells.length, liveFriends);
            setFriendScratch(compare);
          }
        })
        .catch(() => {
          if (active) setError('Không thể đọc dấu chân trên thiết bị.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [retry])
  );

  const earliest = useMemo(()=>range ? Date.now() - range * 86400000 : 0,[range,retry]);
  const filteredPhotos = useMemo(()=>photos.filter(
    p => p.capturedAt >= earliest && (!country || p.countryCode === country) && (!place || p.placeName === place)
  ),[photos,earliest,country,place]);
  const filteredPoints = useMemo(()=>country || place ? [] : points.filter(p => p.timestamp >= earliest),[points,earliest,country,place]);

  const filteredScratchCells = useMemo(()=>scratchCells.filter(c=>c.unlockedAt>=earliest &&
    (!(country||place)||filteredPhotos.some(p=>{const h=coordsToHex(p.latitude,p.longitude);return h.key===c.key;}))),[scratchCells,earliest,country,place,photos]);
  const scratchHexagons = useMemo(()=>filteredScratchCells.map(c=>hexToPolygonCoords(c.q,c.r)),[filteredScratchCells]);
  const displayObservations = useMemo(()=>buildHeatmapObservations(filteredPoints,filteredPhotos),[filteredPoints,filteredPhotos]);
  const realObservations = displayObservations;
  const max = Math.max(1, ...displayObservations.map(c => c.count || 1));

  const totalDays = new Set([
    ...points.filter(p => p.timestamp >= earliest).map(p => localDayKey(p.timestamp)),
    ...photos.filter(p => p.capturedAt >= earliest).map(p => localDayKey(p.capturedAt)),
  ]).size;

  const stats = {
    countries: new Set(photos.map(p => p.countryCode).filter(Boolean)).size,
    places: new Set(photos.map(p => p.placeName).filter(Boolean)).size,
    photos: photos.length,
    days: totalDays,
  };

  const countryOptions = [...new Set(photos.map(p => p.countryCode).filter((c): c is string => !!c))];
  const placeOptions = [...new Set(photos.map(p => p.placeName).filter((c): c is string => !!c))];

  async function locate() {
    if(viewMode==='overview'){setViewMode('leaflet');}

    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Cần quyền vị trí để tìm bạn trên bản đồ.');
      const pos = await getDeviceCurrentPosition({ accuracy: Location.Accuracy.Balanced });
      if (leafletMap.current) {
        leafletMap.current.animateToRegion({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          zoom: 16,
        });
      } else {
        await openExternalNavigation(pos.coords.latitude, pos.coords.longitude, 'Vị trí của tôi');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function handleFitBounds() {
    if (leafletMap.current) {
      leafletMap.current.fitBounds();
    }
  }

  const explorerTitle =
    displayObservations.length >= 40
      ? 'Đại sứ khám phá'
      : displayObservations.length >= 15
      ? 'Phượt thủ dày dạn'
      : displayObservations.length >= 5
      ? 'Nhà thám hiểm'
      : 'Tập sự mở lối';

  return (
    <ScreenScaffold
      title="Dấu chân của bạn"
      subtitle="Khám phá dấu chân của bạn trên khắp thế giới"
      icon="earth"
      actions={[
  {id:'fit',icon:'crop-free',label:'Vừa khung dấu chân',onPress:handleFitBounds},
  {id:'locate',icon:'crosshairs-gps',label:'Vị trí của tôi',primary:true,busy,onPress:()=>void locate()},
 ]}
    >
      {/* World Coverage Card */}
      <GlassSurface style={s.coverageCard}>
        <IconBadge name="trophy" tone="violet" size={26} />
        <View style={s.flex}>
          <Text style={s.coverageTitle}>
            {exploration?.unlockedCellsCount ?? 0} ô đã khám phá
          </Text>
          <Text style={s.coverageSub}>
            Danh hiệu: {explorerTitle} · {displayObservations.length} vị trí được ghi nhận
          </Text>
        </View>
      </GlassSurface>

      {/* Heatmap intensity gradient legend */}
      <GlassSurface style={s.legend}>
        <Text style={s.legendLabel}>Ít hoạt động</Text>
        <View style={s.legendDots}>
          {['#00F5D4', '#00BBF9', '#FEE440', '#F15BB5', '#FF0054'].map(color => (
            <View key={color} style={[s.legendDot, { backgroundColor: color }]} />
          ))}
        </View>
        <Text style={s.legendLabel}>Mật độ cao</Text>
      </GlassSurface>

      {loading && <ActivityIndicator color={glassColors.cyan} style={{ marginVertical: 8 }} />}

      {error && (
        <EmptyGlass
          title="Chưa thể hoàn tất"
          body={error}
          icon="alert-circle-outline"
          action={
            <GlassButton onPress={() => setRetry(v => v + 1)}>
              <Text style={s.white}>Thử lại</Text>
            </GlassButton>
          }
        />
      )}

      {/* Empty footprints prompt if real data is 0 */}
      {!loading && realObservations.length === 0 && (
        <GlassSurface tone="cyan" style={s.emptyPrompt}>
          <IconBadge name="map-marker-path" size={26} tone="cyan" />
          <View style={s.flex}>
            <Text style={s.emptyPromptTitle}>Chưa có dấu chân GPS thực tế</Text>
            <Text style={s.emptyPromptSub}>
              Bật theo dõi hành trình ở màn hình Bản đồ để dấu chân GPS thực tế tự động vẽ lên đây!
            </Text>
          </View>
        </GlassSurface>
      )}

      {/* Main Map Container */}
      <GlassSurface style={s.mapCard}>
        {/* Map View Mode Switcher Header */}
        <View style={s.mapHeaderRow}>
          <View style={s.viewToggleRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bản đồ nhiệt 3D"
              onPress={() => setViewMode('leaflet')}
              style={[s.toggleBtn, viewMode === 'leaflet' && s.toggleBtnActive]}
            >
              <MaterialCommunityIcons name="layers-triple" size={14} color={viewMode === 'leaflet' ? '#fff' : '#7BB0E2'} />
              <Text style={[s.toggleBtnText, viewMode === 'leaflet' && s.toggleBtnTextActive]}>Mật độ</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cào bản đồ lục giác"
              onPress={() => setViewMode('scratch')}
              style={[s.toggleBtn, viewMode === 'scratch' && s.toggleBtnActive]}
            >
              <MaterialCommunityIcons name="hexagon-multiple-outline" size={14} color={viewMode === 'scratch' ? '#fff' : '#7BB0E2'} />
              <Text style={[s.toggleBtnText, viewMode === 'scratch' && s.toggleBtnTextActive]}>Cào bản đồ</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bản đồ phẳng toàn cầu"
              onPress={() => setViewMode('overview')}
              style={[s.toggleBtn, viewMode === 'overview' && s.toggleBtnActive]}
            >
              <MaterialCommunityIcons name="earth" size={14} color={viewMode === 'overview' ? '#fff' : '#7BB0E2'} />
              <Text style={[s.toggleBtnText, viewMode === 'overview' && s.toggleBtnTextActive]}>Toàn cầu</Text>
            </Pressable>
          </View>

          <View style={s.mapToolsRow}>
            {viewMode !== 'overview' && (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tập trung dấu chân"
                  onPress={handleFitBounds}
                  style={s.toolMiniBtn}
                >
                  <MaterialCommunityIcons name="crosshairs" size={16} color="#88E5FF" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Phóng to bản đồ"
                  onPress={() => leafletMap.current?.zoomIn()}
                  style={s.toolMiniBtn}
                >
                  <MaterialCommunityIcons name="plus" size={16} color="#88E5FF" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Thu nhỏ bản đồ"
                  onPress={() => leafletMap.current?.zoomOut()}
                  style={s.toolMiniBtn}
                >
                  <MaterialCommunityIcons name="minus" size={16} color="#88E5FF" />
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* Map Display Frame */}
        <View style={[s.mapFrame, { height: r.isWide ? 420 : 310 }]}>
          {viewMode === 'overview' ? (
            <WorldMap
              observations={displayObservations as MapObservation[]}
              height={r.isWide ? 420 : 310}
              emptyLabel={loading ? 'Đang đọc dấu chân…' : 'Chưa có dấu chân được lưu'}
            />
          ) : (
            <LeafletHeatmap
              ref={leafletMap}
              observations={viewMode === 'scratch' ? [] : displayObservations}
              hexagons={viewMode === 'scratch' ? scratchHexagons : undefined}
              maxCount={max}
              autoFit={displayObservations.length > 0 || scratchHexagons.length > 0}
            />
          )}
        </View>

        {/* Bottom Control bar */}
        <View style={s.mapControls}>
          <Text style={s.pointCountText}>
            {viewMode === 'scratch'
              ? `${filteredScratchCells.length} ô lục giác trong bộ lọc`
              : `${displayObservations.length} địa điểm ghi nhận`}
          </Text>
          <View style={s.buttonRow}>
            {viewMode !== 'overview' && (
              <GlassButton tone="neutral" onPress={handleFitBounds}>
                <View style={s.buttonInner}>
                  <MaterialCommunityIcons name="crop-free" size={16} color="#7BE8FF" />
                  <Text style={s.white}>Tập trung</Text>
                </View>
              </GlassButton>
            )}
            <GlassButton tone="blue" disabled={busy} onPress={() => void locate()}>
              <View style={s.buttonInner}>
                <MaterialCommunityIcons name="navigation-variant" size={16} color="#98E9FF" />
                <Text style={s.white}>{busy ? 'Đang tìm…' : 'Vị trí của tôi'}</Text>
              </View>
            </GlassButton>
          </View>
        </View>
      </GlassSurface>

      {/* Scratch Map Stats Panel */}
      <GlassSurface style={s.scratchCard}>
        <View style={s.scratchHeader}>
          <IconBadge name="map-check-outline" tone="cyan" size={24} />
          <View style={s.flex}>
            <Text style={s.scratchTitle}>Tiến độ cào mở ô lục giác (Scratch Map)</Text>
            <Text style={s.scratchSub}>
              Đã mở {exploration?.unlockedCellsCount || 0} ô lục giác ({exploration?.newCellsSinceLastSession || 0} ô mới gần đây)
            </Text>
          </View>
        </View>

        <View style={s.scratchGauges}>
          <View style={s.gaugeCol}><Text style={s.gaugeValue}>{exploration?.unlockedCellsCount ?? 0}</Text><Text style={s.gaugeLabel}>Ô GPS thực</Text></View>
          <View style={s.gaugeCol}><Text style={s.gaugeValue}>{(exploration?.exploredAreaKm2 ?? 0).toLocaleString('vi-VN',{maximumFractionDigits:2})}</Text><Text style={s.gaugeLabel}>km² ô đã mở</Text></View>
          <View style={s.gaugeCol}><Text style={s.gaugeValue}>{exploration?.newCellsSinceLastSession ?? 0}</Text><Text style={s.gaugeLabel}>Mới từ lần xem trước</Text></View>
        </View>
        <Text style={s.source}>Diện tích các ô chứa GPS; không phải toàn bộ khu vực bạn đã đi qua. Chưa có dữ liệu địa giới để tính phần trăm phường/thành phố/quốc gia.</Text>
      </GlassSurface>

      <NativeAdCard placement="heatmap" />

      {/* Nights Counter Panel */}
      <GlassSurface style={s.nightsCard}>
        <View style={s.notesHeader}>
          <IconBadge name="weather-night" tone="violet" size={22} />
          <Text style={s.sectionTitle}>Số đêm ở từng thành phố (Nights)</Text>
        </View>
        {cityNights.length === 0 ? (
          <Text style={s.emptyText}>Chưa ghi nhận điểm dừng qua đêm (23:00 - 06:00).</Text>
        ) : (
          <View style={s.nightsRow}>
            {cityNights.map(cn => (
              <View key={cn.cityName} style={s.nightChip}>
                <MaterialCommunityIcons name="moon-waning-crescent" size={14} color="#C4B5FD" />
                <Text style={s.nightCity}>{cn.cityName}</Text>
                <Text style={s.nightCount}>{cn.nightsCount} đêm</Text>
              </View>
            ))}
          </View>
        )}
      </GlassSurface>

      {/* Friend Scratch Leaderboard */}
      <GlassSurface style={s.leaderboardCard}>
        <View style={s.notesHeader}>
          <IconBadge name="podium-gold" tone="cyan" size={22} />
          <Text style={s.sectionTitle}>Khám phá cùng bạn bè</Text>
        </View>
        <Text style={s.source}>Chỉ xếp hạng người có số ô đã chia sẻ; chưa có dữ liệu không được tính là 0.</Text>
        <View style={s.leaderboardList}>
          {friendScratch.slice(0, 5).map((fs, idx) => (
            <View key={fs.id} style={[s.leaderboardItem, fs.isMe && s.leaderboardItemMe]}>
              <Text style={s.rankNum}>#{idx + 1}</Text>
              <View style={s.fsAvatar}>
                <Text style={s.fsInitial}>{fs.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={s.flex}>
                <Text style={s.fsName}>{fs.name} {fs.isMe ? '(Bạn)' : ''}</Text>
                <Text style={s.fsSub}>{fs.cells} ô lục giác đã khám phá</Text>
              </View>
              <MaterialCommunityIcons
                name={idx === 0 ? 'trophy' : idx === 1 ? 'medal' : 'check-decagram'}
                size={18}
                color={idx === 0 ? '#FBBF24' : idx === 1 ? '#E2E8F0' : '#71F1FF'}
              />
            </View>
          ))}
        </View>
      </GlassSurface>

      <Text style={s.source}>
        {country || place ? 'Vị trí từ ảnh có thông tin địa điểm' : 'Mật độ từ GPS đã lưu · Tự động tính toán mật độ nhiệt'}
        {range ? ` · ${range} ngày gần đây` : ''}
      </Text>

      {/* Metrics breakdown */}
      <GlassSurface style={s.stats}>
        {[
          { icon: 'flag-outline' as const, value: stats.countries, title: 'Quốc gia', sub: 'Mã quốc gia đã đến' },
          { icon: 'city-variant-outline' as const, value: stats.places, title: 'Địa điểm', sub: 'Tên địa danh khám phá' },
          { icon: 'image-outline' as const, value: stats.photos, title: 'Kỷ niệm', sub: 'Khoảnh khắc đã lưu' },
          { icon: 'calendar-month' as const, value: stats.days, title: 'Ngày hoạt động', sub: range ? `${range} ngày gần đây` : 'Tổng ngày khám phá' },
        ].map((m, i) => (
          <View key={m.title} style={s.stat}>
            <IconBadge name={m.icon} tone={i % 2 ? 'violet' : 'cyan'} size={25} />
            <Text style={s.value}>{loading ? '—' : m.value}</Text>
            <Text style={s.statTitle}>{m.title}</Text>
            <Text style={s.statSub}>{m.sub}</Text>
          </View>
        ))}
      </GlassSurface>

      {/* Filter Row */}
      <View style={s.filters}>
        {[
          { key: 'global', label: 'Toàn cầu', icon: 'earth' as IconName },
          { key: 'country', label: country || 'Quốc gia', icon: 'flag-outline' as IconName },
          { key: 'place', label: place || 'Địa điểm', icon: 'city-variant-outline' as IconName },
          { key: 'time', label: range ? `${range} ngày` : 'Thời gian', icon: 'calendar-blank-outline' as IconName },
        ].map(item => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            style={{ width: r.width < 360 || r.fontScale > 1.2 ? '48%' : '23.2%' }}
            onPress={() => (item.key === 'global' ? (setCountry(null), setPlace(null), setRange(0)) : setPicker(item.key as Filter))}
          >
            <GlassSurface style={s.filter} tone={item.key === 'global' && !country && !place && !range ? 'cyan' : 'blue'}>
              <MaterialCommunityIcons name={item.icon} size={20} color={glassColors.cyan} />
              <Text numberOfLines={1} style={s.filterLabel}>
                {item.label}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={15} color="#B2D8FF" />
            </GlassSurface>
          </Pressable>
        ))}
      </View>

      {/* Details & Achievements */}
      <View style={s.actions}>
        <Pressable style={s.flex} onPress={() => setDetails('stats')}>
          <GlassSurface style={s.action}>
            <IconBadge name="chart-bar" />
            <View style={s.flex}>
              <Text style={s.actionTitle}>Thống kê chi tiết</Text>
              <Text style={s.actionSub}>Xem phân bố mật độ và tọa độ dấu chân</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#BAD8FF" />
          </GlassSurface>
        </Pressable>
        <Pressable style={s.flex} onPress={() => setDetails('achievements')}>
          <GlassSurface tone="violet" style={s.action}>
            <IconBadge name="trophy-outline" tone="violet" />
            <View style={s.flex}>
              <Text style={s.actionTitle}>Thành tích khám phá</Text>
              <Text style={s.actionSub}>Mở khóa danh hiệu và vùng đất mới</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#CFC0FF" />
          </GlassSurface>
        </Pressable>
      </View>

      {/* Filter Options Modal */}
      <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <View style={s.overlay}>
          <GlassSurface style={s.dialog}>
            <Text style={s.dialogTitle}>
              {picker === 'country' ? 'Quốc gia từ ảnh' : picker === 'place' ? 'Địa điểm trong ảnh' : 'Thời gian lọc'}
            </Text>
            <View style={s.options}>
              {picker === 'time'
                ? [0, 7, 30, 90].map(value => (
                    <GlassChip
                      key={value}
                      label={value ? `${value} ngày gần đây` : 'Tất cả'}
                      active={range === value}
                      onPress={() => {
                        setRange(value);
                        setPicker(null);
                      }}
                    />
                  ))
                : (picker === 'country' ? countryOptions : placeOptions).map(value => (
                    <GlassChip
                      key={value}
                      label={value}
                      active={picker === 'country' ? country === value : place === value}
                      onPress={() => {
                        if (picker === 'country') {
                          setCountry(value);
                          setPlace(null);
                        } else {
                          setPlace(value);
                          setCountry(null);
                        }
                        setPicker(null);
                      }}
                    />
                  ))}
            </View>
            {picker !== 'time' && !(picker === 'country' ? countryOptions : placeOptions).length && (
              <Text style={s.actionSub}>Chưa có ảnh kèm thông tin này.</Text>
            )}
            <GlassButton tone="neutral" onPress={() => setPicker(null)}>
              <Text style={s.white}>Đóng</Text>
            </GlassButton>
          </GlassSurface>
        </View>
      </Modal>

      {/* Detail Stats Modal */}
      <Modal visible={!!details} transparent animationType="fade" onRequestClose={() => setDetails(null)}>
        <View style={s.overlay}>
          <GlassSurface style={s.dialog}>
            <Text style={s.dialogTitle}>{details === 'stats' ? 'Thống kê chi tiết' : 'Thành tích khám phá'}</Text>
            <Text style={s.detailBody}>
              {details === 'stats'
                ? `${displayObservations.length.toLocaleString('vi-VN')} điểm nhiệt bản đồ\n${displayObservations.reduce((acc, c) => acc + (c.count || 1), 0)} lượt hoạt động GPS ghi nhận\nÔ GPS đã mở: ${exploration?.unlockedCellsCount ?? 0}\nDanh hiệu hiện tại: ${explorerTitle}`
                : `${stats.countries} quốc gia có ảnh đã lưu\n${stats.places} địa điểm được đặt tên\n${stats.photos} bức ảnh kỷ niệm đã lưu\n${stats.days} ngày khám phá\nÔ GPS đã mở: ${exploration?.unlockedCellsCount ?? 0} (${explorerTitle})`}
            </Text>
            <GlassButton onPress={() => setDetails(null)}>
              <Text style={s.white}>Đóng</Text>
            </GlassButton>
          </GlassSurface>
        </View>
      </Modal>
    </ScreenScaffold>
  );
}

const s = StyleSheet.create({
  coverageCard: { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 12, marginBottom: 4 },
  coverageTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  coverageSub: { fontSize: 11, color: '#B5DCFF', marginTop: 2 },
  legend: { paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  legendLabel: { fontSize: 10, color: '#C4DFFF', fontWeight: '600' },
  legendDots: { flexDirection: 'row', gap: 6, flex: 1, justifyContent: 'center' },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  emptyPrompt: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, marginBottom: 4 },
  emptyPromptTitle: { fontSize: 13, fontWeight: '800', color: '#fff' },
  emptyPromptSub: { fontSize: 10.5, color: '#B3DCFF', marginTop: 2 },
  mapCard: { overflow: 'hidden', borderRadius: 22 },
  mapHeaderRow: { flexDirection: 'row', flexWrap:'wrap', gap:8, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(141,208,255,0.15)' },
  viewToggleRow: { flexDirection: 'row', gap: 6 },
  toggleBtn: { minHeight:48, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  toggleBtnActive: { backgroundColor: 'rgba(72,227,255,0.22)', borderColor: '#48E3FF' },
  toggleBtnText: { fontSize: 10.5, color: '#A0C8EF', fontWeight: '600' },
  toggleBtnTextActive: { color: '#fff', fontWeight: '800' },
  mapToolsRow: { flexDirection: 'row', gap: 6 },
  toolMiniBtn: { width: 48, height: 48, borderRadius: 15, backgroundColor: 'rgba(4,22,58,0.85)', borderWidth: 1, borderColor: 'rgba(141,208,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  mapFrame: { position: 'relative', width: '100%', overflow: 'hidden' },
  mapControls: { flexWrap:'wrap', gap:10, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pointCountText: { fontSize: 11, color: '#8EBEF0', fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  buttonInner: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  white: { fontSize: 12, fontWeight: '700', color: '#fff' },
  source: { fontSize: 10, color: glassColors.muted, textAlign: 'center' },
  stats: { flexDirection: 'row', paddingVertical: 15, paddingHorizontal: 7 },
  stat: { flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: 3 },
  value: { color: '#fff', fontSize: 25, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statTitle: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  statSub: { color: glassColors.muted, fontSize: 9, lineHeight: 13, textAlign: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  filter: { paddingHorizontal: 7, paddingVertical: 12, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterLabel: { flex: 1, color: '#D3E7FF', fontSize: 10 },
  actions: { gap: 10 },
  flex: { flex: 1 },
  action: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  actionTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  actionSub: { color: glassColors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 4 },
  overlay: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: 'rgba(2,9,29,.86)' },
  dialog: { padding: 20, gap: 16, maxWidth: 580, width: '100%', alignSelf: 'center' },
  dialogTitle: { fontSize: 23, fontWeight: '800', color: '#fff' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  detailBody: { fontSize: 14, lineHeight: 23, color: '#C3DCF8' },
  scratchCard: { padding: 14, gap: 12, borderRadius: 20 },
  scratchHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scratchTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  scratchSub: { color: '#88E5FF', fontSize: 11, marginTop: 2 },
  scratchGauges: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(2,16,42,0.5)', borderRadius: 15, padding: 10 },
  gaugeCol: { flex: 1, alignItems: 'center' },
  gaugeValue: { color: '#00F5D4', fontSize: 16, fontWeight: '900' },
  gaugeLabel: { color: '#90BCE5', fontSize: 9.5, marginTop: 3, textAlign: 'center' },
  nightsCard: { padding: 14, gap: 10, borderRadius: 20 },
  notesHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  emptyText: { color: '#8BB0D6', fontSize: 11.5, fontStyle: 'italic' },
  nightsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nightChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(167,139,250,0.15)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.35)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  nightCity: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  nightCount: { color: '#C4B5FD', fontSize: 11, fontWeight: '800' },
  leaderboardCard: { padding: 14, gap: 10, borderRadius: 20 },
  leaderboardList: { gap: 8 },
  leaderboardItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)' },
  leaderboardItemMe: { backgroundColor: 'rgba(34,211,238,0.12)', borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)' },
  rankNum: { color: '#FBBF24', fontSize: 13, fontWeight: '900', width: 26 },
  fsAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(14,116,144,0.4)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#38BDF8' },
  fsInitial: { color: '#fff', fontSize: 13, fontWeight: '800' },
  fsName: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  fsSub: { color: '#87B5E3', fontSize: 10.5, marginTop: 1 },
});
