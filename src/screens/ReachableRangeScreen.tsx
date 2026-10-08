import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Switch,View} from 'react-native';
import * as Location from 'expo-location';
import {useFocusEffect} from '@react-navigation/native';
import {ScreenScaffold} from '../ui/ScreenScaffold';
import {Text} from '../ui/Text';
import {GlassChip,GlassSurface} from '../ui/glass';
import {ActionButton} from '../ui/ActionButton';
import {useAppTheme} from '../ui/theme';
import {useMapFeatures} from '../components/MapFeatureSettings';
import {setMapFeature} from '../services/mapFeaturePreferences';
import {LeafletMap,type LeafletMapRef} from '../components/LeafletMap';
import {PlaceSearchSheet} from '../components/PlaceSearchSheet';
import {getDeviceCurrentPosition} from '../services/platformLocation';
import {calculateReachableRange,type ReachableRange,type RangeOrigin} from '../services/reachableRange';
export default function ReachableRangeScreen(){
 const{theme}=useAppTheme(),features=useMapFeatures();const[origin,setOrigin]=useState<RangeOrigin|null>(null),[minutes,setMinutes]=useState(15),[mode,setMode]=useState<'car'|'motorbike'>('motorbike');
 const[result,setResult]=useState<ReachableRange|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState(false);
 const pending=useRef(false),request=useRef(0),active=useRef(false),controller=useRef<AbortController|null>(null),map=useRef<LeafletMapRef|null>(null);
 const cancel=()=>{request.current++;controller.current?.abort();controller.current=null;};
 useFocusEffect(useCallback(()=>{active.current=true;setBusy(false);return()=>{active.current=false;cancel();setResult(null);setSearch(false);};},[]));
 useEffect(()=>{cancel();setResult(null);setError('');setBusy(false);},[origin,minutes,mode,features.reachableRange]);
 async function work(task:()=>Promise<void>){if(pending.current)return;pending.current=true;const token=request.current;setBusy(true);setError('');try{await task();}catch(e){if(active.current&&token===request.current)setError(e instanceof Error?e.message:String(e));}finally{pending.current=false;if(active.current)setBusy(false);}}
 async function locate(){const token=request.current,p=await Location.requestForegroundPermissionsAsync();if(!p.granted)throw new Error('Cần quyền vị trí để dùng điểm xuất phát hiện tại.');const fix=await getDeviceCurrentPosition({accuracy:Location.Accuracy.High,timeoutMs:12000});if(active.current&&token===request.current)setOrigin({latitude:fix.coords.latitude,longitude:fix.coords.longitude,name:'Vị trí hiện tại'});}
 async function calculate(){if(!origin||!features.reachableRange)return;const token=request.current;controller.current=new AbortController();const range=await calculateReachableRange(origin,minutes,mode,controller.current.signal);if(!active.current||token!==request.current)return;setResult(range);}
 const fit=()=>{if(result)map.current?.fitToCoordinates(result.boundary.map(([latitude,longitude])=>({latitude,longitude})));};
 return <ScreenScaffold title="Vùng có thể đi tới" subtitle="Khám phá khu vực trong thời gian bạn có">
  <GlassSurface style={{padding:18,gap:14}}><View style={{flexDirection:'row',alignItems:'center',gap:12}}><Text style={{flex:1,fontWeight:'700'}}>Bật tính vùng đi tới</Text><Switch accessibilityLabel="Bật tính vùng đi tới" value={features.reachableRange} onValueChange={value=>{if(!value)cancel();void setMapFeature('reachableRange',value).catch(()=>setError('Chưa lưu được lựa chọn. Hãy thử lại.'));}}/></View><Text style={{color:theme.colors.muted,lineHeight:21}}>Chỉ gửi điểm xuất phát đến TomTom khi bạn nhấn Tính. Vùng là ước tính theo đường bộ và giao thông, không bảo đảm mọi điểm bên trong đều tiếp cận được.</Text></GlassSurface>
  {features.reachableRange&&<><GlassSurface style={{padding:18,gap:12}}><Text style={{fontWeight:'700'}}>{origin?.name||'Chọn điểm xuất phát'}</Text><ActionButton title="Dùng vị trí hiện tại" icon="crosshairs-gps" disabled={busy} onPress={()=>void work(locate)}/><ActionButton title="Chọn địa điểm" icon="magnify" disabled={busy} onPress={()=>setSearch(true)}/><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{([10,15,30,45,60]).map(value=><GlassChip key={value} label={`${value} phút`} active={minutes===value} onPress={()=>setMinutes(value)}/>)}</View><View style={{flexDirection:'row',gap:8}}><GlassChip label="Xe máy" active={mode==='motorbike'} onPress={()=>setMode('motorbike')}/><GlassChip label="Ô tô" active={mode==='car'} onPress={()=>setMode('car')}/></View><ActionButton title={busy?'Đang xử lý…':'Tính vùng đi tới'} disabled={busy||!origin} onPress={()=>void work(calculate)}/></GlassSurface>
  {result&&<GlassSurface style={{padding:12,gap:12}}><Text style={{fontWeight:'700'}}>{result.minutes} phút · {result.mode==='car'?'Ô tô':'Xe máy'}</Text><View style={{height:340,borderRadius:16,overflow:'hidden'}}><LeafletMap key={`${result.calculatedAt}:${result.mode}:${result.minutes}`} ref={map} initialRegion={{...result.center,zoom:12}} currentPosition={result.center} roadLines={[result.boundary]} tileProvider="osm" onMapReady={fit}/></View><ActionButton title="Xem toàn bộ vùng" icon="fit-to-screen-outline" onPress={fit}/><Text style={{fontSize:12,color:theme.colors.muted}}>Viền tím: vùng ước tính · TomTom · {new Date(result.calculatedAt).toLocaleTimeString('vi-VN')}. Cần tính lại khi điều kiện giao thông thay đổi.</Text></GlassSurface>}
  <PlaceSearchSheet visible={search} onClose={()=>setSearch(false)} position={origin} onSelect={place=>{setSearch(false);setOrigin({latitude:place.latitude,longitude:place.longitude,name:place.displayName});}}/></>}
  {!!error&&<Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{error}</Text>}
 </ScreenScaffold>;
}
