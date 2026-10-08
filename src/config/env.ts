export type IntegrationKey =
  | 'supabase'
  | 'stadiaMaps'
  | 'mapLibre'
  | 'routing'
  | 'openStreetMap'
  | 'adMob'
  | 'amazonAps';

const value = (input: string | undefined) => input?.trim() ?? '';

export const env = {
  supabaseUrl: value(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: value(
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  stadiaMapsKey: value(process.env.EXPO_PUBLIC_STADIA_MAPS_API_KEY),
  openFreeMapBaseUrl: value(process.env.EXPO_PUBLIC_OPENFREEMAP_BASE_URL) || 'https://tiles.openfreemap.org',
  offlineTileUrl: value(process.env.EXPO_PUBLIC_OFFLINE_TILE_URL),
  mapLibreStyleUrl: value(process.env.EXPO_PUBLIC_MAPLIBRE_STYLE_URL),
  mapLibreDemUrl: value(process.env.EXPO_PUBLIC_MAPLIBRE_DEM_URL) || 'https://tiles.mapterhorn.com/tilejson.json',
  cesiumIonToken: value(process.env.EXPO_PUBLIC_CESIUM_ION_TOKEN),
  osmTileUrl: value(process.env.EXPO_PUBLIC_OSM_TILE_URL) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  osmSearchUrl: value(process.env.EXPO_PUBLIC_OSM_SEARCH_URL) || 'https://nominatim.openstreetmap.org/search',
  osmReverseUrl: value(process.env.EXPO_PUBLIC_OSM_REVERSE_URL) || 'https://nominatim.openstreetmap.org/reverse',
  osmOverpassUrl: value(process.env.EXPO_PUBLIC_OSM_OVERPASS_URL) || 'https://overpass-api.de/api/interpreter',
  routingGatewayUrl: value(process.env.EXPO_PUBLIC_ROUTING_GATEWAY_URL),
  routingProviders: value(process.env.EXPO_PUBLIC_ROUTING_PROVIDERS) || 'osrm,valhalla,graphhopper',
  osrmUrl: value(process.env.EXPO_PUBLIC_OSRM_URL) || 'https://router.project-osrm.org',
  valhallaUrl: value(process.env.EXPO_PUBLIC_VALHALLA_URL) || 'https://valhalla1.openstreetmap.de',
  graphHopperUrl: value(process.env.EXPO_PUBLIC_GRAPHHOPPER_URL) || 'https://graphhopper.com/api/1',
  graphHopperKey: value(process.env.EXPO_PUBLIC_GRAPHHOPPER_KEY),
  adMobAndroidAppId: '',
  adMobIosAppId: value(process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID),
  amazonApsAppId: '',
  googleIosClientId: value(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  googleWebClientId: value(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  enableTestAds: value(process.env.EXPO_PUBLIC_ENABLE_TEST_ADS) === 'true',
  tomTomTrafficKey: value(process.env.EXPO_PUBLIC_TOMTOM_TRAFFIC_KEY),
  mapillaryToken: value(process.env.EXPO_PUBLIC_MAPILLARY_ACCESS_TOKEN),
  vietFuelUrl: value(process.env.EXPO_PUBLIC_VIETFUEL_URL) || 'https://vietfuel-api.tranqui.workers.dev',
  nativeAdUnitIds: {
    smart: value(process.env.EXPO_PUBLIC_ADMOB_NATIVE_SMART_ID),
    friends: value(process.env.EXPO_PUBLIC_ADMOB_NATIVE_FRIENDS_ID),
    timeline: value(process.env.EXPO_PUBLIC_ADMOB_NATIVE_TIMELINE_ID),
    stats: value(process.env.EXPO_PUBLIC_ADMOB_NATIVE_STATS_ID),
    profile: value(process.env.EXPO_PUBLIC_ADMOB_NATIVE_PROFILE_ID),
    memories: value(process.env.EXPO_PUBLIC_ADMOB_NATIVE_MEMORIES_ID),
    heatmap: value(process.env.EXPO_PUBLIC_ADMOB_NATIVE_HEATMAP_ID),
    settings: value(process.env.EXPO_PUBLIC_ADMOB_NATIVE_SETTINGS_ID),
    place: value(process.env.EXPO_PUBLIC_ADMOB_NATIVE_PLACE_ID),
  },
  bannerAdUnitIds: {
    smart: value(process.env.EXPO_PUBLIC_ADMOB_BANNER_SMART_ID),
    friends: value(process.env.EXPO_PUBLIC_ADMOB_BANNER_FRIENDS_ID),
    timeline: value(process.env.EXPO_PUBLIC_ADMOB_BANNER_TIMELINE_ID),
    stats: value(process.env.EXPO_PUBLIC_ADMOB_BANNER_STATS_ID),
    profile: value(process.env.EXPO_PUBLIC_ADMOB_BANNER_PROFILE_ID),
    memories: value(process.env.EXPO_PUBLIC_ADMOB_BANNER_MEMORIES_ID),
    heatmap: value(process.env.EXPO_PUBLIC_ADMOB_BANNER_HEATMAP_ID),
    settings: value(process.env.EXPO_PUBLIC_ADMOB_BANNER_SETTINGS_ID),
    place: value(process.env.EXPO_PUBLIC_ADMOB_BANNER_PLACE_ID),
  },
} as const;

export const integrations: Record<IntegrationKey, boolean> = {
  supabase: Boolean(env.supabaseUrl && env.supabasePublishableKey),
  stadiaMaps: Boolean(env.stadiaMapsKey),
  mapLibre: Boolean(env.mapLibreStyleUrl || env.osmTileUrl),
  routing: Boolean(env.routingGatewayUrl || env.osrmUrl || env.valhallaUrl || (env.graphHopperUrl && env.graphHopperKey)),
  openStreetMap: Boolean(env.osmTileUrl && env.osmSearchUrl && env.osmOverpassUrl),
  adMob: Boolean(env.adMobIosAppId),
  amazonAps: Boolean(env.amazonApsAppId),
};
