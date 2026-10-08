import {useCommunityRoads,CommunityRoadSheet} from '../components/CommunityRoads';
import {guidanceSpeechCue} from '../utils/guidanceSpeech';
import {speakGuidance,stopGuidanceSpeech as stopGuidance} from '../services/platformCapabilities';
import {createChatRoom} from '../services/privateChat';
import {saveOfflineRoute} from '../services/offlineRoutes';
import {useExtensions} from '../hooks/useExtensions';
import {TextInput} from '../ui/TextInput';
import { Text } from '../ui/Text';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, DeviceEventEmitter, Image, Modal, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation, useRoute, type CompositeNavigationProp, type RouteProp } from '@react-navigation/native';
import { useBottomTabBarHeight, type BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Platform, StatusBar } from 'react-native';
import type { LeafletTileProvider } from '../components/LeafletMap';
import {
  MAP_RENDERER_ENGINES,
  MAP_RENDERER_LABELS,
  MapRenderer,
  isMapRendererEngine,
  type MapRendererEngine,
  type MapRendererRef,
} from '../components/MapRenderer';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocationPoints, getPhotoPins } from '../db/database';
import { startTracking, stopTracking, isTracking, getBatteryProfile, getTrackingMode, getTrackingError, type BatteryProfile, type TrackingMode } from '../services/locationTracking';

import { supabase } from '../services/supabase';
import { fetchWeather, type WeatherSnapshot } from '../services/weather';
import { publishLivePresence } from '../services/liveSafety';
import { glassColors, useResponsiveLayout, type IconName } from '../ui/glass';
import { useAppTheme } from '../ui/theme';
type HomeAction = 'tracking' | 'photo' | 'locate' | null;
type LatLng = { latitude: number; longitude: number };
import { AmbientBackdrop, GlassSurface, GlassButton, IconBadge, ScreenQuote } from '../ui/glass';
import { ActionSheet } from '../ui/ActionSheet';
import { WeatherCard } from '../ui/WeatherCard';
import { visitsWithinLocalDays } from '../utils/journeyStats';
import { NATIVE_MAPS_ENABLED } from '../config/maps';
import { distanceMeters, formatDateTime } from '../utils/geo';
import { groupPointsByLocalDay, localDayKey } from '../utils/journeyStats';
import type { MainTabsParamList, RootStackParamList } from '../navigation/types';
import type { LocationPoint } from '../types/location';
import type { PhotoPin } from '../types/photo';
import type { CrowdCell } from '../types/safety';
import { type OsmSearchResult } from '../services/openStreetMap';
import { env } from '../config/env';
import { DEFAULT_MAP_PROVIDER, OPEN_MAP_STYLES, isMapTileProvider, isOpenMapProvider } from '../config/mapProviders';
import {
  getLiveFriends,
  broadcastContinuousPresence,
  detectPartyGroups,
  getMapChatMessages,
  postMapChatMessage,
  sendFriendInteraction,
  subscribeToFriendInteractions,
  subscribeToMapChat,
  type RealtimeFriend,
  type RealtimePartyGroup,
  type MapChatMessage,
  type FriendInteractionEvent,
} from '../services/realtimeFriends';
import { getCurrentSession, getCurrentUser,subscribeAuthState } from '../services/auth';
import {
  startLiveTrip,
  updateLiveTrip,
  endLiveTrip,
  getActiveLiveTrip,
  formatTripShareMessage,
  type LiveTripSession,
} from '../services/liveTripShare';
import { formatBatteryDisplay } from '../services/friendStatus';
import { setFriendGhostMode, type GhostModeLevel } from '../services/ghostMode';
import { FriendDetailModal } from '../components/FriendDetailModal';
import { MapChatModal } from '../components/MapChatModal';
import { BumpModal } from '../components/BumpModal';
import { InteractionWheel } from '../components/InteractionWheel';
import { EmojiBombOverlay } from '../components/EmojiBombOverlay';
import { VoicePingModal } from '../components/VoicePingModal';
import { AchievementsModal } from '../components/AchievementsModal';
import { WrappedStoryModal } from '../components/WrappedStoryModal';
import { TimeCapsuleModal } from '../components/TimeCapsuleModal';
import { ARFinderModal } from '../components/ARFinderModal';
import { HangoutInviteModal } from '../components/HangoutInviteModal';
import { RealtimeInteractionsOverlay } from '../components/RealtimeInteractionsOverlay';
import { MusicStatusWidget } from '../components/MusicStatusWidget';
import {LandscapeMapControls} from '../components/LandscapeMapControls';
import {getDeviceCurrentPosition,watchNavigationPosition} from '../services/platformLocation';
import {travelNative} from '../services/travelPlatform';
import {getNavigationPreferences,DEFAULT_NAVIGATION_PREFERENCES,warningThreshold} from '../services/navigationPreferences';
import {Vibration} from 'react-native';
import { NavigationHud } from '../components/NavigationHud';
import { LiveTripCard } from '../components/LiveTripCard';
import { updateWidgetSnapshot } from '../services/widgetBridge';
import { downloadCityOfflinePack, PRESET_CITIES } from '../services/offlineMap';
import { Alert } from 'react-native';
import {useJourneyMusic,toggleJourneyMusic,nextJourneyMusic,playDefaultJourneyRadio} from '../services/musicControls';
import {duckMusicForWarning} from '../services/musicPlayback';
import { getMapStories24h, type MapStory } from '../services/mapStories';
import { getUnlockedHexCells, hexToPolygonCoords } from '../services/scratchMap';
import { registerOneTimeArrivalAlert, checkArrivalAlerts } from '../services/destinationPrediction';
import { fetchRoadRoute, getRouteGuidance, matchTraveledRouteSegments, type RouteGuidance } from '../services/roadRouting';
import type {RoadRouteResult,RoutingMode} from '../services/roadRouting';
import {PlaceSearchSheet} from '../components/PlaceSearchSheet';
import {familiarSearchPlace} from '../services/placeSearchHistory';
import {getNearbyMapPlaces,type MapPlace} from '../services/mapPlaces';
import {useMapFeatures,MapFeatureSettings} from '../components/MapFeatureSettings';
import {useRoadExplorer,RoadDetailsSheet} from '../components/RoadExplorer';
import {upcomingRoadSigns} from '../services/upcomingRoadSigns';
import {prioritizeRoadMarkers} from '../services/roadExplorer';
import {MapScale} from '../components/MapScale';
import {fetchRouteTraffic,type RouteTraffic} from '../services/routeTraffic';
import {navigationCamera} from '../utils/navigationCamera';
import {rawTraveledSegments, traceDistance, type TraveledSegments} from '../services/traveledTrace';
import { getRoadSpeedContext, type RoadSpeedContext } from '../services/roadSpeedLimit';
import {
  deriveReliableGpsSpeedKmh,
  evaluateRouteProximity,
  navigationDistanceMeters,
  pointAlongRoute,
  type GpsSpeedFix,
} from '../utils/navigation';

type HomeNavigation = CompositeNavigationProp<BottomTabNavigationProp<MainTabsParamList, 'Map'>, NativeStackNavigationProp<RootStackParamList>>;
type MapRouteProp = RouteProp<MainTabsParamList, 'Map'>;
const defaultCenter = { latitude: 21.028511, longitude: 105.854167, latitudeDelta: 0.04, longitudeDelta: 0.04 };

export type TileProvider = LeafletTileProvider;

const TILE_MAP: Record<TileProvider, { label: string }> = {
  openfreemap_liberty: { label: 'OpenFreeMap · Liberty' },
  openfreemap_liberty_3d: { label: 'OpenFreeMap · Thành phố 3D' },
  openfreemap_dark: { label: 'OpenFreeMap · Dark' },
  openfreemap_positron: { label: 'OpenFreeMap · Positron' },
  stadia_dark: {
    label: 'Bản đồ Tối',
  },
  carto_dark: {
    label: 'Bản đồ Tối',
  },
  osm: {
    label: 'OSM Bright',
  },
  stadia_smooth: {
    label: 'Bản đồ Sáng',
  },
  satellite: {
    label: 'Vệ tinh',
  },
};

