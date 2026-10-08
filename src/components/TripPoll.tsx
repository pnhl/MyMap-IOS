import React,{useState,useRef,useEffect} from 'react';
import {View} from 'react-native';
import {ActionButton} from '../ui/ActionButton';
import {GlassChip} from '../ui/glass';
import {Text} from '../ui/Text';
import {supabase} from '../services/supabase';
import type {CatalogDocument,TripPlan} from '../types/catalog';
type Ballot={user_id:string;stop_id:string};
export function TripPoll({document}:{document:CatalogDocument<TripPlan>}){
 const [opened,setOpened]=useState(false),[busy,setBusy]=useState(false),[rows,setRows]=useState<Ballot[]>([]),[me,setMe]=useState(''),[error,setError]=useState('');const generation=useRef(0),pending=useRef(false);
 useEffect(()=>()=>{generation.current++;},[document.id]);
 async function load(){const [identity,result]=await Promise.all([supabase.rpc('mm_identity'),supabase.from('mm_trip_ballots').select('user_id,stop_id').eq('document_id',document.id)]);if(identity.error)throw identity.error;if(result.error)throw result.error;return{me:String(identity.data),rows:result.data as Ballot[]};}
 async function action(stop?:string|null){if(pending.current)return;pending.current=true;setBusy(true);setError('');const token=generation.current;try{if(stop!==undefined){const{error}=await supabase.rpc('mm_trip_vote',{p_id:document.id,p_stop:stop});if(error)throw error;}const data=await load();if(token!==generation.current)return;setMe(data.me);setRows(data.rows);setOpened(true);}catch(e){if(token===generation.current)setError((e as{message?:string}).message||String(e));}finally{pending.current=false;if(token===generation.current)setBusy(false);}}
 if(document.sync==='local'||document.version===0)return <Text>Đồng bộ chuyến đi có bạn cùng chỉnh sửa để mở bình chọn điểm dừng.</Text>;
 const mine=rows.find(r=>r.user_id===me)?.stop_id;
 return <View style={{gap:10}}><ActionButton title={opened?'Ẩn bình chọn':'Bình chọn điểm dừng yêu thích'} disabled={busy} onPress={()=>opened?setOpened(false):void action()}/>{!!error&&<Text>{error}</Text>}{opened&&<><Text>Mỗi thành viên có một lựa chọn; chọn lại để bỏ phiếu.</Text><View style={{gap:8}}>{document.data.stops.map(s=><GlassChip key={s.id} label={`${s.name} · ${rows.filter(r=>r.stop_id===s.id).length} phiếu`} active={mine===s.id} onPress={()=>{if(!busy)void action(mine===s.id?null:s.id);}}/>)}</View><ActionButton title="Cập nhật kết quả" disabled={busy} onPress={()=>void action()}/></>}</View>;
}
