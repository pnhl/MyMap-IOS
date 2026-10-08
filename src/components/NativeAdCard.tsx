import React, { useEffect, useRef, useState } from 'react';
import {useIsFocused} from '@react-navigation/native';
import {prepareAds} from '../services/adsPrivacy';
import { AppState, Image, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  NativeAd,
  NativeAdChoicesPlacement,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaAspectRatio,
  NativeMediaView,
  BannerAd,
  BannerAdSize,
  TestIds,
} from 'react-native-google-mobile-ads';
import { env } from '../config/env';
import { Text } from '../ui/Text';
import {useAppTheme} from '../ui/theme';
import {recordAdDiagnostic} from '../services/adDiagnostics';
import {classifyAdFailure, getAdRequestPolicy, type AdLoadFailure} from '../services/adRequestPolicy';

type Placement = 'smart' | 'friends' | 'timeline' | 'stats' | 'profile' | 'memories' | 'heatmap' | 'settings' | 'place';
type Props = { placement: Placement; compact?: boolean };

const PROD_IDS: Record<Placement, string | undefined> = env.nativeAdUnitIds;
const BANNER_IDS: Record<Placement, string | undefined> = env.bannerAdUnitIds;


export function NativeAdCard({ placement, compact = true }: Props) {
  const {theme}=useAppTheme();
  const focused=useIsFocused();
  const bannerLoaded = useRef(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [ad, setAd] = useState<NativeAd | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [useBannerFallback, setUseBannerFallback] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let alive = true;
    let loaded: NativeAd | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const adUnitId = env.enableTestAds ? TestIds.GAM_NATIVE : PROD_IDS[placement];

    setAd(null);
    setUseBannerFallback(false);
    bannerLoaded.current = false;
    if (!adUnitId || !focused || (appState != null && appState !== 'active')) {
      if (!adUnitId) recordAdDiagnostic(placement,'missing','Chưa cấu hình đơn vị Native.');
      return () => { alive = false; };
    }
    const policy = getAdRequestPolicy(adUnitId);
    const retry = () => {
      const delay = policy.waitMs();
      if (!alive || !Number.isFinite(delay)) return;
      retryTimer = setTimeout(() => {
        if (alive && !bannerLoaded.current) setAttempt(value => value + 1);
      }, delay);
    };
    if (!policy.begin()) {
      retry();
    } else {
      void (async () => {
        try {
          const allowed = await prepareAds();
          if (!alive) { policy.release(); return; }
          if (!allowed) {
            policy.fail({code:'consent-not-ready'});
            recordAdDiagnostic(placement,'blocked','Chưa được SDK cho phép tải quảng cáo.');
            retry();
            return;
          }
          recordAdDiagnostic(placement,'loading','Đang yêu cầu Native.');
          const nextAd = await NativeAd.createForAdRequest(adUnitId, {
            aspectRatio: NativeMediaAspectRatio.LANDSCAPE,
            adChoicesPlacement: NativeAdChoicesPlacement.TOP_RIGHT,
            startVideoMuted: true,
            requestNonPersonalizedAdsOnly: true,
          });
          policy.succeed();
          if (!alive) { nextAd.destroy(); return; }
          loaded = nextAd;
          recordAdDiagnostic(placement,'loaded','Đã tải Native.');
          setAd(nextAd);
        } catch (error: unknown) {
          const failure = (error ?? {}) as AdLoadFailure;
          policy.fail(failure);
          if (!alive) return;
          const noFill = classifyAdFailure(failure) === 'no-fill';
          recordAdDiagnostic(placement,noFill?'unavailable':'error',noFill
            ? 'AdMob chưa có quảng cáo phù hợp; sẽ thử lại sau.'
            : `${failure.code||'unknown'}: ${failure.message||'Tải quảng cáo thất bại.'}`);
          if (!noFill) console.warn('[MyMap Ads] native load failed',placement,failure.code,failure.message,failure.userInfo?.responseInfo ?? '');
          if (env.enableTestAds || BANNER_IDS[placement]) setUseBannerFallback(true);
          retry();
        }
      })();
    }

    return () => {
      alive = false;
      if (retryTimer) clearTimeout(retryTimer);
      loaded?.destroy();
    };
  }, [placement, attempt, focused, appState]);

  if (!ad && useBannerFallback) {
    const bannerUnitId = env.enableTestAds ? TestIds.ADAPTIVE_BANNER : BANNER_IDS[placement];
    if (!bannerUnitId) return null;
    return <View style={[s.bannerFallback,{backgroundColor:theme.colors.bgRaised}]}>
      <View style={s.bannerLabel}><Text style={s.bannerLabelText}>ĐƯỢC TÀI TRỢ</Text></View>
      <BannerAd unitId={bannerUnitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdLoaded={()=>{bannerLoaded.current=true;recordAdDiagnostic(placement,'loaded','Đã tải Banner dự phòng.');}}
        onAdFailedToLoad={error=>{bannerLoaded.current=false;recordAdDiagnostic(placement,classifyAdFailure(error)==='no-fill'?'unavailable':'error',`Banner: ${error.message}`);setUseBannerFallback(false);setAttempt(value => value + 1);}}/>
    </View>;
  }
  if (!ad) return null;

  const backgroundImage = ad.images?.[0];
  return <View style={s.outer}>
    <NativeAdView nativeAd={ad} style={[s.nativeAd,{backgroundColor:theme.colors.bgRaised,borderColor:theme.colors.border},!compact&&s.roomy]}>
      <View style={s.attribution}><Text style={s.sponsored}>ĐƯỢC TÀI TRỢ</Text></View>
      <View style={s.row}>
        {ad.mediaContent ? <NativeMediaView resizeMode="cover" style={s.media}/> : backgroundImage ?
          <NativeAsset assetType={NativeAssetType.IMAGE}><Image source={{uri:backgroundImage.url}} style={s.media}/></NativeAsset> : null}
        <View style={s.copy}>
          <View style={s.brandRow}>
            {ad.icon&&<NativeAsset assetType={NativeAssetType.ICON}><Image source={{uri:ad.icon.url}} style={s.icon}/></NativeAsset>}
            {!!ad.advertiser&&<NativeAsset assetType={NativeAssetType.ADVERTISER}><Text numberOfLines={1} style={[s.advertiser,{color:theme.colors.muted}]}>{ad.advertiser}</Text></NativeAsset>}
          </View>
          <NativeAsset assetType={NativeAssetType.HEADLINE}><Text numberOfLines={2} style={[s.headline,{color:theme.colors.text}]}>{ad.headline}</Text></NativeAsset>
          {!!ad.body&&<NativeAsset assetType={NativeAssetType.BODY}><Text numberOfLines={2} style={[s.body,{color:theme.colors.muted}]}>{ad.body}</Text></NativeAsset>}
          {!!ad.callToAction&&<NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}><View style={s.cta}><Text numberOfLines={1} style={s.ctaText}>{ad.callToAction}</Text><MaterialCommunityIcons name="arrow-right" size={15} color="#DDF9F1"/></View></NativeAsset>}
        </View>
      </View>
    </NativeAdView>
  </View>;
}
const s=StyleSheet.create({
  outer:{marginVertical:20},
  nativeAd:{minHeight:158,padding:14,borderRadius:22,borderWidth:1,borderColor:'rgba(190,209,232,.16)',backgroundColor:'#17232F'},
  roomy:{padding:16},
  attribution:{paddingRight:28,marginBottom:8},
  sponsored:{fontSize:9,lineHeight:12,fontWeight:'700',color:'#BCCADB',letterSpacing:.5},
  row:{flexDirection:'row',gap:12,alignItems:'center'},
  media:{width:120,height:120,minWidth:120,minHeight:120,aspectRatio:1,borderRadius:12},
  copy:{flex:1,minWidth:0,gap:5},
  brandRow:{flexDirection:'row',alignItems:'center',gap:6},
  icon:{width:22,height:22,borderRadius:5},
  advertiser:{flex:1,fontSize:10,lineHeight:14,color:'#B9CCDF'},
  headline:{fontSize:14,lineHeight:20,fontWeight:'700',color:'#F6F8FC'},
  body:{fontSize:12,lineHeight:17,color:'#C0CBD8'},
  cta:{minHeight:32,paddingHorizontal:10,paddingVertical:6,borderRadius:10,backgroundColor:'#225C50',flexDirection:'row',alignItems:'center',gap:6,alignSelf:'flex-start',maxWidth:'100%'},
  ctaText:{flexShrink:1,fontSize:11,fontWeight:'700',color:'#DDF9F1'},
  bannerFallback:{marginTop:14,minHeight:72,borderRadius:18,overflow:'hidden',alignItems:'center',backgroundColor:'#17232F'},
  bannerLabel:{alignSelf:'stretch',paddingHorizontal:9,paddingTop:5},
  bannerLabelText:{fontSize:9,color:'#BCCADB'},
});