export default function MapScreen() {
  const nav = useNavigation<HomeNavigation>();
  const route = useRoute<MapRouteProp>();
  const r = useResponsiveLayout();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0);
  const tabHeight = useBottomTabBarHeight();
  const mapDockHeight = (theme.layout.dock === 'compact' || r.isLandscape ? 58 : 70) + Math.max(insets.bottom, 8) + 8;
  const bottomControlsInset = Math.max(tabHeight, mapDockHeight) + 14;
  const focused = useIsFocused();
  const mapRef = useRef<MapRendererRef>(null);
  const initialCenterApplied = useRef(false);
  const pendingRef = useRef<HomeAction>(null);
  const navigationHeading=useRef<number|null>(null);
  const previousSpeedFixRef = useRef<GpsSpeedFix | null>(null);
  const filteredSpeedRef = useRef<number | null>(null);

  const [points, setPoints] = useState<LocationPoint[]>([]);
  const [photos, setPhotos] = useState<PhotoPin[]>([]);
  const [tracking, setTracking] = useState(false);
  const [trackingMode, setTrackingMode] = useState<TrackingMode | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [battery, setBattery] = useState<BatteryProfile>('balanced');
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherRefreshKey, setWeatherRefreshKey] = useState(0);
  const [crowd, setCrowd] = useState<CrowdCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<HomeAction>(null);
  const [expanded, setExpanded] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [advancedLayers, setAdvancedLayers] = useState(false);
  const [showRoute, setShowRoute] = useState(true);
  const [showPhotos, setShowPhotos] = useState(true);
  const [showFriends, setShowFriends] = useState(true);
  const [tileProvider, setTileProvider] = useState<TileProvider>(DEFAULT_MAP_PROVIDER);
  const [mapEngine, setMapEngine] = useState<MapRendererEngine>('maplibre_native');
  const [foregroundGranted, setForegroundGranted] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<LatLng | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapLoadError,setMapLoadError]=useState<string|null>(null);
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);
  const [fullscreenMap, setFullscreenMap] = useState(true);
  const [destination, setDestination] = useState<{ latitude: number; longitude: number; name: string } | null>(null);
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('carStopNavigation', () => setDestination(null));
    return () => subscription.remove();
  }, []);
  const [destinationRoadRoute, setDestinationRoadRoute] = useState<[number, number][] | undefined>(undefined);
  const extensions=useExtensions();
  const [routeChoices,setRouteChoices]=useState<RoadRouteResult[]>([]);
  const [selectedRouteIndex,setSelectedRouteIndex]=useState(0);
  const [routeTraffic,setRouteTraffic]=useState<RouteTraffic|null>(null);
  const [routeRefresh,setRouteRefresh]=useState(0);
  const [mapPlaces,setMapPlaces]=useState<MapPlace[]>([]);
  const [mapViewport,setMapViewport]=useState<{latitude:number;longitude:number;zoom:number}|null>(null);
  const [destinationRoadInfo, setDestinationRoadInfo] = useState<{ kmStr: string; minutes: number; distanceMeters: number } | null>(null);
  const [navigationTopHeight, setNavigationTopHeight] = useState(190);
  const [navigationBottomHeight, setNavigationBottomHeight] = useState(138);
  const [routeGuidance, setRouteGuidance] = useState<RouteGuidance | null>(null);
  const [destinationWeather, setDestinationWeather] = useState<WeatherSnapshot | null>(null);
  const [routeAheadWeather, setRouteAheadWeather] = useState<WeatherSnapshot | null>(null);
  const [routeAheadDistanceMeters, setRouteAheadDistanceMeters] = useState(5_000);
  const [navigationWeatherUpdatedAt, setNavigationWeatherUpdatedAt] = useState<number | null>(null);
  const [navigationWeatherTick, setNavigationWeatherTick] = useState(0);
  const [todayRoadSegments, setTodayRoadSegments] = useState<TraveledSegments | undefined>(undefined);
  const [travelMode, setTravelMode] = useState<RoutingMode>('motorbike');
  const [liveSpeedKmh, setLiveSpeedKmh] = useState<number | null>(null);
  const [navigationPosition, setNavigationPosition] = useState<LatLng | null>(null);
  const [routeUnavailable,setRouteUnavailable]=useState(false);
  const [followNavigation,setFollowNavigation]=useState(true);
  const [navigationAccuracy,setNavigationAccuracy]=useState<number|null>(null);
  const [gpsStatusOpen,setGpsStatusOpen]=useState(false);
  const [gpsTick,setGpsTick]=useState(0);
  const pendingCenter=useRef<LatLng|null>(null);
  const routeIdentity=useRef('');
  useEffect(()=>{setFollowNavigation(true);},[destination?.latitude,destination?.longitude]);
  useEffect(()=>{if(!gpsStatusOpen)return;const timer=setInterval(()=>setGpsTick(v=>v+1),1000);return()=>clearInterval(timer);},[gpsStatusOpen]);
  const [navigationPreferences,setNavigationPreferences]=useState(DEFAULT_NAVIGATION_PREFERENCES);
  const lastSpeedWarning=useRef(0);
  const navigationFixAt=useRef(0);
  useEffect(()=>{
    if(!destination)return;
    const timer=setInterval(()=>{if(Date.now()-navigationFixAt.current>10000)setLiveSpeedKmh(null);},1000);
    return()=>clearInterval(timer);
  },[!!destination]);
  useFocusEffect(useCallback(()=>{let active=true;void getNavigationPreferences().then(p=>{if(active)setNavigationPreferences(p);});return()=>{active=false;};},[]));
  const [roadSpeedContext, setRoadSpeedContext] = useState<RoadSpeedContext | null>(null);
  const roadMatchedPosition=useRef<LatLng|null>(null);
  useEffect(()=>{
    if(navigationPosition&&roadMatchedPosition.current&&traceDistance(navigationPosition,roadMatchedPosition.current)>45)setRoadSpeedContext(null);
  },[navigationPosition]);
  const [replayActive, setReplayActive] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2 | 4>(1);

  // Social & Realtime states
  const [friends, setFriends] = useState<RealtimeFriend[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<RealtimeFriend | null>(null);
  const [wheelFriend, setWheelFriend] = useState<RealtimeFriend | null>(null);
  const [inviteModalFriend, setInviteModalFriend] = useState<RealtimeFriend | null>(null);
  const [chatTargetFriend, setChatTargetFriend] = useState<RealtimeFriend | null>(null);
  const destinationStepsRef = useRef<any[]>([]);
  const journeyMusic = useJourneyMusic();
  const [footprintsFriend, setFootprintsFriend] = useState<RealtimeFriend | null>(null);
  const [partyGroups, setPartyGroups] = useState<RealtimePartyGroup[]>([]);
  const [mapChatMessages, setMapChatMessages] = useState<MapChatMessage[]>([]);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [bumpModalOpen, setBumpModalOpen] = useState(false);
  const [mapStories, setMapStories] = useState<MapStory[]>([]);
  const [activeStory, setActiveStory] = useState<MapStory | null>(null);
  const [showScratch, setShowScratch] = useState(false);
  const [scratchHexagons, setScratchHexagons] = useState<[number, number][][]>([]);

  // 4 Feature Groups States (Zenly / Bump Next-Gen)
  const [emojiBombOpen, setEmojiBombOpen] = useState(false);
  const [emojiTargetFriend, setEmojiTargetFriend] = useState<RealtimeFriend | null>(null);
  const [voicePingFriend, setVoicePingFriend] = useState<RealtimeFriend | null>(null);
  const [arFinderFriend, setArFinderFriend] = useState<RealtimeFriend | null>(null);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const [timeCapsuleOpen, setTimeCapsuleOpen] = useState(false);
  const [offlineDownloading, setOfflineDownloading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('me');
  const [incomingInteraction, setIncomingInteraction] = useState<FriendInteractionEvent | null>(null);
  const [liveTripSession, setLiveTripSession] = useState<LiveTripSession | null>(null);
  const lastPresenceRef = useRef<{ latitude: number; longitude: number; sentAt: number } | null>(null);

  useEffect(() => {
    // Request initial position immediately if permission granted
    void Location.getForegroundPermissionsAsync().then(perm => {
      if (perm.granted) {
        setForegroundGranted(true);
        void Location.getLastKnownPositionAsync().then(last => {
          if (last) {
            setCurrentPosition({ latitude: last.coords.latitude, longitude: last.coords.longitude });
            navigationFixAt.current=last.timestamp;
            setNavigationAccuracy(last.coords.accuracy);
          }
          return getDeviceCurrentPosition({ accuracy: Location.Accuracy.Balanced });
        }).then(pos => {
          if (pos) {
            setCurrentPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            navigationFixAt.current=pos.timestamp;
            setNavigationAccuracy(pos.coords.accuracy);
          }
        }).catch(() => {});
      }
    }).catch(() => {});

    void getCurrentUser().then(user => {
      if (user?.id) setCurrentUserId(user.id);
    });

    void getActiveLiveTrip().then(session => {
      if (session) setLiveTripSession(session);
    });


  }, []);

  // Lắng nghe tương tác bạn bè & tin nhắn bản đồ Realtime
  useEffect(() => {
    if(!focused)return;
    const unsubInteractions = subscribeToFriendInteractions(currentUserId, event => {
      setIncomingInteraction(event);
    });
    const unsubChat = subscribeToMapChat(newMsg => {
      setMapChatMessages(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [newMsg, ...prev].slice(0, 30);
      });
    });

    return () => {
      if (typeof unsubInteractions === 'function') unsubInteractions();
      if (typeof unsubChat === 'function') unsubChat();
    };
  }, [currentUserId,focused]);
  useEffect(()=>{let previous:string|undefined;return subscribeAuthState((_event,session)=>{const next=session?.user.id||'me';if(previous!==undefined&&previous!==next){setFriends([]);setPartyGroups([]);setMapChatMessages([]);setIncomingInteraction(null);setSelectedFriend(null);setWheelFriend(null);setChatTargetFriend(null);}setCurrentUserId(next);previous=next;});},[]);

  // Khởi động hoặc cập nhật chuyến đi trực tiếp (Live Trip Session)
  useEffect(() => {
    const originCoord = currentPosition || (points.length > 0 ? points[points.length - 1] : null);
    if (destination && originCoord) {
      void startLiveTrip(
        { name: 'Vị trí hiện tại', latitude: originCoord.latitude, longitude: originCoord.longitude },
        { name: destination.name, latitude: destination.latitude, longitude: destination.longitude },
        liveSpeedKmh || 30
      ).then(session => {
        setLiveTripSession(session);
      });
    } else if (!destination && liveTripSession) {
      void endLiveTrip().then(() => {
        setLiveTripSession(null);
      });
    }
  }, [destination]);

  // Cập nhật tọa độ di chuyển theo thời gian thực cho Live Trip
  useEffect(() => {
    if (liveTripSession?.isActive) {
      const pos = currentPosition || (points.length > 0 ? points[points.length - 1] : null);
      if (pos) {
        void updateLiveTrip(pos.latitude, pos.longitude, liveSpeedKmh || 30).then(updated => {
          if (updated) setLiveTripSession(updated);
        });
      }
    }
  }, [currentPosition, points, liveSpeedKmh]);

  const handleEndLiveTrip = useCallback(async () => {
    await endLiveTrip();
    setLiveTripSession(null);
    setDestination(null);
  }, []);

  const handleShareLiveTrip = useCallback(async () => {
    if (!liveTripSession?.isActive) return;
    const session = destinationRoadInfo ? {
      ...liveTripSession,
      remainingDistanceMeters: destinationRoadInfo.distanceMeters,
      etaMinutes: destinationRoadInfo.minutes,
    } : liveTripSession;
    try { await Share.share({ message: formatTripShareMessage(session), title: `Chuyến đi tới ${session.destination.name}` }); } catch {}
  }, [liveTripSession, destinationRoadInfo]);

  useEffect(()=>{if(route.params?.searchQuery)setPlaceSearchOpen(true);},[route.params?.searchQuery]);

  useEffect(() => {
    if (route.params?.destination) {
      setDestination(route.params.destination);
      setTravelMode(route.params.travelMode || 'motorbike');
    }
  }, [route.params?.destination, route.params?.travelMode]);

  useEffect(() => {
    const focusFriendId = route.params?.focusFriendId;
    if (!focusFriendId || !friends.length) return;
    const friend = friends.find(item => item.userId === focusFriendId || item.id === focusFriendId);
    if (!friend) return;
    setSelectedFriend(friend);
    mapRef.current?.animateToRegion({ latitude: friend.latitude, longitude: friend.longitude, zoom: 16 }, 650);
    nav.setParams({ focusFriendId: undefined });
  }, [route.params?.focusFriendId, friends, nav]);

  useEffect(() => {
    if (currentPosition) {
      const lastPt = points.length > 0 ? points[points.length - 1] : undefined;
      void updateWidgetSnapshot({
        friendCount: friends.length,
        batteryPercent: 95,
        currentPlaceName: destination?.name || 'Đang khám phá',
        speedKmh: Math.round(lastPt?.speed ? lastPt.speed * 3.6 : 0),
        statusEmoji: '⚡',
      });
    }
  }, [currentPosition, friends.length, destination?.name, points]);

  // Preserve explicit provider selections; migrate the previous default once.
  useFocusEffect(useCallback(() => {
    let active=true;
    void Promise.all([AsyncStorage.getItem('mymap.tile_provider'),AsyncStorage.getItem('mymap.map_engine'),AsyncStorage.getItem('mymap.open-map-default.v1')]).then(async([stored,engine,migrated])=>{
      if(!active)return;
      const hasExplicitProvider = stored === 'satellite' || ((stored === 'stadia_dark' || stored === 'stadia_smooth') && Boolean(env.stadiaMapsKey));
      const provider = (migrated || hasExplicitProvider) && isMapTileProvider(stored) ? stored : DEFAULT_MAP_PROVIDER;
      const selectedEngine = isOpenMapProvider(provider) && engine!=='maplibre_gl' ? 'maplibre_native' : isMapRendererEngine(engine) ? engine : 'maplibre_native';
      setTileProvider(provider);setMapEngine(selectedEngine);
      await AsyncStorage.setItem('mymap.map_engine',selectedEngine);
      await AsyncStorage.setItem('mymap.tile_provider',provider);
      await AsyncStorage.setItem('mymap.open-map-default.v1','true');
    }).catch(()=>{});
    return()=>{active=false;};
  }, []));

  const changeTileProvider = useCallback(async (tp: TileProvider) => {
    setMapLoaded(false);
    setMapLoadError(null);
    setTileProvider(tp);
    if(isOpenMapProvider(tp)){setMapEngine('maplibre_native');await AsyncStorage.setItem('mymap.map_engine','maplibre_native');}
    await AsyncStorage.setItem('mymap.tile_provider', tp).catch(() => {});
  }, []);

  const changeMapEngine = useCallback(async (engine: MapRendererEngine) => {
    setMapLoaded(false);
    setMapLoadError(null);
    setMapEngine(engine);
    await AsyncStorage.setItem('mymap.map_engine', engine).catch(() => {});
  }, []);

  const refresh = useCallback(async (active: () => boolean = () => true) => {
    try {
      const [p, m, t, b, permission, activeTrackingMode, trackingError] = await Promise.all([
        getLocationPoints(),
        getPhotoPins(),
        isTracking(),
        getBatteryProfile(),
        Location.getForegroundPermissionsAsync(),
        getTrackingMode(),
        getTrackingError(),
      ]);
      if (!active()) return;
      setPoints(p);
      setPhotos(m);
      setTracking(t);
      setTrackingMode(activeTrackingMode);
      setRecordingError(trackingError);
      setBattery(b);
      setForegroundGranted(permission.granted);
      setDataError(null);
      if (permission.granted) {
        void Location.getLastKnownPositionAsync()
          .then(last => {
            if (active() && last) setCurrentPosition({ latitude: last.coords.latitude, longitude: last.coords.longitude });
          })
          .catch(() => {});
      }
      void getMapStories24h().then(st => { if (active()) setMapStories(st); }).catch(() => {});
      void getUnlockedHexCells().then(cells => {
        if (active()) {
          const hexs = cells.slice(0, 300).map(c => hexToPolygonCoords(c.q, c.r));
          setScratchHexagons(hexs);
        }
      }).catch(() => {});
    } catch {
      if (active()) setDataError('Không thể tải hành trình. Chạm nút thử lại.');
    } finally {
      if (active()) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void refresh(() => active);
      const timer = setInterval(() => void refresh(() => active), 20000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [refresh])
  );

  const latestPoint = points[points.length - 1];
  const latestPhoto = photos[photos.length - 1];

  // Keep the navigation speed bubble live without requiring background tracking.
  useEffect(() => {
    if (!destination) {
      setLiveSpeedKmh(null);
      setNavigationPosition(null);
      setRoadSpeedContext(null);
      previousSpeedFixRef.current = null;
      filteredSpeedRef.current = null;
      return;
    }

    if (!focused) return;
    let active = true;
    let subscription: Location.LocationSubscription | null = null;
    void Location.getForegroundPermissionsAsync()
      .then(async permission => {
        if (!active || !permission.granted) return;
        subscription = await watchNavigationPosition(
          location => {
            if (!active) return;
            if(!Number.isFinite(location.coords.latitude)||!Number.isFinite(location.coords.longitude)||Math.abs(location.coords.latitude)>90||Math.abs(location.coords.longitude)>180||Date.now()-location.timestamp>15000)return;
            setNavigationAccuracy(location.coords.accuracy);
            if(location.coords.accuracy!=null&&location.coords.accuracy>65){setLiveSpeedKmh(null);return;}
            navigationFixAt.current=location.timestamp;
            navigationHeading.current=location.coords.heading;
            const fix: GpsSpeedFix = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
              speedMps: location.coords.speed,
              timestamp: location.timestamp,
            };
            const reliableSpeed = deriveReliableGpsSpeedKmh(
              fix,
              previousSpeedFixRef.current,
              filteredSpeedRef.current,
            );
            previousSpeedFixRef.current = fix;
            if (reliableSpeed !== null) {
              filteredSpeedRef.current = reliableSpeed;
              setLiveSpeedKmh(reliableSpeed);
            } else if (fix.speedMps != null && fix.speedMps >= 0 && (fix.accuracy == null || fix.accuracy <= 35)) {
              const nativeSpeedKmh = Math.round(fix.speedMps * 3.6);
              filteredSpeedRef.current = nativeSpeedKmh;
              setLiveSpeedKmh(nativeSpeedKmh);
            } else {
              setLiveSpeedKmh(null);
            }
            setNavigationPosition({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          }
        );
        if(!active)subscription?.remove();
      })
      .catch(() => {if(active)setActionError('Chưa nhận được GPS cho chỉ đường. Bấm Về giữa để cấp quyền và thử lại.');});

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [Boolean(destination), focused, foregroundGranted]);

  const roadPositionRef=useRef<LatLng|null>(null);
  roadPositionRef.current=navigationPosition||currentPosition||null;
  const roadRequest=useRef<AbortController|null>(null);
  const [routeOrigin,setRouteOrigin]=useState<{latitude:number;longitude:number}|null>(null);
  const routeOriginUpdated=useRef(0);
  const routeDestinationKey=`${destination?.latitude},${destination?.longitude}`;
  const previousRouteDestination=useRef('');
  useEffect(()=>{
    const position=navigationPosition || currentPosition || latestPoint;
    if(!destination || !position){if(!destination)setRouteOrigin(null);return;}
    const changed=previousRouteDestination.current!==routeDestinationKey;
    if(changed || !routeOrigin){
      previousRouteDestination.current=routeDestinationKey;
      routeOriginUpdated.current=Date.now();
      setRouteOrigin({latitude:position.latitude,longitude:position.longitude});
      return;
    }
    // Check if user is actively deviating from the current route line
    if (destinationRoadRoute && destinationRoadRoute.length > 1) {
      const proximity = evaluateRouteProximity(position, destinationRoadRoute);
      if (proximity && !proximity.isOnRoute && proximity.distanceMeters > 55 && (navigationAccuracy == null || navigationAccuracy <= 40)) {
        if (Date.now() - routeOriginUpdated.current >= 6000 && traceDistance(routeOrigin, position) > 25) {
          routeOriginUpdated.current = Date.now();
          setRouteOrigin({ latitude: position.latitude, longitude: position.longitude });
        }
      }
    } else if (Date.now()-routeOriginUpdated.current>=15000 && traceDistance(routeOrigin,position)>80){
      routeOriginUpdated.current=Date.now();
      setRouteOrigin({latitude:position.latitude,longitude:position.longitude});
    }
  },[navigationPosition,currentPosition,latestPoint,routeDestinationKey,routeOrigin,destinationRoadRoute,navigationAccuracy]);

  // Dynamically update remaining distance and ETA along current route as GPS advances
  useEffect(() => {
    if (!destination || !destinationRoadRoute || destinationRoadRoute.length < 2) return;
    const pos = navigationPosition || currentPosition;
    if (!pos) return;
    const proximity = evaluateRouteProximity(pos, destinationRoadRoute);
    if (!proximity || !proximity.isOnRoute) return;
    const remainingKm = proximity.remainingDistanceMeters / 1000;
    const kmStr = remainingKm.toLocaleString('vi-VN', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const speedKmh = (liveSpeedKmh != null && liveSpeedKmh > 10) ? liveSpeedKmh : (travelMode === 'car' ? 35 : travelMode === 'foot' ? 5 : travelMode === 'bike' ? 15 : 28);
    const minutes = Math.max(1, Math.round((remainingKm / speedKmh) * 60));
    setDestinationRoadInfo(curr => {
      if (curr && Math.abs(curr.distanceMeters - proximity.remainingDistanceMeters) < 15 && curr.minutes === minutes) return curr;
      return { kmStr, minutes, distanceMeters: proximity.remainingDistanceMeters };
    });
  }, [navigationPosition, currentPosition, destinationRoadRoute, destination, liveSpeedKmh, travelMode]);

  useEffect(() => {
    if (!destination || travelMode==='foot' || travelMode==='bike') {
      setRoadSpeedContext(null);
      return;
    }
    if(!focused)return;
    let active = true;
    let loading = false;
    const lookup = async () => {
      const position=roadPositionRef.current;
      if(!position||loading||Date.now()-navigationFixAt.current>15000)return;
      loading=true;
      const controller=new AbortController();roadRequest.current=controller;
      const heading=(filteredSpeedRef.current??0)>8?navigationHeading.current:null;
      const context=await getRoadSpeedContext(position.latitude,position.longitude,travelMode,{heading,signal:controller.signal});
      loading=false;
      if(!active)return;
      const latest=roadPositionRef.current;
      const fresh=latest&&traceDistance(position,latest)<=45;
      roadMatchedPosition.current=fresh?position:null;
      setRoadSpeedContext(fresh?context:null);
    };
    setRoadSpeedContext(null);
    void lookup();
    const timer=setInterval(()=>void lookup(),6000);
    return()=>{active=false;clearInterval(timer);roadRequest.current?.abort();};
  },[Boolean(destination),focused,travelMode]);

  // Realtime friends, Continuous Presence & Map Chat loop (every 4s)
  useEffect(() => {
    let active = true;
    const runRealtimeSync = async () => {
      const pos = currentPosition || latestPoint;
      try {
        const [f, c] = await Promise.all([
          getLiveFriends(pos),
          getMapChatMessages(),
        ]);
        if (!active) return;
        setFriends(f);
        setMapChatMessages(c);
        setPartyGroups(detectPartyGroups(f, pos));

        void checkArrivalAlerts(f, w => {
          Alert.alert('Đến nơi 🔔', `${w.friendName} đã đến đích (${w.destinationName})!`);
        });

        if (pos) {
          const previousPresence = lastPresenceRef.current;
          const shouldBroadcast = !previousPresence
            || Date.now() - previousPresence.sentAt > 30_000
            || distanceMeters(previousPresence, pos) >= 15;
          if (!shouldBroadcast) return;
          lastPresenceRef.current = { latitude: pos.latitude, longitude: pos.longitude, sentAt: Date.now() };
          void broadcastContinuousPresence({
            latitude: pos.latitude,
            longitude: pos.longitude,
            heading: latestPoint?.heading,
            speedMps: latestPoint?.speed,
          });
        }
      } catch {}
    };

    void runRealtimeSync();
    const interval = setInterval(() => {
      if (active && focused) void runRealtimeSync();
    }, destination ? 6000 : 12000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [focused, currentPosition?.latitude, currentPosition?.longitude, latestPoint?.timestamp, Boolean(destination)]);

  const weatherPosition = currentPosition || latestPoint;
  const weatherPositionKey = weatherPosition
    ? `${weatherPosition.latitude.toFixed(2)},${weatherPosition.longitude.toFixed(2)}`
    : null;

  useEffect(() => {
    if (!weatherPosition || !focused) return;
    let active = true;
    const position = weatherPosition;
    const run = async () => {
      const weatherRequest = fetchWeather(position.latitude, position.longitude);
      const session = await getCurrentSession().catch(() => null);
      const presenceRequest = session
        ? publishLivePresence({
            latitude: position.latitude,
            longitude: position.longitude,
            accuracy_m: position === latestPoint ? latestPoint?.accuracy : undefined,
          })
        : Promise.resolve<CrowdCell[] | null>(null);
      const [weatherResult, presenceResult] = await Promise.allSettled([
        weatherRequest,
        presenceRequest,
      ]);
      if (!active) return;
      setWeather(weatherResult.status === 'fulfilled' ? weatherResult.value : null);
      if (presenceResult.status === 'fulfilled' && presenceResult.value) {
        setCrowd(presenceResult.value);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [weatherPositionKey, weatherRefreshKey, focused]);

  const today = localDayKey(Date.now());
  const todayPoints = useMemo(() => groupPointsByLocalDay(points).get(today) || [], [points, today]);

  const todayTraceKey=`${today}:${todayPoints.length}:${todayPoints[0]?.timestamp}:${todayPoints[todayPoints.length-1]?.timestamp}`;
  // Keep the original trace visible while matching every fix, without joining GPS gaps.
  useEffect(() => {
    let active = true;
    if (todayPoints.length < 2) {
      setTodayRoadSegments([]);
      return;
    }
    setTodayRoadSegments(rawTraveledSegments(todayPoints));
    void matchTraveledRouteSegments(todayPoints).then(snapped => {
      if (active) setTodayRoadSegments(snapped);
    }).catch(()=>{});
    return () => {
      active = false;
    };
  }, [todayTraceKey]);

  // 2. Tính toán đường dẫn bộ chính xác theo mạng lưới giao thông tới điểm đến (thay vì vẽ đường thẳng chim bay)
  function chooseRoadRoute(result:RoadRouteResult,index:number){
    setSelectedRouteIndex(index);setDestinationRoadRoute(result.coordinates);destinationStepsRef.current=result.steps||[];
    setDestinationRoadInfo({kmStr:(result.distanceMeters/1000).toLocaleString('vi-VN',{minimumFractionDigits:1,maximumFractionDigits:1}),minutes:Math.max(1,Math.round(result.durationSeconds/60)),distanceMeters:result.distanceMeters});
    setRouteGuidance(getRouteGuidance(result.steps,navigationPosition||currentPosition));setRouteUnavailable(false);
  }
  const features=useMapFeatures();
  const [selectedMapPlace,setSelectedMapPlace]=useState<MapPlace|null>(null);
  const poiAnchor=mapViewport||currentPosition;
  const explorer=useRoadExplorer(poiAnchor,focused,mapViewport?.zoom||14,features);
  const upcomingSigns=features.signAssistant&&destination?upcomingRoadSigns(destinationRoadRoute||[],navigationPosition||currentPosition,explorer.features,navigationAccuracy,navigationFixAt.current):[];
  const community=useCommunityRoads(poiAnchor,features.communityReports,focused);
  const visiblePlaces=[...community.markers.slice(0,12),...prioritizeRoadMarkers(explorer.markers,poiAnchor),...mapPlaces.filter(place=>features.places||(features.fuelPrices&&place.kind==='fuel')).slice(0,10)];
  const trafficTileUrl=focused&&features.traffic&&env.tomTomTrafficKey?`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(env.tomTomTrafficKey)}`:'';
  const poiKey=poiAnchor?`${poiAnchor.latitude.toFixed(2)},${poiAnchor.longitude.toFixed(2)}:${!mapViewport||mapViewport.zoom>=13}`:'';
  useEffect(()=>{if(!focused||!(features.places||features.fuelPrices)||!poiAnchor||mapViewport&&mapViewport.zoom<13){setMapPlaces([]);return;}let active=true;const abort=new AbortController();setMapPlaces([]);void getNearbyMapPlaces(poiAnchor.latitude,poiAnchor.longitude,abort.signal).then(places=>{if(active)setMapPlaces(places);}).catch(()=>{});return()=>{active=false;abort.abort();};},[poiKey,focused,features.places,features.fuelPrices]);
  useEffect(()=>{
    if(!features.traffic||!destination||!focused||!routeChoices.length){setRouteTraffic(null);return;}
    if(routeChoices.every(route=>route.provider==='tomtom')){
      const updatedAt=Math.min(...routeChoices.map(route=>route.trafficUpdatedAt||0));
      setRouteTraffic({status:'available',updatedAt,sampledPoints:0,segments:routeChoices.flatMap((route,index)=>(route.trafficSegments||[]).map((coordinates,i)=>({id:`${index}:${i}`,coordinates,currentSpeed:0,freeFlowSpeed:0,closed:false,updatedAt})))});return;
    }
    let active=true,request:AbortController|null=null;setRouteTraffic(null);
    const load=()=>{request?.abort();request=new AbortController();void fetchRouteTraffic(routeChoices.map(route=>route.coordinates),request.signal).then(data=>{if(active)setRouteTraffic(data);}).catch(()=>{if(active)setRouteTraffic({status:'unavailable',segments:[],sampledPoints:0,updatedAt:null});});};
    load();return()=>{active=false;request?.abort();};
  },[routeChoices,!!destination,focused,features.traffic]);
  useEffect(() => {
    let active = true;
    const origin = routeOrigin;
    if (!destination || !origin) {
      setRouteChoices([]);setSelectedRouteIndex(0);
      setDestinationRoadRoute(undefined);
      setDestinationRoadInfo(null);
      setRouteGuidance(null);
      destinationStepsRef.current=[];
      setRouteUnavailable(Boolean(destination));
      return;
    }

    const identity=destination.latitude+','+destination.longitude+'|'+travelMode+'|'+JSON.stringify(navigationPreferences);
    if(routeIdentity.current!==identity){setRouteChoices([]);setDestinationRoadRoute(undefined);setDestinationRoadInfo(null);destinationStepsRef.current=[];setRouteGuidance(null);}
    routeIdentity.current=identity;
    setRouteUnavailable(false);
    const heading = (filteredSpeedRef.current ?? 0) > 8 ? navigationHeading.current : null;
    const accuracy = navigationAccuracy;
    void fetchRoadRoute(origin, destination, travelMode, navigationPreferences, { heading, accuracy,refresh:routeRefresh>0,traffic:features.traffic }).then(res => {
      if (!active) return;
      if (res && res.coordinates.length > 1) {
        setRouteChoices([res,...(res.alternatives||[])]);setSelectedRouteIndex(0);
        setDestinationRoadRoute(res.coordinates);
        destinationStepsRef.current = res.steps || [];
        const kmStr = (res.distanceMeters / 1000).toLocaleString('vi-VN', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
        const minutes = Math.max(1, Math.round(res.durationSeconds / 60));
        setDestinationRoadInfo({ kmStr, minutes, distanceMeters: res.distanceMeters });
        setRouteGuidance(getRouteGuidance(res.steps, navigationPosition || currentPosition));
      } else {
        setRouteUnavailable(true);
        // Retain usable previous guidance while the next request can retry.
        setActionError('Chưa cập nhật được tuyến. Đang giữ lộ trình gần nhất.');
      }
    }).catch(()=>{if(active){setRouteUnavailable(true);setActionError('Không thể cập nhật tuyến. Kiểm tra mạng; lộ trình gần nhất vẫn được giữ.');}});

    return () => {
      active = false;
    };
  }, [
    destination?.latitude,
    destination?.longitude,
    routeOrigin?.latitude,
    routeOrigin?.longitude,
    travelMode, navigationPreferences,routeRefresh,features.traffic,
  ]);

  useEffect(() => {
    if (!replayPlaying || !todayPoints.length) return;
    const interval = setInterval(() => {
      setReplayIndex(curr => {
        if (curr >= todayPoints.length - 1) {
          setReplayPlaying(false);
          return curr;
        }
        const next = curr + 1;
        const pt = todayPoints[next];
        if (pt && mapRef.current) {
          mapRef.current.animateToRegion(
            {
              latitude: pt.latitude,
              longitude: pt.longitude,
              zoom: 16,
              latitudeDelta: 0.015,
              longitudeDelta: 0.015,
            }
          );
        }
        return next;
      });
    }, 750 / replaySpeed);
    return () => clearInterval(interval);
  }, [replayPlaying, todayPoints, replaySpeed]);

  const region = useMemo(() => {
    if (destination) {
      return { latitude: destination.latitude, longitude: destination.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 };
    }
    const latest = latestPhoto && (!latestPoint || latestPhoto.capturedAt > latestPoint.timestamp) ? latestPhoto : latestPoint;
    const center = currentPosition || latest;
    return center ? { latitude: center.latitude, longitude: center.longitude, latitudeDelta: 0.035, longitudeDelta: 0.035 } : defaultCenter;
  }, [destination, currentPosition, latestPoint, latestPhoto]);

  // Center once when the first usable position arrives, then leave panning to the user.
  useEffect(() => {
    if (!focused || !mapLoaded || initialCenterApplied.current || destination || route.params?.focusFriendId) return;
    const position = currentPosition || latestPoint;
    if (!position) return;
    mapRef.current?.animateToRegion({ latitude: position.latitude, longitude: position.longitude, zoom: 15 }, 0);
    initialCenterApplied.current = true;
  }, [focused, mapLoaded, currentPosition, latestPoint, destination, route.params?.focusFriendId]);

  // During guidance, restore GPS follow automatically even after a map gesture.
  useEffect(()=>{
    if(!destination||!focused||!mapLoaded||replayActive)return;
    const pos=navigationPosition||currentPosition;
    const move=()=>{if(pos&&Date.now()-navigationFixAt.current<15000){setFollowNavigation(true);mapRef.current?.animateToRegion(navigationCamera(pos,liveSpeedKmh,r.width,r.height-topInset-navigationTopHeight-navigationBottomHeight-bottomControlsInset-100,mapEngine==='leaflet'||mapEngine==='openlayers'?256:512),450);}};
    move();const timer=setInterval(move,3000);return()=>clearInterval(timer);
  },[navigationPosition,currentPosition,liveSpeedKmh,!!destination,focused,mapLoaded,replayActive,r.width,r.height,navigationTopHeight,navigationBottomHeight,mapEngine]);
  useEffect(()=>{
    if(mapLoaded&&pendingCenter.current){mapRef.current?.animateToRegion({...pendingCenter.current,zoom:16},650);pendingCenter.current=null;}
  },[mapLoaded]);
  function recenterNavigation(){
    setFollowNavigation(true);
    const pos=navigationPosition||currentPosition;
    if(pos&&Date.now()-navigationFixAt.current<15000)mapRef.current?.animateToRegion(navigationCamera(pos,liveSpeedKmh,r.width,r.height-topInset-navigationTopHeight-navigationBottomHeight-bottomControlsInset-100,mapEngine==='leaflet'||mapEngine==='openlayers'?256:512),650);
    else locate();
  }

  const routeDistance = useMemo(() => {
    if (destinationRoadInfo) {
      return `${destinationRoadInfo.kmStr} km đường bộ · ~${destinationRoadInfo.minutes} phút`;
    }
    const origin = navigationPosition || currentPosition || latestPoint;
    if (!origin || !destination) return null;
    const meters = distanceMeters(origin, destination);
    return `${(meters / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
  }, [destinationRoadInfo, navigationPosition, currentPosition, latestPoint, destination]);

  const liveRouteGuidance = useMemo<RouteGuidance | null>(() => {
    if (!destinationRoadRoute || !destinationStepsRef.current.length) return routeGuidance;
    const position = navigationPosition || currentPosition;
    return getRouteGuidance(destinationStepsRef.current, position) || routeGuidance;
  }, [
    destinationRoadRoute,
    navigationPosition?.latitude,
    navigationPosition?.longitude,
    currentPosition?.latitude,
    currentPosition?.longitude,
    routeGuidance,
  ]);

  const spokenCues=useRef(new Set<string>());
  const [voiceNotice,setVoiceNotice]=useState<string|null>(null);
  const speechSession=useRef(0);
  useEffect(()=>{speechSession.current++;spokenCues.current.clear();setVoiceNotice(null);void stopGuidance();return()=>{speechSession.current++;void stopGuidance();};},[routeDestinationKey,travelMode,focused,navigationPreferences.voiceGuidance]);
  useEffect(()=>{
    if(!focused||!destination||!navigationPreferences.voiceGuidance){void stopGuidance();return;}
    if(AppState.currentState!=='active'||Date.now()-navigationFixAt.current>15000||navigationAccuracy!=null&&navigationAccuracy>60)return;
    const cue=guidanceSpeechCue(liveRouteGuidance);if(!cue||spokenCues.current.has(cue.key))return;
    spokenCues.current.add(cue.key);
    const session=speechSession.current;
    void speakGuidance(cue.text).then(started=>{if(session===speechSession.current)setVoiceNotice(started?null:'Không phát được hướng dẫn · kiểm tra giọng tiếng Việt trên thiết bị');}).catch(()=>{if(session===speechSession.current)setVoiceNotice('Hướng dẫn âm thanh chưa sẵn sàng');});
  },[focused,destination,liveRouteGuidance,navigationPreferences.voiceGuidance,navigationAccuracy]);
  const destinationRouteReady = Boolean(destinationRoadRoute && destinationRoadRoute.length > 1);

  useEffect(() => {
    if (!destination) {
      setDestinationWeather(null);
      setRouteAheadWeather(null);
      setNavigationWeatherUpdatedAt(null);
      return;
    }
    setNavigationWeatherTick(value => value + 1);
    const timer = setInterval(() => setNavigationWeatherTick(value => value + 1), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [destination?.latitude, destination?.longitude]);

  useEffect(() => {
    if (!destination) return;
    let active = true;
    void fetchWeather(destination.latitude, destination.longitude).then(result => {
      if (!active) return;
      setDestinationWeather(result);
      setNavigationWeatherUpdatedAt(Date.now());
    }).catch(() => {
      if (active) setDestinationWeather(null);
    });
    return () => {
      active = false;
    };
  }, [destination?.latitude, destination?.longitude, navigationWeatherTick]);

  useEffect(() => {
    if (!destination || !destinationRouteReady || !destinationRoadRoute) {
      setRouteAheadWeather(null);
      return;
    }
    let active = true;
    const ahead = pointAlongRoute(destinationRoadRoute, 5_000);
    const aheadCoordinate = ahead?.coordinate || destination;
    setRouteAheadDistanceMeters(ahead?.traversedMeters ?? 5_000);
    void fetchWeather(aheadCoordinate.latitude, aheadCoordinate.longitude).then(result => {
      if (!active) return;
      setRouteAheadWeather(result);
      setNavigationWeatherUpdatedAt(Date.now());
    }).catch(() => {
      if (active) setRouteAheadWeather(null);
    });
    return () => {
      active = false;
    };
  }, [
    destination?.latitude,
    destination?.longitude,
    destinationRouteReady,
    navigationWeatherTick,
  ]);

  async function performAction(action: Exclude<HomeAction, null>, work: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = action;
    setPending(action);
    setActionError(null);
    try {
      await work();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Không thể thực hiện. Vui lòng thử lại.');
    } finally {
      pendingRef.current = null;
      setPending(null);
    }
  }

  function toggleTracking() {
    void performAction('tracking', async () => {
      if (tracking) {
        await stopTracking();
        setTrackingMode(null);
      } else {
        const result = await startTracking();
        setTrackingMode(result.mode);
      }
      await refresh();
    });
  }

  function takePhoto() { nav.navigate('MomentCamera',{purpose:'memory'}); }

  function locate() {
    void performAction('locate', async () => {
      if (!(await Location.hasServicesEnabledAsync())) throw new Error('Hãy bật dịch vụ vị trí để tìm bạn trên bản đồ.');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Cần quyền vị trí để đưa bản đồ về nơi bạn đang đứng.');
      setForegroundGranted(true);
      const location = await getDeviceCurrentPosition({ accuracy: Location.Accuracy.High });
      const next = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      setCurrentPosition(next);
      navigationFixAt.current=location.timestamp;
      setNavigationAccuracy(location.coords.accuracy);
      if(destination){setNavigationPosition(next);setFollowNavigation(true);}
      pendingCenter.current=next;
      if (mapLoaded && mapRef.current) {
        pendingCenter.current=null;
        mapRef.current.animateToRegion(
          {
            latitude: next.latitude,
            longitude: next.longitude,
            zoom: 16,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }
        );
      }
    });
  }

  async function manualRefresh() {
    setRefreshing(true);
    try {
      await refresh();
      setWeatherRefreshKey(value => value + 1);
    } finally {
      setRefreshing(false);
    }
  }

  function selectPlace(res: OsmSearchResult) {

    setPlaceSearchOpen(false);


    setDestination({
      latitude: res.latitude,
      longitude: res.longitude,
      name: res.displayName.split(',')[0] || res.displayName,
    });
    const userPos = navigationPosition || currentPosition || latestPoint;
    if (mapRef.current) {
      const target = userPos ? { latitude: userPos.latitude, longitude: userPos.longitude } : { latitude: res.latitude, longitude: res.longitude };
      mapRef.current.animateToRegion(
        {
          latitude: target.latitude,
          longitude: target.longitude,
          zoom: 16,
          latitudeDelta: 0.018,
          longitudeDelta: 0.018,
        },
        500,
      );
    }
  }

  const totals = useMemo(() => {
    const visits = visitsWithinLocalDays(points);
    const dayKeys = new Set<string>();
    for (const p of points) dayKeys.add(localDayKey(p.timestamp));
    for (const m of photos) dayKeys.add(localDayKey(m.capturedAt));
    return { visits, photos: photos.length, days: dayKeys.size };
  }, [points, photos]);

  const toggleRadioPlayback = useCallback(() => {
    if(!journeyMusic.canControl){nav.navigate('Music');return;}
    const action=journeyMusic.source==='mymap'&&!journeyMusic.local.current?playDefaultJourneyRadio:toggleJourneyMusic;
    void action().catch(error=>Alert.alert('Âm nhạc',error instanceof Error?error.message:String(error)));
  }, [nav,journeyMusic.canControl,journeyMusic.source,journeyMusic.local.current]);

  const nextRadioStation = useCallback(() => {
    if(!journeyMusic.canControl){nav.navigate('Music');return;}
    void nextJourneyMusic().catch(error=>Alert.alert('Âm nhạc',error instanceof Error?error.message:String(error)));
  }, [nav,journeyMusic.canControl]);

  useEffect(()=>{
    const threshold=warningThreshold(navigationPreferences,roadSpeedContext?.source==='osm'?roadSpeedContext.speedLimitKmh:null);
    if(!focused||!destination||liveSpeedKmh==null||threshold==null||liveSpeedKmh<=threshold){lastSpeedWarning.current=0;return;}
    const warn=()=>{if(Date.now()-lastSpeedWarning.current<10000)return;lastSpeedWarning.current=Date.now();if(navigationPreferences.vibration)Vibration.vibrate([0,250,100,250]);if(navigationPreferences.sound){duckMusicForWarning();travelNative?.playWarning();}};
    warn();const timer=setInterval(warn,10000);return()=>clearInterval(timer);
  },[focused,!!destination,liveSpeedKmh,roadSpeedContext?.speedLimitKmh,navigationPreferences]);
  useEffect(()=>{
    const position=navigationPosition||currentPosition||latestPoint;
    const coordinates=destinationRoadRoute||[];
    const stride=Math.max(1,Math.ceil(coordinates.length/3000));
    const bounded=coordinates.filter((_,index)=>index%stride===0||index===coordinates.length-1);
    travelNative?.updateCarState(JSON.stringify({active:focused&&!!destination,destination:destination?.name,position,coordinates:bounded,steps:destinationStepsRef.current.slice(0,500),routeVersion:destinationRoadRoute?.length?coordinates.length+coordinates[0]![0]+coordinates[coordinates.length-1]![1]:0,guidance:liveRouteGuidance,speed:liveSpeedKmh,speedLimit:roadSpeedContext?.speedLimitKmh,updatedAt:Date.now()}));
  },[focused,destination,navigationPosition,currentPosition,latestPoint,destinationRoadRoute,liveRouteGuidance,liveSpeedKmh,roadSpeedContext]);
  const visibleStories = mapStories.filter(story => story.id !== 'story-welcome');
  const error = dataError || actionError;
  const compactNavigationTools = Boolean(destination) && r.height - topInset - 8 - navigationTopHeight - bottomControlsInset - navigationBottomHeight < 172;

  return (
    <View style={s.root}>
      {focused && <StatusBar barStyle={tileProvider === 'openfreemap_liberty' || tileProvider === 'openfreemap_liberty_3d' || tileProvider === 'openfreemap_positron' || tileProvider === 'osm' || tileProvider === 'stadia_smooth' ? 'dark-content' : 'light-content'} />}
      <AmbientBackdrop />

      {NATIVE_MAPS_ENABLED && (
        <MapRenderer
          key={`${mapEngine}:${tileProvider}`}
          ref={mapRef}
          engine={mapEngine}
          currentPosition={navigationPosition || currentPosition || latestPoint || null}
          initialRegion={{
            latitude: region.latitude,
            longitude: region.longitude,
            zoom: 14,
          }}
          tileProvider={tileProvider}
          attributionBottom={r.isLandscape ? Math.max(insets.bottom,8) : bottomControlsInset + (destination ? navigationBottomHeight + 8 : r.fontScale > 1.2 ? 210 : 155)}
          friends={showFriends ? friends : []}
          photos={showPhotos ? photos : []}
          partyGroups={partyGroups}
          mapChatMessages={mapChatMessages}
          todayPoints={todayPoints}
          todayRoadSegments={todayRoadSegments}
          showRoute={showRoute}
          destination={destination}
          destinationRoadRoute={destinationRoadRoute}
          routeAlternatives={destination?routeChoices.map(route=>route.coordinates):[]}
          selectedRouteIndex={selectedRouteIndex}
          onRouteChoice={index=>{if(routeChoices[index])chooseRoadRoute(routeChoices[index]!,index);}}
          trafficSegments={destination&&features.traffic?(routeTraffic?.segments.map(segment=>segment.coordinates)||[]):[]}
          places={visiblePlaces}
          roadLines={explorer.lines}
          trafficTileUrl={trafficTileUrl}
          onPlacePress={place=>setSelectedMapPlace(place)}
          onViewportChange={setMapViewport}
          scaleBarTop={destination?topInset+navigationTopHeight+(upcomingSigns.length?232:168):topInset+126}
          footprintsFriend={footprintsFriend}
          scratchHexagons={showScratch ? scratchHexagons : undefined}
          onFriendPress={f => setWheelFriend(f)}
          onMapClick={() => {
            if (expanded) setExpanded(false);
          }}
          onMapReady={() => {setMapLoaded(true);if(pendingCenter.current){mapRef.current?.animateToRegion({...pendingCenter.current,zoom:16});pendingCenter.current=null;}}}
          onMapGesture={()=>{if(destination)setFollowNavigation(true);}}
          onMapError={setMapLoadError}
        />
      )}

      {mapEngine==='maplibre_native'&&<MapScale viewport={mapViewport} top={destination?topInset+navigationTopHeight+(upcomingSigns.length?218:138):topInset+164} approximate={tileProvider?.endsWith('_3d')&&!destination}/> }
      {!!destination&&routeChoices.length>0&&<View style={{position:'absolute',top:topInset+navigationTopHeight+8,left:r.isLandscape?74:16,right:r.isLandscape?250:82,zIndex:12,backgroundColor:theme.colors.bgRaised,borderRadius:16,padding:8,gap:6}}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:6}}>{extensions.offlineTrips&&<Pressable accessibilityRole="button" accessibilityLabel="Lưu tuyến đang chọn để xem ngoại tuyến" onPress={()=>{const choice=routeChoices[selectedRouteIndex];if(!choice||!destination)return;void saveOfflineRoute({name:destination.name.slice(0,100),destination,mode:travelMode,route:{provider:choice.provider,coordinates:choice.coordinates,steps:choice.steps,distanceMeters:choice.distanceMeters,durationSeconds:choice.durationSeconds}}).then(()=>Alert.alert('Đã lưu tuyến','Tuyến được mã hóa trên máy. Mở Tuyến ngoại tuyến trong Cài đặt để xem.')).catch(e=>Alert.alert('Chưa lưu được',e.message||String(e)));}} style={{minWidth:76,minHeight:52,borderRadius:12,padding:12,justifyContent:'center',backgroundColor:theme.colors.bg}}><Text style={{color:theme.colors.primary,fontWeight:'700'}}>Lưu tuyến</Text></Pressable>}{routeChoices.map((choice,index)=><Pressable key={index} accessibilityRole="button" accessibilityState={{selected:index===selectedRouteIndex}} accessibilityLabel={`Chọn tuyến ${index+1}, ${Math.round(choice.durationSeconds/60)} phút`} onPress={()=>chooseRoadRoute(choice,index)} style={{minHeight:44,paddingHorizontal:12,paddingVertical:8,borderRadius:12,backgroundColor:index===selectedRouteIndex?theme.colors.primary:theme.colors.bg,borderWidth:1,borderColor:theme.colors.border}}><Text style={{color:index===selectedRouteIndex?theme.colors.bg:theme.colors.text,fontSize:12,fontWeight:'700'}}>Tuyến {index+1} · {Math.max(1,Math.round(choice.durationSeconds/60))} phút</Text><Text style={{color:index===selectedRouteIndex?theme.colors.bg:theme.colors.muted,fontSize:10}}>{(choice.distanceMeters/1000).toFixed(1)} km{choice.hasTolls?' · Thu phí':''}{features.traffic&&choice.trafficDelaySeconds?` · Chậm ${Math.ceil(choice.trafficDelaySeconds/60)} phút`:''}</Text></Pressable>)}</ScrollView><Text style={{fontSize:10,color:theme.colors.muted,paddingRight:32,minHeight:28}}>{!features.traffic?'Giao thông trực tiếp đang tắt':routeTraffic?.status==='unconfigured'?'Chưa có dữ liệu giao thông trực tiếp':routeTraffic?.status==='unavailable'?'Chưa cập nhật được giao thông':routeTraffic?.updatedAt?`© TomTom · cập nhật ${new Date(routeTraffic.updatedAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})} · đỏ: ùn tắc/đóng đường`:'Đang cập nhật giao thông…'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Cập nhật tuyến và giao thông" onPress={()=>setRouteRefresh(value=>value+1)} style={{minHeight:36,justifyContent:'center',position:'absolute',right:4,bottom:0,width:36,alignItems:'center'}}><MaterialCommunityIcons name="refresh" size={20} color={theme.colors.primary}/></Pressable></View>}
      {mapLoadError && (
        <View
          style={{
            position: 'absolute',
            top: r.isLandscape ? topInset + 140 : destination ? topInset + navigationTopHeight + (routeChoices.length ? 174 : 14) : topInset + 124,
            left: 16,
            right: r.isLandscape ? 120 : 82,
            zIndex: 15,
            backgroundColor: theme.colors.bgRaised,
            borderRadius: 18,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#FFB8BE" />
            <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: theme.colors.text }}>
              {mapLoadError}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {isOpenMapProvider(tileProvider) && (
              <GlassButton
                tone="blue"
                style={{ paddingHorizontal: 10, paddingVertical: 6, minHeight: 32 }}
                onPress={() => void changeTileProvider('osm')}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>Dùng OSM dự phòng</Text>
              </GlassButton>
            )}
            <GlassButton
              tone="neutral"
              style={{ paddingHorizontal: 10, paddingVertical: 6, minHeight: 32 }}
              onPress={() => void changeTileProvider(tileProvider)}
            >
              <Text style={{ fontSize: 11, color: theme.colors.text }}>Thử lại</Text>
            </GlassButton>
            <GlassButton
              tone="neutral"
              style={{ paddingHorizontal: 10, paddingVertical: 6, minHeight: 32 }}
              onPress={() => setExpanded(true)}
            >
              <Text style={{ fontSize: 11, color: theme.colors.text }}>Đổi lớp khác</Text>
            </GlassButton>
          </View>
        </View>
      )}
      {/* Light gradient overlay for maximum tile readability */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(14,27,59,.05)', 'transparent', 'rgba(14,27,59,.10)']}
        style={[StyleSheet.absoluteFill, s.mapShade]}
      />

      {!!upcomingSigns.length && <Pressable accessibilityRole="button" accessibilityLabel="Xem biển báo phía trước" onPress={()=>setSelectedMapPlace(upcomingSigns[0]!.sign)} style={{position:'absolute',top:topInset+navigationTopHeight+150,left:r.isLandscape?74:16,right:r.isLandscape?250:82,zIndex:12,padding:10,borderRadius:14,backgroundColor:theme.colors.bgRaised,borderWidth:1,borderColor:'#F59E0B'}}><Text style={{fontWeight:'800',fontSize:13}}>⚠ ≈ {upcomingSigns[0]!.meters} m · {upcomingSigns[0]!.sign.displayName}</Text><Text style={{fontSize:10,color:theme.colors.muted}}>Biển gần tuyến · cần kiểm tra hướng áp dụng</Text></Pressable>}
      {!!explorer.status && <Pressable onPress={explorer.retry} accessibilityRole="button" accessibilityLabel="Tải lại dữ liệu đường" style={{position:'absolute',left:r.isLandscape?74:16,right:82,bottom:bottomControlsInset+(destination?navigationBottomHeight:0)+96,zIndex:10,borderRadius:12,padding:8,backgroundColor:theme.colors.bgRaised}}><Text style={{fontSize:11,color:theme.colors.muted}}>{explorer.status}</Text></Pressable>}
      {destination && <NavigationHud
        isLandscape={r.isLandscape}
        width={r.width}
        top={topInset + 8}
        bottom={r.isLandscape ? 12 : bottomControlsInset + (replayActive ? 86 : 0)}
        destinationName={destination.name}
        routeSummary={routeUnavailable ? (destinationRoadRoute?'Mạng chậm · đang giữ tuyến gần nhất':'Chưa tìm được tuyến phù hợp tùy chọn') : routeDistance ? `${routeDistance} từ vị trí của bạn` : null}
        travelMode={travelMode}
        onToggleTravelMode={() => setTravelMode(mode => ({motorbike:'car',car:'foot',foot:'bike',bike:'motorbike'} as const)[mode])}
        onClose={() => setDestination(null)}
        guidance={liveRouteGuidance}
        voiceNotice={voiceNotice}
        speedKmh={liveSpeedKmh}
        speedLimitKmh={roadSpeedContext?.speedLimitKmh ?? null}
        roadName={roadSpeedContext?.roadName}
        roadDescription={roadSpeedContext?.roadClass
          ? `${roadSpeedContext.isBuiltUp ? 'Khu đông dân cư' : 'Ngoài khu đông dân cư'} · ${roadSpeedContext.isDivided ? 'Có dải phân cách' : 'Không có dải phân cách'}`
          : undefined}
        speedSource={roadSpeedContext?.source}
        destinationWeather={destinationWeather}
        aheadWeather={routeAheadWeather}
        aheadDistanceMeters={routeAheadDistanceMeters}
        weatherUpdatedAt={navigationWeatherUpdatedAt}
        musicPlaying={journeyMusic.playing}
        musicStationName={journeyMusic.title}
        onToggleMusic={toggleRadioPlayback}
        onNextStation={nextRadioStation}
        etaMinutes={destinationRoadInfo?.minutes}
        remainingDistanceText={destinationRoadInfo?.kmStr}
        onShareTrip={liveTripSession?.isActive ? handleShareLiveTrip : undefined}
        onEndTrip={handleEndLiveTrip}
        onTopHeightChange={setNavigationTopHeight}
        onBottomHeightChange={setNavigationBottomHeight}
        onRecenter={recenterNavigation}
        following={followNavigation}
        onSos={() => nav.navigate('SOS')}
      />}

      {/* Real-time Live Trip Floating Card */}
      {liveTripSession && liveTripSession.isActive && (r.isLandscape || !destination) && (
        <LiveTripCard
          session={liveTripSession}
          onEndTrip={handleEndLiveTrip}
          style={[
            s.liveTripCardFixed,
            r.isLandscape && { left: Math.min(500, r.width * 0.47), right: 76 },
            { bottom: tabHeight + (destination && travelMode === 'motorbike' ? 116 : (replayActive ? 86 : 20)) },
          ]}
        />
      )}

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {r.isLandscape&&<LandscapeMapControls top={topInset} bottom={insets.bottom} left={insets.left} right={insets.right} tracking={tracking} navigating={!!destination} busy={loading||!!pending} search={()=>setPlaceSearchOpen(true)} locate={()=>destination?recenterNavigation():void locate()} layers={()=>setExpanded(true)} tools={()=>setToolsExpanded(true)} sos={()=>nav.navigate('SOS')} record={()=>void toggleTracking()} photo={()=>void takePhoto()} chat={()=>setChatModalOpen(true)} today={()=>setFullscreenMap(false)} music={()=>{nav.navigate('Music');}}/>}
        {!r.isLandscape && !destination && <View style={[s.socialTop,{top:topInset+8}]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Tìm địa điểm" onPress={()=>setPlaceSearchOpen(true)} style={s.socialSearch}>
            <MaterialCommunityIcons name="magnify" size={23} color="#293754"/><Text style={s.socialSearchText}>Tìm địa điểm</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Mở hồ sơ của bạn" onPress={()=>nav.navigate('Profile')} style={s.socialProfile}>
            <MaterialCommunityIcons name="account" size={25} color="#4464F6"/>
          </Pressable>
        </View>}
        {!r.isLandscape && !destination && <Pressable accessibilityRole="button" accessibilityLabel="Xem thời tiết và hoạt động hôm nay" onPress={()=>setFullscreenMap(false)} style={[s.weatherBubble,{top:topInset+68}]}>
          <MaterialCommunityIcons name="weather-partly-cloudy" size={18} color="#4464F6"/>
          <Text style={s.weatherBubbleText}>{weather?.current?.temperature_2m!=null?Math.round(weather.current.temperature_2m)+'°':'Hôm nay'}</Text>
          <MaterialCommunityIcons name="chevron-down" size={17} color="#687492"/>
        </Pressable>}
        {!r.isLandscape&&<View style={[s.fullscreenTools,{top:destination ? topInset + 8 + navigationTopHeight + 12 : insets.top + 76},compactNavigationTools&&{flexDirection:'row',gap:6,right:12}]}>
          <MapControl icon="crosshairs-gps" label={destination?'Về giữa và bám vị trí':'Về vị trí hiện tại'} pending={pending==='locate'} disabled={!!pending} onPress={destination?recenterNavigation:locate}/>
          <SideTool icon="satellite-variant" label="Chất lượng GPS" onPress={()=>setGpsStatusOpen(true)}/>
          <SideTool icon="layers-outline" label="Lớp bản đồ" onPress={()=>setExpanded(true)}/>
          <SideTool icon={toolsExpanded ? 'close' : 'dots-horizontal'} label={toolsExpanded?'Thu gọn công cụ':'Mở thêm công cụ'} onPress={()=>setToolsExpanded(v=>!v)}/>
          {!destination&&<SideTool icon="alert-octagon" label="Khẩn cấp SOS" tone="rose" onPress={()=>nav.navigate('SOS')}/>}
        </View>}
        {!r.isLandscape&&!destination&&!replayActive&&!liveTripSession?.isActive && <View pointerEvents="box-none" style={[s.socialBottom,{bottom:bottomControlsInset},r.isLandscape&&{right:r.width*.5}]}>
          {(error||recordingError) && <Pressable accessibilityRole="button" accessibilityLabel="Xem lỗi ghi hành trình" onPress={()=>setFullscreenMap(false)} style={s.socialError}><Text style={s.socialErrorText} numberOfLines={2}>{recordingError||error}</Text></Pressable>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.friendTray}>
            <Pressable accessibilityRole="button" accessibilityLabel="Thêm bạn bè" onPress={()=>nav.navigate('Friends')} style={s.trayPerson}><View style={s.trayAdd}><MaterialCommunityIcons name="account-plus-outline" size={23} color="#4464F6"/></View><Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={s.trayName}>Thêm bạn</Text></Pressable>
            {friends.map(friend=><Pressable key={friend.id} accessibilityRole="button" accessibilityLabel={'Xem '+friend.displayName+' trên bản đồ'} onPress={()=>{mapRef.current?.animateToRegion({latitude:friend.latitude,longitude:friend.longitude,zoom:16});setWheelFriend(friend);}} style={s.trayPerson}>
              <View style={s.trayAvatar}>{friend.avatarUrl?<Image source={{uri:friend.avatarUrl}} style={s.trayImage}/>:<Text style={s.trayInitial}>{friend.displayName.slice(0,1).toUpperCase()}</Text>}</View><Text numberOfLines={1} style={s.trayName}>{friend.displayName}</Text>
            </Pressable>)}
            {!friends.length&&<Pressable accessibilityRole="button" onPress={()=>nav.navigate('Friends')} style={[s.trayInvite,{width:Math.min(270,r.width-112)}]}><Text style={s.trayInviteTitle}>Bạn bè đang ở đâu?</Text><Text style={s.trayInviteBody}>Kết nối để cùng xuất hiện trên bản đồ</Text></Pressable>}
          </ScrollView>
          <View style={s.socialActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={tracking?'Dừng ghi hành trình':'Bắt đầu ghi hành trình'} disabled={loading||!!pending} onPress={toggleTracking} style={({pressed})=>[s.recordBubble,tracking&&s.recordBubbleActive,(pressed||loading||!!pending)&&{opacity:.65}]}>
              <MaterialCommunityIcons name={tracking?'stop':'navigation-variant'} size={20} color="#fff"/><Text numberOfLines={2} style={s.recordBubbleText}>{pending==='tracking'?'Đang xử lý…':tracking?'Đang ghi · Dừng':'Ghi hành trình'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Lưu một kỷ niệm" disabled={!!pending} onPress={takePhoto} style={s.socialActionCircle}><MaterialCommunityIcons name="camera-outline" size={25} color="#293754"/></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Mở ghim tin nhắn" onPress={()=>setChatModalOpen(true)} style={s.socialActionCircle}><MaterialCommunityIcons name="chat-processing-outline" size={25} color="#4464F6"/></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Xem hoạt động hôm nay" onPress={()=>setFullscreenMap(false)} style={s.socialActionCircle}><MaterialCommunityIcons name="chevron-up" size={26} color="#293754"/></Pressable>
          </View>
          {tracking&&trackingMode==='foreground'&&<Text style={s.foregroundNotice}>Chỉ ghi khi mở ứng dụng · cần quyền vị trí nền</Text>}
        </View>}
      </View>
      <ActionSheet visible={gpsStatusOpen} onClose={()=>setGpsStatusOpen(false)} title="Chất lượng vị trí" subtitle="Kiểm tra tín hiệu trước khi bắt đầu hành trình.">
        <View style={{padding:20,gap:14}}>
          <Text>Độ chính xác: {navigationAccuracy==null?'Chưa có lần đo mới':Math.round(navigationAccuracy)+' m'}</Text>
          <Text>Lần nhận vị trí: {navigationFixAt.current?Math.max(0,Math.floor((Date.now()-navigationFixAt.current)/1000))+' giây trước':'Chưa nhận GPS trong phiên này'}</Text>
          <Text>Ghi hành trình: {tracking?(trackingMode==='foreground'?'Chỉ khi mở ứng dụng':'Đang ghi nền'):'Chưa bật'}</Text>
          <Text>{recordingError||'Ra nơi thoáng và bật vị trí chính xác để cải thiện tín hiệu.'}</Text>
          <GlassButton disabled={!!pending} onPress={locate}><Text>Lấy vị trí mới</Text></GlassButton>
        </View>
      </ActionSheet>
      <ActionSheet visible={!fullscreenMap} onClose={()=>setFullscreenMap(true)} title="Hôm nay của bạn" subtitle="Hành trình, thời tiết và những điều đã lưu.">
        <ScrollView
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 0, paddingBottom: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void manualRefresh()} tintColor={glassColors.cyan} colors={[glassColors.cyan]} />}
        >
          <View style={[s.content, { paddingHorizontal: r.gutter, maxWidth: r.maxContent }]}>

            <WeatherCard
              weather={weather}
              place={currentPosition ? 'Tại vị trí hiện tại' : latestPoint ? 'Tại điểm GPS gần nhất' : 'Vị trí của bạn'}
              unavailable={weatherPosition ? 'Chưa cập nhật được thời tiết' : 'Bật vị trí để xem thời tiết'}
            />

            {/* 24h Map Stories Highlights */}
            {visibleStories.length > 0 && (
              <View style={s.storiesBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storiesScroll}>
                  {visibleStories.map(story => (
                    <Pressable
                      key={story.id}
                      accessibilityRole="button"
                      accessibilityLabel={story.title}
                      onPress={() => {
                        setActiveStory(story);
                        if (mapRef.current) {
                          mapRef.current.animateToRegion({
                            latitude: story.latitude,
                            longitude: story.longitude,
                            zoom: 15,
                          });
                        }
                      }}
                      style={s.storyPill}
                    >
                      <View style={s.storyRing}>
                        <View style={s.storyAvatarInner}>
                          <Text style={s.storyEmoji}>{story.emoji}</Text>
                        </View>
                      </View>
                      <Text style={s.storyTitle} numberOfLines={2}>
                        {story.title}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {error && (
              <GlassSurface tone="rose" style={s.error}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#FF9BB6" />
                <Text style={s.errorText}>{error}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Thử tải lại" onPress={() => void manualRefresh()} style={s.retry}>
                  <MaterialCommunityIcons name="refresh" size={24} color="#FFD0DE" />
                </Pressable>
              </GlassSurface>
            )}

            <View style={[s.actions, (r.width < 380 || r.fontScale > 1.2) && { flexDirection: 'column' }]}>
              <GlassButton
                style={s.action}
                tone={tracking ? 'red' : 'blue'}
                disabled={loading || !!pending}
                onPress={toggleTracking}
                accessibilityLabel={tracking ? 'Dừng ghi hành trình' : 'Bắt đầu ghi hành trình'}
              >
                <View style={s.actionRow}>
                  <IconBadge name={tracking ? 'stop' : 'navigation-variant'} size={24} diameter={35} />
                  <View style={s.actionCopy}>
                    <Text style={s.actionTitle}>
                      {pending === 'tracking' ? 'Đang xử lý…' : tracking ? 'Dừng ghi hành trình' : 'Bắt đầu ghi hành trình'}
                    </Text>
                    <Text style={s.actionSubtitle}>{tracking ? trackingMode === 'background' ? 'Đang ghi cả khi chạy nền' : 'Đang ghi khi ứng dụng mở' : 'Lưu ngay từ điểm bắt đầu'}</Text>
                  </View>
                </View>
              </GlassButton>
              <GlassButton style={s.action} tone="neutral" disabled={!!pending} onPress={takePhoto} accessibilityLabel="Lưu một kỷ niệm">
                <View style={s.actionRow}>
                  <IconBadge name="camera" tone="violet" size={24} diameter={35} />
                  <View style={s.actionCopy}>
                    <Text style={s.actionTitle}>{pending === 'photo' ? 'Đang mở…' : 'Lưu một kỷ niệm'}</Text>
                    <Text style={s.actionSubtitle}>Chụp, ghi chú, lưu vị trí</Text>
                  </View>
                </View>
              </GlassButton>
            </View>

            <GlassSurface style={s.summary}>
              <HomeStat icon="map-marker" value={loading ? '—' : totals.visits} label="Địa điểm đã đến" onPress={() => nav.navigate('Timeline')} />
              <View style={s.divider} />
              <HomeStat icon="image" value={loading ? '—' : totals.photos} label="Kỷ niệm đã lưu" onPress={() => nav.navigate('Memories')} />
              <View style={s.divider} />
              <HomeStat icon="calendar-month" tone="violet" value={loading ? '—' : totals.days} label="Ngày khám phá" onPress={() => nav.navigate('Heatmap')} />
            </GlassSurface>

            <Text style={s.status}>
              {loading
                ? 'Đang đọc dữ liệu trên thiết bị…'
                : tracking
                ? trackingMode === 'background'
                  ? latestPoint ? `● Đang ghi nền · GPS lưu lúc ${new Date(latestPoint.timestamp).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}` : '● Đã bật ghi nền · đang chờ tín hiệu GPS'
                  : '● Chỉ ghi khi mở ứng dụng · cần cấp quyền vị trí nền để ghi khi tắt màn hình'
                : points.length
                ? 'Đã dừng ghi · Dữ liệu lưu trên thiết bị'
                : 'Chưa ghi hành trình · Dữ liệu lưu trên thiết bị'}
            </Text>
            {recordingError && <Text accessibilityRole="alert" style={[s.status,{color:glassColors.red}]}>{recordingError}</Text>}
          </View>
        </ScrollView>
      </ActionSheet>

      {replayActive && todayPoints.length > 0 && (
        <GlassSurface style={[s.replayBar, { bottom: tabHeight + 14 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={replayPlaying ? 'Tạm dừng phát lại' : 'Tiếp tục phát lại'}
            onPress={() => setReplayPlaying(v => !v)}
            style={s.replayPlayBtn}
          >
            <MaterialCommunityIcons name={replayPlaying ? 'pause' : 'play'} size={22} color="#fff" />
          </Pressable>
          <View style={s.replayInfo}>
            <Text style={s.replayTime}>
              {todayPoints[replayIndex] ? formatDateTime(todayPoints[replayIndex]!.timestamp) : '—'}
            </Text>
            <Text style={s.replayProgress}>
              Điểm {replayIndex + 1} / {todayPoints.length} · Di chuyển
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đổi tốc độ phát lại"
            onPress={() => setReplaySpeed(v => (v === 1 ? 2 : v === 2 ? 4 : 1))}
            style={s.speedBtn}
          >
            <Text style={s.speedText}>{replaySpeed}x</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng phát lại"
            onPress={() => {
              setReplayPlaying(false);
              setReplayActive(false);
            }}
            style={s.closeReplayBtn}
          >
            <MaterialCommunityIcons name="close" size={20} color="#DCEEFF" />
          </Pressable>
        </GlassSurface>
      )}


      <ActionSheet visible={toolsExpanded} onClose={() => setToolsExpanded(false)} title="Tiện ích bản đồ" subtitle="Chọn điều bạn muốn làm trên hành trình.">
        <ToolAction icon="cellphone-nfc" label="Cụng máy kết bạn" onPress={() => { setToolsExpanded(false); setBumpModalOpen(true); }} />
        <ToolAction icon="chat-processing-outline" label="Ghim tin nhắn" onPress={() => { setToolsExpanded(false); setChatModalOpen(true); }} />
        <ToolAction icon="trophy-outline" label="Huy hiệu của bạn" onPress={() => { setToolsExpanded(false); setAchievementsOpen(true); }} />
        <ToolAction icon="calendar-week" label="Nhìn lại tuần qua" onPress={() => { setToolsExpanded(false); setWrappedOpen(true); }} />
        <ToolAction icon="timer-sand" label="Kỷ niệm gửi tới tương lai" onPress={() => { setToolsExpanded(false); setTimeCapsuleOpen(true); }} />
        <View style={s.musicRow}><Text style={[s.toolLabel, { color: theme.colors.text }]}>Âm nhạc của bạn</Text><MusicStatusWidget /></View>
        {todayPoints.length > 1 && <ToolAction icon="play-circle-outline" label="Phát lại hành trình hôm nay" onPress={() => { setToolsExpanded(false); setReplayIndex(0); setReplayActive(true); setReplayPlaying(true); }} />}
        <ToolAction icon="music-note" label="Âm nhạc" onPress={()=>{setToolsExpanded(false);nav.navigate('Music');}}/>
        <ToolAction icon="cog-outline" label="Cài đặt" onPress={() => { setToolsExpanded(false); nav.navigate('Settings'); }} />
      </ActionSheet>
      <ActionSheet visible={expanded && NATIVE_MAPS_ENABLED} onClose={() => setExpanded(false)} title="Lớp bản đồ" subtitle="Chọn những gì bạn muốn thấy trên bản đồ.">
        <MapFeatureSettings/>
        <View style={s.layerPanel}>
          <LayerChoice label="Vị trí bạn bè" value={showFriends} onChange={() => setShowFriends(v => !v)} />
          <LayerChoice label="Tuyến đường" value={showRoute} onChange={() => setShowRoute(v => !v)} />
          <LayerChoice label="Ghim kỷ niệm" value={showPhotos} onChange={() => setShowPhotos(v => !v)} />
          <LayerChoice label="Những vùng đã khám phá" value={showScratch} onChange={() => setShowScratch(v => !v)} />
          <View style={s.tileSelectBox}>
            <Text style={[s.tileSelectLabel,{color:theme.colors.text}]}>OpenFreeMap</Text>
            <Text style={[s.layerLegal,{color:theme.colors.muted}]}>Mã nguồn mở · dùng thương mại miễn phí · không cần khóa API</Text>
            {OPEN_MAP_STYLES.map(item=><Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.label} accessibilityState={{checked:tileProvider===item.id}} onPress={()=>void changeTileProvider(item.id)} style={[s.tileBtn,{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},tileProvider===item.id&&{backgroundColor:theme.colors.primary+'12',borderColor:theme.colors.primary}]}><Text style={[s.tileBtnText,{flex:1,textAlign:'left',color:tileProvider===item.id?theme.colors.text:theme.colors.muted}]}>{item.label}</Text><MaterialCommunityIcons name={tileProvider===item.id?'radiobox-marked':'radiobox-blank'} size={20} color={tileProvider===item.id?theme.colors.primary:theme.colors.muted}/></Pressable>)}
            <Text style={[s.tileSelectLabel, { color: theme.colors.muted }]}>Các nguồn khác</Text>
            {(['stadia_dark', 'osm', 'stadia_smooth', 'satellite'] as const).map(tp => (
              <Pressable key={tp} accessibilityRole="radio" accessibilityState={{ checked: tileProvider === tp }} onPress={() => void changeTileProvider(tp)} style={[s.tileBtn, tileProvider === tp && { backgroundColor: `${theme.colors.primary}12`, borderColor: theme.colors.primary }]}>
                <Text style={[s.tileBtnText, { color: tileProvider === tp ? theme.colors.text : theme.colors.muted }]}>{TILE_MAP[tp].label}</Text>
              </Pressable>
            ))}
          </View>
          <GlassButton tone="neutral" onPress={()=>nav.navigate('OfflineMaps')}><Text style={s.white}>Tải và xem bản đồ ngoại tuyến</Text></GlassButton>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: advancedLayers }} onPress={() => setAdvancedLayers(value => !value)} style={s.advancedRow}>
            <Text style={[s.tileSelectLabel, { color: theme.colors.muted }]}>Tùy chọn nâng cao</Text>
            <MaterialCommunityIcons name={advancedLayers ? 'chevron-up' : 'chevron-down'} size={22} color={theme.colors.muted} />
          </Pressable>
          {advancedLayers && <View style={s.tileSelectBox}>
            <Text style={[s.tileSelectLabel, { color: theme.colors.muted }]}>Cách hiển thị bản đồ</Text>
            {isOpenMapProvider(tileProvider)&&<Text style={s.layerLegal}>Lớp vector OpenFreeMap dùng MapLibre. Các nguồn raster ở trên vẫn hỗ trợ những cách hiển thị khác.</Text>}
            {MAP_RENDERER_ENGINES.map(engine => (
              <Pressable key={engine} accessibilityRole="radio" disabled={isOpenMapProvider(tileProvider)&&engine!=='maplibre_native'&&engine!=='maplibre_gl'} accessibilityState={{ checked: mapEngine === engine,disabled:isOpenMapProvider(tileProvider)&&engine!=='maplibre_native'&&engine!=='maplibre_gl' }} onPress={() => void changeMapEngine(engine)} style={[s.tileBtn, isOpenMapProvider(tileProvider)&&engine!=='maplibre_native'&&engine!=='maplibre_gl'&&{opacity:.4}, mapEngine === engine && { backgroundColor: `${theme.colors.primary}12`, borderColor: theme.colors.primary }]}>
                <Text style={[s.tileBtnText, { color: mapEngine === engine ? theme.colors.text : theme.colors.muted }]}>{MAP_RENDERER_LABELS[engine]}</Text>
              </Pressable>
            ))}
          </View>}
        </View>
      </ActionSheet>

      <CommunityRoadSheet place={selectedMapPlace?.kind==='road_report'?selectedMapPlace:null} reports={community.reports} onClose={()=>setSelectedMapPlace(null)} onRefresh={community.reload}/>
      <RoadDetailsSheet place={selectedMapPlace?.kind==='road_report'?null:selectedMapPlace} preferences={features} onClose={()=>setSelectedMapPlace(null)} onNavigate={selectPlace}/>
      <PlaceSearchSheet initialQuery={route.params?.searchQuery} visible={placeSearchOpen} onClose={()=>setPlaceSearchOpen(false)} onSelect={selectPlace} position={currentPosition||latestPoint||null} knownPlaces={photos.filter(photo=>photo.placeName).slice(-30).map(photo=>familiarSearchPlace(photo.placeName!,photo.latitude,photo.longitude))}/>

      {/* Friend Detail Modal */}
      <FriendDetailModal
        friend={selectedFriend}
        visible={!!selectedFriend}
        onClose={() => setSelectedFriend(null)}
        onNavigate={f => {
          setSelectedFriend(null);
          setDestination({ latitude: f.latitude, longitude: f.longitude, name: f.displayName });
        }}
        onToggleFootprints={f => {
          if (footprintsFriend?.id === f.id) setFootprintsFriend(null);
          else setFootprintsFriend(f);
        }}
        showingFootprints={footprintsFriend?.id === selectedFriend?.id}
        onSendPop={f => {
          Alert.alert('Pop tiệc 🎉', `Đã gửi Pop nổ tiệc tới ${f.displayName}!`);
        }}
        onOpenChat={() => {
          const target = selectedFriend;
          setSelectedFriend(null);
          setChatTargetFriend(target);
          setChatModalOpen(true);
        }}
        onChangeGhostMode={(f, mode) => {
          void setFriendGhostMode(f.userId, mode).catch(e=>Alert.alert('Chưa cập nhật quyền riêng tư',e instanceof Error?e.message:String(e)));
          setSelectedFriend({ ...f, ghostMode: mode });
        }}
        distanceKm={
          selectedFriend && (currentPosition || latestPoint)
            ? (distanceMeters(currentPosition || latestPoint!, { latitude: selectedFriend.latitude, longitude: selectedFriend.longitude }) / 1000).toFixed(1)
            : undefined
        }
        onEmojiBomb={f => {
          setSelectedFriend(null);
          setEmojiTargetFriend(f);
          setEmojiBombOpen(true);
        }}
        onVoicePing={f => {
          setSelectedFriend(null);
          setVoicePingFriend(f);
        }}
        onARFinder={f => {
          setSelectedFriend(null);
          setArFinderFriend(f);
        }}
      />

      {/* Map Chat Modal */}
      <MapChatModal
        visible={chatModalOpen}
        onClose={() => {
          setChatModalOpen(false);
          setChatTargetFriend(null);
        }}
        onSubmit={async (msg, emoji) => {
          const pos = currentPosition || latestPoint || defaultCenter;
          const newM = await postMapChatMessage({
            targetFriendId:chatTargetFriend?.userId||chatTargetFriend?.id,
            message: chatTargetFriend ? `@${chatTargetFriend.displayName}: ${msg}` : msg,
            emoji,
            latitude: pos.latitude,
            longitude: pos.longitude,
          });
          setMapChatMessages(prev => [newM, ...prev]);
        }}
          targetName={chatTargetFriend?.displayName}
      />

      {/* Bump Modal */}
      <BumpModal
        visible={bumpModalOpen}
        onClose={() => setBumpModalOpen(false)}
        currentCoords={currentPosition || latestPoint || null}
        onFriendAdded={name => {
          Alert.alert('Kết bạn thành công 🎉', `Đã kết bạn thành công với ${name}!`);
        }}
      />

      {/* Interaction Wheel */}
      <InteractionWheel
        friend={wheelFriend}
        visible={!!wheelFriend}
        onClose={() => setWheelFriend(null)}
        onPeek={f => {
          if (mapRef.current) {
            mapRef.current.animateToRegion({
              latitude: f.latitude,
              longitude: f.longitude,
              zoom: 16,
            });
          }
          setIncomingInteraction({
            id: `peek_${Date.now()}`,
            senderId: 'me',
            senderName: 'Bạn',
            targetFriendId: f.userId || f.id,
            type: 'peek',
            timestamp: Date.now(),
            metadata: { targetName: f.displayName, isSender: true },
          });
          void sendFriendInteraction(f.userId || f.id, 'peek', { targetName: f.displayName }).catch(e=>Alert.alert('Chưa gửi được tương tác',e.message||String(e)));
        }}
        onSendHeart={f => {
          setIncomingInteraction({
            id: `heart_${Date.now()}`,
            senderId: 'me',
            senderName: 'Bạn',
            targetFriendId: f.userId || f.id,
            type: 'heart',
            timestamp: Date.now(),
            metadata: { targetName: f.displayName, isSender: true },
          });
          void sendFriendInteraction(f.userId || f.id, 'heart', { targetName: f.displayName }).catch(e=>Alert.alert('Chưa gửi được tương tác',e.message||String(e)));
        }}
        onInviteHangout={f => {
          setWheelFriend(null);
          setInviteModalFriend(f);
        }}
        onBuzz={f => {
          setIncomingInteraction({
            id: `buzz_${Date.now()}`,
            senderId: 'me',
            senderName: 'Bạn',
            targetFriendId: f.userId || f.id,
            type: 'buzz',
            timestamp: Date.now(),
            metadata: { targetName: f.displayName, isSender: true },
          });
          void sendFriendInteraction(f.userId || f.id, 'buzz', { targetName: f.displayName }).catch(e=>Alert.alert('Chưa gửi được tương tác',e.message||String(e)));
        }}
        onOpenChat={f => {
          setWheelFriend(null);
          setChatTargetFriend(f);
          setChatModalOpen(true);
        }}
        onNavigate={f => {
          setWheelFriend(null);
          setDestination({ latitude: f.latitude, longitude: f.longitude, name: f.displayName });
        }}
        onNotifyArrival={f => {
          setWheelFriend(null);
          const myPos = currentPosition || latestPoint || defaultCenter;
          void registerOneTimeArrivalAlert(f, {
            name: destination?.name || 'Vị trí của bạn',
            latitude: myPos.latitude,
            longitude: myPos.longitude,
          });
          Alert.alert('Báo khi đến 🔔', `Sẽ tự động thông báo và rung chuông khi ${f.displayName} đến gần bạn!`);
        }}
        onOpenFullDetail={f => {
          setWheelFriend(null);
          setSelectedFriend(f);
        }}
        onEmojiBomb={f => {
          setWheelFriend(null);
          setEmojiTargetFriend(f);
          setEmojiBombOpen(true);
        }}
        onVoicePing={f => {
          setWheelFriend(null);
          setVoicePingFriend(f);
        }}
        onARFinder={f => {
          setWheelFriend(null);
          setArFinderFriend(f);
        }}
      />

      {/* Hangout Invite Modal */}
      <HangoutInviteModal
        visible={!!inviteModalFriend}
        friend={inviteModalFriend}
        onClose={() => setInviteModalFriend(null)}
        onSendInvite={(f, act, note) => {
          setIncomingInteraction({
            id: `invite_${Date.now()}`,
            senderId: 'me',
            senderName: 'Bạn',
            targetFriendId: f.userId || f.id,
            type: 'invite',
            timestamp: Date.now(),
            metadata: { targetName: f.displayName, activity: act, note, isSender: true },
          });
          void sendFriendInteraction(f.userId || f.id, 'invite', {
            targetName: f.displayName,
            activity: act,
            note,
          });
        }}
      />

      {/* Story Viewer Modal */}
      <Modal visible={!!activeStory} transparent animationType="fade" onRequestClose={() => setActiveStory(null)}>
        <View style={s.searchOverlay}>
          <GlassSurface style={s.storyModal}>
            <View style={s.storyModalHeader}>
              <View style={s.storyBadgeWrap}>
                <Text style={s.storyBadgeEmoji}>{activeStory?.emoji}</Text>
                <View style={s.flex}>
                  <Text style={s.storyModalTitle} numberOfLines={1}>{activeStory?.title}</Text>
                  <Text style={s.storyModalSub} numberOfLines={1}>{activeStory?.subtitle} · 24h</Text>
                </View>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={() => setActiveStory(null)} style={s.searchClose}>
                <MaterialCommunityIcons name="close" size={22} color="#DCEEFF" />
              </Pressable>
            </View>

            {activeStory?.coverUri ? (
              <Image source={{ uri: activeStory.coverUri }} style={s.storyCoverImg} resizeMode="cover" />
            ) : (
              <View style={s.storyEmptyCover}>
                <Text style={s.storyBigEmoji}>{activeStory?.emoji}</Text>
                <Text style={s.storyCoverCaption}>{activeStory?.title}</Text>
              </View>
            )}

            <View style={s.storyModalFooter}>
              <GlassButton
                tone="blue"
                style={s.flex}
                onPress={() => {
                  if (activeStory) {
                    setDestination({ latitude: activeStory.latitude, longitude: activeStory.longitude, name: activeStory.title });
                    setActiveStory(null);
                  }
                }}
              >
                <View style={s.actionRow}>
                  <MaterialCommunityIcons name="navigation-variant" size={16} color="#7BE8FF" />
                  <Text style={s.white}>Đến vị trí này</Text>
                </View>
              </GlassButton>
              <GlassButton tone="neutral" onPress={() => setActiveStory(null)}>
                <Text style={s.white}>Đóng</Text>
              </GlassButton>
            </View>
          </GlassSurface>
        </View>
      </Modal>

      {/* Emoji Bomb Overlay */}
      <EmojiBombOverlay
        visible={emojiBombOpen}
        onClose={() => setEmojiBombOpen(false)}
        targetName={emojiTargetFriend?.displayName}
        onSendBomb={(emoji, count) => {
          if (emojiTargetFriend) {
            setIncomingInteraction({
              id: `bomb_${Date.now()}`,
              senderId: 'me',
              senderName: 'Bạn',
              targetFriendId: emojiTargetFriend.userId || emojiTargetFriend.id,
              type: 'emoji_bomb',
              timestamp: Date.now(),
              metadata: { targetName: emojiTargetFriend.displayName, emoji, count, isSender: true },
            });
            void sendFriendInteraction(emojiTargetFriend.userId || emojiTargetFriend.id, 'emoji_bomb', {
              targetName: emojiTargetFriend.displayName,
              emoji,
              count,
            }).catch(e=>Alert.alert('Chưa gửi được tương tác',e.message||String(e)));
          }
        }}
      />

      {/* Voice Ping Modal */}
      <VoicePingModal
        visible={!!voicePingFriend}
        onClose={() => setVoicePingFriend(null)}
        targetFriend={voicePingFriend}
        currentCoords={currentPosition || latestPoint || defaultCenter}
        onVoiceSent={({roomId})=>nav.navigate('Chat',{roomId})}
      />

      {/* AR Compass Finder Modal */}
      {arFinderFriend && (
        <ARFinderModal
          visible={!!arFinderFriend}
          onClose={() => setArFinderFriend(null)}
          friendName={arFinderFriend.displayName}
          friendAvatar={arFinderFriend.avatarUrl || undefined}
          friendLat={arFinderFriend.latitude}
          friendLon={arFinderFriend.longitude}
          userLat={(currentPosition || latestPoint)?.latitude || defaultCenter.latitude}
          userLon={(currentPosition || latestPoint)?.longitude || defaultCenter.longitude}
        />
      )}

      {/* Explorer Badges & Achievements Modal */}
      <AchievementsModal
        visible={achievementsOpen}
        onClose={() => setAchievementsOpen(false)}
      />

      {/* Weekly MyMap Wrapped Modal */}
      <WrappedStoryModal
        visible={wrappedOpen}
        onClose={() => setWrappedOpen(false)}
      />

      {/* Geocached Time Capsule Modal */}
      <TimeCapsuleModal
        visible={timeCapsuleOpen}
        onClose={() => setTimeCapsuleOpen(false)}
        userLat={(currentPosition || latestPoint)?.latitude || defaultCenter.latitude}
        userLon={(currentPosition || latestPoint)?.longitude || defaultCenter.longitude}
      />

      {/* Real-time Friend Interactions Overlay (Hearts, Buzz, Peek, Hangout Invites) */}
      <RealtimeInteractionsOverlay
        incomingEvent={incomingInteraction}
        onDismiss={() => setIncomingInteraction(null)}
        onLocateSender={senderId => {
          const friend = friends.find(f => f.userId === senderId || f.id === senderId);
          if (friend && mapRef.current) {
            mapRef.current.animateToRegion({
              latitude: friend.latitude,
              longitude: friend.longitude,
              zoom: 16,
            });
            setSelectedFriend(friend);
          }
        }}
        onOpenChatWithSender={senderId => {
          void createChatRoom([senderId]).then(roomId=>{setIncomingInteraction(null);nav.navigate('Chat',{roomId});}).catch(error=>Alert.alert('Chưa mở được hội thoại',error instanceof Error?error.message:String(error)));
        }}
      />
    </View>
  );
}

function SideTool({ icon, label, onPress, tone = 'blue' }: { icon: IconName; label: string; onPress: () => void; tone?: 'blue' | 'cyan' | 'mint' | 'yellow' | 'violet' | 'rose' }) {
  const { theme } = useAppTheme();
  const isDanger = tone === 'rose';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        s.control,
        { backgroundColor:'#FFFFFF',borderColor:'#FFFFFF' },
        isDanger && [s.sosControl, { backgroundColor: '#FFF0F3', borderColor: '#FFF0F3' }],
        pressed && s.controlPressed,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={21} color={isDanger ? '#CC4B69' : '#4464F6'} />
    </Pressable>
  );
}

function MapControl({ icon, label, onPress, pending, disabled }: { icon: IconName; label: string; onPress: () => void; pending?: boolean; disabled?: boolean }) {
  const { theme } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      style={({ pressed }) => [s.control, { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' }, disabled && s.disabledControl, pressed && s.controlPressed]}
    >
      {pending ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <MaterialCommunityIcons name={icon} size={21} color="#4464F6" />}
    </Pressable>
  );
}

function ToolAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { theme } = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.toolAction, pressed && s.controlPressed]}><IconBadge name={icon} size={23} /><Text style={[s.toolLabel, { color: theme.colors.text }]}>{label}</Text><MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.muted} /></Pressable>;
}

function LayerChoice({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  const { theme } = useAppTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={onChange} style={s.layerChoice}>
      <Text style={[s.layerChoiceLabel, { color: theme.colors.text }]}>{label}</Text><View pointerEvents="none"><Switch value={value} trackColor={{ false: theme.colors.faint, true: theme.colors.primary }} thumbColor="#F5F3EE" /></View>
    </Pressable>
  );
}

function HomeStat({ icon, value, label, tone, onPress }: { icon: IconName; value: number | string; label: string; tone?: 'cyan' | 'violet'; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={s.stat}>
      <IconBadge name={icon} size={20} diameter={34} tone={tone} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  socialTop:{position:'absolute',left:16,right:16,flexDirection:'row',alignItems:'center',gap:10,zIndex:12},
  socialSearch:{flex:1,height:48,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:17,backgroundColor:'#fff',borderRadius:25,shadowColor:'#233057',shadowOpacity:.13,shadowRadius:12,elevation:3},
  socialSearchText:{fontSize:14,fontWeight:'700',color:'#526080'},socialProfile:{width:48,height:48,borderRadius:24,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',elevation:3},
  weatherBubble:{position:'absolute',left:16,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:12,minHeight:36,borderRadius:20,backgroundColor:'#fff',zIndex:12,elevation:2},weatherBubbleText:{color:'#293754',fontSize:13,fontWeight:'800'},
  socialBottom:{position:'absolute',left:16,right:16,gap:10,zIndex:13},friendTray:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:3},trayPerson:{width:64,alignItems:'center',gap:5},
  trayAdd:{width:49,height:49,borderRadius:25,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#fff'},trayAvatar:{width:49,height:49,borderRadius:25,backgroundColor:'#4464F6',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#fff',overflow:'hidden'},trayImage:{width:45,height:45},trayInitial:{color:'#fff',fontWeight:'800',fontSize:22},trayName:{fontSize:10,fontWeight:'800',color:'#263659',backgroundColor:'#fff',paddingHorizontal:5,borderRadius:6},
  trayInvite:{flex:1,padding:12,borderRadius:19,backgroundColor:'#FFFFFFE8',maxWidth:270},trayInviteTitle:{color:'#293754',fontSize:13,fontWeight:'800'},trayInviteBody:{color:'#687492',fontSize:11,lineHeight:16,marginTop:2},
  socialActions:{flexDirection:'row',gap:8,alignItems:'center'},recordBubble:{flex:1,minHeight:49,borderRadius:26,backgroundColor:'#4464F6',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:12},recordBubbleActive:{backgroundColor:'#23375B'},recordBubbleText:{color:'#fff',fontSize:13,fontWeight:'800',flexShrink:1,textAlign:'center'},socialActionCircle:{width:47,height:47,borderRadius:24,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},
  socialError:{padding:10,borderRadius:14,backgroundColor:'#FFECEF'},socialErrorText:{color:'#8D3046',fontSize:12,lineHeight:17},foregroundNotice:{fontSize:11,color:'#293754',backgroundColor:'#fff',padding:7,borderRadius:12},layerLegal:{fontSize:11,color:'#A7B4D0',lineHeight:17},

  root: { flex: 1, backgroundColor: '#07131F' },
  nativeMap: { zIndex: 0 },
  mapShade: { zIndex: 1 },
  foreground: { flex: 1, zIndex: 2 },
  content: { alignSelf: 'center', width: '100%', gap: 16, paddingTop: 8 },
  mapSpace: { width: '100%', position: 'relative' },
  mapFallback: { position: 'absolute', top: 12, left: 14, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(8,24,38,.84)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  mapFallbackText: { color: '#B3D3FB', fontSize: 11, fontWeight: '600' },
  friendsOnlinePill: { position: 'absolute', top: 12, left: 14, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(8,24,38,.88)', borderWidth: .8, borderColor: 'rgba(135,186,205,.22)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 13, zIndex: 10 },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: glassColors.green },
  friendsOnlineText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  mapTools: { position: 'absolute', right: 12, top: 10, gap: 7, zIndex: 5 },
  control: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF', borderWidth: 0, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#01080F', shadowOpacity: .14, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  controlPressed: { transform: [{ scale: .96 }], opacity: .82 },
  sosControl: { backgroundColor: 'rgba(233,121,142,.12)', borderColor: 'rgba(233,121,142,.32)', shadowOpacity: .08 },
  disabledControl: { opacity: 0.6 },
  layerPanel: { gap: 12, width: '100%' }, advancedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }, toolAction: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 8 }, toolLabel: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '600' }, musicRow: { flexDirection: 'row', alignItems: 'center', minHeight: 60 },
  layerChoice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 52 },
  layerChoiceLabel: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  tileSelectBox: { marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  tileSelectLabel: { color: glassColors.muted, fontSize: 13, marginBottom: 4 },
  tileBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 9, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.045)', borderWidth: .8, borderColor: 'rgba(255,255,255,.08)', marginBottom: 5 },
  tileBtnActive: { backgroundColor: 'rgba(105,195,211,.14)', borderColor: 'rgba(105,195,211,.38)' },
  tileBtnText: { color: glassColors.muted, fontSize: 14, textAlign: 'center' },
  tileBtnTextActive: { color: '#fff', fontWeight: '700' },
  userMarkerWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  userMarkerPulse: { position: 'absolute', width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,255,200,.3)' },
  userMarkerDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#00FFCC', borderWidth: 2.5, borderColor: '#fff' },
  friendMarker: { alignItems: 'center', justifyContent: 'center' },
  friendAvatarRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#52E3FF', backgroundColor: '#092147', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  friendAvatar: { width: 36, height: 36, borderRadius: 18 },
  friendAvatarBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#164375', alignItems: 'center', justifyContent: 'center' },
  friendInitial: { color: '#fff', fontSize: 16, fontWeight: '800' },
  friendStatusBadge: { position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#041738', borderWidth: 1, borderColor: '#52E3FF', alignItems: 'center', justifyContent: 'center' },
  friendPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(3,17,48,0.85)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginTop: 2 },
  friendPillText: { fontSize: 9, fontWeight: '800' },
  partyMarker: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF0055', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14, borderWidth: 2, borderColor: '#fff', gap: 3 },
  partyEmoji: { fontSize: 14 },
  partyCount: { color: '#fff', fontSize: 11, fontWeight: '900' },
  chatPin: { backgroundColor: 'rgba(4,22,60,0.88)', borderWidth: 1, borderColor: '#52E3FF', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 140 },
  chatPinEmoji: { fontSize: 13 },
  chatPinText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  stopBadge: { backgroundColor: '#FF6BD6', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: '#fff' },
  stopText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  pinFrame: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#fff', overflow: 'hidden', backgroundColor: '#052250' },
  pin: { width: 34, height: 34 },
  pinStem: { width: 2, height: 8, backgroundColor: '#fff', alignSelf: 'center' },
  destPinFrame: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E02020', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  destPinStem: { width: 2, height: 8, backgroundColor: '#E02020', alignSelf: 'center' },
  replayMarker: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(3,17,51,.9)', borderWidth: 2, borderColor: '#00FFCC', alignItems: 'center', justifyContent: 'center' },
  routeBanner: { position: 'absolute', left: 16, right: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 15, borderRadius: 18 },
  routeBannerCopy: { flex: 1 },
  routeBannerTitle: { color: '#fff', fontSize: 13, fontWeight: '800' },
  routeBannerSub: { color: '#88E5FF', fontSize: 11, marginTop: 2 },
  travelModeButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(123,232,255,.42)', backgroundColor: 'rgba(15,71,111,.55)', paddingHorizontal: 8, paddingVertical: 7 },
  travelModeText: { color: '#E8FAFF', fontSize: 10, fontWeight: '800' },
  closeRoute: { padding: 4 },
  navigationSpeedBubble: { position: 'absolute', left: 16, right: 76, maxWidth: 390, zIndex: 30, borderRadius: 22, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  currentSpeedCircle: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,23,55,.92)', borderWidth: 2, borderColor: '#52E3FF' },
  currentSpeedValue: { color: '#fff', fontSize: 23, lineHeight: 25, fontWeight: '900', fontVariant: ['tabular-nums'] },
  currentSpeedOver: { color: '#FF5B72' },
  speedUnit: { color: '#9CCFF2', fontSize: 8, fontWeight: '800' },
  limitSign: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 5, borderColor: '#E32235' },
  limitValue: { color: '#111827', fontSize: 20, lineHeight: 21, fontWeight: '900', fontVariant: ['tabular-nums'] },
  limitCaption: { color: '#4B5563', fontSize: 6.5, fontWeight: '900' },
  speedRoadCopy: { flex: 1, minWidth: 0 },
  speedRoadTitle: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  speedRoadMeta: { color: '#9DDCF5', fontSize: 9, marginTop: 2 },
  speedEstimateNote: { color: '#7E9DBB', fontSize: 8, marginTop: 2 },
  fullscreenTopBar: { position: 'absolute', left: 16, right: 16, zIndex: 12 },
  fullscreenSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#222C32', borderWidth: 1, borderColor: glassColors.border, borderRadius: 22, paddingHorizontal: 14, height: 44 },
  fullscreenSearchText: { color: '#AFD5FA', fontSize: 13, flex: 1 },
  fullscreenTools: { position: 'absolute', right: 16, gap: 7, zIndex: 12 },
  exitFullscreenBtn: { position: 'absolute', alignSelf: 'center', zIndex: 12 },
  exitFullscreenInner: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  exitFullscreenText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  replayBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, zIndex: 25, borderRadius: 20 },
  replayPlayBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#00A8FF', alignItems: 'center', justifyContent: 'center' },
  replayInfo: { flex: 1 },
  replayTime: { color: '#fff', fontSize: 12, fontWeight: '800' },
  replayProgress: { color: '#88E5FF', fontSize: 10, marginTop: 2 },
  speedBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.12)' },
  speedText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  closeReplayBtn: { padding: 6 },
  searchOverlay: { flex: 1, backgroundColor: 'rgba(2,9,28,.82)', justifyContent: 'center', padding: 16 },
  searchDialog: { padding: 18, borderRadius: 24, gap: 12, maxHeight: '82%' },
  searchHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  searchCopy: { flex: 1 },
  searchTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  searchHint: { color: '#AFD7FA', fontSize: 11, marginTop: 2 },
  searchClose: { padding: 4 },
  searchBar: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: 14, backgroundColor: 'rgba(5,21,50,.7)', borderWidth: 1, borderColor: 'rgba(147,211,255,.3)', paddingHorizontal: 10 },
  searchIconLead: { marginRight: 6 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, height: '100%' },
  searchClearBtn: { padding: 4 },
  searchSubmit: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#00A8FF', alignItems: 'center', justifyContent: 'center' },
  suggestionChipsWrapper: { gap: 6, marginTop: 2 },
  suggestionChipsLabel: { color: '#8CB8E8', fontSize: 11, fontWeight: '600' },
  suggestionChipsRow: { gap: 8, paddingVertical: 2 },
  suggestionChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,168,255,.12)', borderWidth: 1, borderColor: 'rgba(0,255,204,.3)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  suggestionChipText: { color: '#DCEEFF', fontSize: 11.5, fontWeight: '600' },
  searchError: { color: '#FF9BB6', fontSize: 12, textAlign: 'center' },
  searchResultsList: { maxHeight: 280 },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.08)' },
  resultIconCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,245,212,.12)', borderWidth: 1, borderColor: 'rgba(0,245,212,.3)', alignItems: 'center', justifyContent: 'center' },
  searchResultTextWrap: { flex: 1 },
  searchResultName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  searchResultFull: { color: '#8CB8E8', fontSize: 11, marginTop: 1 },
  distBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,229,255,.1)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,229,255,.25)' },
  distText: { color: '#00E5FF', fontSize: 10.5, fontWeight: '700' },
  error: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16 },
  errorText: { flex: 1, color: '#FFD0DE', fontSize: 12 },
  retry: { padding: 4 },
  summary: { paddingVertical: 16, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderRadius: 18 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { color: '#fff', fontSize: 18, fontWeight: '700' },
  statLabel: { color: glassColors.muted, fontSize: 10, textAlign: 'center' },
  divider: { width: 1, height: 28, backgroundColor: 'rgba(147,211,255,.18)' },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 82, borderRadius: 16 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionCopy: { flex: 1 },
  actionTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actionSubtitle: { color: glassColors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  status: { color: '#8CB8E8', fontSize: 11, textAlign: 'center', marginTop: 4 },
  flex: { flex: 1 },
  white: { color: '#fff', fontWeight: '700', fontSize: 13 },
  storiesBar: { marginBottom: 0 },
  storiesScroll: { gap: 14, paddingHorizontal: 4 },
  storyPill: { flexDirection: 'row', alignItems: 'center', width: 200, gap: 10, padding: 8, borderRadius: 16, backgroundColor: glassColors.bgRaised },
  storyRing: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  storyAvatarInner: { width: '100%', height: '100%', borderRadius: 16, backgroundColor: '#102333', alignItems: 'center', justifyContent: 'center' },
  storyEmoji: { fontSize: 20 },
  storyTitle: { flex: 1, color: '#F5F3EE', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  storyModal: { padding: 20, borderRadius: 24, gap: 16, width: '100%', maxWidth: 460, alignSelf: 'center' },
  storyModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  storyBadgeWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  storyBadgeEmoji: { fontSize: 32 },
  storyModalTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  storyModalSub: { color: '#88E5FF', fontSize: 12, marginTop: 2 },
  storyCoverImg: { width: '100%', height: 220, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(113,241,255,0.3)' },
  storyEmptyCover: { width: '100%', height: 160, borderRadius: 18, backgroundColor: 'rgba(5,26,64,0.6)', borderWidth: 1, borderColor: 'rgba(113,241,255,0.2)', alignItems: 'center', justifyContent: 'center', gap: 10 },
  storyBigEmoji: { fontSize: 48 },
  storyCoverCaption: { color: '#B0D8FF', fontSize: 13, fontWeight: '600' },
  storyModalFooter: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  liveTripCardFixed: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 900,
  },
});
