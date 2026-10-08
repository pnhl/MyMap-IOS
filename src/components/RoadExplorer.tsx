import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, View } from 'react-native';
import { Text } from '../ui/Text';
import { ActionSheet } from '../ui/ActionSheet';
import { GlassButton } from '../ui/glass';
import { useAppTheme } from '../ui/theme';
import { env } from '../config/env';
import type { MapFeaturePreferences } from '../services/mapFeaturePreferences';
import { fetchOsmRoadData, fetchStreetImages, fetchMapillaryFeatures, fetchImageAnalysis, imageAnnotation, roadObjectDescription, type RoadFeature, type StreetImage, type Coordinate } from '../services/roadExplorer';
import { fetchVietFuel, type FuelPrices } from '../services/vietFuel';
import type { MapPlace } from '../services/mapPlaces';

export function useRoadExplorer(point: Coordinate|null, focused: boolean, zoom: number, preferences: MapFeaturePreferences) {
  const [features,setFeatures]=useState<RoadFeature[]>([]), [lines,setLines]=useState<[number,number][][]>([]), [status,setStatus]=useState(''),[refresh,setRefresh]=useState(0);
  const key=point?`${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`:'';
  const signs=preferences.trafficSigns||preferences.signAssistant, images=preferences.streetImagery||preferences.imageHistory||preferences.imageAnalysis;
  useEffect(()=>{
    setFeatures([]);setLines([]);setStatus('');
    if (!focused || !point || zoom<14 || !(signs||images||preferences.infrastructure||preferences.deadEnds)) return;
    const queryPoint={latitude:Number(point.latitude.toFixed(2)),longitude:Number(point.longitude.toFixed(2))};
    const controller=new AbortController();let active=true;
    setStatus('Đang tải dữ liệu đường…');
    const work:Array<Promise<{features:RoadFeature[];lines:[number,number][][]}>>=[];
    if (signs||preferences.infrastructure||preferences.deadEnds) work.push(fetchOsmRoadData(queryPoint,{signs,infrastructure:preferences.infrastructure,deadEnds:preferences.deadEnds},controller.signal));
    if (images && env.mapillaryToken) work.push(fetchStreetImages(queryPoint,controller.signal).then(data=>({features:data.map(imageAnnotation),lines:[]})));
    if ((signs||preferences.infrastructure) && env.mapillaryToken) work.push(fetchMapillaryFeatures(queryPoint,controller.signal).then(data=>({features:data.filter(f=>f.kind==='traffic_sign'?signs:preferences.infrastructure),lines:[]})));
    void Promise.allSettled(work).then(results=>{
      if (!active) return;
      const data=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
      setFeatures(data.flatMap(d=>d.features));setLines(data.flatMap(d=>d.lines));
      const failed=results.some(result=>result.status==='rejected');
      setStatus(images&&!env.mapillaryToken?'Ảnh Mapillary chưa sẵn sàng trên bản này.':failed?'Một số nguồn chưa tải được.':data.every(d=>!d.features.length)?'Chưa có dữ liệu mở rộng ở khu vực này.':'');
    });
    return()=>{active=false;controller.abort();};
  },[key,focused,zoom>=14,signs,images,preferences.infrastructure,preferences.deadEnds,refresh]);
  const visible=features.filter(f=>f.kind==='traffic_sign'?preferences.trafficSigns:f.kind==='street_image'?images:f.kind==='dead_end'?preferences.deadEnds:preferences.infrastructure);
  return {features,markers:visible,lines:preferences.infrastructure?lines:[],status,retry:()=>setRefresh(x=>x+1)};
}
export function RoadDetailsSheet({place,preferences,onClose,onNavigate}:{place:MapPlace|null;preferences:MapFeaturePreferences;onClose:()=>void;onNavigate:(place:MapPlace)=>void}) {
  const {theme}=useAppTheme();
  const [prices,setPrices]=useState<FuelPrices|null>(null),[history,setHistory]=useState<StreetImage[]>([]),[image,setImage]=useState<StreetImage|null>(null),[detections,setDetections]=useState<Array<{value:string;count:number}>>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const road=place as RoadFeature|null;
  useEffect(()=>{
    setPrices(null);setHistory([]);setImage(preferences.streetImagery||preferences.imageHistory||preferences.imageAnalysis?road?.image||null:null);setError('');
    if (!place) return;
    const abort=new AbortController();let active=true;
    const jobs:Array<Promise<void>>=[];setBusy(true);
    if (place.kind==='fuel' && preferences.fuelPrices) jobs.push(fetchVietFuel(place.address?.name||place.displayName,abort.signal,refresh>0).then(data=>{if(active)setPrices(data);}));
    if (preferences.imageHistory && env.mapillaryToken) jobs.push(fetchStreetImages(place,abort.signal,true,road?.image).then(data=>{if(active){setHistory(data);setImage(previous=>previous||data[0]||null);}}));
    else if ((preferences.streetImagery||preferences.imageAnalysis) && env.mapillaryToken && !road?.image) jobs.push(fetchStreetImages(place,abort.signal,true).then(data=>{if(active)setImage(data[0]||null);}));
    void Promise.allSettled(jobs).then(results=>{if(active){setBusy(false);if(results.some(r=>r.status==='rejected'))setError('Chưa tải được một số dữ liệu. Kiểm tra mạng hoặc thử lại sau.');}});
    return()=>{active=false;abort.abort();};
  },[place?.placeId,preferences.fuelPrices,preferences.imageHistory,preferences.streetImagery,preferences.imageAnalysis,refresh]);
  useEffect(()=>{
    setDetections([]);
    if (!image || !preferences.imageAnalysis) return;
    const abort=new AbortController();let active=true;
    void fetchImageAnalysis(image.id,abort.signal).then(data=>{if(active)setDetections(data);}).catch(()=>{if(active)setError('Chưa tải được nhận diện trong ảnh.');});
    return()=>{active=false;abort.abort();};
  },[image?.id,preferences.imageAnalysis]);
  return <ActionSheet visible={!!place} title={place?.address?.name||place?.displayName||'Thông tin điểm'} subtitle="Dữ liệu tại vị trí đã chọn" onClose={onClose}>
    {road?.details && <Text style={{fontSize:13,lineHeight:20}}>{road.details}</Text>}
    {!!road?.observedAt && <Text style={{color:theme.colors.muted,fontSize:12}}>Ghi nhận: {new Date(road.observedAt).toLocaleDateString('vi-VN')}</Text>}
    {busy && <ActivityIndicator color={theme.colors.primary}/>}
    {!!error && <Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{error}</Text>}
    {place?.kind==='fuel' && preferences.fuelPrices && <View style={{gap:10}}>
      <Text style={{fontWeight:'800',fontSize:18}}>Giá nhiên liệu tham khảo</Text>
      <Text style={{color:theme.colors.muted,fontSize:12,lineHeight:19}}>Bảng giá Việt Nam theo hãng và vùng. Chưa có xác nhận giá riêng tại cửa hàng này; vui lòng kiểm tra giá trên cột bơm.</Text>
      {prices && <><Text style={{fontSize:12}}>VietFuel · {prices.source} · ngày giá {prices.priceDate||'chưa xác định'}</Text>
        {prices.stale && <Text style={{color:theme.colors.danger,fontSize:12}}>Dữ liệu cũ hoặc thiếu ngày giá; không thể xác nhận là giá hiện hành.</Text>}
        <View style={{flexDirection:'row',gap:8}}><Text style={{flex:2,fontWeight:'700'}}>Sản phẩm</Text><Text style={{flex:1,fontWeight:'700'}}>Vùng 1</Text><Text style={{flex:1,fontWeight:'700'}}>Vùng 2</Text></View>
        {prices.rows.map(row=><View key={row.name} style={{flexDirection:'row',gap:8,paddingVertical:8,borderBottomWidth:.5,borderColor:theme.colors.border}}><View style={{flex:2}}><Text style={{fontSize:12}}>{row.name}</Text><Text style={{fontSize:10,color:theme.colors.muted}}>{row.unit}</Text></View><Text style={{flex:1,fontSize:12}}>{row.region1?.toLocaleString('vi-VN')||'—'}</Text><Text style={{flex:1,fontSize:12}}>{row.region2?.toLocaleString('vi-VN')||'—'}</Text></View>)}
        {!prices.rows.some(row=>/ad.?blue/i.test(row.name)) && <Text style={{fontSize:12,color:theme.colors.muted}}>Nguồn chưa cung cấp giá AdBlue.</Text>}
        <Text style={{fontSize:10,color:theme.colors.muted}}>Truy vấn {new Date(prices.fetchedAt).toLocaleTimeString('vi-VN')} · © VietFuel / TranQui</Text>
      </>}
    </View>}
    {image && (preferences.streetImagery||preferences.imageHistory||preferences.imageAnalysis) && <View style={{gap:8}}><Image accessibilityLabel="Ảnh đường từ Mapillary" source={{uri:image.thumbnail}} style={{width:'100%',height:210,borderRadius:16}} resizeMode="contain"/><Text style={{fontSize:12,color:theme.colors.muted}}>{image.creator} · {new Date(image.capturedAt).toLocaleDateString('vi-VN')} · Mapillary · CC BY-SA</Text><GlassButton tone="neutral" onPress={()=>void Linking.openURL(`https://www.mapillary.com/app/?pKey=${image.id}`).catch(()=>setError('Chưa mở được ảnh.'))}><Text>Xem ảnh đường / 360° trên Mapillary</Text></GlassButton></View>}
    {preferences.imageHistory && <View style={{gap:6}}><Text style={{fontWeight:'800'}}>Ảnh quanh vị trí này theo thời gian</Text><Text style={{fontSize:12,color:theme.colors.muted}}>Các ảnh API trả về trong bán kính khoảng 100 m; có thể khác hướng chụp, không phải toàn bộ lịch sử.</Text>{history.map(item=><Pressable key={item.id} accessibilityRole="button" onPress={()=>setImage(item)} style={{padding:12,borderRadius:12,backgroundColor:item.id===image?.id?theme.colors.primary:theme.colors.bg}}><Text>{new Date(item.capturedAt).toLocaleDateString('vi-VN')} · {item.creator}</Text></Pressable>)}{!busy&&!history.length&&<Text>Chưa có ảnh lịch sử tại đây.</Text>}</View>}
    {preferences.imageAnalysis && image && <View style={{gap:8}}><Text style={{fontWeight:'800'}}>Vật thể được nhận diện trong ảnh</Text><Text style={{fontSize:12,color:theme.colors.muted}}>Nhận diện tự động của Mapillary; không xác nhận hiện trạng đường hoặc hiệu lực biển báo.</Text>{detections.map(item=><Text key={item.value} style={{fontSize:12}}>{item.count} × {roadObjectDescription(item.value)}</Text>)}{!detections.length&&<Text style={{fontSize:12}}>Chưa có kết quả nhận diện.</Text>}</View>}
    {image && (preferences.streetImagery||preferences.imageHistory||preferences.imageAnalysis) && <Pressable accessibilityRole="link" accessibilityLabel="Giấy phép ảnh Mapillary CC BY-SA 4.0" onPress={()=>void Linking.openURL('https://creativecommons.org/licenses/by-sa/4.0/').catch(()=>setError('Chưa mở được giấy phép.'))}><Text style={{fontSize:12,color:theme.colors.primary}}>Giấy phép ảnh · CC BY-SA 4.0</Text></Pressable>}
    <GlassButton tone="neutral" disabled={busy} onPress={()=>setRefresh(x=>x+1)}><Text>Tải lại dữ liệu</Text></GlassButton>
    <GlassButton onPress={()=>{if(place)onNavigate(place);onClose();}}><Text>Chỉ đường đến đây</Text></GlassButton>
    {place?.provider==='osm' && <Text style={{fontSize:10,color:theme.colors.muted}}>© OpenStreetMap contributors · ODbL</Text>}
  </ActionSheet>;
}
