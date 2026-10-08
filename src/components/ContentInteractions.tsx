import React,{useCallback,useRef,useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {View} from 'react-native';
import {Text} from '../ui/Text';
import {TextInput} from '../ui/TextInput';
import {ActionButton} from '../ui/ActionButton';
import {useExtensions} from '../hooks/useExtensions';
import {useAccountEpoch} from '../hooks/useAccountEpoch';
import {contentAction,getContentDetails,reportContent,type ContentDetails} from '../services/socialTools';
export function ContentInteractions({documentId,event=false}:{documentId:string;event?:boolean}) {
  const enabled=useExtensions().communityTools,[details,setDetails]=useState<ContentDetails|null>(null),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const generation=useRef(0),pending=useRef(false),accountEpoch=useAccountEpoch();
  useFocusEffect(useCallback(()=>{let alive=true;const token=++generation.current;setDetails(null);setError('');setText('');setNotice('');setBusy(pending.current);if(enabled)void getContentDetails(documentId).then(value=>{if(alive&&token===generation.current)setDetails(value);}).catch(e=>{if(alive&&token===generation.current)setError((e as Error).message||String(e));});return()=>{alive=false;generation.current++;};},[documentId,enabled,accountEpoch]));
  async function work(task:()=>Promise<void>,success?:()=>void){if(pending.current)return;pending.current=true;setBusy(true);setError('');setNotice('');const token=generation.current;try{await task();if(token!==generation.current)return;success?.();const value=await getContentDetails(documentId);if(token===generation.current)setDetails(value);}catch(e){if(token===generation.current)setError((e as Error).message||String(e));}finally{pending.current=false;setBusy(false);}}
  if(!enabled)return null;
  return <View style={{gap:10}}>
    {details&&<><ActionButton title={`${details.liked?'Bỏ thích':'Thích'} · ${details.likes}`} disabled={busy} onPress={()=>void work(()=>contentAction(documentId,details.liked?'unlike':'like'))}/>
    {event&&<><Text>{details.going} tham gia · {details.interested} quan tâm</Text><ActionButton title={details.rsvp==='going'?'Hủy tham gia':'Tôi sẽ tham gia'} disabled={busy} onPress={()=>void work(()=>contentAction(documentId,details.rsvp==='going'?'cancel_rsvp':'going'))}/><ActionButton title={details.rsvp==='interested'?'Hủy quan tâm':'Quan tâm'} disabled={busy} onPress={()=>void work(()=>contentAction(documentId,details.rsvp==='interested'?'cancel_rsvp':'interested'))}/></>}
    <Text>50 bình luận mới nhất</Text>{[...details.comments].reverse().map(comment=><View key={comment.id} style={{gap:5}}><Text style={{fontWeight:'700'}}>{comment.display_name||'Thành viên'} · {new Date(comment.created_at).toLocaleString('vi-VN')}</Text><Text>{comment.body}</Text>{comment.can_delete&&<ActionButton title="Xóa bình luận" disabled={busy} onPress={()=>void work(()=>contentAction(documentId,'delete_comment','',comment.id))}/>}</View>)}</>}
    <TextInput value={text} onChangeText={setText} placeholder="Viết bình luận hoặc ghi chú báo cáo…" maxLength={1000} multiline editable={!busy}/><ActionButton title="Gửi bình luận" disabled={busy||!text.trim()} onPress={()=>void work(()=>contentAction(documentId,'comment',text),()=>setText(''))}/>
    <ActionButton title="Báo cáo nội dung không phù hợp" disabled={busy} onPress={()=>void work(()=>reportContent('document',documentId,'other',text),()=>setNotice('Đã gửi báo cáo cho bộ phận kiểm duyệt.'))}/>
    {!!notice&&<Text>{notice}</Text>}{!!error&&<Text accessibilityRole="alert">{error}</Text>}
  </View>;
}
