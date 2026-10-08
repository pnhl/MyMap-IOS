import {TextInput} from '../ui/TextInput';
import React,{useCallback,useState} from 'react';
import {View,Switch,Pressable} from 'react-native';
import {useFocusEffect,useNavigation} from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import {GlassSurface,GlassButton,glassColors} from '../ui/glass';
import {Text} from '../ui/Text';
import {getNavigationPreferences,saveNavigationPreferences,DEFAULT_NAVIGATION_PREFERENCES,type NavigationPreferences} from '../services/navigationPreferences';
import {configureSafety,getSafetyState} from '../services/travelPlatform';
import {LANGUAGES,setLanguage,useLanguage,translate} from '../i18n/languages';
import {ActionSheet} from '../ui/ActionSheet';
import {AdsConsent} from 'react-native-google-mobile-ads';
import {resetAdsConsent} from '../services/adsPrivacy';
export function TravelSettings(){
 const nav=useNavigation<any>();const language=useLanguage();
 const[preferences,setPreferences]=useState(DEFAULT_NAVIGATION_PREFERENCES),[limit,setLimit]=useState(''),[safety,setSafety]=useState(false),[number,setNumber]=useState('112'),[languageOpen,setLanguageOpen]=useState(false),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 useFocusEffect(useCallback(()=>{let active=true;void Promise.all([getNavigationPreferences(),getSafetyState()]).then(([p,s])=>{if(!active)return;setPreferences(p);setLimit(p.customSpeedKmh==null?'':String(p.customSpeedKmh));setSafety(s.enabled);setNumber(s.emergencyNumber);});return()=>{active=false;};},[]));
 async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);setError(null);try{await work();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 async function update(part:Partial<NavigationPreferences>){const next={...preferences,...part};await saveNavigationPreferences(next);setPreferences(next);}
 const toggle=(title:string,body:string,value:boolean,onChange:(value:boolean)=>void)=><View key={title} style={{flexDirection:'row',gap:12,paddingVertical:12,alignItems:'center',borderBottomWidth:.5,borderBottomColor:glassColors.border}}><View style={{flex:1}}><Text style={{fontSize:14,fontWeight:'800'}}>{title}</Text><Text style={{fontSize:12,lineHeight:19,color:glassColors.muted,marginTop:4}}>{body}</Text></View><Switch accessibilityLabel={translate(title)} disabled={busy} value={value} onValueChange={onChange} trackColor={{true:'#4464F6'}}/></View>;
 const row=(title:string,body:string,onPress:()=>void)=><Pressable key={title} accessibilityRole="button" onPress={onPress} style={{paddingVertical:13,gap:4,minHeight:52}}><Text style={{fontSize:15,fontWeight:'800'}}>{title}</Text><Text style={{color:glassColors.muted,fontSize:12,lineHeight:19}}>{body}</Text></Pressable>;
 return <>
  <GlassSurface style={{padding:17,gap:5}}><Text style={{fontSize:20,fontWeight:'800'}}>Dẫn đường</Text>
   {toggle('Tránh phà','Chọn tuyến không đi qua phà khi máy chủ hỗ trợ.',preferences.avoidFerries,v=>void action(()=>update({avoidFerries:v})))}
   {toggle('Tránh cao tốc','Xe máy sử dụng cấu hình tuyến riêng theo phương tiện.',preferences.avoidHighways,v=>void action(()=>update({avoidHighways:v})))}
   {toggle('Tránh đường thô sơ','Ưu tiên tuyến không có đoạn giữa chưa được trải nhựa.',preferences.avoidUnpaved,v=>void action(()=>update({avoidUnpaved:v})))}
   {toggle('Cảnh báo tốc độ','Theo biển báo OSM tại quốc gia hiện tại; dữ liệu thiếu sẽ hiện chưa xác định. Biển báo thực tế luôn được ưu tiên.',preferences.speedWarnings,v=>void action(()=>update({speedWarnings:v})))}
   {toggle('Âm thanh','Âm cảnh báo khi vượt mức được xác định.',preferences.sound,v=>void action(()=>update({sound:v})))}
   {toggle('Rung thiết bị','Rung khi vượt giới hạn hoặc mức bạn đặt.',preferences.vibration,v=>void action(()=>update({vibration:v})))}
   {toggle('Đọc hướng dẫn','Đọc chỉ dẫn rẽ bằng giọng nói trên thiết bị. Cần cài giọng tiếng Việt.',preferences.voiceGuidance,v=>void action(()=>update({voiceGuidance:v})))}
   <Text style={{fontSize:14,fontWeight:'800',marginTop:10}}>Mức tốc độ muốn được nhắc (km/h)</Text>
   <Text style={{fontSize:12,color:glassColors.muted,lineHeight:19}}>Để trống để chỉ dùng giới hạn đường. Mức bạn đặt không vô hiệu hóa cảnh báo giới hạn thấp hơn.</Text>
   <TextInput accessibilityLabel="Mức cảnh báo tốc độ" value={limit} onChangeText={setLimit} placeholder="Ví dụ: 50" keyboardType="numeric" placeholderTextColor={glassColors.muted} style={{color:'#fff',backgroundColor:'#101B30',padding:12,borderRadius:12}}/>
   <GlassButton disabled={busy} onPress={()=>void action(async()=>{const n=limit.trim()?Number(limit):null;if(n!=null&&(!Number.isFinite(n)||n<5||n>300))throw new Error('Nhập mức từ 5 đến 300 km/h hoặc để trống.');await update({customSpeedKmh:n});})}><Text>Lưu</Text></GlassButton>
  </GlassSurface>
  <GlassSurface style={{padding:17,gap:9}}><Text style={{fontSize:20,fontWeight:'800'}}>An toàn khi di chuyển</Text>
   {toggle('Phát hiện chuyển động bất thường','Theo dõi cảm biến khi MyMap đang mở. Chuyển động mạnh sẽ hiện cảnh báo để bạn kiểm tra.',safety,v=>void action(async()=>{await configureSafety(v,number);setSafety(v);}))}
   <Text style={{fontSize:12,lineHeight:20,color:glassColors.muted}}>iOS không cho phép theo dõi cảm biến liên tục khi app bị treo hoặc đóng. MyMap không tự gọi khẩn cấp; bạn phải xác nhận cuộc gọi.</Text>
   <Text style={{fontSize:14,fontWeight:'800'}}>Số khẩn cấp trên thiết bị này</Text>
   <TextInput accessibilityLabel="Số khẩn cấp" value={number} onChangeText={setNumber} keyboardType="phone-pad" style={{color:'#fff',backgroundColor:'#101B30',padding:12,borderRadius:12}}/>
   <Text style={{fontSize:12,color:glassColors.muted,lineHeight:19}}>112 là số chung tại Việt Nam từ 23/8/2025 và tại nhiều nước. Khi ra nước ngoài, kiểm tra và đặt đúng số địa phương (ví dụ 911 tại Mỹ). iPad có thể không hỗ trợ cuộc gọi di động.</Text>
   <GlassButton disabled={busy} onPress={()=>void action(async()=>{if(!/^\+?\d{2,15}$/.test(number))throw new Error('Số khẩn cấp không hợp lệ.');await configureSafety(safety,number);})}><Text>Lưu</Text></GlassButton>
  </GlassSurface>
  <GlassSurface style={{padding:17,gap:2}}>
   {row('Ngôn ngữ',LANGUAGES.find(l=>l[0]===language)?.[1]||'Tiếng Việt',()=>setLanguageOpen(true))}
   {row('Âm nhạc','Liên kết tài khoản của bạn để tìm và nghe nhạc.',()=>nav.navigate('Music'))}
   {row('Điều khoản sử dụng','Đọc bản đầy đủ, luôn có sẵn ở đây.',()=>nav.navigate('Legal',{document:'terms'}))}
   {row('Chính sách quyền riêng tư','Dữ liệu, quyền ứng dụng và lựa chọn của bạn.',()=>nav.navigate('Legal',{document:'privacy'}))}
   {row('Giới thiệu MyMap','Tính năng, nền tảng, giấy phép và giới hạn thiết bị.',()=>nav.navigate('Legal',{document:'about'}))}
   {row('Lựa chọn quyền riêng tư quảng cáo','Xem hoặc thay đổi lựa chọn do Google cung cấp.',()=>void action(async()=>{await AdsConsent.showPrivacyOptionsForm();resetAdsConsent();}))}
  </GlassSurface>
  {error&&<Text accessibilityRole="alert" style={{color:'#FFA8BA',fontSize:13,lineHeight:20}}>{error}</Text>}
  <ActionSheet title="Ngôn ngữ" visible={languageOpen} onClose={()=>setLanguageOpen(false)}><Text style={{fontSize:12,color:glassColors.muted,lineHeight:19}}>Có 21 lựa chọn. Nội dung dài của Cornish dùng tiếng Anh dự phòng. Bản dịch tự động có thể cần hiệu chỉnh.</Text>{LANGUAGES.map(([code,name,english])=><Pressable key={code} accessibilityRole="radio" accessibilityState={{checked:code===language}} onPress={()=>void action(async()=>{await setLanguage(code);setLanguageOpen(false);})} style={{minHeight:49,paddingVertical:10,flexDirection:'row',justifyContent:'space-between'}}><Text style={{fontSize:15}}>{name} · {english}</Text><Text>{code===language?'✓':''}</Text></Pressable>)}</ActionSheet>
 </>;
}
