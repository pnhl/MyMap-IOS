import React,{useEffect,useRef,useState} from 'react';
import {AppState,View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {useExtensions} from '../hooks/useExtensions';
import {useAccountEpoch} from '../hooks/useAccountEpoch';
import {generateDeviceAi,stopDeviceAi} from '../services/deviceAi';
import type {AiTask} from '../utils/aiRules';
import {ActionButton} from '../ui/ActionButton';
import {GlassChip} from '../ui/glass';
import {Text} from '../ui/Text';
import {TextInput} from '../ui/TextInput';

/** A suggestion is only inserted into the open draft after the user reviews it. */
export function DeviceAiComposer({task,facts,onUse,disabled=false}:{task:AiTask;facts:string;onUse:(text:string)=>void;disabled?:boolean}){
 const enabled=useExtensions().deviceAi,focused=useIsFocused(),epoch=useAccountEpoch();
 const mounted=useRef(true),generation=useRef(0),pending=useRef(false);
 const[open,setOpen]=useState(false),[input,setInput]=useState(''),[provider,setProvider]=useState<'system'|'local'>('local'),[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;if(pending.current)void stopDeviceAi();};},[]);
 useEffect(()=>{function clear(){generation.current++;if(pending.current)void stopDeviceAi();if(mounted.current){setOpen(false);setInput('');setAnswer('');setError('');}}if(!enabled||!focused)clear();const sub=AppState.addEventListener('change',state=>{if(state!=='active')clear();});return()=>{sub.remove();clear();};},[enabled,focused,epoch]);
 async function generate(){if(pending.current)return;const token=generation.current;pending.current=true;setBusy(true);setError('');setAnswer('');try{const text=await generateDeviceAi(provider,task,input);if(mounted.current&&token===generation.current)setAnswer(text);}catch(e){if(mounted.current&&token===generation.current)setError((e as Error).message||'Chưa thể tạo gợi ý.');}finally{pending.current=false;if(mounted.current)setBusy(false);}}
 if(!enabled)return null;
 return <View style={{gap:10}}>
 {!open?<ActionButton title={task==='caption'?'Gợi ý chú thích bằng AI':'Gợi ý nhật ký bằng AI'} disabled={disabled||busy} onPress={()=>{setInput(facts.slice(0,4500));setOpen(true);}}/>:<>
 <Text>Kiểm tra và bổ sung các sự kiện bên dưới. AI chỉ nhận phần văn bản này; ảnh không được gửi cho AI.</Text>
 <TextInput value={input} onChangeText={setInput} editable={!busy&&!disabled} maxLength={4500} multiline accessibilityLabel="Ghi chú đưa vào AI"/>
 <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}><GlassChip label="GGUF cục bộ" active={provider==='local'} disabled={busy} onPress={()=>setProvider('local')}/><GlassChip label="Apple Intelligence" active={provider==='system'} disabled={busy} onPress={()=>setProvider('system')}/></View>
 <Text>Cấu hình mô hình trong Cài đặt → AI trên thiết bị.</Text>
 <ActionButton title={busy?'AI đang xử lý…':'Tạo gợi ý'} disabled={busy||disabled||!input.trim()} onPress={()=>void generate()}/>
 {busy&&<ActionButton title="Dừng xử lý" onPress={()=>{generation.current++;void stopDeviceAi();setAnswer('');}}/>}
 {!!answer&&<><Text selectable>{answer}</Text><ActionButton title="Dùng gợi ý trong bản nháp" disabled={busy||disabled} onPress={()=>{onUse(answer.slice(0,4000));setAnswer('');setOpen(false);}}/></>}
 {!!error&&<Text accessibilityRole="alert">{error}</Text>}
 <ActionButton title="Đóng gợi ý" disabled={busy} onPress={()=>{setOpen(false);setAnswer('');setInput('');}}/>
 </>}
 </View>;
}
