import {
  invokeEdgeFunctionWithFallback,
  SUPABASE_PUBLISHABLE_KEY,
} from './supabase';

export type WeatherSnapshot = {
  fetched_at: string;
  timezone?: string;
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    weather_code?: number;
    cloud_cover?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
};

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
].join(',');
const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
].join(',');

function validCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

function isWeatherSnapshot(value: unknown): value is WeatherSnapshot {
  if (!value || typeof value !== 'object') return false;
  const current = (value as WeatherSnapshot).current;
  return Boolean(
    current
    && typeof current.temperature_2m === 'number'
    && Number.isFinite(current.temperature_2m),
  );
}

async function fetchOpenMeteoWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: CURRENT_FIELDS,
    daily: DAILY_FIELDS,
    timezone: 'auto',
    forecast_days: '7',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP ${response.status}`);
    }
    const data = await response.json() as Omit<WeatherSnapshot, 'fetched_at'>;
    const snapshot: WeatherSnapshot = {
      ...data,
      fetched_at: new Date().toISOString(),
    };
    if (!isWeatherSnapshot(snapshot)) {
      throw new Error('Open-Meteo không trả về nhiệt độ hiện tại.');
    }
    return snapshot;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherSnapshot> {
  if (!validCoordinate(latitude, longitude)) {
    throw new Error('Tọa độ thời tiết không hợp lệ.');
  }

  // Weather is public data. Force the public project credential here so a
  // Firebase ID token on the shared Supabase client cannot make the Edge
  // Function gateway reject an otherwise valid request.
  const { data, error } = await invokeEdgeFunctionWithFallback(
    'mymap-weather',
    'vibecoding-weather',
    {
      body: { latitude, longitude },
      timeout: 8_000,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
    },
  );

  if (!error && isWeatherSnapshot(data)) {
    return data;
  }

  return fetchOpenMeteoWeather(latitude, longitude);
}

export function weatherLabel(code?: number) {
  if (code == null) return 'Không rõ';
  if (code === 0) return 'Trời quang';
  if ([1, 2, 3].includes(code)) return 'Có mây';
  if ([45, 48].includes(code)) return 'Sương mù';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Mưa phùn';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Mưa';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Tuyết';
  if ([95, 96, 99].includes(code)) return 'Dông';
  return 'Thời tiết thay đổi';
}
