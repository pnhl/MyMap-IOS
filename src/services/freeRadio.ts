export type FreeRadioStation = {
  id: string;
  name: string;
  streamUrl: string;
  homepage?: string | null;
  favicon?: string | null;
  country?: string | null;
  tags: string[];
  codec?: string | null;
  bitrate?: number | null;
};

const RADIO_BROWSER_URL = 'https://de1.api.radio-browser.info/json/stations/search';

type RadioBrowserStation = {
  stationuuid?: string;
  name?: string;
  url_resolved?: string;
  url?: string;
  homepage?: string;
  favicon?: string;
  country?: string;
  tags?: string;
  codec?: string;
  bitrate?: number;
};

function isHttpStream(value: string): boolean {
  return /^https:\/\//i.test(value);
}

export function normalizeRadioStation(value: RadioBrowserStation): FreeRadioStation | null {
  const name = value.name?.trim();
  const streamUrl = (value.url_resolved || value.url || '').trim();
  if (!name || !streamUrl || !isHttpStream(streamUrl)) return null;
  return {
    id: value.stationuuid || `${name}:${streamUrl}`,
    name,
    streamUrl,
    homepage: value.homepage || null,
    favicon: value.favicon || null,
    country: value.country || null,
    tags: (value.tags || '').split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 4),
    codec: value.codec || null,
    bitrate: Number.isFinite(value.bitrate) ? value.bitrate ?? null : null,
  };
}

export const CURATED_RADIO_STATIONS: FreeRadioStation[] = [
  {
    id: 'vov_traffic',
    name: 'VOV Giao Thông',
    streamUrl: 'https://play.vovgiaothong.vn/live/gthn3/playlist.m3u8',
    homepage: 'https://vovgiaothong.vn/',
    tags: ['Giao thông', 'Tin tức', 'Việt Nam'],
    country: 'Vietnam',
  },
  {
    id:'vov_traffic_hcm', name:'VOV Giao Thông TP.HCM',
    streamUrl:'https://play.vovgiaothong.vn/live/gthcm3/playlist.m3u8',
    homepage:'https://vovgiaothong.vn/', tags:['Giao thông','Tin tức','Việt Nam'],country:'Vietnam',
  },
  {
    id:'vov_mekong', name:'VOV Mekong',
    streamUrl:'https://play.vovgiaothong.vn/live/mekong3/playlist.m3u8',
    homepage:'https://vovgiaothong.vn/', tags:['Tin tức','Việt Nam'],country:'Vietnam',
  },
];

export async function searchFreeRadioStations(
  query = '',
  signal?: AbortSignal,
): Promise<FreeRadioStation[]> {
  const cleanQuery = query.trim();
  const params = new URLSearchParams({
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
    limit: '24',
  });
  const genre = cleanQuery.toLowerCase();
  if (genre === 'việt nam' || genre === 'vietnam') params.set('countrycode', 'VN');
  else if (['lofi','jazz','classical','ambient'].includes(genre)) params.set('tag', genre);
  else if (cleanQuery) params.set('name', cleanQuery.slice(0,120));
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort',cancel,{once:true});
  const timer = setTimeout(cancel,10_000);

  try {
    const response = await fetch(`${RADIO_BROWSER_URL}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MyMap/1.0.0 (com.pnhl.vibecoding)',
      },
      signal:controller.signal,
    });
    if (!response.ok) throw new Error(`Radio Browser HTTP ${response.status}`);
    const payload = await response.json() as RadioBrowserStation[];
    if (Array.isArray(payload) && payload.length > 0) {
      const fetched = payload.map(normalizeRadioStation).filter((item): item is FreeRadioStation => Boolean(item));
      const combined = cleanQuery ? fetched : [...CURATED_RADIO_STATIONS, ...fetched];
      return [...new Map(combined.map(station=>[station.id,station])).values()];
    }
  } catch {} finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);}

  // Fallback to curated stations when offline or search fails
  if (!cleanQuery) return CURATED_RADIO_STATIONS;
  return CURATED_RADIO_STATIONS.filter(s =>
    s.name.toLowerCase().includes(cleanQuery.toLowerCase()) ||
    s.tags.some(t => t.toLowerCase().includes(cleanQuery.toLowerCase()))
  );
}
