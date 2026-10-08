import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,StyleSheet,View} from 'react-native';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text} from '../ui/Text';
import {TextInput} from '../ui/TextInput';
import {useAppTheme} from '../ui/theme';
import {searchOpenStreetMap,type OsmSearchResult} from '../services/openStreetMap';
import {env} from '../config/env';
import {VoiceSearchButton} from './VoiceSearchButton';
import {nearbyTomTomPlaces,searchTomTomPlaces,type NearbyCategory} from '../services/tomTomPlaces';
import {getSavedPlaces} from '../services/placeMetadata';
import {clearPlaceSearchHistory,familiarSearchPlace,readPlaceSearchHistory,rememberPlaceSearch,uniqueSearchPlaces,type PlaceSearchHistoryEntry} from '../services/placeSearchHistory';
type Props={visible:boolean;onClose:()=>void;onSelect:(place:OsmSearchResult)=>void;position:{latitude:number;longitude:number}|null;knownPlaces?:OsmSearchResult[];initialQuery?:string};
const categories:[string,NearbyCategory][]=[['Cây xăng','fuel'],['Quán ăn','restaurant'],['Cà phê','cafe'],['Nhà thuốc','pharmacy'],['Bãi đỗ xe','parking'],['Trạm sạc EV','charging_station']];
export function PlaceSearchSheet({visible,onClose,onSelect,position,knownPlaces=[],initialQuery=''}:Props){
 const {theme}=useAppTheme(),insets=useSafeAreaInsets();
 const [query,setQuery]=useState(''),[results,setResults]=useState<OsmSearchResult[]>([]),[history,setHistory]=useState<PlaceSearchHistoryEntry[]>([]),[familiar,setFamiliar]=useState<OsmSearchResult[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const generation=useRef(0),request=useRef<AbortController|null>(null),coords=useRef(position);coords.current=position;
 const close=()=>{generation.current++;request.current?.abort();Keyboard.dismiss();onClose();};
 useEffect(()=>{if(!visible)return;let active=true;setQuery(initialQuery.slice(0,150));setResults([]);setError(null);setBusy(false);void Promise.all([readPlaceSearchHistory(),getSavedPlaces().catch(()=>[])]).then(([recent,saved])=>{if(!active)return;setHistory(recent);setFamiliar(uniqueSearchPlaces([...saved.map(p=>familiarSearchPlace(p.name,p.latitude,p.longitude)),...knownPlaces]).slice(0,8));});return()=>{active=false;generation.current++;};},[visible]);
 async function search(text:string,submit=false){
  const id=++generation.current,q=text.trim();if(q.length<2){setResults([]);setBusy(false);return;}
  setBusy(true);setError(null);
  if(submit)void rememberPlaceSearch(q).catch(()=>{});
  request.current?.abort();const controller=new AbortController();request.current=controller;
  try{let found:OsmSearchResult[]=[];const category=categories.find(([label])=>label===q)?.[1];
   if(env.tomTomTrafficKey){try{found=category&&coords.current?await nearbyTomTomPlaces(coords.current.latitude,coords.current.longitude,category,controller.signal):await searchTomTomPlaces(q,coords.current||undefined,controller.signal);}catch{}}
   if(id!==generation.current||controller.signal.aborted)return;
   if(!found.length)found=await searchOpenStreetMap(q,10,coords.current||undefined,{allowNominatim:submit});
   if(id===generation.current){setResults(uniqueSearchPlaces(found));if(!found.length)setError('Chưa tìm thấy địa điểm. Thử thêm tên đường hoặc thành phố.');}}
  catch{if(id===generation.current)setError('Chưa tìm được địa điểm. Kiểm tra mạng và thử lại.');}
  finally{if(id===generation.current)setBusy(false);}
 }
 useEffect(()=>{generation.current++;request.current?.abort();setResults([]);setError(null);setBusy(false);if(!visible||query.trim().length<2)return;const timer=setTimeout(()=>void search(query),800);return()=>{clearTimeout(timer);request.current?.abort();};},[query,visible]);
 function choose(place:OsmSearchResult){void rememberPlaceSearch(query.trim()||place.displayName.split(',')[0]||place.displayName,place).catch(()=>{});close();onSelect(place);}
 const row=(place:OsmSearchResult,icon:'history'|'map-marker-outline'|'star-outline')=><Pressable key={`${icon}:${place.placeId}:${place.latitude}`} accessibilityRole="button" accessibilityLabel={`Chọn ${place.displayName}`} onPress={()=>choose(place)} style={s.row}><MaterialCommunityIcons name={icon} size={22} color={theme.colors.primary}/><View style={{flex:1}}><Text numberOfLines={1} style={{color:theme.colors.text,fontWeight:'700'}}>{place.displayName.split(',')[0]}</Text><Text numberOfLines={2} style={{color:theme.colors.muted,fontSize:12,marginTop:4}}>{place.displayName.split(',').slice(1).join(',')||'Địa điểm trên bản đồ'}</Text></View><MaterialCommunityIcons name="arrow-top-left" size={18} color={theme.colors.muted}/></Pressable>;
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={close}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={s.overlay}><Pressable accessibilityLabel="Đóng tìm kiếm" onPress={close} style={StyleSheet.absoluteFill}/><View style={[s.sheet,{backgroundColor:theme.colors.bg,paddingBottom:Math.max(insets.bottom,16),marginTop:insets.top+20}]}><View style={[s.search,{backgroundColor:theme.colors.bgRaised}]}><Pressable accessibilityRole="button" accessibilityLabel="Quay lại bản đồ" onPress={close} style={s.icon}><MaterialCommunityIcons name="arrow-left" size={23} color={theme.colors.text}/></Pressable><TextInput autoFocus accessibilityLabel="Tìm địa điểm hoặc địa chỉ" value={query} onChangeText={setQuery} placeholder="Tìm địa điểm hoặc địa chỉ" placeholderTextColor={theme.colors.muted} autoCorrect={false} returnKeyType="search" onSubmitEditing={()=>void search(query,true)} style={{flex:1,color:theme.colors.text,fontSize:16,minHeight:52}}/><Pressable accessibilityRole="button" accessibilityLabel={query?'Xóa nội dung tìm':'Tìm địa điểm'} onPress={()=>query?setQuery(''):void search(query,true)} style={s.icon}><MaterialCommunityIcons name={query?'close':'magnify'} size={22} color={theme.colors.muted}/></Pressable></View>
 <VoiceSearchButton active={visible} onText={setQuery}/>
 <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
 {!query.trim()?<>{history.length>0&&<><View style={s.heading}><Text style={{color:theme.colors.text,fontWeight:'700'}}>Tìm gần đây</Text><Pressable accessibilityRole="button" accessibilityLabel="Xóa lịch sử tìm địa điểm" onPress={()=>{void clearPlaceSearchHistory().then(()=>setHistory([])).catch(()=>setError('Chưa xóa được lịch sử.'));}}><Text style={{color:theme.colors.primary}}>Xóa lịch sử</Text></Pressable></View>{history.map(item=>item.place?row(item.place,'history'):<Pressable key={item.query} onPress={()=>setQuery(item.query)} style={s.row}><MaterialCommunityIcons name="history" size={22} color={theme.colors.muted}/><Text style={{flex:1,color:theme.colors.text}}>{item.query}</Text></Pressable>)}</>}{familiar.length>0&&<><View style={s.heading}><Text style={{color:theme.colors.text,fontWeight:'700'}}>Địa điểm quen thuộc</Text></View>{familiar.map(place=>row(place,'star-outline'))}</>}{!history.length&&!familiar.length&&<Text style={[s.empty,{color:theme.colors.muted}]}>Những địa điểm bạn tìm hoặc lưu sẽ xuất hiện ở đây.</Text>}<View style={s.heading}><Text style={{color:theme.colors.text,fontWeight:'700'}}>Khám phá quanh bạn</Text></View><View style={s.categories}>{categories.map(([label])=><Pressable key={label} onPress={()=>setQuery(label!)} style={[s.category,{backgroundColor:theme.colors.bgRaised}]}><Text style={{color:theme.colors.text}}>{label}</Text></Pressable>)}</View></>:<>{busy&&<ActivityIndicator style={{margin:18}} color={theme.colors.primary}/>}<Text style={[s.empty,{color:theme.colors.muted}]}>{query.trim().length<2?'Nhập ít nhất 2 ký tự để xem gợi ý.':'Gợi ý địa điểm'}</Text>{results.map(place=>row(place,'map-marker-outline'))}</>}
 {error&&<Text accessibilityRole="alert" style={[s.empty,{color:theme.colors.muted}]}>{error}</Text>}
 </ScrollView><Text style={{color:theme.colors.muted,fontSize:10,padding:12}}>{results.some(place=>place.provider==='tomtom')?'Địa điểm: © TomTom':'Địa điểm: OpenStreetMap · Photon'}</Text></View></KeyboardAvoidingView></Modal>;
}
const s=StyleSheet.create({overlay:{flex:1,backgroundColor:'rgba(0,0,0,.45)',justifyContent:'flex-end'},sheet:{maxHeight:'92%',minHeight:'65%',borderTopLeftRadius:26,borderTopRightRadius:26,paddingTop:12,paddingHorizontal:14},search:{flexDirection:'row',alignItems:'center',borderRadius:18,gap:6},icon:{minWidth:44,minHeight:52,alignItems:'center',justifyContent:'center'},row:{minHeight:68,paddingHorizontal:10,paddingVertical:12,flexDirection:'row',gap:14,alignItems:'center'},heading:{flexDirection:'row',justifyContent:'space-between',padding:12,paddingTop:22},empty:{padding:14,fontSize:13,lineHeight:21},categories:{flexDirection:'row',flexWrap:'wrap',gap:8,padding:10},category:{minHeight:44,padding:12,borderRadius:14}});
