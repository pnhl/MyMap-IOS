import React,{useEffect,useRef,useState} from 'react';
import {AppState,View} from 'react-native';
import {RecordingPresets,useAudioRecorder,useAudioRecorderState,requestRecordingPermissionsAsync,setAudioModeAsync,setIsAudioActiveAsync} from 'expo-audio';
import {ActionButton as GlassButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
import {pauseMusicPlayback} from '../services/musicPlayback';
export function ChatAudioRecorder({onRecorded,onError,disabled}:{onRecorded:(uri:string,duration:number)=>Promise<void>;onError:(message:string)=>void;disabled:boolean}){
 const recorder=useAudioRecorder(RecordingPresets.HIGH_QUALITY),state=useAudioRecorderState(recorder,200);
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const generation=useRef(0),active=useRef(true),pending=useRef(false),discarded=useRef(true);
 useEffect(()=>{const subscription=AppState.addEventListener('change',value=>{active.current=value!=='background';if(value==='background'||(value==='inactive'&&recorder.isRecording)){generation.current++;discarded.current=true;setReady(false);if(recorder.isRecording)void recorder.stop().catch(()=>{});void setAudioModeAsync({allowsRecording:false}).catch(()=>{});}});return()=>{active.current=false;generation.current++;subscription.remove();if(recorder.isRecording)void recorder.stop().catch(()=>{});void setAudioModeAsync({allowsRecording:false}).catch(()=>{});};},[recorder]);
 useEffect(()=>{if(active.current&&!discarded.current&&!state.isRecording&&state.durationMillis>0&&recorder.uri)setReady(true);},[state.isRecording,state.durationMillis,recorder]);
 async function toggle(){if(pending.current)return;pending.current=true;setBusy(true);const token=++generation.current;try{
  if(recorder.isRecording){await recorder.stop();await setAudioModeAsync({allowsRecording:false});if(active.current)setReady(true);return;}
  const permission=await requestRecordingPermissionsAsync();if(!permission.granted)throw new Error('Cần quyền micro để ghi âm.');if(token!==generation.current)return;
  await pauseMusicPlayback();await setIsAudioActiveAsync(true);await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,shouldPlayInBackground:false,interruptionMode:'doNotMix'});await recorder.prepareToRecordAsync();if(token!==generation.current)return;discarded.current=false;setReady(false);recorder.record({forDuration:60});
 }catch(e){onError(e instanceof Error?e.message:String(e));}finally{if(!recorder.isRecording)await setAudioModeAsync({allowsRecording:false}).catch(()=>{});pending.current=false;setBusy(false);}}
 async function send(){if(!recorder.uri||pending.current)return;pending.current=true;setBusy(true);try{await setAudioModeAsync({allowsRecording:false});await onRecorded(recorder.uri,Math.min(60,state.durationMillis/1000));setReady(false);}catch(e){onError(e instanceof Error?e.message:String(e));}finally{pending.current=false;setBusy(false);}}
 return <View style={{gap:8}}><GlassButton title={state.isRecording?'Dừng ghi âm':ready?'Ghi lại':'Ghi lời nhắn'} icon={state.isRecording?'stop':'microphone'} disabled={disabled||busy} onPress={()=>void toggle()}/>{(state.isRecording||ready)&&<Text>{Math.floor(state.durationMillis/1000)} / 60 giây</Text>}{ready&&!state.isRecording&&<GlassButton title="Gửi ghi âm" icon="send" disabled={disabled||busy} onPress={()=>void send()}/>}</View>;
}
