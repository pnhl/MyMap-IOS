import React,{useCallback,useRef,useState} from 'react';
import {View} from 'react-native';
import {useFocusEffect,useNavigation} from '@react-navigation/native';
import * as Location from 'expo-location';
import {getDeviceCurrentPosition} from '../services/platformLocation';
import {getSavedPlaces} from '../services/placeMetadata';
import {fetchAirQuality} from '../services/airQuality';
import {aqiColor,type AirQuality,type AirField} from '../utils/airQuality';
import {useExtensions} from '../hooks/useExtensions';
import {useAccountEpoch} from '../hooks/useAccountEpoch';
import {ScreenScaffold} from '../ui/ScreenScaffold';
import {GlassSurface} from '../ui/glass';
import {ActionButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
const labels:Record<AirField,string>={us_aqi:'AQI Hoa Kỳ',european_aqi:'AQI châu Âu',pm2_5:'PM2.5',pm10:'PM10',carbon_monoxide:'CO',nitrogen_dioxide:'NO₂',sulphur_dioxide:'SO₂',ozone:'O₃'};
export default function EnvironmentScreen(){
 const enabled=useExtensions().airQuality,epoch=useAccountEpoch(),nav=useNavigation<any>(),generation=useRef(0),pending=useRef(false);
 const [data,setData]=useState<AirQuality|null>(null),[place,setPlace]=useState(''),[saved,setSaved]=useState<Awaited<ReturnType<typeof getSavedPlaces>>>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useFocusEffect(useCallback(()=>{const token=++generation.current;setData(null);setSaved([]);setError('');setBusy(pending.current);if(enabled)void getSavedPlaces().then(value=>{if(token===generation.current)setSaved(value.slice(0,10));}).catch(()=>{});return()=>{generation.current++;};},[enabled,epoch]));
 async function load(point?:{latitude:number;longitude:number;name:string}){if(pending.current)return;pending.current=true;setBusy(true);setError('');const token=generation.current;try{if(!point){const permission=await Location.requestForegroundPermissionsAsync();if(!permission.granted)throw Error('Cần quyền vị trí, hoặc chọn địa điểm đã lưu.');const location=await getDeviceCurrentPosition({accuracy:Location.Accuracy.Balanced});point={...location.coords,name:'Quanh vị trí hiện tại'};}if(token!==generation.current)return;const value=await fetchAirQuality(point.latitude,point.longitude);if(token===generation.current){setData(value);setPlace(point.name);}}catch(e){if(token===generation.current)setError((e as Error).message||String(e));}finally{pending.current=false;if(token===generation.current)setBusy(false);}}
 return <ScreenScaffold title="Chất lượng không khí" subtitle="Dự báo theo khu vực từ Open-Meteo/CAMS">
 {!enabled?<ActionButton title="Bật dự báo không khí trong Cài đặt" onPress={()=>nav.navigate('Settings')}/>:<>
 <Text>Đây là dự báo từ mô hình theo khu vực, không phải số đo trực tiếp tại vị trí. AQI Hoa Kỳ và châu Âu dùng thang khác nhau.</Text><ActionButton title={busy?'Đang tải dự báo…':'Xem tại vị trí hiện tại'} disabled={busy} onPress={()=>void load()}/>
 {saved.map(p=><ActionButton key={p.key} title={p.name} disabled={busy} onPress={()=>void load(p)}/>)}
 {data&&<><GlassSurface style={{padding:20,gap:12}}><Text style={{fontWeight:'800',fontSize:19}}>{place}</Text><Text>Dữ liệu cho {new Date(data.current.at).toLocaleString('vi-VN')} · tải lúc {new Date(data.fetchedAt).toLocaleTimeString('vi-VN')}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:16}}>{(Object.keys(labels) as AirField[]).map(field=><View key={field} style={{minWidth:'42%',gap:4}}><Text>{labels[field]}</Text><Text style={{fontSize:26,fontWeight:'800',color:field==='us_aqi'?aqiColor(data.current.values[field]):undefined}}>{data.current.values[field]===undefined?'—':Math.round(data.current.values[field]!*10)/10} <Text style={{fontSize:12}}>{data.units[field]||''}</Text></Text></View>)}</View></GlassSurface>
 <GlassSurface style={{padding:18,gap:12}}><Text style={{fontWeight:'800'}}>24 giờ tới · AQI Hoa Kỳ</Text>{data.hourly.filter(v=>v.at>=Date.now()).slice(0,24).map(row=><View key={row.at} style={{flexDirection:'row',alignItems:'center',gap:12}}><Text style={{width:100}}>{new Date(row.at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</Text><View style={{height:9,borderRadius:6,width:Math.max(3,Math.min(120,(row.values.us_aqi||0)/2)),backgroundColor:aqiColor(row.values.us_aqi)}}/><Text>{row.values.us_aqi===undefined?'—':Math.round(row.values.us_aqi)}</Text></View>)}</GlassSurface><Text>Nguồn: Open-Meteo · Copernicus CAMS, CC BY 4.0. Mô hình toàn cầu có độ phân giải theo khu vực; dữ liệu có thể chưa phủ đủ mọi vị trí.</Text></>}
 {!!error&&<Text accessibilityRole="alert">{error}</Text>}
 </>}
 </ScreenScaffold>;
}
