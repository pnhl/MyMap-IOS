import React,{useCallback,useRef,useState} from 'react';
import {useFocusEffect,useNavigation} from '@react-navigation/native';
import * as Location from 'expo-location';
import {offlineRoutes,deleteOfflineRoute,type OfflineRoute} from '../services/offlineRoutes';
import {getDeviceCurrentPosition} from '../services/platformLocation';
import {OfflineMapView} from '../components/OfflineMapView';
import {useExtensions} from '../hooks/useExtensions';
import {useAccountEpoch} from '../hooks/useAccountEpoch';
import {ScreenScaffold} from '../ui/ScreenScaffold';
import {GlassSurface} from '../ui/glass';
import {ActionButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
export default function OfflineRoutesScreen(){
 const enabled=useExtensions().offlineTrips,epoch=useAccountEpoch(),nav=useNavigation<any>(),generation=useRef(0),[rows,setRows]=useState<OfflineRoute[]>([]),[opened,setOpened]=useState<OfflineRoute|null>(null),[position,setPosition]=useState<{latitude:number;longitude:number}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useFocusEffect(useCallback(()=>{const token=++generation.current;setRows([]);setOpened(null);setPosition(null);setError('');if(enabled)void offlineRoutes().then(r=>{if(token===generation.current)setRows(r);}).catch(e=>{if(token===generation.current)setError((e as Error).message||String(e));});return()=>{generation.current++;};},[enabled,epoch]));
 async function locate(){setBusy(true);const token=generation.current;try{const permission=await Location.requestForegroundPermissionsAsync();if(!permission.granted)throw Error('Cần quyền vị trí.');const fix=(await getDeviceCurrentPosition({accuracy:Location.Accuracy.High})).coords;if(token===generation.current)setPosition(fix);}catch(e){if(token===generation.current)setError((e as Error).message||String(e));}finally{setBusy(false);}}
 return <ScreenScaffold title="Tuyến đã lưu ngoại tuyến" subtitle="Tuyến và chỉ dẫn được mã hóa trên thiết bị">
 {!enabled?<ActionButton title="Bật lưu tuyến trong Cài đặt" onPress={()=>nav.navigate('Settings')}/>:<>
 <Text>Lưu tuyến sau khi tính đường trên bản đồ. Tuyến giữ nguyên thời điểm tính; giao thông và hướng dẫn có thể đã thay đổi. Khi lệch đường, cần có mạng để tính lại.</Text>
 {!!error&&<Text accessibilityRole="alert">{error}</Text>}{opened?<><ActionButton title="Danh sách tuyến" onPress={()=>setOpened(null)}/><Text style={{fontSize:21,fontWeight:'800'}}>{opened.name}</Text><Text>{(opened.route.distanceMeters/1000).toFixed(1)} km · {Math.ceil(opened.route.durationSeconds/60)} phút lúc lưu</Text><OfflineMapView tiles={[]} center={opened.destination} attribution={`Tuyến: ${opened.route.provider}`} route={opened.route.coordinates} position={position}/><Text>Nền bản đồ chưa nằm trong gói tuyến. Bạn có thể xem các vùng đã tải trong Bản đồ ngoại tuyến.</Text><ActionButton title="Xác định vị trí trên tuyến" disabled={busy} onPress={()=>void locate()}/>{opened.route.steps.map((step,i)=><Text key={i}>{i+1}. {step.instruction} · {Math.round(step.distanceMeters)} m</Text>)}</>:<>{!rows.length&&<Text>Chưa lưu tuyến nào.</Text>}{rows.map(r=><GlassSurface key={r.id} style={{padding:18,gap:10}}><Text style={{fontSize:18,fontWeight:'700'}}>{r.name}</Text><Text>{new Date(r.createdAt).toLocaleString('vi-VN')} · {r.mode}</Text><ActionButton title="Xem tuyến ngoại tuyến" onPress={()=>{setOpened(r);setPosition(null);}}/><ActionButton title="Xóa tuyến trên máy" disabled={busy} onPress={()=>{const token=generation.current;setBusy(true);void deleteOfflineRoute(r.id).then(offlineRoutes).then(value=>{if(token===generation.current)setRows(value);}).catch(e=>{if(token===generation.current)setError((e as Error).message||String(e));}).finally(()=>setBusy(false));}}/></GlassSurface>)}</>}
 </>}
 </ScreenScaffold>;
}
