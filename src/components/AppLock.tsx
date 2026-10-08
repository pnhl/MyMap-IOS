import React,{useEffect,useState} from 'react';
import {AppState,Modal,View,Pressable} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {authenticateDevice,setPrivateScreen} from '../services/platformCapabilities';
import {Text} from '../ui/Text';
export const APP_LOCK_KEY='mymap.biometric-lock.v1';
const listeners=new Set<()=>void>();
export async function setAppLock(enabled:boolean){if(enabled&&!await authenticateDevice('Xác nhận bật khóa MyMap'))throw new Error('Chưa xác thực sinh trắc.');await AsyncStorage.setItem(APP_LOCK_KEY,String(enabled));listeners.forEach(fn=>fn());}
export function AppLock(){
 const[locked,setLocked]=useState(true),[enabled,setEnabled]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{void setPrivateScreen(enabled).catch(()=>{});return()=>{void setPrivateScreen(false).catch(()=>{});};},[enabled]);
 useEffect(()=>{let live=true;const load=()=>void AsyncStorage.getItem(APP_LOCK_KEY).then(v=>{if(live){setEnabled(v==='true');setReady(true);setError('');}}).catch(()=>{if(live){setReady(false);setError('Chưa đọc được cài đặt khóa. Hãy thử lại.');}});load();listeners.add(load);const sub=AppState.addEventListener('change',s=>{if(s!=='active')setLocked(true);});return()=>{live=false;listeners.delete(load);sub.remove();};},[]);
 async function unlock(){if(busy)return;setBusy(true);try{if(!ready){const v=await AsyncStorage.getItem(APP_LOCK_KEY);setEnabled(v==='true');setReady(true);setError('');return;}if(await authenticateDevice('Mở khóa MyMap')){setLocked(false);setError('');}else setError('Chưa xác thực. Hãy thử lại.');}catch(e){setError(e instanceof Error?e.message:'Không thể mở khóa.');}finally{setBusy(false);}}
 if(ready&&!enabled)return null;
 return <Modal visible={!ready||locked} animationType="none" onRequestClose={()=>{}}><View style={{flex:1,backgroundColor:'#101827',alignItems:'center',justifyContent:'center',padding:28,gap:20}}><Text style={{fontSize:26,color:'#fff',fontWeight:'700'}}>MyMap riêng tư</Text><Text style={{color:'#CAD3E4',textAlign:'center'}}>Xác thực trên thiết bị để mở ứng dụng.</Text>{!!error&&<Text style={{color:'#FFB4B4'}}>{error}</Text>}<Pressable disabled={busy||(!ready&&!error)} onPress={()=>void unlock()} style={{backgroundColor:'#4667F6',padding:18,borderRadius:18}}><Text style={{color:'#fff'}}>{busy?'Đang xác thực…':!ready?'Đọc lại cài đặt khóa':'Mở khóa'}</Text></Pressable></View></Modal>;
}
