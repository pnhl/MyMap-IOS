import { getDeviceCurrentPosition } from '../services/platformLocation';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBatteryProfile, setBatteryProfile, isTracking, startTracking, stopTracking, type BatteryProfile } from '../services/locationTracking';
import { getCurrentUser } from '../services/auth';
import { getLocationPoints, getPhotoPins } from '../db/database';
import { getLocalProfile, type LocalProfile } from '../services/localProfile';
import { exportLocalData, type ExportFormat } from '../services/dataExport';
import { getRetentionPolicy, setRetentionPolicy, applyRetentionPurge, type RetentionPeriod } from '../services/retention';
import { getPrivacyZones, savePrivacyZone, deletePrivacyZone, type PrivacyZone } from '../services/privacyZones';
import { isBatteryOptimizationIgnored, requestIgnoreBatteryOptimizations, getNativeAvailableSensors, getNativeDetectedActivity } from '../services/nativeSafety';
import { getGlobalGhostMode, setGlobalGhostMode, type GhostModeLevel } from '../services/ghostMode';
import { syncGeofences } from '../services/geofencing';
import { integrations } from '../config/env';
import { DEFAULT_MAP_PROVIDER, OPEN_MAP_STYLES, isMapTileProvider, isOpenMapProvider, type MapTileProvider } from '../config/mapProviders';
import { GlassButton, GlassChip, GlassSurface, IconBadge, glassColors, useResponsiveLayout, type IconName } from '../ui/glass';
import { ScreenScaffold, EmptyGlass } from '../ui/ScreenScaffold';
import { Text } from '../ui/Text';
import { NativeAdCard } from '../components/NativeAdCard';
import {TravelSettings} from '../components/TravelSettings';
import {MapFeatureSettings} from '../components/MapFeatureSettings';
import {ExtensionSettings} from '../components/ExtensionSettings';
import {ActionButton} from '../ui/ActionButton';
import { APP_THEMES, useAppTheme } from '../ui/theme';
import type { User } from '@supabase/supabase-js';
import { version } from '../../package.json';
import {SyncSettings} from '../components/SyncSettings';

