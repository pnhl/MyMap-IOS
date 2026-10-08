import AsyncStorage from '@react-native-async-storage/async-storage';

export const EXTENSIONS = {
  calls: ['Gọi thoại, video và bộ đàm', 'Cuộc gọi LiveKit riêng trong hội thoại; cần mạng và quyền micro/camera.'],
  socialTools: ['Cộng đồng và bạn thân', 'Theo dõi, danh sách bạn thân và hoạt động bạn chọn chia sẻ.'],
  drivingInsights: ['Phân tích hành trình xe', 'Phân tích GPS đã lưu trên thiết bị; không tải lịch sử lên máy chủ.'],
  offlineTrips: ['Lưu tuyến ngoại tuyến', 'Giữ tuyến đã tính để xem khi mất mạng; cần tính lại khi đổi đường.'],
  voiceSearch: ['Tìm kiếm bằng giọng nói', 'Dùng bộ nhận dạng ngoại tuyến cài trên thiết bị nếu có.'],
  communityTools: ['Tương tác cộng đồng', 'Bình luận, tham gia sự kiện và báo cáo nội dung.'],
  deviceAi: ['AI trên thiết bị', 'Apple Intelligence trên thiết bị hỗ trợ hoặc mô hình GGUF cục bộ; chỉ xử lý khi bạn yêu cầu.'],
  iosWatch: ['Apple Watch', 'Đồng bộ chỉ dẫn, tốc độ và rung vùng an toàn; yêu cầu SOS cần xác nhận trên iPhone. Cần cài ứng dụng đồng hồ.'],
  carPlay: ['CarPlay', 'Đưa tuyến đang chỉ đường lên màn hình xe; cần bản build có quyền CarPlay của Apple.'],
  airQuality: ['Dự báo chất lượng không khí', 'AQI và nồng độ ô nhiễm từ mô hình Open-Meteo/CAMS; không phải trạm đo.'],
} as const;
export type Extension = keyof typeof EXTENSIONS;
export type ExtensionPreferences = Record<Extension, boolean>;
const KEY = 'mymap.extensions.v1';
let snapshot = Object.fromEntries(Object.keys(EXTENSIONS).map(k => [k, false])) as ExtensionPreferences;
let initialized: Promise<void> | null = null;
let writes: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
export function normalizeExtensions(value: unknown): ExtensionPreferences {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.keys(EXTENSIONS).map(k => [k, raw[k] === true])) as ExtensionPreferences;
}
export function extensionSnapshot() { return snapshot; }
export function subscribeExtensions(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function initializeExtensions() {
  initialized ??= AsyncStorage.getItem(KEY).then(raw => {
    snapshot = normalizeExtensions(raw ? JSON.parse(raw) : null);
    listeners.forEach(fn => fn());
  }).catch(() => { initialized = null; });
  return initialized;
}
export function setExtension(key: Extension, enabled: boolean) {
  const work = writes.catch(() => {}).then(async () => {
    await initializeExtensions();
    const next = { ...snapshot, [key]: enabled };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    snapshot = next;
    listeners.forEach(fn => fn());
  });
  writes = work;
  return work;
}
