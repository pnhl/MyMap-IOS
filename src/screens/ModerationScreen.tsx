import React,{useCallback,useRef,useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {moderationQueue,moderate,type ModerationReport} from '../services/socialTools';
import {useAccountEpoch} from '../hooks/useAccountEpoch';
import {ScreenScaffold} from '../ui/ScreenScaffold';
import {GlassSurface} from '../ui/glass';
import {Text} from '../ui/Text';
import {TextInput} from '../ui/TextInput';
import {ActionButton} from '../ui/ActionButton';
export default function ModerationScreen(){
 const epoch=useAccountEpoch(),generation=useRef(0),pending=useRef(false),[reports,setReports]=useState<ModerationReport[]>([]),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useFocusEffect(useCallback(()=>{const token=++generation.current;setReports([]);setNote('');setError('');void moderationQueue().then(r=>{if(token===generation.current)setReports(r);}).catch(()=>{if(token===generation.current)setError('Cần tài khoản được quản trị viên cấp quyền kiểm duyệt.');});return()=>{generation.current++;};},[epoch]));
 async function resolve(id:string,hidden:boolean){if(pending.current)return;pending.current=true;setBusy(true);setError('');const token=generation.current;try{await moderate(id,hidden,note);const value=await moderationQueue();if(token===generation.current){setReports(value);setNote('');}}catch(e){if(token===generation.current)setError((e as Error).message||String(e));}finally{pending.current=false;setBusy(false);}}
 return <ScreenScaffold title="Kiểm duyệt cộng đồng" subtitle="Báo cáo được gửi bởi thành viên MyMap">
 <Text>Mỗi quyết định được lưu cùng tài khoản xử lý và thời gian. Màn hình hiển thị phần văn bản liên quan; tệp đính kèm chưa có trình xem dành cho kiểm duyệt viên.</Text>
 {!!error&&<Text accessibilityRole="alert">{error}</Text>}<TextInput value={note} onChangeText={setNote} placeholder="Lý do xử lý (bắt buộc)" maxLength={1000} multiline/>
 {reports.map(r=><GlassSurface key={r.id} style={{padding:18,gap:10}}><Text style={{fontSize:18,fontWeight:'700'}}>{r.subject?.name||r.kind} · {r.reason}</Text><Text>{r.subject?.text||'Nội dung đã bị xóa hoặc không có phần văn bản.'}</Text><Text>Ghi chú báo cáo: {r.note||'Không có'}</Text><Text>{new Date(r.created_at).toLocaleString('vi-VN')}{r.hidden?' · Đang ẩn':''}</Text><ActionButton title="Ẩn nội dung" disabled={busy||!note.trim()} onPress={()=>void resolve(r.id,true)}/><ActionButton title="Không vi phạm / gỡ ẩn" disabled={busy||!note.trim()} onPress={()=>void resolve(r.id,false)}/></GlassSurface>)}{!reports.length&&!error&&<Text>Không có báo cáo đang chờ.</Text>}
 </ScreenScaffold>;
}
