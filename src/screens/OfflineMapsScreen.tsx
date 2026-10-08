import React,{useCallback,useRef,useState} from 'react';
import {View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import * as Location from 'expo-location';
import {getDownloadedPacks,downloadCityOfflinePack,readOfflineTiles,clearOfflinePacks,PRESET_CITIES,type OfflineTilePack} from '../services/offlineMap';
import {getDeviceCurrentPosition} from '../services/platformLocation';
import {OfflineMapView} from '../components/OfflineMapView';
import {ScreenScaffold} from '../ui/ScreenScaffold';
import {GlassSurface} from '../ui/glass';
import {ActionButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
export default function OfflineMapsScreen(){
 const[packs,setPacks]=useState<OfflineTilePack[]>([]),[selected,setSelected]=useState<OfflineTilePack|null>(null),[tiles,setTiles]=useState<Awaited<ReturnType<typeof readOfflineTiles>>>([]),[position,setPosition]=useState<{latitude:number;longitude:number}|null>(null),[progress,setProgress]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');const pending=useRef(false);
 useFocusEffect(useCallback(()=>{let alive=true;void getDownloadedPacks().then(value=>{if(alive)setPacks(value);});return()=>{alive=false;};},[]));
 async function action(work:()=>Promise<void>){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await work();setPacks(await getDownloadedPacks());}catch(e){setError(e instanceof Error?e.message:String(e));}finally{pending.current=false;setBusy(false);}}
 return <ScreenScaffold title="Bản đồ ngoại tuyến" subtitle="Xem các ô đã tải, kéo và phóng to khi không có mạng">
  <Text>Gói hiện tại gồm 18 ô ở mức 12–13 quanh trung tâm thành phố. Chỉ dùng nguồn được phép tải ngoại tuyến; tìm kiếm và tính tuyến mới cần mạng.</Text>
  {!!error&&<Text style={{color:'#FF9AA9'}}>{error}</Text>}
  {busy&&<Text>Đang xử lý · {progress}%</Text>}
  {PRESET_CITIES.map(city=><ActionButton key={city.id} title={`Tải / cập nhật ${city.name}`} disabled={busy} onPress={()=>void action(async()=>{setProgress(0);await downloadCityOfflinePack(city.id,setProgress);})}/>)}
  {packs.map(pack=><GlassSurface key={pack.id} style={{padding:16,gap:8}}><Text style={{fontSize:18,fontWeight:'700'}}>{pack.name}</Text><Text>{pack.tileCount} ô · {(pack.sizeBytes/1048576).toFixed(1)} MB · {new Date(pack.downloadedAt).toLocaleDateString('vi-VN')}</Text><ActionButton title="Xem bản đồ đã tải" disabled={busy} onPress={()=>void action(async()=>{setSelected(null);setTiles([]);setPosition(null);const loaded=await readOfflineTiles(pack);setTiles(loaded);setSelected(pack);})}/></GlassSurface>)}
  {selected&&tiles.length>0&&<View style={{gap:12}}><Text>{selected.name} · dữ liệu tải {new Date(selected.downloadedAt).toLocaleString('vi-VN')}</Text><OfflineMapView tiles={tiles} center={{latitude:selected.centerLat,longitude:selected.centerLon}} position={position} attribution="Nguồn bản đồ ngoại tuyến đã cấu hình · © OpenStreetMap contributors"/><ActionButton title="Đánh dấu vị trí hiện tại" disabled={busy} onPress={()=>void action(async()=>{const permission=await Location.requestForegroundPermissionsAsync();if(!permission.granted)throw new Error('Cần quyền vị trí.');const fix=await getDeviceCurrentPosition({accuracy:Location.Accuracy.High});setPosition(fix.coords);})}/></View>}
  {!!packs.length&&<ActionButton title="Xóa các gói đã tải" disabled={busy} onPress={()=>void action(async()=>{await clearOfflinePacks();setTiles([]);setSelected(null);})}/>}
 </ScreenScaffold>;
}
