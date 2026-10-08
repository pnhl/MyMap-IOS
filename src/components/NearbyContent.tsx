import React,{useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useAccountEpoch} from '../hooks/useAccountEpoch';
import * as Location from 'expo-location';
import {getDeviceCurrentPosition} from '../services/platformLocation';
import {accountRpc} from '../services/accountApi';
import {ContentInteractions} from './ContentInteractions';
import {distanceMeters} from '../utils/geo';
import {validateEvent,validateReview} from '../utils/catalogRules';
import {ActionButton} from '../ui/ActionButton';
import {GlassSurface} from '../ui/glass';
import {Text} from '../ui/Text';
import type {MeetupEvent,PlaceReview} from '../types/catalog';
type Entry={id:string;payload:MeetupEvent|PlaceReview;display_name:string;updated_at:string};
export function NearbyContent({kind}:{kind:'event'|'review'}){
 const accountEpoch=useAccountEpoch();
 const nav=useNavigation<any>(),[rows,setRows]=useState<Entry[]>([]),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const generation=useRef(0),pending=useRef(false);
 useEffect(()=>{generation.current++;setRows([]);setEnabled(false);setError('');setBusy(false);return()=>{generation.current++;};},[kind,accountEpoch]);
 async function load(){if(pending.current)return;pending.current=true;setBusy(true);setError('');const token=generation.current;try{const permission=await Location.requestForegroundPermissionsAsync();if(!permission.granted)throw new Error('Cần quyền vị trí để tìm quanh bạn.');const point=(await getDeviceCurrentPosition({accuracy:Location.Accuracy.High})).coords;const data=await accountRpc<Entry[]>('mm_nearby_content',{p_kind:kind,p_lat:point.latitude,p_lon:point.longitude,p_radius:2000});if(token!==generation.current)return;setRows((data as Entry[]).filter(row=>{try{if(kind==='event')validateEvent(row.payload as MeetupEvent);else validateReview(row.payload as PlaceReview);return distanceMeters(point,row.payload.place!)<=2000;}catch{return false;}}));setEnabled(true);}catch(e){if(token===generation.current)setError((e as{message?:string}).message||String(e));}finally{pending.current=false;setBusy(false);}}
 return <View style={{gap:12}}><ActionButton title={busy?'Đang tìm quanh bạn…':kind==='event'?'Tìm cuộc hẹn công khai trong 2 km':'Tìm đánh giá công khai trong 2 km'} disabled={busy} onPress={()=>void load()}/>{!!error&&<Text>{error}</Text>}{enabled&&<><Text>Nội dung do người dùng MyMap chia sẻ; đánh giá chưa được xác minh. {rows.length} kết quả.</Text><ActionButton title="Ẩn nội dung quanh tôi" onPress={()=>{generation.current++;setRows([]);setEnabled(false);}}/>{rows.map(row=><GlassSurface key={row.id} style={{padding:16,gap:10}}><Text style={{fontSize:18,fontWeight:'700'}}>{row.payload.name}</Text><Text>{row.display_name||'Người dùng MyMap'} · {row.payload.place?.name}</Text><Text>{row.payload.note}</Text>{'rating' in row.payload?<Text>{'★'.repeat(row.payload.rating)} · {new Date(row.payload.visitedAt).toLocaleDateString('vi-VN')}</Text>:<Text>{new Date(row.payload.startsAt).toLocaleString('vi-VN')} → {new Date(row.payload.endsAt).toLocaleString('vi-VN')}</Text>}<ActionButton title="Dẫn đường đến địa điểm" onPress={()=>nav.navigate('Tabs',{screen:'Map',params:{destination:row.payload.place}})}/><ContentInteractions documentId={row.id} event={kind==='event'}/></GlassSurface>)}</>}</View>;
}
