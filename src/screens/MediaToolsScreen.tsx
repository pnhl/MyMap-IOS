import React,{useCallback,useMemo,useRef,useState} from 'react';
import {Image,Pressable,View} from 'react-native';
import {useFocusEffect,useNavigation} from '@react-navigation/native';
import {getPhotoPins} from '../db/database';
import {getPhotoInsights,analyzeLocalPhoto,clearPhotoInsights} from '../services/photoInsights';
import {similarPhotos,smartAlbumGroups,normalizeSearch,type PhotoInsight} from '../utils/mediaInsights';
import type {PhotoPin} from '../types/photo';
import {ScreenScaffold,EmptyGlass} from '../ui/ScreenScaffold';
import {GlassSurface,GlassChip} from '../ui/glass';
import {ActionButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
import {TextInput} from '../ui/TextInput';
import {useAppTheme} from '../ui/theme';
export default function MediaToolsScreen(){
 const nav=useNavigation<any>(),{theme}=useAppTheme();const[photos,setPhotos]=useState<PhotoPin[]>([]),[insights,setInsights]=useState<PhotoInsight[]>([]),[query,setQuery]=useState(''),[album,setAlbum]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState('');const live=useRef(false),pending=useRef(false),cancel=useRef(false);
 const reload=useCallback(async()=>{const[p,i]=await Promise.all([getPhotoPins(),getPhotoInsights()]);if(!live.current)return;setPhotos(p);setInsights(i.filter(v=>p.some(photo=>photo.id===v.photoId&&photo.uri===v.uri)));},[]);
 useFocusEffect(useCallback(()=>{live.current=true;if(!pending.current){setBusy(false);setProgress('');}void reload().catch(e=>setError(String(e)));return()=>{live.current=false;cancel.current=true;};},[reload]));
 const groups=useMemo(()=>smartAlbumGroups(insights),[insights]),duplicates=useMemo(()=>similarPhotos(insights),[insights]);
 const visible=photos.filter(p=>{const i=insights.find(v=>v.photoId===p.id),words=normalizeSearch([p.title,p.note,p.placeName,i?.text,i?.labels.map(v=>v.label).join(' ')].join(' '));return(!album||groups.find(g=>g.label===album)?.photoIds.includes(p.id))&&normalizeSearch(query).split(/\s+/).every(q=>words.includes(q));});
 async function analyze(list:PhotoPin[]){if(pending.current)return;pending.current=true;cancel.current=false;setBusy(true);setError('');try{for(let index=0;index<list.length&&!cancel.current;index++){setProgress(`Đang xử lý ${index+1}/${list.length}`);await analyzeLocalPhoto(list[index]!);if(live.current)await reload();}}catch(e){if(live.current)setError(e instanceof Error?e.message:String(e));}finally{pending.current=false;if(live.current){setBusy(false);setProgress('');}}}
 return <ScreenScaffold title="Công cụ ảnh" subtitle="Đọc chữ, album theo nhãn và ảnh có nội dung tương tự">
  <Text style={{color:theme.colors.muted,lineHeight:21}}>Chỉ phân tích khi bạn yêu cầu. Kết quả lưu trên máy. Ảnh giống nhau cần tự kiểm tra trước khi xóa.</Text>
  {!!error&&<Text style={{color:theme.colors.danger}}>{error}</Text>}
  <TextInput value={query} onChangeText={setQuery} placeholder="Tìm bằng chữ trong ảnh, nhãn, tên hoặc ghi chú…" accessibilityLabel="Tìm nội dung ảnh"/>
  <ActionButton title={busy?progress:'Phân tích tối đa 50 ảnh đang hiển thị'} icon="image-search-outline" disabled={busy||!visible.length} onPress={()=>void analyze(visible.filter(p=>!insights.some(i=>i.photoId===p.id)).slice(0,50))}/>
  {busy&&<ActionButton title="Dừng sau ảnh hiện tại" onPress={()=>{cancel.current=true;}}/>}
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}><GlassChip label="Tất cả" active={!album} onPress={()=>setAlbum('')}/>{groups.slice(0,15).map(g=><GlassChip key={g.label} label={`${g.label} · ${g.photoIds.length}`} active={g.label===album} onPress={()=>setAlbum(g.label)}/>)}</View>
  {!!duplicates.length&&<GlassSurface style={{padding:16,gap:10}}><Text style={{fontWeight:'700'}}>Ảnh có nội dung tương tự</Text>{duplicates.slice(0,10).map(([a,b,d])=><Pressable key={a+':'+b} onPress={()=>nav.navigate('MemoryDetail',{photoId:b})}><Text style={{color:theme.colors.primary}}>Ảnh #{a} và #{b} · khác {d}/64 bit</Text></Pressable>)}</GlassSurface>}
  {!visible.length&&<EmptyGlass title="Chưa tìm thấy ảnh" body="Chụp ảnh kỷ niệm hoặc thay đổi từ khóa tìm kiếm."/>}
  {visible.slice(0,50).map(photo=>{const i=insights.find(v=>v.photoId===photo.id);return <GlassSurface key={photo.id} style={{padding:16,gap:10}}><Pressable onPress={()=>nav.navigate('MemoryDetail',{photoId:photo.id})}><Image source={{uri:photo.uri}} style={{height:180,borderRadius:14}} resizeMode="cover"/><Text style={{fontSize:17,color:theme.colors.text,marginTop:10}}>{photo.title||photo.placeName||'Ảnh kỷ niệm'}</Text></Pressable>{i?<><Text style={{color:theme.colors.muted}}>{i.provider} · {i.labels.map(l=>`${l.label} ${Math.round(l.confidence*100)}%`).join(' · ')||'Chưa có nhãn đủ tin cậy'}</Text>{!!i.text&&<Text selectable style={{color:theme.colors.text,lineHeight:21}}>{i.text.slice(0,1200)}</Text>}</>:<ActionButton title="Đọc chữ và phân loại ảnh này" disabled={busy} onPress={()=>void analyze([photo])}/>}</GlassSurface>;})}
  {!!insights.length&&<ActionButton title="Xóa kết quả phân tích trên máy" disabled={busy} onPress={()=>void clearPhotoInsights().then(reload).catch(e=>setError(String(e)))}/>}
 </ScreenScaffold>;
}
