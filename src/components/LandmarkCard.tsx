import React,{useCallback,useState} from 'react';
import {Linking} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {GlassSurface} from '../ui/glass';
import {Text} from '../ui/Text';
import {ActionButton} from '../ui/ActionButton';
import {useAppTheme} from '../ui/theme';
import {useMapFeatures} from './MapFeatureSettings';
import {getLandmarkMetadata,type LandmarkMetadata} from '../services/landmarkMetadata';
export function LandmarkCard({id}:{id?:string}){
 const{theme}=useAppTheme(),preferences=useMapFeatures();const[data,setData]=useState<LandmarkMetadata|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0);
 useFocusEffect(useCallback(()=>{const controller=new AbortController();let active=true;setData(null);setError('');if(!preferences.landmarkMetadata||!id||!/^Q[1-9]\d{0,14}$/.test(id)){setLoading(false);return;}setLoading(true);void getLandmarkMetadata(id,controller.signal).then(value=>{if(active)setData(value);}).catch(()=>{if(active)setError('Chưa tải được thông tin địa danh.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;controller.abort();};},[id,preferences.landmarkMetadata,retry]));
 if(!preferences.landmarkMetadata||!id||!/^Q[1-9]\d{0,14}$/.test(id))return null;
 return <GlassSurface style={{padding:18,gap:10}}><Text style={{fontSize:19,fontWeight:'700'}}>Tìm hiểu địa danh</Text>{loading&&<Text style={{color:theme.colors.muted}}>Đang tải thông tin…</Text>}{error&&<><Text style={{color:theme.colors.muted}}>{error}</Text><ActionButton title="Thử lại" icon="refresh" onPress={()=>setRetry(v=>v+1)}/></>}{data&&<><Text style={{fontWeight:'700'}}>{data.label}</Text>{!!data.description&&<Text style={{lineHeight:22}}>{data.description}</Text>}{data.wikipediaUrl&&<ActionButton title="Đọc trên Wikipedia" icon="open-in-new" onPress={()=>void Linking.openURL(data.wikipediaUrl!).catch(()=>setError('Chưa mở được Wikipedia.'))}/>}<ActionButton title="Xem nguồn Wikidata" icon="open-in-new" onPress={()=>void Linking.openURL(data.wikidataUrl).catch(()=>setError('Chưa mở được Wikidata.'))}/><Text style={{fontSize:12,color:theme.colors.muted}}>Dữ liệu Wikidata · CC0 · liên kết từ thuộc tính OpenStreetMap. Mô tả do cộng đồng đóng góp.</Text></>}</GlassSurface>;
}
