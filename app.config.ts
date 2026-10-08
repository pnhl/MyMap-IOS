import type {ConfigContext, ExpoConfig} from 'expo/config';
import {existsSync, readFileSync} from 'node:fs';

export default ({config}: ConfigContext): ExpoConfig => {
  const firebaseFile = './GoogleService-Info.plist';
  const appleServicesEnabled=process.env.MYMAP_ENABLE_APPLE_SERVICES==='true';
  const schemes = Array.isArray(config.scheme) ? config.scheme : [config.scheme || 'mymap'];
  const googleScheme = process.env.GOOGLE_IOS_REVERSED_CLIENT_ID?.trim() || (existsSync(firebaseFile)
    ? readFileSync(firebaseFile, 'utf8').match(/<key>REVERSED_CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/)?.[1] : undefined);
  return {
    ...config,
    name: config.name || 'MyMap', slug: config.slug || 'mymap', platforms: ['ios'],
    extra:{...config.extra,appleServicesEnabled},
    scheme: [...new Set([...schemes, 'com.pnhl.vibecoding', ...(googleScheme ? [googleScheme] : [])])],
    ios: {
      ...config.ios, usesAppleSignIn: appleServicesEnabled,
      ...(existsSync(firebaseFile) ? {googleServicesFile: firebaseFile} : {}),
      entitlements: {...config.ios?.entitlements, ...(appleServicesEnabled?{'com.apple.developer.game-center':true}:{})},
      infoPlist: {
        ...config.ios?.infoPlist,
        MyMapAppleServicesEnabled:appleServicesEnabled,
        NSFaceIDUsageDescription: 'MyMap dùng Face ID khi bạn bật khóa ứng dụng hoặc mở dữ liệu riêng tư.',
        NSSpeechRecognitionUsageDescription: 'MyMap nhận dạng giọng nói trên thiết bị khi bạn nhấn tìm kiếm bằng giọng nói.',
        NSPhotoLibraryAddUsageDescription: 'MyMap lưu ảnh vào thư viện khi bạn chọn xuất ảnh.',
        NSMotionUsageDescription: 'MyMap dùng cảm biến chuyển động khi bạn bật phát hiện va chạm và té ngã.',
        UIBackgroundModes: ['location', 'audio', 'processing', 'remote-notification'],
        BGTaskSchedulerPermittedIdentifiers: ['com.expo.modules.backgroundtask.processing'],
      },
    },
    plugins: [
      ...(config.plugins || []),
      ['./plugins/with-ios-companions.cjs', {carPlay: process.env.MYMAP_ENABLE_CARPLAY === 'true', watch: process.env.MYMAP_ENABLE_WATCH === 'true'}],
      ...(process.env.EXPO_PUBLIC_ENABLE_IOS_WIDGET === 'true' ? [
        ['expo-widgets', {groupIdentifier:'group.com.pnhl.vibecoding', widgets:[{
          name:'MyMapMomentWidget', displayName:'MyMap · Khoảnh khắc', description:'Ảnh và kỷ niệm bạn chủ động chọn.', ios:{supportedFamilies:['systemSmall','systemMedium']},
        }]}]] as NonNullable<ExpoConfig['plugins']> : []),
      ['@react-native-firebase/app', {ios:{disableSPM:true}}], '@react-native-firebase/auth',
      ...(appleServicesEnabled?['expo-apple-authentication']:[]),
      ['expo-build-properties', {ios: {deploymentTarget: '16.4', useFrameworks: 'static'}}],
      ['react-native-google-mobile-ads', {
        iosAppId: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || 'ca-app-pub-3940256099942544~1458002511',
      }],
    ],
  };
};
