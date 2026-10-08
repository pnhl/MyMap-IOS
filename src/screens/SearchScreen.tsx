import React,{useCallback,useMemo,useState,useEffect,useRef} from 'react';
import {Pressable} from 'react-native';
import {useFocusEffect,useNavigation} from '@react-navigation/native';
import {subscribeAuthState} from '../services/auth';
import {VoiceSearchButton} from '../components/VoiceSearchButton';
import {getPhotoPins} from '../db/database';
import {getSavedPlaces} from '../services/placeMetadata';
import {listDocuments} from '../services/catalogStore';
import {listConnections} from '../services/friendDiscovery';
import {getPhotoInsights} from '../services/photoInsights';
import {searchEntries,type SearchEntry} from '../utils/globalSearch';
import {ScreenScaffold,EmptyGlass} from '../ui/ScreenScaffold';
import {GlassSurface} from '../ui/glass';
import {Text} from '../ui/Text';
import {TextInput} from '../ui/TextInput';
import {useAppTheme} from '../ui/theme';
export default function SearchScreen(){
 const nav=useNavigation<any>(),{theme}=useAppTheme();const[entries,setEntries]=useState<SearchEntry[]>([]),[query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const generation=useRef(0);useEffect(()=>{let owner:string|undefined;return subscribeAuthState((_event,session)=>{const next=session?.user.id||'local';if(owner!==undefined&&owner!==next){generation.current++;setEntries([]);setQuery('');setBusy(false);}owner=next;});},[]);
 useFocusEffect(useCallback(()=>{let active=true;const token=generation.current;setBusy(true);void Promise.allSettled([getPhotoPins(),getSavedPlaces(),listDocuments(),listConnections(),getPhotoInsights()]).then(([p,s,d,f,i])=>{if(!active||token!==generation.current)return;const insights=i.status==='fulfilled'?i.value:[];const result:SearchEntry[]=[];
  if(p.status==='fulfilled')for(const photo of p.value)result.push({id:'memory:'+photo.id,kind:'memory',title:photo.title||photo.placeName||'Ảnh kỷ niệm',description:photo.note||new Date(photo.capturedAt).toLocaleDateString('vi-VN'),terms:[photo.placeName,photo.tags,insights.find(v=>v.photoId===photo.id)?.text].join(' '),target:{photoId:photo.id}});
  if(s.status==='fulfilled')for(const place of s.value)result.push({id:'place:'+place.key,kind:'place',title:place.name,description:'Địa điểm đã lưu',terms:'',target:{name:place.name,latitude:place.latitude,longitude:place.longitude}});
  if(d.status==='fulfilled')for(const doc of d.value.filter(v=>['trip','collection','vehicle','journal','expense','maintenance','event','review'].includes(v.kind)))result.push({id:'document:'+doc.id,kind:'document',title:String(doc.data.name||doc.data.note||'Mục đã lưu'),description:doc.kind,terms:JSON.stringify(doc.data),target:{tab:['vehicle','expense','maintenance'].includes(doc.kind)?'vehicle':['collection','journal','event','review'].includes(doc.kind)?doc.kind:'trip',documentId:doc.id}});
  if(f.status==='fulfilled')for(const friend of f.value.filter(v=>v.direction==='accepted'))result.push({id:'friend:'+friend.user_id,kind:'friend',title:friend.display_name||friend.username||'Bạn MyMap',description:friend.username||'Bạn bè',terms:'',target:{focusFriendId:friend.user_id}});
  setEntries(result);if([p,s,d,i].some(r=>r.status==='rejected'))setError('Một phần dữ liệu trên máy chưa đọc được. Hãy thử mở lại.');
 }).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[]));
 const found=useMemo(()=>searchEntries(entries,query),[entries,query]);
 function open(entry:SearchEntry){if(entry.kind==='memory')nav.navigate('MemoryDetail',entry.target);else if(entry.kind==='place')nav.navigate('Tabs',{screen:'Map',params:{destination:entry.target}});else if(entry.kind==='friend')nav.navigate('Tabs',{screen:'Map',params:entry.target});else nav.navigate('Catalog',entry.target);}
 return <ScreenScaffold title="Tìm trong MyMap" subtitle="Kỷ niệm, chữ trong ảnh, địa điểm, chuyến đi và bạn bè">
  <TextInput autoFocus accessibilityLabel="Tìm trong MyMap" placeholder="Nhập tên, ghi chú hoặc chữ trong ảnh…" value={query} onChangeText={setQuery}/>
  <VoiceSearchButton onText={setQuery}/>
  {busy&&<Text>Đang đọc dữ liệu…</Text>}{!!error&&<Text>{error}</Text>}
  {!query.trim()?<Text style={{color:theme.colors.muted}}>Tìm kiếm hỗ trợ tiếng Việt không dấu và lỗi gõ nhỏ. OCR cần phân tích ảnh trước trong Công cụ ảnh.</Text>:!found.length&&!busy?<EmptyGlass title="Chưa tìm thấy" body="Thử từ khóa ngắn hơn hoặc phân tích chữ trong ảnh."/>:found.map(entry=><Pressable key={entry.id} onPress={()=>open(entry)} accessibilityRole="button"><GlassSurface style={{padding:18,gap:8}}><Text style={{fontSize:17,color:theme.colors.text,fontWeight:'700'}}>{entry.title}</Text><Text numberOfLines={2} style={{color:theme.colors.muted}}>{entry.description}</Text></GlassSurface></Pressable>)}
 </ScreenScaffold>;
}
