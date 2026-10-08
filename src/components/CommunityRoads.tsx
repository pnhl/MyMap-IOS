import React,{useEffect,useState} from 'react';
import {View} from 'react-native';
import {accountRpc} from '../services/accountApi';
import {useAccountEpoch} from '../hooks/useAccountEpoch';
import {annotationId} from '../services/roadExplorer';
import type {MapPlace} from '../services/mapPlaces';
import type {RoadReport} from '../types/catalog';
import {ActionSheet} from '../ui/ActionSheet';
import {ActionButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
import {distanceMeters} from '../utils/geo';
type Report={id:string;payload:RoadReport;expires_at:string;display_name:string;confirmations:number;rejections:number;confidence:number|null};
const names:Record<RoadReport['category'],string>={hazard:'Nguy hiểm',pothole:'Ổ gà',flood:'Ngập nước',accident:'Tai nạn',closure:'Đóng đường',broken_light:'Đèn hỏng'};
export function useCommunityRoads(point:{latitude:number;longitude:number}|null,enabled:boolean,focused:boolean){
 const [reports,setReports]=useState<Report[]>([]),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const epoch=useAccountEpoch();
 const key=point?point.latitude.toFixed(3)+','+point.longitude.toFixed(3):'';
 useEffect(()=>{if(!enabled||!focused)return;const timer=setInterval(()=>setRefresh(v=>v+1),30000);return()=>clearInterval(timer);},[enabled,focused]);
 useEffect(()=>{setReports([]);setError('');if(!enabled||!focused||!point)return;let alive=true;const center=point;
  void accountRpc<Report[]>('mm_nearby_reports',{p_lat:point.latitude,p_lon:point.longitude,p_radius:2000}).then(data=>{if(!alive)return;setReports((data as Report[]).filter(r=>distanceMeters(center,r.payload)<=2000));}).catch(()=>{if(alive)setError('Chưa tải được báo cáo đường. Hãy thử lại khi có mạng.');});
  return()=>{alive=false;};
 },[key,enabled,focused,refresh,epoch]);
 const valid=enabled?reports.filter(r=>Date.parse(r.expires_at)>Date.now()):[];
 const markers:MapPlace[]=valid.map(r=>({placeId:annotationId(r.id),provider:'community',providerId:r.id,osmId:0,osmType:'node',kind:'road_report',latitude:r.payload.latitude,longitude:r.payload.longitude,displayName:names[r.payload.category]||'Báo cáo đường',category:'road_report',type:r.payload.category,address:{name:names[r.payload.category]}}));
 return{reports:valid,markers,error,reload:()=>setRefresh(v=>v+1)};
}
export function CommunityRoadSheet({place,reports,onClose,onRefresh}:{place:MapPlace|null;reports:Report[];onClose:()=>void;onRefresh:()=>void}){
 const report=reports.find(r=>r.id===place?.providerId),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setError('');},[place?.placeId]);
 async function vote(confirmed:boolean){if(!report||busy)return;setBusy(true);setError('');try{await accountRpc('mm_road_vote',{p_id:report.id,p_confirmed:confirmed});onRefresh();onClose();}catch(e){setError((e as{message?:string}).message||String(e));}finally{setBusy(false);}}
 return <ActionSheet visible={place?.kind==='road_report'} title={place?.displayName||'Báo cáo đường'} onClose={onClose}><View style={{gap:14}}><Text>Báo cáo của cộng đồng, chưa được cơ quan chức năng xác minh.</Text>{report?<><Text>{report.payload.note||'Không có ghi chú.'}</Text><Text>{report.display_name||'Người dùng MyMap'} · {new Date(report.payload.createdAt).toLocaleString('vi-VN')}</Text><Text>{report.confirmations} xác nhận · {report.rejections} báo đã hết</Text><Text>{report.confidence===null?'Chưa có phản hồi cộng đồng':`Mức ủng hộ tối thiểu từ phiếu cộng đồng: ${Math.round(report.confidence*100)}%`} · chưa xác minh chính thức</Text><Text>Hết hạn: {new Date(report.expires_at).toLocaleString('vi-VN')}</Text><ActionButton title="Tình trạng vẫn còn" disabled={busy} onPress={()=>void vote(true)}/><ActionButton title="Đã hết hoặc không đúng" disabled={busy} onPress={()=>void vote(false)}/></>:<Text>Báo cáo đã hết hạn hoặc chưa tải được.</Text>}{!!error&&<Text>{error}</Text>}</View></ActionSheet>;
}
