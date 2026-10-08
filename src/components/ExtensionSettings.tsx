import React,{useState} from 'react';
import {Switch,View} from 'react-native';
import {useExtensions} from '../hooks/useExtensions';
import {EXTENSIONS,setExtension,type Extension} from '../services/extensionPreferences';
import {GlassSurface} from '../ui/glass';
import {Text} from '../ui/Text';
import {useAppTheme} from '../ui/theme';
import {companionStatus} from '../services/iosCompanions';
import * as Notifications from 'expo-notifications';
export function ExtensionSettings(){
 const preferences=useExtensions(),{theme}=useAppTheme(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function toggle(key:Extension,value:boolean){
  if(value&&(key==='iosWatch'||key==='carPlay')){
   const status=await companionStatus();
   if(key==='carPlay'&&!status.carPlayConfigured)throw Error('Bản IPA này chưa có quyền CarPlay của Apple. Cần bản build với MYMAP_ENABLE_CARPLAY=true và provisioning được Apple chấp thuận.');
   if(key==='iosWatch'){
    if(!status.watchSupported||!status.paired||!status.installed)throw Error('Ghép Apple Watch với iPhone và cài ứng dụng MyMap Watch trước. Bản sideload cơ bản không kèm ứng dụng đồng hồ.');
    await Notifications.requestPermissionsAsync();
   }
  }
  await setExtension(key,value);
 }
 return <GlassSurface style={{padding:18,gap:10}}><Text style={{fontSize:20,fontWeight:'800'}}>Tiện ích mở rộng</Text><Text style={{color:theme.colors.muted}}>Mặc định tắt. Bật từng tiện ích để sử dụng; micro và camera chỉ mở khi bạn tham gia cuộc gọi.</Text>
 {(Object.keys(EXTENSIONS) as Extension[]).map(key=><View key={key} style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:8}}><View style={{flex:1,gap:4}}><Text style={{fontWeight:'700'}}>{EXTENSIONS[key][0]}</Text><Text style={{color:theme.colors.muted,fontSize:12}}>{EXTENSIONS[key][1]}</Text></View><Switch accessibilityLabel={EXTENSIONS[key][0]} value={preferences[key]} disabled={busy} onValueChange={value=>{setBusy(true);setError('');void toggle(key,value).catch(e=>setError(e instanceof Error?e.message:'Chưa lưu được lựa chọn.')).finally(()=>setBusy(false));}}/></View>)}{!!error&&<Text accessibilityRole="alert">{error}</Text>}</GlassSurface>;
}
