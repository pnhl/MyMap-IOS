import AsyncStorage from '@react-native-async-storage/async-storage';

export const MAP_FEATURES = {
  landmarkMetadata: ['Thông tin địa danh', 'Đọc mô tả Wikidata và mở Wikipedia khi địa điểm OSM có mã liên kết; mặc định tắt.'],
  routeMatrix: ['So sánh điểm đến', 'So sánh thời gian và quãng đường bằng ô tô tới tối đa 5 địa điểm; chỉ tính khi bạn yêu cầu.'],
  reachableRange: ['Vùng có thể đi tới', 'Ước tính vùng đi xe máy hoặc ô tô trong 10–60 phút; tính chủ động trong công cụ hành trình.'],
  communityReports: ['Báo cáo đường cộng đồng', 'Ngập, ổ gà, tai nạn và đóng đường do người dùng báo; có thời hạn và xác nhận.'],
  traffic: ['Giao thông trực tiếp', 'Đánh dấu đoạn ùn tắc / đóng đường từ TomTom.'],
  places: ['Địa điểm quanh đây', 'Cây xăng, quán ăn, bãi đỗ và trạm sạc.'],
  streetImagery: ['Ảnh đường phố', 'Xem ảnh có tọa độ từ cộng đồng Mapillary.'],
  trafficSigns: ['Biển báo giao thông', 'Biển báo được ghi nhận trong OSM và Mapillary.'],
  infrastructure: ['Hạ tầng đường', 'Mặt đường, số làn, đèn tín hiệu và vật thể được nhận diện.'],
  deadEnds: ['Đường cụt', 'Hiển thị các điểm được gắn thẻ đường cụt trong OSM.'],
  imageHistory: ['Lịch sử ảnh đường', 'Chọn ảnh theo ngày chụp quanh vị trí đã chọn.'],
  imageAnalysis: ['Phân tích ảnh', 'Xem các loại vật thể Mapillary đã nhận diện trong ảnh.'],
  signAssistant: ['Trợ lý biển báo', 'Khoảng cách ước tính dọc tuyến đến biển báo phía trước; cần kiểm tra hướng áp dụng.'],
  fuelPrices: ['Giá xăng dầu', 'Giá tham khảo theo hãng, vùng và ngày từ VietFuel.'],
} as const;
export type MapFeature = keyof typeof MAP_FEATURES;
export type MapFeaturePreferences = Record<MapFeature, boolean>;
export const DEFAULT_MAP_FEATURES = Object.fromEntries(Object.keys(MAP_FEATURES).map(key => [key, false])) as MapFeaturePreferences;
const KEY = 'mymap.map.features.v1';
let snapshot = { ...DEFAULT_MAP_FEATURES };
let initialized: Promise<void> | null = null;
let writes = Promise.resolve();
const listeners = new Set<() => void>();
export function normalizeMapFeatures(value: unknown): MapFeaturePreferences {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.keys(MAP_FEATURES).map(key => [key, data[key] === true])) as MapFeaturePreferences;
}
export function getMapFeatureSnapshot() { return snapshot; }
export function subscribeMapFeatures(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function initializeMapFeatures() {
  if (!initialized) initialized = AsyncStorage.getItem(KEY).then(raw => {
    if (raw) { try { snapshot = normalizeMapFeatures(JSON.parse(raw)); } catch {} }
    listeners.forEach(listener => listener());
  }).catch(() => { initialized = null; });
  return initialized;
}
export function setMapFeature(feature: MapFeature, enabled: boolean) {
  const work = writes.then(async () => {
    await initializeMapFeatures();
    const next = { ...snapshot, [feature]: enabled };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    snapshot = next;
    listeners.forEach(listener => listener());
  });
  writes = work.catch(() => {});
  return work;
}