export default function SettingsScreen() {
  const nav = useNavigation<any>();
  const r = useResponsiveLayout();
  const { theme, themeId, setThemeId } = useAppTheme();
  const pending = useRef(false);

  const [battery, setBattery] = useState<BatteryProfile>('balanced');
  const [tracking, setTracking] = useState(false);
  const [location, setLocation] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<LocalProfile>({ name: '', bio: '', avatarUri: null });
  const [counts, setCounts] = useState({ points: 0, photos: 0 });
  const [storage, setStorage] = useState({ dbMb: 0, photosMb: 0, totalMb: 0 });
  const [retention, setRetention] = useState<RetentionPeriod>('forever');
  const [privacyZones, setZones] = useState<PrivacyZone[]>([]);
  const [isDozeExempt, setIsDozeExempt] = useState(true);
  const [sensors, setSensors] = useState<Record<string, boolean>>({});
  const [detectedActivity, setDetectedActivity] = useState('STILL');
  const [ghostMode, setGhostMode] = useState<GhostModeLevel>('precise');
  const [tileProvider, setTileProvider] = useState<MapTileProvider>(DEFAULT_MAP_PROVIDER);

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ title: string; body: string } | null>(null);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);

  async function calculateStorageSizes() {
    let dbBytes = 0;
    let photoBytes = 0;
    try {
      const dbInfo = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}SQLite/vibecoding.db`);
      if (dbInfo.exists && typeof dbInfo.size === 'number') {
        dbBytes = dbInfo.size;
      }
    } catch {}
    try {
      const photoDir = `${FileSystem.documentDirectory}mymap/photos/`;
      const dirInfo = await FileSystem.getInfoAsync(photoDir);
      if (dirInfo.exists) {
        const files = await FileSystem.readDirectoryAsync(photoDir);
        for (const file of files) {
          const fInfo = await FileSystem.getInfoAsync(`${photoDir}${file}`);
          if (fInfo.exists && typeof fInfo.size === 'number') {
            photoBytes += fInfo.size;
          }
        }
      }
    } catch {}
    const dbMb = Math.round((dbBytes / (1024 * 1024)) * 10) / 10;
    const photosMb = Math.round((photoBytes / (1024 * 1024)) * 10) / 10;
    return { dbMb, photosMb, totalMb: Math.round((dbMb + photosMb) * 10) / 10 };
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([
        getBatteryProfile(),
        isTracking(),
        Location.getForegroundPermissionsAsync(),
        Notifications.getPermissionsAsync(),
        getCurrentUser(),
        getLocalProfile(),
        getLocationPoints(),
        getPhotoPins(),
        calculateStorageSizes(),
        getRetentionPolicy(),
        getPrivacyZones(),
        isBatteryOptimizationIgnored(),
        getNativeAvailableSensors(),
        getNativeDetectedActivity(),
        getGlobalGhostMode(),
        AsyncStorage.getItem('mymap.tile_provider'),
      ])
        .then(([b, t, l, n, u, p, points, photos, st, ret, zones, doze, sens, act, gm, tp]) => {
          if (!active) return;
          setBattery(b);
          setTracking(t);
          setLocation(l.granted);
          setNotifications(n.granted);
          setUser(u);
          setProfile(p);
          setCounts({ points: points.length, photos: photos.length });
          setStorage(st);
          setRetention(ret);
          setZones(zones);
          setIsDozeExempt(doze);
          setSensors(sens);
          setDetectedActivity(act);
          setGhostMode(gm);
          if (isMapTileProvider(tp)) {
            setTileProvider(tp);
          }
        })
        .catch(() => {
          if (active) setError('Không thể đọc một số thiết lập trên thiết bị.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  async function action(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function handleExport(fmt: ExportFormat) {
    setExportModalVisible(false);
    await action(async () => {
      const ok = await exportLocalData(fmt);
      if (ok) {
        setStatus(`Đã xuất dữ liệu định dạng ${fmt.toUpperCase()} thành công.`);
      }
    });
  }

  async function handlePurgeOldGps() {
    await action(async () => {
      const count = await applyRetentionPurge();
      const points = await getLocationPoints();
      setCounts(c => ({ ...c, points: points.length }));
      const st = await calculateStorageSizes();
      setStorage(st);
      setStatus(`Đã dọn dẹp ${count.toLocaleString('vi-VN')} điểm GPS cũ.`);
    });
  }

  async function handleAddCurrentPrivacyZone(label: string, radiusMeters: number) {
    await action(async () => {
      const loc = await getDeviceCurrentPosition({ accuracy: Location.Accuracy.Balanced });
      await savePrivacyZone({
        id: `pz_${Date.now()}`,
        name: label,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        radius_m: radiusMeters,
        is_active: 1,
      });
      const updated = await getPrivacyZones();
      setZones(updated);
      setStatus(`Đã thêm vùng riêng tư "${label}" (${radiusMeters}m).`);
    });
  }

  async function handleDeletePrivacyZone(id: string) {
    await action(async () => {
      await deletePrivacyZone(id);
      const updated = await getPrivacyZones();
      setZones(updated);
      setStatus('Đã xóa vùng riêng tư.');
    });
  }

  // FIX: On smartphones (< 720px width), always use 100% width cards to prevent squished two-column text wrapping
  const groupStyle = [s.group, { width: r.width >= 720 ? ('48.8%' as const) : ('100%' as const) }];

  return (
    <ScreenScaffold title="Cài đặt" subtitle="Điều chỉnh để MyMap hợp với bạn hơn." actions={[
      {id:'back',icon:'arrow-left',label:'Quay lại',onPress:()=>nav.goBack()},
      {id:'music',icon:'music-note',label:'Âm nhạc',onPress:()=>nav.navigate('Music')},
    ]}>
      <TravelSettings/>
      <SyncSettings/>
      <MapFeatureSettings/>
      <ExtensionSettings/>
      <ActionButton title="Dự báo chất lượng không khí" icon="weather-hazy" onPress={()=>nav.navigate("Environment")}/>
      <ActionButton title="AI trên thiết bị" icon="robot-outline" onPress={()=>nav.navigate("DeviceAi")}/>
      <SettingRow icon="map-marker-path" title="Tuyến ngoại tuyến đã lưu" body="Xem lại tuyến đã tính khi mất mạng" onPress={()=>nav.navigate('OfflineRoutes')}/>
      <SettingRow icon="account-group-outline" title="Bạn thân và cộng đồng" body="Theo dõi, chặn và hoạt động được chia sẻ" onPress={()=>nav.navigate('SocialTools')}/>
      <SettingRow icon="car-speed-limiter" title="Phân tích hành trình xe" body="Tốc độ và chuyển động quan sát từ GPS trên máy" onPress={()=>nav.navigate('DrivingInsights')}/>
      <GlassSurface style={s.account}>
        <IconBadge name="account-outline" size={30} />
        <View style={s.flex}>
          <Text style={s.accountName}>{profile.name || user?.user_metadata?.name || user?.email || 'Hồ sơ của bạn'}</Text>
          <Text style={s.muted}>{profile.bio || 'Khám phá nhiều hơn mỗi ngày'}</Text>
        </View>
        <GlassButton tone="neutral" onPress={() => nav.navigate('Tabs', { screen: 'Profile' })}>
          <Text style={s.white}>Hồ sơ</Text>
        </GlassButton>
      </GlassSurface>

      {loading && <ActivityIndicator color={theme.colors.primary} />}
      {error && <EmptyGlass icon="alert-circle-outline" title="Chưa thể hoàn tất" body={error} />}
      {status && <Text accessibilityLiveRegion="polite" style={s.status}>{status}</Text>}

      <View style={s.groups}>
        {/* Hồ sơ */}
        <GlassSurface style={groupStyle}>
          <GroupTitle icon="account-outline" title="Hồ sơ cá nhân" hint="Thông tin của bạn" />
          <SettingRow icon="account-outline" title="Chỉnh sửa hồ sơ" body="Tên, ảnh đại diện, mô tả" onPress={() => nav.navigate('Tabs', { screen: 'Profile' })} />
          <SettingRow
            icon="shield-check-outline"
            title="Tài khoản & bảo mật"
            body={user ? 'Xem phiên đang đăng nhập' : 'Đăng nhập bằng email'}
            onPress={() =>
              user
                ? setDialog({
                    title: 'Phiên đăng nhập',
                    body: `${user.email || 'Tài khoản MyMap'}\nĐang đăng nhập trên thiết bị này.`,
                  })
                : nav.navigate('Login')
            }
          />
          <SettingRow icon="cellphone-link" title="Thiết bị" body={user ? 'Đang đăng nhập trên thiết bị này' : 'Đang dùng trên thiết bị này'} onPress={() => setDialog({ title: 'Thiết bị', body: user ? (user.email || 'Tài khoản MyMap') + '\nĐang đăng nhập trên thiết bị này.' : 'Bạn đang dùng MyMap trên thiết bị này, chưa đăng nhập tài khoản.' })} />
        </GlassSurface>

        {/* Quyền riêng tư & Ghost Mode */}
        <GlassSurface style={groupStyle}>
          <GroupTitle icon="lock-outline" title="Quyền riêng tư" hint="Bạn quyết định chia sẻ những gì" />
          <View style={s.gpsModes}>
            <Text style={s.muted}>Vị trí bạn bè có thể nhìn thấy:</Text>
            <View style={s.chips}>
              {[
                { id: 'precise', label: 'Chính xác' },
                { id: 'fuzzy', label: 'Gần đúng' },
                { id: 'frozen', label: 'Giữ vị trí cũ' },
              ].map(item => (
                <GlassChip
                  key={item.id}
                  label={item.label}
                  active={ghostMode === item.id}
                  onPress={() =>
                    void action(async () => {
                      const loc = await Location.getLastKnownPositionAsync().catch(() => null);
                      await setGlobalGhostMode(
                        item.id as GhostModeLevel,
                        loc?.coords ? { latitude: loc.coords.latitude, longitude: loc.coords.longitude } : undefined
                      );
                      setGhostMode(item.id as GhostModeLevel);
                      setStatus(`Đã đổi chia sẻ vị trí: ${item.label}`);
                    })
                  }
                />
              ))}
            </View>
            <Text style={s.hintSmall}>
              {ghostMode === 'precise'
                ? 'Bạn bè thấy toạ độ GPS chính xác theo thời gian thực.'
                : ghostMode === 'fuzzy'
                ? 'Toạ độ của bạn được làm mờ ngẫu nhiên trong bán kính ~1 km.'
                : 'Toạ độ được đóng băng cố định tại chỗ, bạn bè thấy bạn đứng yên.'}
            </Text>
          </View>
          <SettingRow
            icon="shield-home-outline"
            title="Vùng riêng tư"
            body={`${privacyZones.length} vùng đã thiết lập (Ẩn/làm mờ nhà, công ty)`}
            onPress={() => setPrivacyModalVisible(true)}
          />
          <SettingRow
            icon="shield-lock-outline"
            title="Dữ liệu hành trình cục bộ"
            body="GPS và ảnh được lưu trên thiết bị"
            onPress={() =>
              setDialog({
                title: 'Dữ liệu hành trình',
                body:
                  'Lịch sử GPS và ảnh được lưu trong SQLite và bộ nhớ ứng dụng. Khi bạn bật vùng riêng tư, các toạ độ thuộc phạm vi nhà/công ty sẽ được làm mờ chống lộ toạ độ.',
              })
            }
          />
          <SettingRow icon="account-group-outline" title="Khám phá bạn bè" body="Quản lý bạn bè và kết nối xung quanh" onPress={() => nav.navigate('Tabs', { screen: 'Friends' })} />
        </GlassSurface>

        {/* Dữ liệu & lưu trữ */}
        <GlassSurface style={groupStyle}>
          <GroupTitle icon="database-outline" title="Dữ liệu & lưu trữ" hint="Bộ nhớ & xuất dữ liệu" />
          <SettingRow
            icon="server"
            title="Dung lượng đã dùng"
            body={`SQLite: ${storage.dbMb} MB · Ảnh: ${storage.photosMb} MB · Tổng: ${storage.totalMb} MB`}
            onPress={() =>
              setDialog({
                title: 'Bộ nhớ cục bộ',
                body: `Cơ sở dữ liệu SQLite: ${storage.dbMb} MB\nThư mục ảnh chụp: ${storage.photosMb} MB\nTổng cộng: ${storage.totalMb} MB\n\nToàn bộ dữ liệu nằm an toàn trong bộ nhớ riêng của ứng dụng trên thiết bị của bạn.`,
              })
            }
          />
          <SettingRow icon="image-outline" title="Kỷ niệm đã lưu" body={loading ? 'Đang đọc…' : `${counts.photos} ảnh trên thiết bị`} onPress={() => nav.navigate('Tabs', { screen: 'Memories' })} />
          <SettingRow icon="map-marker-path" title="Lịch sử di chuyển" body={loading ? 'Đang đọc…' : `${counts.points.toLocaleString('vi-VN')} điểm GPS`} onPress={() => nav.navigate('Tabs', { screen: 'Timeline' })} />
          <View style={s.gpsModes}>
            <Text style={s.muted}>Giữ lịch sử hành trình trong:</Text>
            <View style={s.chips}>
              {[
                { id: 'forever', label: 'Vô hạn' },
                { id: '90_days', label: '90 ngày' },
                { id: '30_days', label: '30 ngày' },
                { id: '7_days', label: '7 ngày' },
              ].map(item => (
                <GlassChip
                  key={item.id}
                  label={item.label}
                  active={retention === item.id}
                  onPress={() =>
                    void action(async () => {
                      await setRetentionPolicy(item.id as RetentionPeriod);
                      setRetention(item.id as RetentionPeriod);
                      setStatus(`Đã áp dụng thời gian lưu GPS: ${item.label}`);
                    })
                  }
                />
              ))}
            </View>
            {retention !== 'forever' && (
              <GlassButton tone="neutral" onPress={() => void handlePurgeOldGps()}>
                <Text style={s.white}>Dọn dẹp điểm GPS cũ ngay</Text>
              </GlassButton>
            )}
          </View>
          <SettingRow icon="compare" title="So sánh điểm đến" body="Chọn điểm đến tiện hơn bằng thời gian và quãng đường ô tô" onPress={() => nav.navigate('RouteComparison')} />
          <SettingRow icon="map-clock-outline" title="Vùng có thể đi tới" body="Xem vùng đi xe máy hoặc ô tô trong 10–60 phút" onPress={() => nav.navigate('ReachableRange')} />
          <SettingRow icon="download-outline" title="Xuất dữ liệu" body="Hỗ trợ JSON, GPX, GeoJSON và CSV" disabled={busy} onPress={() => setExportModalVisible(true)} />
        </GlassSurface>

        <SettingRow icon="bag-suitcase-outline" title="Công cụ hành trình" body="Chuyến đi, xe, danh sách địa điểm và bảo mật" onPress={() => nav.navigate('Catalog')} /><NativeAdCard placement="settings" />

        {/* Thông báo */}
        <GlassSurface style={groupStyle}>
          <GroupTitle icon="bell-outline" title="Thông báo" hint="Cảnh báo trên thiết bị" />
          <SettingToggle
            icon="bell-outline"
            title="Cho phép thông báo"
            body="Trạng thái quyền của hệ điều hành"
            value={notifications}
            disabled={busy || loading}
            onChange={value =>
              void action(async () => {
                if (!value) {
                  await Linking.openSettings();
                  return;
                }
                const permission = await Notifications.requestPermissionsAsync();
                setNotifications(permission.granted);
                if (!permission.granted) setStatus('Chưa cấp quyền thông báo. Bạn có thể bật trong cài đặt hệ thống.');
              })
            }
          />
          <SettingRow icon="map-marker-radius-outline" title="Cảnh báo địa điểm" body="Quản lý vùng nhắc khi đến hoặc rời" onPress={() => nav.navigate('Smart')} />
          <SettingRow icon="tune-variant" title="Cài đặt thông báo hệ thống" body="Âm thanh, quyền và hiển thị" onPress={() => void Linking.openSettings()} />
        </GlassSurface>

        {/* Trợ giúp & an toàn */}
        <GlassSurface style={groupStyle}>
          <GroupTitle icon="help-circle-outline" title="Trợ giúp & an toàn" hint="SOS & hướng dẫn" />
          <SettingRow icon="image-search-outline" title="Công cụ ảnh" body="OCR, phân loại ảnh và phát hiện ảnh tương tự trên thiết bị" onPress={() => nav.navigate('MediaTools')} />
          <SettingRow icon="download-outline" title="Bản đồ ngoại tuyến" body="Tải khu vực và xem bản đồ đã lưu khi không có mạng" onPress={() => nav.navigate('OfflineMaps')} />
          <SettingRow icon="phone-alert" title="Trợ giúp khẩn cấp SOS" body="SOS offline cache, rung nhịp tim & gửi tin khẩn" onPress={() => nav.navigate('SOS')} />
          <SettingRow
            icon="book-open-outline"
            title="Bắt đầu với MyMap"
            body="Ghi hành trình, tạo và tìm kỷ niệm"
            onPress={() =>
              setDialog({
                title: 'Bắt đầu với MyMap',
                body:
                  '1. Bấm Bắt đầu ghi hành trình ở Bản đồ và cấp quyền vị trí khi dùng ứng dụng, vị trí nền.\n2. Bấm Tạo kỷ niệm mới để chụp ảnh kèm vị trí.\n3. Xem lại ngày ở Timeline, xem Trip Story và Replay.\n4. Tìm và lọc ảnh theo Tag trong Kỷ niệm.\n5. Xem bạn bè di chuyển theo thời gian thực và cụng máy để kết bạn.',
              })
            }
          />
          <SettingRow icon="alert-circle-outline" title="Kiểm tra quyền ứng dụng" body="Vị trí, máy ảnh và thông báo" onPress={() => void Linking.openSettings()} />
        </GlassSurface>

        {/* Vị trí & theo dõi */}
        <GlassSurface style={groupStyle}>
          <GroupTitle icon="map-marker-outline" title="Vị trí & theo dõi" hint="Lọc GPS & cảm biến" />
          <SettingToggle
            icon="navigation-variant"
            title="Cho phép truy cập vị trí"
            body="Trạng thái quyền vị trí khi dùng ứng dụng"
            value={location}
            disabled={busy || loading}
            onChange={value =>
              void action(async () => {
                if (!value) {
                  await Linking.openSettings();
                  return;
                }
                const permission = await Location.requestForegroundPermissionsAsync();
                setLocation(permission.granted);
              })
            }
          />
          <SettingToggle
            icon="map-marker-path"
            title="Theo dõi hành trình"
            body="Ghi liên tục, lọc nhiễu GPS và lưu dữ liệu trên thiết bị"
            value={tracking}
            disabled={busy || loading}
            onChange={value =>
              void action(async () => {
                if (value) await startTracking();
                else await stopTracking();
                setTracking(await isTracking());
              })
            }
          />
          <SettingRow
            icon="car-speed-limiter"
            title="Nhận diện di chuyển"
            body={`Trạng thái: ${
              detectedActivity === 'IN_VEHICLE'
                ? 'Đang đi xe'
                : detectedActivity === 'ON_BICYCLE'
                ? 'Đạp xe'
                : detectedActivity === 'RUNNING'
                ? 'Chạy bộ'
                : detectedActivity === 'WALKING'
                ? 'Đi bộ'
                : 'Đứng yên'
            }`}
            onPress={() =>
              setDialog({
                title: 'Activity Recognition',
                body:
                  'Tự động phát hiện khi bạn chuyển từ đứng yên sang đi bộ, xe đạp hoặc xe hơi để điều chỉnh độ chính xác GPS và tiết kiệm pin tối ưu.',
              })
            }
          />
          <SettingRow
            icon="motion-sensor"
            title="Cảm biến an toàn"
            body={`Gia tốc: ${sensors.accelerometer ? '✓' : '✗'} · Con quay: ${sensors.gyroscope ? '✓' : '✗'} · Khí áp: ${sensors.barometer ? '✓' : '✗'} · Bước: ${sensors.stepDetector ? '✓' : '✗'}`}
            onPress={() =>
              setDialog({
                title: 'Hệ thống cảm biến an toàn',
                body: `Danh sách cảm biến phần cứng sẵn sàng:\n- Gia tốc kế (Accelerometer): ${sensors.accelerometer ? 'Có' : 'Không'}\n- Con quay hồi chuyển (Gyroscope): ${sensors.gyroscope ? 'Có' : 'Không'}\n- Khí áp kế (Barometer): ${sensors.barometer ? 'Có' : 'Không'}\n- Máy đếm bước (Step Detector): ${sensors.stepDetector ? 'Có' : 'Không'}\n\nHệ thống kết hợp đa cảm biến để phân biệt chính xác té ngã thật vs làm rơi máy lên nệm, ghế sofa.`,
              })
            }
          />
          <SettingRow
            icon="crosshairs-gps"
            title="Đồng bộ cảnh báo địa điểm"
            body="Cập nhật vùng geofence đang bật"
            disabled={busy}
            onPress={() =>
              void action(async () => {
                await syncGeofences();
                setStatus('Đã cập nhật vùng cảnh báo địa điểm.');
              })
            }
          />
        </GlassSurface>

        {/* Pin & hiệu năng */}
        <GlassSurface style={groupStyle}>
          <GroupTitle icon="battery-heart-variant" title="Pin & hiệu năng" hint="Tối ưu trải nghiệm" />
          <SettingToggle
            icon="leaf"
            title="Chế độ tiết kiệm pin"
            body="Giảm tần suất cập nhật vị trí"
            value={battery === 'battery_saver'}
            disabled={busy || loading}
            onChange={value =>
              void action(async () => {
                const next = value ? 'battery_saver' : 'balanced';
                await setBatteryProfile(next);
                setBattery(next);
              })
            }
          />
          <SettingRow
            icon="battery-charging-wireless"
            title="Bỏ qua tối ưu hóa pin (Doze Exemption)"
            body={isDozeExempt ? 'Đã cấp quyền chạy nền liên tục không bị ngắt' : 'Chưa cấp phép. Chạm để bật quyền chạy nền ổn định'}
            onPress={() =>
              void action(async () => {
                await requestIgnoreBatteryOptimizations();
                setIsDozeExempt(await isBatteryOptimizationIgnored());
              })
            }
          />
          <View style={s.gpsModes}>
            <Text style={s.muted}>Độ chính xác GPS</Text>
            <View style={s.chips}>
              {(['battery_saver', 'balanced', 'high_accuracy'] as const).map(mode => (
                <GlassChip
                  key={mode}
                  label={mode === 'battery_saver' ? 'Tiết kiệm' : mode === 'balanced' ? 'Cân bằng' : 'Chính xác'}
                  active={battery === mode}
                  onPress={() =>
                    void action(async () => {
                      await setBatteryProfile(mode);
                      setBattery(mode);
                    })
                  }
                />
              ))}
            </View>
          </View>
        </GlassSurface>


        {/* Lớp bản đồ & Giới thiệu */}
        <GlassSurface style={groupStyle}>
          <GroupTitle icon="layers-outline" title="Bản đồ & ứng dụng" hint="Hiển thị bản đồ và thông tin phiên bản" />
          <View style={s.gpsModes}>
            <Text style={s.muted}>Kiểu bản đồ:</Text>
            <View style={s.chips}>
              {[
                ...OPEN_MAP_STYLES,
                { id: 'stadia_dark', label: 'Tối' },
                { id: 'osm', label: 'OpenStreetMap' },
                { id: 'stadia_smooth', label: 'Sáng' },
                { id: 'satellite', label: 'Vệ tinh Esri' },
              ].map(item => (
                <GlassChip
                  key={item.id}
                  label={item.label}
                  active={tileProvider === item.id}
                  onPress={() =>
                    void action(async () => {
                      await AsyncStorage.setItem('mymap.tile_provider', item.id);
                      await AsyncStorage.setItem('mymap.open-map-default.v1', 'true');
                      if (isOpenMapProvider(item.id)) await AsyncStorage.setItem('mymap.map_engine', 'maplibre_native');
                      if (isMapTileProvider(item.id)) setTileProvider(item.id);
                      setStatus(`Đã chọn lớp bản đồ: ${item.label}`);
                    })
                  }
                />
              ))}
            </View>
          </View>
          <SettingRow icon="license" title="Giấy phép OpenFreeMap" body="Mã nguồn mở, dùng thương mại miễn phí · có ghi nguồn" onPress={() => void Linking.openURL('https://openfreemap.org/')} />
          <SettingRow icon="tag-outline" title="Phiên bản ứng dụng" body={`v${version}`} onPress={() => setDialog({ title: 'Phiên bản', body: `MyMap v${version}` })} />
          <SettingRow
            icon="cloud-check-outline"
            title="Trạng thái dịch vụ"
            body="Xem dịch vụ đã được cấu hình"
            onPress={() =>
              setDialog({
                title: 'Dịch vụ',
                body: [
                  'Firebase Authentication: Đã tích hợp trong ứng dụng',
                  'OpenFreeMap: Đã tích hợp · không cần API key',
                  `Supabase dữ liệu: ${integrations.supabase ? 'Đã cấu hình' : 'Chưa cấu hình'}`,
                  `Stadia Maps: ${integrations.stadiaMaps ? 'Đã kích hoạt' : 'Chưa cấu hình'}`,
                  `OpenStreetMap: ${integrations.openStreetMap ? 'Đã kích hoạt' : 'Chưa cấu hình'}`,
                  `Quảng cáo: ${integrations.adMob ? 'Đã cấu hình' : 'Chưa cấu hình'}`,
                  'Quảng cáo iOS: AdMob',
                ].join('\n'),
              })
            }
          />
        </GlassSurface>
      </View>

      <GlassSurface style={s.themePanel}>
        <View style={s.themeHeading}>
          <View style={[s.themeHeadingIcon, { backgroundColor: `${theme.colors.primary}22`, borderColor: `${theme.colors.primary}88` }]}>
            <MaterialCommunityIcons name="palette-outline" size={24} color={theme.colors.primary} />
          </View>
          <View style={s.flex}>
            <Text style={s.themeTitle}>Phong cách giao diện</Text>
            <Text style={[s.muted, { color: theme.colors.muted }]}>Chọn kiểu bạn thấy dễ đọc và thoải mái — không chỉ đổi màu</Text>
          </View>
          <Text style={[s.themeCount, { color: theme.colors.primary }]}>{APP_THEMES.length} kiểu</Text>
        </View>
        <View style={s.themeGrid}>
          {APP_THEMES.map(item => {
            const selected = item.id === themeId;
            const width = r.width < 360 || r.fontScale > 1.2 ? ('100%' as const) : r.width < 720 ? ('48%' as const) : ('31%' as const);
            return <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityLabel={`${item.name}: ${item.description}`}
              accessibilityState={{ selected }}
              onPress={() => void action(async () => {
                await setThemeId(item.id);
                setStatus(`Đã áp dụng giao diện ${item.name}.`);
              })}
              style={({ pressed }) => [
                s.themeCard,
                { width, borderColor: selected ? item.colors.primary : item.colors.border, backgroundColor: item.colors.bg, borderRadius: item.radius.control },
                selected && { borderWidth: 1.5 },
                pressed && { transform: [{ scale: .975 }], opacity: .9 },
              ]}
            >
              <LinearGradient colors={item.surfaceGradient} style={StyleSheet.absoluteFill} />
              <View style={s.themePreviewTop}>
                <View style={[s.themeDot, { backgroundColor: item.colors.primary }]} />
                <View style={[s.themeDot, { backgroundColor: item.colors.secondary }]} />
                <View style={[s.themeDot, { backgroundColor: item.colors.success }]} />
                <View style={s.themeSelected}>{selected && <MaterialCommunityIcons name="check-circle" size={20} color={item.colors.primary} />}</View>
              </View>
              <View style={s.themeMiniMap}>
                <View style={[s.themeRoute, { backgroundColor: item.colors.primary }]} />
                <MaterialCommunityIcons name={item.icon} size={22} color={item.colors.primary} />
              </View>
              <Text numberOfLines={1} style={[s.themeName, { color: item.colors.text }]}>{item.name}</Text>
              <Text numberOfLines={2} style={[s.themeDescription, { color: item.colors.muted }]}>{item.description}</Text>
            </Pressable>;
          })}
        </View>
      </GlassSurface>


      {/* Dialog chung */}
      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => setDialog(null)}>
        <View style={s.overlay}>
          <GlassSurface style={s.dialog}>
            <Text style={s.dialogTitle}>{dialog?.title}</Text>
            <Text style={s.dialogBody}>{dialog?.body}</Text>
            <GlassButton onPress={() => setDialog(null)}>
              <Text style={s.white}>Đóng</Text>
            </GlassButton>
          </GlassSurface>
        </View>
      </Modal>

      {/* Modal chọn định dạng xuất dữ liệu */}
      <Modal visible={exportModalVisible} transparent animationType="slide" onRequestClose={() => setExportModalVisible(false)}>
        <View style={s.overlay}>
          <GlassSurface style={s.dialog}>
            <Text style={s.dialogTitle}>Chọn định dạng xuất dữ liệu</Text>
            <Text style={s.dialogBody}>Xuất toàn bộ lịch sử GPS và dữ liệu kỷ niệm của bạn sang các định dạng tiêu chuẩn:</Text>
            <View style={{ gap: 10, marginVertical: 8 }}>
              <GlassButton onPress={() => void handleExport('json')}>
                <Text style={s.white}>JSON (Đầy đủ GPS + Ảnh + Điểm lưu)</Text>
              </GlassButton>
              <GlassButton onPress={() => void handleExport('gpx')}>
                <Text style={s.white}>GPX 1.1 (Garmin, Strava, Google Earth)</Text>
              </GlassButton>
              <GlassButton onPress={() => void handleExport('geojson')}>
                <Text style={s.white}>GeoJSON (Bản đồ GIS / QGIS / Web)</Text>
              </GlassButton>
              <GlassButton onPress={() => void handleExport('csv')}>
                <Text style={s.white}>CSV (Excel, Google Sheets)</Text>
              </GlassButton>
            </View>
            <GlassButton tone="neutral" onPress={() => setExportModalVisible(false)}>
              <Text style={s.white}>Hủy</Text>
            </GlassButton>
          </GlassSurface>
        </View>
      </Modal>

      {/* Modal quản lý vùng riêng tư */}
      <Modal visible={privacyModalVisible} transparent animationType="slide" onRequestClose={() => setPrivacyModalVisible(false)}>
        <View style={s.overlay}>
          <GlassSurface style={[s.dialog, { maxHeight: '80%' }]}>
            <Text style={s.dialogTitle}>Vùng riêng tư (Privacy Zones)</Text>
            <Text style={s.dialogBody}>Toạ độ nằm trong các vùng này sẽ được tự động che giấu hoặc làm mờ khi xuất dữ liệu hoặc chia sẻ vị trí:</Text>

            <View style={{ gap: 8, marginVertical: 8 }}>
              {privacyZones.length === 0 ? (
                <Text style={s.muted}>Chưa có vùng riêng tư nào được thiết lập.</Text>
              ) : (
                privacyZones.map(zone => (
                  <View key={zone.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{zone.name}</Text>
                      <Text style={{ color: '#AFD7FA', fontSize: 11 }}>
                        Bán kính: {zone.radius_m}m · ({zone.latitude.toFixed(4)}, {zone.longitude.toFixed(4)})
                      </Text>
                    </View>
                    <Pressable onPress={() => void handleDeletePrivacyZone(zone.id)} style={{ padding: 6 }}>
                      <MaterialCommunityIcons name="trash-can-outline" size={20} color="#ff6b6b" />
                    </Pressable>
                  </View>
                ))
              )}
            </View>

            <View style={{ gap: 8, marginTop: 10 }}>
              <GlassButton onPress={() => void handleAddCurrentPrivacyZone('Nhà riêng', 200)}>
                <Text style={s.white}>+ Đặt vị trí hiện tại làm Nhà riêng (200m)</Text>
              </GlassButton>
              <GlassButton onPress={() => void handleAddCurrentPrivacyZone('Cơ quan / Nơi làm việc', 300)}>
                <Text style={s.white}>+ Đặt vị trí hiện tại làm Nơi làm việc (300m)</Text>
              </GlassButton>
              <GlassButton tone="neutral" onPress={() => setPrivacyModalVisible(false)}>
                <Text style={s.white}>Đóng</Text>
              </GlassButton>
            </View>
          </GlassSurface>
        </View>
      </Modal>
    </ScreenScaffold>
  );
}

function GroupTitle({ icon, title, hint }: { icon: IconName; title: string; hint: string }) {
  const { theme } = useAppTheme();
  return (
    <View style={s.groupTitle}>
      <MaterialCommunityIcons name={icon} size={23} color={theme.colors.primary} />
      <View style={s.flex}>
        <Text style={[s.groupLabel, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[s.groupHint, { color: theme.colors.muted }]}>{hint}</Text>
      </View>
    </View>
  );
}

function SettingRow({ icon, title, body, onPress, disabled }: { icon: IconName; title: string; body: string; onPress: () => void; disabled?: boolean }) {
  const { theme } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [s.setting, pressed && { opacity: 0.75 }, disabled && { opacity: 0.5 }]}
    >
      <IconBadge name={icon} size={21} />
      <View style={s.flex}>
        <Text style={[s.label, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[s.muted, { color: theme.colors.muted }]}>{body}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.muted} />
    </Pressable>
  );
}

function SettingToggle({
  icon,
  title,
  body,
  value,
  onChange,
  disabled,
}: {
  icon: IconName;
  title: string;
  body: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { theme } = useAppTheme();
  return (
    <View style={s.setting}>
      <IconBadge name={icon} size={21} />
      <View style={s.flex}>
        <Text style={[s.label, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[s.muted, { color: theme.colors.muted }]}>{body}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: theme.colors.faint, true: theme.colors.primary }}
        thumbColor="#F4FAFF"
      />
    </View>
  );
}

const s = StyleSheet.create({
  account: { padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  themePanel: { padding: 18, gap: 16 },
  themeHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  themeHeadingIcon: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  themeTitle: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -.2 },
  themeCount: { fontSize: 11, fontWeight: '700', letterSpacing: .4 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  themeCard: { minHeight: 142, overflow: 'hidden', borderWidth: .8, padding: 13, gap: 6 },
  themePreviewTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  themeDot: { width: 8, height: 8, borderRadius: 4 },
  themeSelected: { marginLeft: 'auto', width: 20, height: 20 },
  themeMiniMap: { height: 37, marginVertical: 2, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,.13)', backgroundColor: 'rgba(255,255,255,.055)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  themeRoute: { position: 'absolute', width: '72%', height: 3, borderRadius: 2, transform: [{ rotate: '-8deg' }], opacity: .55 },
  themeName: { fontSize: 14, fontWeight: '600' },
  themeLayoutName: { fontSize: 9.5, lineHeight: 12, fontWeight: '800', letterSpacing: .35, textTransform: 'uppercase' },
  themeDescription: { fontSize: 10.5, lineHeight: 14 },
  flex: { flex: 1 },
  accountName: { fontSize: 17, fontWeight: '700', color: '#fff' },
  muted: { fontSize: 13, color: glassColors.muted, lineHeight: 19, marginTop: 2 },
  hintSmall: { fontSize: 10.5, color: '#90BEEB', lineHeight: 15, marginTop: 4 },
  white: { fontSize: 12, fontWeight: '700', color: '#fff' },
  groups: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, width: '100%' },
  group: { padding: 8, borderRadius: 22, overflow: 'hidden' },
  groupTitle: { paddingHorizontal: 12, paddingVertical: 14, flexDirection: 'row', gap: 11, alignItems: 'center' },
  groupLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  groupHint: { fontSize: 11, color: '#AFD7FA', marginTop: 2 },
  setting: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderTopWidth: .8,
    borderTopColor: 'rgba(151,181,200,.11)',
    minHeight: 70,
  },
  label: { fontSize: 13.5, fontWeight: '700', color: '#fff' },
  gpsModes: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  status: { fontSize: 13, color: glassColors.green, lineHeight: 19, marginVertical: 4 },
  overlay: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: 'rgba(1,8,28,.86)' },
  dialog: { padding: 20, gap: 12, width: '100%', maxWidth: 600, alignSelf: 'center' },
  dialogTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  dialogBody: { fontSize: 14, lineHeight: 22, color: '#C4DAF8' },
});
