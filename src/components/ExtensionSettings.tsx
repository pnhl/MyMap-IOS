import React,{useState} from 'react';
import {Switch,View} from 'react-native';
import {useExtensions} from '../hooks/useExtensions';
import {EXTENSIONS,setExtension,type Extension} from '../services/extensionPreferences';
import {GlassSurface} from '../ui/glass';
import {Text} from '../ui/Text';
import {useAppTheme} from '../ui/theme';
export function ExtensionSettings(){
 const preferences=useExtensions(),{theme}=useAppTheme(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <GlassSurface style={{padding:18,gap:10}}><Text style={{fontSize:20,fontWeight:'800'}}>Tiện ích mở rộng</Text><Text style={{color:theme.colors.muted}}>Mặc định tắt. Bật từng tiện ích để sử dụng; micro và camera chỉ mở khi bạn tham gia cuộc gọi.</Text>
 {(Object.keys(EXTENSIONS) as Extension[]).map(key=><View key={key} style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:8}}><View style={{flex:1,gap:4}}><Text style={{fontWeight:'700'}}>{EXTENSIONS[key][0]}</Text><Text style={{color:theme.colors.muted,fontSize:12}}>{EXTENSIONS[key][1]}</Text></View><Switch accessibilityLabel={EXTENSIONS[key][0]} value={preferences[key]} disabled={busy} onValueChange={value=>{setBusy(true);setError('');void setExtension(key,value).catch(()=>setError('Chưa lưu được lựa chọn.')).finally(()=>setBusy(false));}}/></View>)}{!!error&&<Text accessibilityRole="alert">{error}</Text>}</GlassSurface>;
}
