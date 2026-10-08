import React from 'react';
import {Pressable,ScrollView,View} from 'react-native';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import type {IconName} from '../ui/glass';
type Props={top:number;bottom:number;right:number;left:number;tracking:boolean;navigating:boolean;busy:boolean;search:()=>void;locate:()=>void;layers:()=>void;tools:()=>void;sos:()=>void;record:()=>void;photo:()=>void;chat:()=>void;today:()=>void;music:()=>void};
export function LandscapeMapControls(p:Props){
 const button=(icon:IconName,label:string,onPress:()=>void,color='#293754')=><Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={2} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><View style={{width:36,height:36,borderRadius:18,backgroundColor:'#FFFFFFF2',alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name={icon} size={21} color={color}/></View></Pressable>;
 return <>
  {!p.navigating&&<View style={{position:'absolute',top:p.top+4,left:p.left+8}}>{button('magnify','Tìm địa điểm',p.search)}</View>}
  <ScrollView style={{position:'absolute',right:p.right+6,top:p.top+4,bottom:p.bottom+4,width:90}} contentContainerStyle={{alignItems:'center',gap:2}} showsVerticalScrollIndicator={false}>
   <View style={{flexDirection:'row'}}>{button('crosshairs-gps','Về vị trí hiện tại',p.locate)}{button('layers-outline','Lớp bản đồ',p.layers)}</View>
   <View style={{flexDirection:'row'}}>{button('dots-horizontal','Mở thêm công cụ',p.tools)}{button('alert-octagon','Khẩn cấp SOS',p.sos,'#D7375B')}</View>
   {!p.navigating&&<Pressable accessibilityRole="button" accessibilityLabel={p.tracking?'Dừng ghi hành trình':'Bắt đầu ghi hành trình'} disabled={p.busy} onPress={p.record} style={{width:84,height:44,alignItems:'center',justifyContent:'center',opacity:p.busy?.5:1}}><View style={{width:80,height:36,backgroundColor:'#4464F6',borderRadius:18,alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name={p.tracking?'stop':'navigation-variant'} size={22} color="#fff"/></View></Pressable>}
   <View style={{flexDirection:'row'}}>{button('camera-outline','Lưu một kỷ niệm',p.photo)}{button('chat-processing-outline','Mở ghim tin nhắn',p.chat)}</View>
   <View style={{flexDirection:'row'}}>{button('weather-partly-cloudy','Xem hoạt động hôm nay',p.today)}{button('music-note','Âm nhạc',p.music)}</View>
  </ScrollView>
 </>;
}
