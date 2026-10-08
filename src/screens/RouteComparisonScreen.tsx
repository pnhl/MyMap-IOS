import React,{useCallback,useEffect,useRef,useState} from 'react';
import {View,Switch} from 'react-native';
import * as Location from 'expo-location';
import {useFocusEffect,useNavigation} from '@react-navigation/native';
import {ScreenScaffold} from '../ui/ScreenScaffold';
import {GlassSurface} from '../ui/glass';
import {Text} from '../ui/Text';
import {ActionButton} from '../ui/ActionButton';
import {useAppTheme} from '../ui/theme';
import {PlaceSearchSheet} from '../components/PlaceSearchSheet';
import {useMapFeatures} from '../components/MapFeatureSettings';
import {setMapFeature} from '../services/mapFeaturePreferences';
import {getDeviceCurrentPosition} from '../services/platformLocation';
import {calculateRouteMatrix,type MatrixPlace,type RouteMatrix} from '../services/routeMatrix';
export default function RouteComparisonScreen(){
 const{theme}=useAppTheme(),nav=useNavigation<any>(),features=useMapFeatures();
 const[origin,setOrigin]=useState<MatrixPlace|null>(null),[destinations,setDestinations]=useState<MatrixPlace[]>([]),[result,setResult]=useState<RouteMatrix|null>(null),[search,setSearch]=useState<'origin'|'destination'|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const active=useRef(false),generation=useRef(0),pending=useRef(false),controller=useRef<AbortController|null>(null);
 const cancel=()=>{generation.current++;controller.current?.abort();controller.current=null;};
 useFocusEffect(useCallback(()=>{active.current=true;setBusy(false);return()=>{active.current=false;cancel();setResult(null);setSearch(null);};},[]));
 useEffect(()=>{cancel();setResult(null);setError('');setBusy(false);},[origin,destinations,features.routeMatrix]);
 async function work(task:(token:number)=>Promise<void>){if(pending.current)return;pending.current=true;const token=generation.current;setBusy(true);setError('');try{await task(token);}catch(e){if(active.current&&token===generation.current)setError(e instanceof Error?e.message:String(e));}finally{pending.current=false;if(active.current)setBusy(false);}}
 async function locate(token:number){const permission=await Location.requestForegroundPermissionsAsync();if(!permission.granted)throw new Error('Cần quyền vị trí.');const fix=await getDeviceCurrentPosition({accuracy:Location.Accuracy.High,timeoutMs:12000});if(active.current&&token===generation.current)setOrigin({name:'Vị trí hiện tại',latitude:fix.coords.latitude,longitude:fix.coords.longitude});}
 async function compare(token:number){if(!origin||!features.routeMatrix)return;controller.current=new AbortController();const value=await calculateRouteMatrix([origin],destinations,controller.current.signal);if(active.current&&token===generation.current)setResult(value);}
 return <ScreenScaffold title="So sánh điểm đến" subtitle="Chọn nơi thuận tiện hơn để đi bằng ô tô">
  <GlassSurface style={{padding:18,gap:12}}><View style={{flexDirection:'row',alignItems:'center',gap:12}}><Text style={{flex:1,fontWeight:'700'}}>Bật so sánh tuyến</Text><Switch value={features.routeMatrix} accessibilityLabel="Bật so sánh tuyến" onValueChange={value=>{if(!value)cancel();void setMapFeature('routeMatrix',value).catch(()=>setError('Chưa lưu được lựa chọn.'));}}/></View><Text style={{color:theme.colors.muted,lineHeight:21}}>Mặc định tắt. Chỉ gửi các điểm đã chọn đến TomTom khi nhấn So sánh. Mỗi lần so sánh tối đa 5 điểm đến; kết quả có tính giao thông.</Text></GlassSurface>
  {features.routeMatrix&&<><GlassSurface style={{padding:18,gap:12}}><Text style={{fontWeight:'700'}}>{origin?.name||'Chọn điểm xuất phát'}</Text><ActionButton title="Dùng vị trí hiện tại" icon="crosshairs-gps" disabled={busy} onPress={()=>void work(locate)}/><ActionButton title="Chọn điểm xuất phát" icon="magnify" disabled={busy} onPress={()=>setSearch('origin')}/><Text style={{fontWeight:'700'}}>Các điểm đến · {destinations.length}/5</Text>{destinations.map((place,index)=><View key={`${place.latitude}:${place.longitude}:${index}`} style={{gap:6}}><Text>{index+1}. {place.name}</Text><ActionButton title="Bỏ địa điểm" disabled={busy} onPress={()=>setDestinations(list=>list.filter((_,i)=>i!==index))}/></View>)}<ActionButton title="Thêm điểm đến" icon="map-marker-plus-outline" disabled={busy||destinations.length>=5} onPress={()=>setSearch('destination')}/><ActionButton title={busy?'Đang tính…':'So sánh thời gian đi'} disabled={busy||!origin||!destinations.length} onPress={()=>void work(compare)}/></GlassSurface>
  {result&&<><Text style={{color:theme.colors.muted}}>TomTom · {new Date(result.calculatedAt).toLocaleTimeString('vi-VN')} · Ước tính cho ô tô</Text>{[...result.cells].sort((a,b)=>(a.seconds??Infinity)-(b.seconds??Infinity)).map(cell=>{const place=destinations[cell.destinationIndex];if(!place)return null;return <GlassSurface key={cell.destinationIndex} style={{padding:18,gap:10}}><Text style={{fontWeight:'700'}}>{place.name}</Text>{cell.error?<Text style={{color:theme.colors.muted}}>{cell.error}</Text>:<><Text>{Math.ceil(cell.seconds!/60)} phút · {(cell.distanceMeters!/1000).toFixed(1)} km{cell.delaySeconds!=null?` · chậm do giao thông ${Math.ceil(cell.delaySeconds/60)} phút`:''}</Text><ActionButton title="Dẫn đường đến đây" icon="navigation-variant" onPress={()=>nav.navigate('Tabs',{screen:'Map',params:{destination:place,travelMode:'car'}})}/></>}</GlassSurface>;})}</>}
  <PlaceSearchSheet visible={search!==null} onClose={()=>setSearch(null)} position={origin} onSelect={place=>{const p={latitude:place.latitude,longitude:place.longitude,name:place.displayName};if(search==='origin')setOrigin(p);else setDestinations(list=>list.length<5&&!list.some(v=>v.latitude===p.latitude&&v.longitude===p.longitude)?[...list,p]:list);setSearch(null);}}/></>}
  {!!error&&<Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{error}</Text>}
 </ScreenScaffold>;
}
