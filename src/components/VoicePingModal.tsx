import React,{useEffect,useRef,useState} from 'react';
import {AppState,Modal,StyleSheet,View} from 'react-native';
import {useAudioRecorder,useAudioRecorderState,RecordingPresets,requestRecordingPermissionsAsync,setAudioModeAsync,setIsAudioActiveAsync} from 'expo-audio';
import {GlassSurface,TopIconButton} from '../ui/glass';
import {ActionButton as GlassButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
import type {RealtimeFriend} from '../services/realtimeFriends';
import {sendVoicePing} from '../services/privateChat';
import {pauseMusicPlayback} from '../services/musicPlayback';

type Props={visible:boolean;friend?:RealtimeFriend|null;targetFriend?:RealtimeFriend|null;currentCoords?:unknown;onClose:()=>void;onVoiceSent?:(data:{roomId:string})=>void};
export function VoicePingModal({visible,friend,targetFriend,onClose,onVoiceSent}:Props){
 const recipient=targetFriend||friend;
 const recorder=useAudioRecorder(RecordingPresets.HIGH_QUALITY);
 const recording=useAudioRecorderState(recorder,200);
 const [voice,setVoice]=useState<string|null>(null),[duration,setDuration]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const operation=useRef(false),generation=useRef(0),discarding=useRef(false);
 useEffect(()=>{
  if(!visible){generation.current++;discarding.current=true;setVoice(null);setDuration(0);setError(null);if(recorder.isRecording)void recorder.stop().catch(()=>{});void setAudioModeAsync({allowsRecording:false}).catch(()=>{});}
 },[visible,recorder]);
 useEffect(()=>{
  const subscription=AppState.addEventListener('change',state=>{
   if(state==='background'||(state==='inactive'&&recorder.isRecording)){generation.current++;discarding.current=true;if(recorder.isRecording)void recorder.stop().catch(()=>{});setVoice(null);void setAudioModeAsync({allowsRecording:false}).catch(()=>{});}
  });
  return()=>{generation.current++;subscription.remove();if(recorder.isRecording)void recorder.stop().catch(()=>{});};
 },[recorder]);
 useEffect(()=>{
  if(visible&&!discarding.current&&!recording.isRecording&&recording.durationMillis>0&&recorder.uri){setVoice(recorder.uri);setDuration(recording.durationMillis/1000);void setAudioModeAsync({allowsRecording:false}).catch(()=>{});}
 },[visible,recording.isRecording,recording.durationMillis,recorder]);
 async function toggle(){
  if(operation.current)return;operation.current=true;setBusy(true);setError(null);const token=++generation.current;
  try{
   if(recorder.isRecording){await recorder.stop();setVoice(recorder.uri);setDuration(recording.durationMillis/1000);await setAudioModeAsync({allowsRecording:false});return;}
   const permission=await requestRecordingPermissionsAsync();if(!permission.granted)throw new Error('Cần quyền micro để ghi lời nhắn.');
   if(token!==generation.current||!visible)return;
   await pauseMusicPlayback();await setIsAudioActiveAsync(true);await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,shouldPlayInBackground:false,interruptionMode:'doNotMix'});
   await recorder.prepareToRecordAsync();
   if(token!==generation.current){await setAudioModeAsync({allowsRecording:false});return;}
   discarding.current=false;setVoice(null);recorder.record({forDuration:60});
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{operation.current=false;setBusy(false);}
 }
 async function send(){
  if(operation.current||!voice||!recipient)return;operation.current=true;setBusy(true);setError(null);
  try{const roomId=await sendVoicePing(recipient.userId,voice,Math.min(60,duration));setVoice(null);onVoiceSent?.({roomId});onClose();}
  catch(e){setError(e instanceof Error?e.message:String(e));if((e as{queued?:boolean}).queued)setVoice(null);}
  finally{operation.current=false;setBusy(false);}
 }
 const close=()=>{if(!busy){generation.current++;discarding.current=true;if(recorder.isRecording)void recorder.stop().catch(()=>{});onClose();}};
 return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}><View style={s.overlay}><GlassSurface style={s.dialog}>
  <View style={s.head}><Text style={s.title}>Ghi âm tới {recipient?.displayName||'bạn bè'}</Text><TopIconButton icon="close" accessibilityLabel="Đóng ghi âm" onPress={close}/></View>
  <Text style={s.detail}>{recording.isRecording?'Đang ghi âm':voice?'Ghi âm sẵn sàng gửi':'Ghi lời nhắn tối đa 60 giây vào hội thoại riêng.'}</Text>
  <Text style={s.timer}>{Math.floor(recording.isRecording?recording.durationMillis/1000:duration)}s</Text>
  {!!error&&<Text style={s.error}>{error}</Text>}
  <GlassButton icon={recording.isRecording?'stop':'microphone'} title={recording.isRecording?'Dừng ghi âm':voice?'Ghi lại':'Bắt đầu ghi âm'} onPress={()=>void toggle()} disabled={busy||!recipient}/>
  {!!voice&&!recording.isRecording&&<GlassButton title={busy?'Đang gửi…':'Gửi lời nhắn'} icon="send" onPress={()=>void send()} disabled={busy}/>}
 </GlassSurface></View></Modal>;
}
const s=StyleSheet.create({overlay:{flex:1,justifyContent:'center',padding:24,backgroundColor:'rgba(4,10,24,.88)'},dialog:{padding:24,gap:18},head:{flexDirection:'row',alignItems:'center'},title:{flex:1,color:'#fff',fontSize:19,fontWeight:'700'},detail:{color:'#ABC0D5',fontSize:14,lineHeight:21},timer:{color:'#89E8FF',fontSize:42,textAlign:'center'},error:{color:'#FF9AA9',lineHeight:20}});
