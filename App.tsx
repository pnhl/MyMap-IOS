import React, { useEffect, useMemo, useState } from 'react';
import {ActivityIndicator,AppState,Image,ImageBackground,StatusBar,StyleSheet,Text,View} from 'react-native';
import {useFonts} from 'expo-font';
import {NavigationContainer,DarkTheme,type LinkingOptions} from '@react-navigation/native';
import type {RootStackParamList} from './src/navigation/types';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { ThemeProvider, useAppTheme } from './src/ui/theme';
import mobileAds from 'react-native-google-mobile-ads';
import { env } from './src/config/env';
import { restoreTracking } from './src/services/locationTracking';
import {initializeLanguage} from './src/i18n/languages';
import {SafetyMonitor} from './src/components/SafetyMonitor';
import {travelNative} from './src/services/travelPlatform';
import {prepareAds} from './src/services/adsPrivacy';
import {startMomentSync} from './src/services/moments';
import {initializeMusicPlayback} from './src/services/musicPlayback';
import {AppLock} from './src/components/AppLock';
import {startSharedSync} from './src/services/sharedSync';
const momentLinking:LinkingOptions<RootStackParamList>={prefixes:['mymap://'],config:{initialRouteName:'Tabs',screens:{Moments:'moments',MomentDetail:'moment/:momentId',MomentCamera:'camera'}}};

function ThemedApp() {
 const {theme}=useAppTheme();
 const navigationTheme=useMemo(()=>({...DarkTheme,colors:{...DarkTheme.colors,primary:theme.colors.primary,background:theme.colors.bg,card:theme.colors.glassStrong,text:theme.colors.text,border:theme.colors.border,notification:theme.colors.danger}}),[theme]);
 return <SafeAreaProvider><View style={{flex:1}} onTouchStart={()=>travelNative?.userInteraction()}><StatusBar barStyle="light-content" translucent backgroundColor="transparent"/><NavigationContainer theme={navigationTheme} linking={momentLinking}><AppNavigator/></NavigationContainer><SafetyMonitor/><AppLock/></View></SafeAreaProvider>;
}

function BrandLaunchScreen() {
 return <View style={launchStyles.root} accessibilityLabel="MyMap đang khởi động">
  <StatusBar barStyle="light-content" backgroundColor="#061326" />
  <ImageBackground source={require('./assets/branding/splash-background-v2.png')} resizeMode="cover" style={StyleSheet.absoluteFill}>
   <View style={launchStyles.shade}/>
   <View style={launchStyles.center}>
    <View style={launchStyles.logoGlow}/>
    <Image source={require('./assets/branding/splash-logo-v2.png')} resizeMode="contain" style={launchStyles.logo}/>
    <Text allowFontScaling={false} style={launchStyles.brand}><Text style={launchStyles.brandMy}>My</Text><Text style={launchStyles.brandMap}>Map</Text></Text>
    <Text style={launchStyles.tagline}>Mỗi hành trình đều đáng nhớ</Text>
   </View>
   <View style={launchStyles.loading}><ActivityIndicator color="#58DFFF" size="small"/><Text style={launchStyles.loadingText}>ĐANG CHUẨN BỊ BẢN ĐỒ</Text></View>
  </ImageBackground>
 </View>;
}

export default function App(){
 const[launchElapsed,setLaunchElapsed]=useState(false);
 const[loaded,error]=useFonts({MyMapRegular:require('./assets/design/NunitoSans-Regular.ttf'),MyMapSemiBold:require('./assets/design/NunitoSans-SemiBold.ttf'),MyMapBold:require('./assets/design/NunitoSans-Bold.ttf'),MyMapScript:require('./assets/design/DancingScript.ttf')});
 useEffect(()=>{const timer=setTimeout(()=>setLaunchElapsed(true),900);return()=>clearTimeout(timer);},[]);
 useEffect(()=>{void initializeLanguage();},[]);
 useEffect(()=>{void initializeMusicPlayback();},[]);
 useEffect(()=>startMomentSync(),[]);
 useEffect(()=>startSharedSync(),[]);
 useEffect(()=>{
  if(AppState.currentState==='active')void restoreTracking();
  const subscription=AppState.addEventListener('change',state=>{if(state==='active')void restoreTracking();});
  return()=>subscription.remove();
 },[]);
 useEffect(()=>{
  void prepareAds();
 },[]);
 if((!loaded&&!error)||!launchElapsed)return <BrandLaunchScreen/>;
 return <ThemeProvider><ThemedApp/></ThemeProvider>;
}

const launchStyles=StyleSheet.create({
 root:{flex:1,backgroundColor:'#061326'},
 shade:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:'rgba(2,10,25,.22)'},
 center:{flex:1,alignItems:'center',justifyContent:'center',paddingBottom:34},
 logoGlow:{position:'absolute',width:230,height:230,borderRadius:115,backgroundColor:'rgba(44,139,255,.13)'},
 logo:{width:118,height:128,marginBottom:14},
 brand:{fontSize:42,lineHeight:50,fontWeight:'800',letterSpacing:-1.7,textShadowColor:'rgba(52,167,255,.30)',textShadowRadius:16},
 brandMy:{color:'#F4F7FC'},brandMap:{color:'#7EB8FF'},
 tagline:{marginTop:3,color:'#A9BAD0',fontSize:13.5,letterSpacing:.2},
 loading:{position:'absolute',left:0,right:0,bottom:48,alignItems:'center',gap:11},
 loadingText:{color:'#7F9AB8',fontSize:9.5,fontWeight:'700',letterSpacing:2.1},
});
