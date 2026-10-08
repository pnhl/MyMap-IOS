import React,{useCallback,useRef,useState} from 'react';
import {useFocusEffect,useNavigation,useRoute} from '@react-navigation/native';
import {useAccountEpoch} from '../hooks/useAccountEpoch';
import {useExtensions} from '../hooks/useExtensions';
import {readSharedContent,type SharedContent} from '../services/sharedContent';
import {ContentInteractions} from '../components/ContentInteractions';
import {ScreenScaffold} from '../ui/ScreenScaffold';
import {GlassSurface} from '../ui/glass';
import {ActionButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
export default function SharedContentScreen(){
 const nav=useNavigation<any>(),route=useRoute<any>(),epoch=useAccountEpoch(),generation=useRef(0),extensions=useExtensions(),enabled=extensions.socialTools||extensions.communityTools;
 const[content,setContent]=useState<SharedContent|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useFocusEffect(useCallback(()=>{const token=++generation.current;setContent(null);setError('');setLoading(enabled);async function load(){try{const value=await readSharedContent(route.params.documentId);if(token===generation.current){setContent(value);setError('');}}catch(e){if(token===generation.current){setContent(null);setError((e as Error).message);}}finally{if(token===generation.current)setLoading(false);}}if(enabled)void load();const timer=enabled?setInterval(()=>void load(),30000):null;return()=>{generation.current++;if(timer)clearInterval(timer);};},[enabled,epoch,route.params.documentId]));
 return <ScreenScaffold title={content?.kind==='event'?'Cuộc hẹn cộng đồng':'Nội dung cộng đồng'} subtitle="Nội dung do người dùng chia sẻ">
 {!enabled?<ActionButton title="Bật tiện ích cộng đồng trong Cài đặt" onPress={()=>nav.navigate('Settings')}/>:<>
 {loading&&<Text>Đang tải nội dung…</Text>}{!!error&&<Text accessibilityRole="alert">{error}</Text>}
 {content&&<GlassSurface style={{padding:18,gap:14}}><Text style={{fontSize:22,fontWeight:'700'}}>{content.payload.name}</Text><Text>{content.payload.note}</Text><Text>{content.payload.place.name}</Text>{'rating'in content.payload?<Text>{'★'.repeat(content.payload.rating)} · ghé thăm {new Date(content.payload.visitedAt).toLocaleDateString('vi-VN')}</Text>:<Text>{new Date(content.payload.startsAt).toLocaleString('vi-VN')} → {new Date(content.payload.endsAt).toLocaleString('vi-VN')}</Text>}<Text>Đánh giá và cuộc hẹn chưa được MyMap xác minh.</Text><ActionButton title="Dẫn đường đến địa điểm" onPress={()=>nav.navigate('Tabs',{screen:'Map',params:{destination:content.payload.place}})}/><ContentInteractions documentId={content.id} event={content.kind==='event'}/></GlassSurface>}
 </>}
 </ScreenScaffold>;
}
