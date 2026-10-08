import React,{useEffect,useState} from 'react';
import {AppState,Modal,View} from 'react-native';
import {getSafetyState,travelNative,configureSafety} from '../services/travelPlatform';
import {openEmergencyDialer} from '../services/liveSafety';
import {GlassButton,GlassSurface} from '../ui/glass';
import {Text} from '../ui/Text';
export function SafetyMonitor(){
 const[state,setState]=useState<Awaited<ReturnType<typeof getSafetyState>>|null>(null);
 const[error,setError]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;
  const load=async()=>{if(AppState.currentState!=='active')return;const s=await getSafetyState().catch(()=>null);if(active)setState(s);};
  travelNative?.setForeground(AppState.currentState==='active');
  void getSafetyState().then(s=>{if(s.enabled&&AppState.currentState==='active')void configureSafety(true,s.emergencyNumber).catch(()=>{});});
  const timer=setInterval(()=>void load(),1000);
  const sub=AppState.addEventListener('change',s=>{travelNative?.setForeground(s==='active');if(s==='active')void load();});
  return()=>{active=false;clearInterval(timer);sub.remove();};
 },[]);
 if(!state?.pendingAt)return null;
 const remaining=state.deadline?Math.max(0,Math.ceil((state.deadline-Date.now())/1000)):null;
 return <Modal visible transparent animationType="fade" onRequestClose={()=>{travelNative?.dismissIncident();setState(null);}}><View style={{flex:1,backgroundColor:'#081326CC',padding:24,justifyContent:'center'}}><GlassSurface tone="rose" style={{padding:22,gap:14}}>
  <Text style={{fontSize:23,fontWeight:'800'}}>Bạn có đang an toàn?</Text>
  <Text style={{fontSize:14,lineHeight:22}}>{state.kind==='high_fall'?`Cảm biến ghi nhận rơi ước tính ${Math.round(state.heightMeters)} m. ${remaining!=null?`Cảnh báo khẩn cấp sau ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} không tương tác.`:'Đã hết thời gian chờ.'}`:'Cảm biến ghi nhận chuyển động giống va chạm hoặc té ngã.'}</Text>
  <Text style={{fontSize:12,lineHeight:19}}>iOS cần bạn xác nhận cuộc gọi. Cảm biến chỉ được theo dõi khi MyMap đang mở và có thể báo nhầm.</Text>
  {error&&<Text>{error}</Text>}
  <GlassButton tone="red" onPress={()=>void openEmergencyDialer(state.emergencyNumber).catch(e=>setError(e.message))}><Text>Mở số khẩn cấp</Text></GlassButton>
  <GlassButton onPress={()=>{travelNative?.dismissIncident();setState(null);}}><Text>Tôi an toàn</Text></GlassButton>
 </GlassSurface></View></Modal>;
}
