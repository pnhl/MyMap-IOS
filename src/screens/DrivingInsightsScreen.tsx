import React,{useCallback,useRef,useState} from 'react';
import {useFocusEffect,useNavigation} from '@react-navigation/native';
import {View} from 'react-native';
import {getDb} from '../db/database';
import type {LocationPoint} from '../types/location';
import {analyzeDriving,type DrivingInsights} from '../utils/drivingInsights';
import {useExtensions} from '../hooks/useExtensions';
import {ScreenScaffold,MetricCard} from '../ui/ScreenScaffold';
import {GlassSurface} from '../ui/glass';
import {ActionButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
export default function DrivingInsightsScreen(){
 const enabled=useExtensions().drivingInsights,nav=useNavigation<any>(),generation=useRef(0),[day,setDay]=useState(0),[stats,setStats]=useState<DrivingInsights|null>(null),[error,setError]=useState('');
 const date=new Date();date.setDate(date.getDate()-day);date.setHours(0,0,0,0);const start=date.getTime(),end=new Date(date.getFullYear(),date.getMonth(),date.getDate()+1).getTime();
 useFocusEffect(useCallback(()=>{const token=++generation.current;setStats(null);setError('');if(enabled)void(async()=>{const db=await getDb();const points=await db.getAllAsync<LocationPoint>('SELECT latitude,longitude,timestamp,accuracy,speed FROM location_points WHERE timestamp>=? AND timestamp<? ORDER BY timestamp LIMIT 50001',start,end);if(points.length>50000)throw Error('Ngày này quá nhiều điểm GPS để phân tích trên màn hình. Hãy xuất lịch sử để kiểm tra.');const result=analyzeDriving(points);if(token===generation.current)setStats(result);})().catch(e=>{if(token===generation.current)setError((e as Error).message||String(e));});return()=>{generation.current++;};},[enabled,start,end]));
 return <ScreenScaffold title="Phân tích hành trình xe" subtitle={date.toLocaleDateString('vi-VN')}>
 {!enabled?<ActionButton title="Bật phân tích trong Cài đặt" onPress={()=>nav.navigate('Settings')}/>:<>
 <View style={{flexDirection:'row',gap:10}}><ActionButton title="Ngày trước" disabled={day>=89} onPress={()=>setDay(day+1)}/><ActionButton title="Ngày sau" disabled={day===0} onPress={()=>setDay(day-1)}/></View>
 {!!error&&<Text accessibilityRole="alert">{error}</Text>}{stats?<><View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}><MetricCard label="Quãng đường quan sát" value={`${stats.distanceKm.toFixed(1)} km`}/><MetricCard label="Di chuyển" value={`${Math.round(stats.movingMinutes)} phút`}/><MetricCard label="Vận tốc trung bình" value={stats.averageMovingKmh===null?'—':`${Math.round(stats.averageMovingKmh)} km/h`}/><MetricCard label="Tốc độ cao nhất ghi nhận" value={stats.maxSpeedKmh===null?'—':`${Math.round(stats.maxSpeedKmh)} km/h`}/></View>
 <GlassSurface style={{padding:18,gap:10}}><Text>{stats.acceptedPoints} điểm phù hợp · {stats.excludedPoints} điểm loại · {stats.gaps} đoạn mất dữ liệu.</Text><Text>Độ đều chuyển động: {stats.smoothness===null?'chưa đủ dữ liệu':`${stats.smoothness}/100`}. Chỉ tính khi có ít nhất 10 phút di chuyển, 1 km và 30 điểm GPS.</Text><Text>Phân tích dữ liệu GPS, gồm cả chuyển động đi bộ hoặc trên phương tiện khác. Độ đều chuyển động không phải đánh giá an toàn lái xe.</Text></GlassSurface>
 {stats.events.slice(-100).map((event,i)=><GlassSurface key={`${event.at}:${i}`} style={{padding:14,gap:6}}><Text>{event.kind==='stop'?'Dừng lâu':event.kind==='braking'?'Giảm tốc nhanh':'Tăng tốc nhanh'} · {new Date(event.at).toLocaleTimeString('vi-VN')}</Text>{event.durationSeconds&&<Text>{Math.round(event.durationSeconds/60)} phút</Text>}<ActionButton title="Xem vị trí" onPress={()=>nav.navigate('Tabs',{screen:'Map',params:{destination:{latitude:event.latitude,longitude:event.longitude,name:'Điểm ghi nhận GPS'}}})}/></GlassSurface>)}{!stats.acceptedPoints&&<Text>Chưa có GPS đủ chính xác trong ngày này. Bật lưu lịch sử và quyền vị trí trong Cài đặt.</Text>}</>:<Text>Đang phân tích trên thiết bị…</Text>}
 </>}
 </ScreenScaffold>;
}
