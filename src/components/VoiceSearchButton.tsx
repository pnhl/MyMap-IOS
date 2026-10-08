import React,{useEffect,useRef,useState} from 'react';
import {AppState,View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import Native from '../../modules/my-map-capabilities';
import {useExtensions} from '../hooks/useExtensions';
import {pauseMusicPlayback} from '../services/musicPlayback';
import {ActionButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
export function VoiceSearchButton({active=true,onText}:{active?:boolean;onText:(text:string)=>void}){
 const focused=useIsFocused();active=active&&focused;
 const enabled=useExtensions().voiceSearch,generation=useRef(0),pending=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{generation.current++;setBusy(false);setError('');const stop=()=>{generation.current++;void Native?.stopRecognition?.();setBusy(false);};const sub=AppState.addEventListener('change',state=>{if(state!=='active')stop();});if(!active||!enabled)stop();return()=>{sub.remove();stop();};},[active,enabled]);
 async function listen(){if(pending.current||!active)return;pending.current=true;setBusy(true);setError('');const token=generation.current;try{if(!Native?.recognizeSpeech||!(await Native.speechInputAvailable?.()))throw Error('Thiết bị chưa có bộ nhận dạng ngoại tuyến. Bạn vẫn có thể nhập tên địa điểm.');await pauseMusicPlayback();if(token!==generation.current)return;const result=await Native.recognizeSpeech('vi-VN');if(token===generation.current&&result.offline&&result.text.trim())onText(result.text);}catch(e){if(token===generation.current)setError((e as Error).message||String(e));}finally{pending.current=false;if(token===generation.current)setBusy(false);}}
 if(!enabled||!active)return null;
 return <View style={{gap:5}}><ActionButton title={busy?'Dừng nghe':'Tìm bằng giọng nói'} icon={busy?'stop':'microphone'} onPress={()=>{if(busy){generation.current++;void Native?.stopRecognition?.();setBusy(false);}else void listen();}}/>{!!error&&<Text accessibilityRole="alert">{error}</Text>}</View>;
}
