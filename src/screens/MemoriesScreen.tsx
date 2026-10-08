import {listLocalMoments,type Moment} from '../services/moments';
import {TextInput} from '../ui/TextInput';
import { Text } from '../ui/Text';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { searchMemories } from '../utils/memorySearch';
import { getPhotoPins } from '../db/database';

import {
  GlassButton,
  GlassSegmentedTabs,
  GlassSurface,
  IconBadge,
  TopIconButton,
  glassColors,
  useResponsiveLayout,
} from '../ui/glass';
import { EmptyGlass, ScreenScaffold, SectionTitle } from '../ui/ScreenScaffold';
import { NativeAdCard } from '../components/NativeAdCard';
import type { PhotoPin } from '../types/photo';

type FilterTab = 'all' | 'photos' | 'places' | 'albums';

interface GroupedMonth {
  key: string;
  label: string;
  items: PhotoPin[];
  places: { placeName: string; items: PhotoPin[] }[];
}

export default function MemoriesScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const [searchVisible,setSearchVisible] = useState(false);
  const [captureBusy,setCaptureBusy] = useState(false);
  const [collapsed,setCollapsed] = useState<Record<string,boolean>>({});
  const r = useResponsiveLayout();
  const [moments,setMoments]=useState<Moment[]>([]);
  const [photos, setPhotos] = useState<PhotoPin[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const searchInput = useRef<TextInput>(null);
  const capturing = useRef(false);
  const revealSearch = useCallback(()=>{setSearchVisible(true); requestAnimationFrame(()=>searchInput.current?.focus());},[]);
  useFocusEffect(useCallback(()=>{if(route.params?.focusSearch){revealSearch();nav.setParams({focusSearch:false});}},[route.params?.focusSearch,revealSearch,nav]));

  const loadData = useCallback(async (isActive: () => boolean = () => true) => {
    try {
      const [list,newMoments] = await Promise.all([getPhotoPins(),listLocalMoments()]);
      if (isActive()) { setPhotos(list);setMoments(newMoments); setError(null); }
    } catch {
      if (isActive()) setError('Không thể đọc thư viện kỷ niệm. Hãy thử lại.');
    } finally {
      if (isActive()) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadData(() => active);
    return () => { active = false; };
  }, [loadData]));

  async function handleTakeNewPhoto() { nav.navigate('MomentCamera',{purpose:'memory'}); }

  // Sort photos newest first
  const latestPhotos = useMemo(() => {
    return [...searchMemories(photos, query)].sort((a, b) => b.capturedAt - a.capturedAt);
  }, [photos, query]);

  // On This Day photos (same month and day in previous years)
  const onThisDayPhotos = useMemo(() => {
    const today = new Date();
    const curMonth = today.getMonth();
    const curDate = today.getDate();
    return photos.filter(p => {
      const d = new Date(p.capturedAt);
      return d.getMonth() === curMonth && d.getDate() === curDate && d.getFullYear() < today.getFullYear();
    });
  }, [photos]);

  // Featured photo of the day (the most recent one or null)
  const featuredPhoto = latestPhotos[0] || null;

  // Recent trips / places (unique places among recent photos)
  const recentPlaces = useMemo(() => {
    const map = new Map<string, PhotoPin>();
    for (const p of latestPhotos) {
      const key = p.placeName || `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`;
      if (!map.has(key)) {
        map.set(key, p);
      }
      if (map.size >= 3) break;
    }
    return Array.from(map.entries());
  }, [latestPhotos]);

  // Grouped by Month & Year for the "All" and "Albums" tabs
  const monthlyGroups = useMemo<GroupedMonth[]>(() => {
    const monthMap = new Map<string, PhotoPin[]>();
    for (const p of latestPhotos) {
      const d = new Date(p.capturedAt);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const arr = monthMap.get(k) || [];
      arr.push(p);
      monthMap.set(k, arr);
    }

    return Array.from(monthMap.entries()).map(([k, items]) => {
      const parts = k.split('-');
      const year = parts[0] || '';
      const month = parts[1] || '1';
      const label = `Tháng ${parseInt(month, 10)}, ${year}`;

      // Subgroup by place inside this month
      const placeMap = new Map<string, PhotoPin[]>();
      for (const item of items) {
        const placeKey = item.placeName || `${item.latitude.toFixed(3)}, ${item.longitude.toFixed(3)}`;
        const arr = placeMap.get(placeKey) || [];
        arr.push(item);
        placeMap.set(placeKey, arr);
      }

      const places = Array.from(placeMap.entries()).map(([placeName, pItems]) => ({
        placeName,
        items: pItems,
      }));

      return { key: k, label, items, places };
    });
  }, [latestPhotos]);

  // Grouped by Place for the "places" tab
  const placeGroups = useMemo(() => {
    const map = new Map<string, PhotoPin[]>();
    for (const p of latestPhotos) {
      const key = p.placeName || `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`;
      const arr = map.get(key) || [];
      arr.push(p);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([placeName, items]) => ({
      placeName,
      items,
      count: items.length,
      latestDate: items[0]?.capturedAt,
      sample: items[0],
    }));
  }, [latestPhotos]);

  const tabs: { key: FilterTab; label: string; icon: any }[] = [
    { key: 'all', label: 'Tất cả', icon: 'view-grid-outline' },
    { key: 'photos', label: 'Ảnh', icon: 'image-outline' },
    { key: 'places', label: 'Địa điểm', icon: 'map-marker-outline' },
    { key: 'albums', label: 'Album', icon: 'image-multiple-outline' },
  ];

  function openPlace(name: string, lat: number, lon: number) {
    nav.navigate('PlaceDetail', {
      name,
      latitude: lat,
      longitude: lon,
    });
  }

  const cols = r.layout === 'narrow' ? 2 : r.layout === 'phone' ? 3 : r.layout === 'foldable' ? 4 : 5;

  return (
    <ScreenScaffold
      title="Kỷ niệm"
      subtitle="Lưu giữ khoảnh khắc, kết nối những nơi bạn đã đi"
      quote="Những bức ảnh là những hành trình vẫn còn nguyên cảm xúc..."
      onSearch={revealSearch}
      actions={[
  {id:'search',icon:'magnify',label:'Tìm kỷ niệm',onPress:revealSearch},
  {id:'moments',icon:'account-heart-outline',label:'Khoảnh khắc cùng bạn bè',onPress:()=>nav.navigate('Moments')},
  {id:'camera',icon:'camera-outline',label:'Chụp ảnh',primary:true,busy:captureBusy,onPress:()=>void handleTakeNewPhoto()},
 ]}

    >
      <GlassSurface style={{padding:18,gap:12}}>
        <Text style={{fontSize:19,fontWeight:'700',color:'#F6FAFF'}}>Khoảnh khắc cùng bạn bè</Text>
        <Text style={{color:glassColors.muted}}>Ảnh, video ngắn, nhật ký nhóm và widget riêng tư.</Text>
        {!!moments.length&&<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:12}}>{moments.slice(0,5).map(m=><Pressable key={m.id} onPress={()=>nav.navigate('MomentDetail',{momentId:m.id})}><Image source={{uri:m.coverUri}} style={{width:84,height:104,borderRadius:16}}/>{m.kind==='video'&&<Text style={{color:glassColors.cyan,fontSize:11}}>▶ {Math.round(m.durationSeconds)}s</Text>}</Pressable>)}</ScrollView>}
        <GlassButton onPress={()=>nav.navigate('Moments')}><Text style={s.btnText}>Mở khoảnh khắc</Text></GlassButton>
        <GlassButton tone="neutral" onPress={()=>nav.navigate('MediaTools')}><Text style={s.btnText}>Đọc chữ và phân loại ảnh</Text></GlassButton>
      </GlassSurface>
      {searchVisible && <GlassSurface style={s.searchBar}>
        <MaterialCommunityIcons name="magnify" size={22} color={glassColors.cyan} />
        <TextInput ref={searchInput} value={query} onChangeText={setQuery} style={s.searchInput}
          accessibilityLabel="Tìm theo tên, ghi chú, địa điểm hoặc ngày" placeholder="Tên, địa điểm, ghi chú, ngày…"
          placeholderTextColor={glassColors.faint} autoCorrect={false} returnKeyType="search" />
        {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Xóa tìm kiếm" onPress={() => setQuery('')} style={s.clearSearch}>
          <MaterialCommunityIcons name="close-circle" size={22} color={glassColors.muted} />
        </Pressable>}
      </GlassSurface>}
      {loading && <ActivityIndicator color={glassColors.cyan} accessibilityLabel="Đang tải thư viện" />}
      {error && <EmptyGlass icon="alert-circle-outline" title="Không thể tải thư viện" body={error}
        action={<GlassButton onPress={() => void loadData()}><Text style={s.btnText}>Thử lại</Text></GlassButton>} />}
      {!loading && !error && photos.length > 0 && latestPhotos.length === 0 && <EmptyGlass icon="magnify" title="Không tìm thấy kỷ niệm"
        body="Thử một tên địa điểm, ghi chú hoặc ngày khác. Bạn có thể nhập tiếng Việt không dấu."
        action={<GlassButton tone="neutral" onPress={() => setQuery('')}><Text style={s.btnText}>Xem tất cả kỷ niệm</Text></GlassButton>} />}
      {/* Segmented Filter Control */}
      <GlassSegmentedTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* On this day banner if matching historical photos exist */}
      {onThisDayPhotos.length > 0 && (
        <GlassSurface tone="violet" style={s.onThisDayCard}>
          <View style={s.onThisDayHeader}>
            <IconBadge name="history" tone="violet" size={22} />
            <View style={s.onThisDayCopy}>
              <Text style={s.onThisDayTitle}>Ngày này năm xưa</Text>
              <Text style={s.onThisDaySub}>{onThisDayPhotos.length} khoảnh khắc được chụp vào ngày hôm nay</Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.onThisDayList}>
            {onThisDayPhotos.map(p => (
              <Pressable key={p.id} onPress={() => nav.navigate('MemoryDetail', { photoId: p.id })} style={s.onThisDayItem}>
                <Image source={{ uri: p.uri }} style={s.onThisDayThumb} />
                <Text style={s.onThisDayYear}>{new Date(p.capturedAt).getFullYear()}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </GlassSurface>
      )}

      <NativeAdCard placement="memories" />

      {/* When no photos are stored in SQLite */}
      {!loading && !error && photos.length === 0 && moments.length === 0 && (
        <EmptyGlass
          icon="camera-image"
          title="Chưa có kỷ niệm"
          body="Chụp ảnh đầu tiên để lưu khoảnh khắc và nơi bạn đã ghé. Ảnh và ghi chú được lưu trên thiết bị."
          action={
            <GlassButton tone="purple" disabled={captureBusy} onPress={() => void handleTakeNewPhoto()}>
              <View style={s.btnRow}>
                <MaterialCommunityIcons name="camera" size={18} color="#fff" />
                <Text style={s.btnText}>{captureBusy?'Đang mở máy ảnh…':'Chụp ảnh kỷ niệm đầu tiên'}</Text>
              </View>
            </GlassButton>
          }
        />
      )}

      {/* TAB: ALL */}
      {latestPhotos.length > 0 && activeTab === 'all' && (
        <>
          {/* Top dual cards: Featured of the day + Recent trips */}
          <View style={[s.heroRow, (r.width>=390&&r.fontScale<=1.2) && s.heroRowWide]}>
            {/* Featured Photo */}
            {featuredPhoto && (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[s.heroCol, (r.width>=390&&r.fontScale<=1.2) && s.heroColWide]}
                onPress={() => nav.navigate('MemoryDetail', { photoId: featuredPhoto.id })}
              >
                <GlassSurface style={s.featuredCard}>
                  <View style={s.cardHeader}>
                    <View style={s.badgeWrap}>
                      <MaterialCommunityIcons name="star-four-points" size={16} color={glassColors.cyan} />
                      <Text style={s.cardTitle}>Kỷ niệm mới nhất</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={glassColors.faint} />
                  </View>
                  <Text style={s.cardSub}>Khoảnh khắc đặc biệt từ hành trình</Text>
                  <View style={s.featuredImgWrap}>
                    <Image source={{ uri: featuredPhoto.uri }} style={s.featuredImg} />
                    <View style={s.featuredOverlay}>
                      {!!featuredPhoto.note && (
                        <Text numberOfLines={1} style={s.featuredQuote}>
                          "{featuredPhoto.note}"
                        </Text>
                      )}
                      <View style={s.featuredFooter}>
                        <View style={s.locationTag}>
                          <MaterialCommunityIcons name="map-marker" size={14} color={glassColors.cyan} />
                          <Text numberOfLines={1} style={s.locationText}>
                            {featuredPhoto.placeName || 'Điểm đã lưu'}
                          </Text>
                        </View>
                        <Text style={s.dateTag}>
                          {new Date(featuredPhoto.capturedAt).toLocaleDateString('vi-VN')}
                        </Text>
                      </View>
                    </View>
                  </View>
                </GlassSurface>
              </TouchableOpacity>
            )}

            {/* Recent Trips Strip */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={[s.heroCol, (r.width>=390&&r.fontScale<=1.2) && s.heroColWide]}
              onPress={() => setActiveTab('places')}
            >
              <GlassSurface style={s.recentCard}>
                <View style={s.cardHeader}>
                  <View style={s.badgeWrap}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color={glassColors.purple} />
                    <Text style={s.cardTitle}>Kỷ niệm gần đây</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={glassColors.faint} />
                </View>
                <Text style={s.cardSub}>Những chuyến đi mới nhất</Text>

                <View style={s.recentThumbRow}>
                  {recentPlaces.map(([placeName, item]) => (
                    <Pressable
                      key={item.id}
                      style={s.recentThumbItem}
                      onPress={() => openPlace(placeName, item.latitude, item.longitude)}
                    >
                      <Image source={{ uri: item.uri }} style={s.recentThumbImg} />
                      <Text numberOfLines={1} style={s.recentThumbPlace}>
                        {placeName}
                      </Text>
                      <Text style={s.recentThumbDate}>
                        {new Date(item.capturedAt).toLocaleDateString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </GlassSurface>
            </TouchableOpacity>
          </View>

          {/* Monthly Sections */}
          {monthlyGroups.map((month) => (
            <View key={month.key} style={s.monthBlock}>
              <View style={s.monthHeader}>
                <Text style={s.monthTitle}>{month.label}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={collapsed[month.key]?"Mở tháng":"Thu gọn tháng"} accessibilityState={{expanded:!collapsed[month.key]}} onPress={()=>setCollapsed(v=>({...v,[month.key]:!v[month.key]}))} style={s.monthCountWrap}>
                  <Text style={s.monthCount}>{month.items.length} kỷ niệm</Text>
                  <MaterialCommunityIcons name={collapsed[month.key]?'chevron-down':'chevron-up'} size={18} color={glassColors.muted} />
                </Pressable>
              </View>

              {!collapsed[month.key] && month.places.map((p) => {
                const mainPhoto = p.items[0];
                if (!mainPhoto) return null;
                const extraThumbnails = p.items.slice(1, 4);
                const overflowCount = Math.max(0, p.items.length - 4);

                return (
                  <TouchableOpacity
                    key={p.placeName}
                    activeOpacity={0.88}
                    style={s.placeCardTouch}
                    onPress={() =>
                      openPlace(p.placeName, mainPhoto.latitude, mainPhoto.longitude)
                    }
                  >
                    <GlassSurface style={s.albumCard}>
                      <View style={s.albumContent}>
                        {/* Main large preview */}
                        <Image source={{ uri: mainPhoto.uri }} style={s.albumMainImg} />

                        {/* Right side information */}
                        <View style={s.albumInfo}>
                          <View style={s.albumTitleRow}>
                            <View style={s.albumTitleBox}>
                              <MaterialCommunityIcons name="map-marker" size={16} color={glassColors.cyan} />
                              <Text numberOfLines={1} style={s.albumPlaceName}>
                                {p.placeName}
                              </Text>
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={20} color={glassColors.faint} />
                          </View>

                          <View style={s.albumDateRow}>
                            <MaterialCommunityIcons name="calendar-blank-outline" size={14} color={glassColors.muted} />
                            <Text style={s.albumDateText}>
                              {new Date(mainPhoto.capturedAt).toLocaleDateString('vi-VN')}
                            </Text>
                          </View>

                          {/* Thumbnails row */}
                          <View style={s.thumbRow}>
                            {extraThumbnails.map((extra) => (
                              <Image key={extra.id} source={{ uri: extra.uri }} style={s.miniThumb} />
                            ))}
                            {overflowCount > 0 && (
                              <View style={s.overflowTile}>
                                <Text style={s.overflowText}>+{overflowCount}</Text>
                              </View>
                            )}
                          </View>

                          {/* Optional note or quote */}
                          {!!mainPhoto.note && (
                            <Text numberOfLines={1} style={s.albumQuote}>
                              "{mainPhoto.note}"
                            </Text>
                          )}
                        </View>
                      </View>
                    </GlassSurface>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </>
      )}

      {/* TAB: PHOTOS GRID */}
      {latestPhotos.length > 0 && activeTab === 'photos' && (
        <>
          <SectionTitle>{latestPhotos.length} ảnh đã ghi lại</SectionTitle>
          <View style={s.photoGrid}>
            {latestPhotos.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={{ width: `${100 / cols}%`, padding: 4 }}
                activeOpacity={0.82}
                onPress={() => nav.navigate('MemoryDetail', { photoId: p.id })}
              >
                <GlassSurface style={s.photoGridTile}>
                  <Image source={{ uri: p.uri }} style={s.photoGridImg} />
                  <View style={s.photoGridMeta}>
                    <Text numberOfLines={1} style={s.photoGridPlace}>
                      {p.placeName || `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`}
                    </Text>
                    <Text style={s.photoGridDate}>
                      {new Date(p.capturedAt).toLocaleDateString('vi-VN')}
                    </Text>
                  </View>
                </GlassSurface>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* TAB: PLACES LIST */}
      {latestPhotos.length > 0 && activeTab === 'places' && (
        <>
          <SectionTitle>{placeGroups.length} địa điểm trong hành trình</SectionTitle>
          <View style={s.placesList}>
            {placeGroups.map((pg) => (
              <TouchableOpacity
                key={pg.placeName}
                activeOpacity={0.8}
                onPress={() =>
                  pg.sample &&
                  openPlace(pg.placeName, pg.sample.latitude, pg.sample.longitude)
                }
              >
                <GlassSurface style={s.placeItemRow}>
                  {pg.sample ? (
                    <Image source={{ uri: pg.sample.uri }} style={s.placeItemThumb} />
                  ) : (
                    <View style={s.placeItemThumbPlaceholder}>
                      <MaterialCommunityIcons name="map-marker" size={24} color={glassColors.cyan} />
                    </View>
                  )}
                  <View style={s.placeItemCopy}>
                    <Text style={s.placeItemName}>{pg.placeName}</Text>
                    <Text style={s.placeItemSubtitle}>
                      {pg.count} ảnh · gần nhất {new Date(pg.latestDate || Date.now()).toLocaleDateString('vi-VN')}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={24} color="#D7E8FF" />
                </GlassSurface>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* TAB: ALBUMS */}
      {latestPhotos.length > 0 && activeTab === 'albums' && (
        <>
          <SectionTitle>{monthlyGroups.length} bộ sưu tập theo thời gian</SectionTitle>
          <View style={s.albumsGrid}>
            {monthlyGroups.map((mg) => (
              <TouchableOpacity
                key={mg.key}
                style={[s.albumGridItem, { width: r.isWide ? '48.5%' : '100%' }]}
                activeOpacity={0.85}
                onPress={() => { setQuery(mg.key); setActiveTab('all'); }}
              >
                <GlassSurface style={s.albumGridCard}>
                  {mg.items[0] && (
                    <Image source={{ uri: mg.items[0].uri }} style={s.albumGridCover} />
                  )}
                  <View style={s.albumGridCopy}>
                    <Text style={s.albumGridTitle}>{mg.label}</Text>
                    <Text style={s.albumGridSub}>
                      {mg.places.length} địa điểm · {mg.items.length} ảnh
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={glassColors.cyan} />
                </GlassSurface>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </ScreenScaffold>
  );
}

const s = StyleSheet.create({
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 48, color: glassColors.text, fontSize: 13 },
  clearSearch: { padding: 8 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  heroRow: { gap: 12, marginTop: 4 },
  heroRowWide: { flexDirection: 'row' },
  heroCol: { width: '100%' },
  heroColWide: { width: '48.8%' },
  featuredCard: { padding: 14, minHeight: 200 },
  recentCard: { padding: 14, minHeight: 200 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex:1 },
  cardTitle: { color: '#fff', fontWeight: '800', fontSize: 12.5, flexShrink:1 },
  cardSub: { color: glassColors.muted, fontSize: 11.5, marginTop: 2, marginBottom: 10 },
  featuredImgWrap: { height: 130, borderRadius: 16, overflow: 'hidden', backgroundColor: '#07183D' },
  featuredImg: { width: '100%', height: '100%' },
  featuredOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    backgroundColor: 'rgba(2, 10, 28, 0.76)',
    gap: 4,
  },
  featuredQuote: { fontStyle: 'italic', color: '#D4E9FF', fontSize: 11 },
  featuredFooter: { gap:3 },
  locationTag: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  locationText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  dateTag: { color: glassColors.cyan, fontSize: 11, fontWeight: '700' },
  recentThumbRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  recentThumbItem: { flex: 1, alignItems: 'center' },
  recentThumbImg: { width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: '#081E48' },
  recentThumbPlace: { color: '#fff', fontWeight: '800', fontSize: 11, marginTop: 5, textAlign: 'center' },
  recentThumbDate: { color: glassColors.muted, fontSize: 10, marginTop: 1 },
  monthBlock: { gap: 10, marginTop: 8 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  monthTitle: { color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: -0.3 },
  monthCountWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthCount: { color: glassColors.muted, fontSize: 12.5, fontWeight: '700' },
  placeCardTouch: { marginBottom: 2 },
  albumCard: { padding: 12 },
  albumContent: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  albumMainImg: { width: '37%', aspectRatio:1, borderRadius:16, borderWidth:1, borderColor:'#8ADDFF', backgroundColor:'#081D46' },
  albumInfo: { flex: 1, gap: 5 },
  albumTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  albumTitleBox: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  albumPlaceName: { color: '#fff', fontWeight: '800', fontSize: 15, flexShrink:1 },
  albumDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  albumDateText: { color: glassColors.muted, fontSize: 11.5 },
  thumbRow: { flexDirection: 'row', gap: 6, marginTop: 3 },
  miniThumb: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#0A2558' },
  overflowTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(23, 73, 149, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(92, 192, 255, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  albumQuote: { fontStyle: 'italic', color: 'rgba(180, 220, 255, 0.78)', fontSize: 11, marginTop: 2 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  photoGridTile: { overflow: 'hidden' },
  photoGridImg: { width: '100%', aspectRatio: 1, backgroundColor: '#07183D' },
  photoGridMeta: { padding: 8 },
  photoGridPlace: { color: '#fff', fontWeight: '800', fontSize: 12 },
  photoGridDate: { color: glassColors.muted, fontSize: 10.5, marginTop: 2 },
  placesList: { gap: 8 },
  placeItemRow: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeItemThumb: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#0A2558' },
  placeItemThumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(35, 110, 205, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeItemCopy: { flex: 1 },
  placeItemName: { color: '#fff', fontWeight: '900', fontSize: 15 },
  placeItemSubtitle: { color: glassColors.muted, fontSize: 12, marginTop: 3 },
  albumsGrid: { gap: 10, flexDirection: 'row', flexWrap: 'wrap' },
  albumGridItem: { minWidth: 160 },
  albumGridCard: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  albumGridCover: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#0A2558' },
  albumGridCopy: { flex: 1 },
  albumGridTitle: { color: '#fff', fontWeight: '900', fontSize: 14.5 },
  albumGridSub: { color: glassColors.muted, fontSize: 11.5, marginTop: 2 },
  onThisDayCard: { padding: 12, borderRadius: 18, marginBottom: 8, gap: 10 },
  onThisDayHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  onThisDayCopy: { flex: 1 },
  onThisDayTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  onThisDaySub: { color: '#D4BFFF', fontSize: 11, marginTop: 2 },
  onThisDayList: { gap: 10, paddingVertical: 4 },
  onThisDayItem: { alignItems: 'center', gap: 4 },
  onThisDayThumb: { width: 66, height: 66, borderRadius: 14, backgroundColor: '#0A2558' },
  onThisDayYear: { color: '#C8B0FF', fontSize: 10.5, fontWeight: '700' },
});
