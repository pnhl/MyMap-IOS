import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Alert,AppState,PermissionsAndroid,Platform,Pressable,View} from 'react-native';
import {useFocusEffect,useNavigation,useRoute} from '@react-navigation/native';
import {AudioSession,LiveKitRoom,VideoTrack,useRoomContext,useParticipants,useTracks} from '@livekit/react-native';
import {Room,Track} from 'livekit-client';
import {callAccess,checkCall,endCall,type CallAccess} from '../services/calls';
import {pauseMusicPlayback} from '../services/musicPlayback';
import {useAccountEpoch} from '../hooks/useAccountEpoch';
import {useExtensions} from '../hooks/useExtensions';
import {ScreenScaffold} from '../ui/ScreenScaffold';
import {GlassSurface} from '../ui/glass';
import {ActionButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
function Controls({mode,onLeave}:{mode:CallAccess['mode'];onLeave:()=>void}){
 const room=useRoomContext(),participants=useParticipants(),tracks=useTracks([Track.Source.Camera]),[mic,setMic]=useState(false),[camera,setCamera]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const active=useRef(true),talking=useRef(false),micQueue=useRef<Promise<unknown>>(Promise.resolve());
 function microphone(enabled:boolean){talking.current=enabled;micQueue.current=micQueue.current.catch(()=>{}).then(async()=>{if(!active.current)return;await room.localParticipant.setMicrophoneEnabled(talking.current);if(!active.current||!talking.current)await room.localParticipant.setMicrophoneEnabled(false);if(active.current)setMic(room.localParticipant.isMicrophoneEnabled);}).catch(()=>{if(active.current)setError('Không mở được micro. Kiểm tra quyền trong Cài đặt.');});}
 useEffect(()=>{active.current=true;return()=>{active.current=false;talking.current=false;void room.localParticipant.setMicrophoneEnabled(false).catch(()=>{});void room.localParticipant.setCameraEnabled(false).catch(()=>{});};},[room]);
 async function video(){if(busy)return;setBusy(true);try{if(Platform.OS==='android'&&!(await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA)==='granted'))throw Error('Cần quyền camera để bật video.');if(!active.current)return;await room.localParticipant.setCameraEnabled(!camera);if(!active.current){await room.localParticipant.setCameraEnabled(false);return;}setCamera(room.localParticipant.isCameraEnabled);}catch(e){if(active.current)setError((e as Error).message||String(e));}finally{if(active.current)setBusy(false);}}
 return <View style={{gap:12}}><Text>{participants.length} người trong phòng · Micro {mic?'bật':'tắt'}</Text>{participants.map(p=><Text key={p.identity}>{p.name||'Thành viên'}{p.isSpeaking?' · đang nói':''}</Text>)}
 {mode==='ptt'?<Pressable accessibilityRole="button" accessibilityLabel="Giữ để nói, thả để tắt micro" onPressIn={()=>microphone(true)} onPressOut={()=>microphone(false)} style={{minHeight:72,borderRadius:20,backgroundColor:'#405df5',justifyContent:'center',alignItems:'center'}}><Text style={{color:'white',fontSize:18,fontWeight:'800'}}>Giữ để nói</Text></Pressable>:<ActionButton title={mic?'Tắt micro':'Bật micro'} icon={mic?'microphone-off':'microphone'} onPress={()=>microphone(!mic)}/>}
 {mode==='video'&&<ActionButton title={camera?'Tắt camera':'Bật camera'} disabled={busy} onPress={()=>void video()}/>}
 {tracks.map(track=><VideoTrack key={`${track.participant.identity}:${track.publication.trackSid}`} trackRef={track} objectFit="contain" style={{height:230,borderRadius:16}}/>)}
 <ActionButton title="Rời cuộc gọi" icon="phone-hangup" onPress={onLeave}/>{!!error&&<Text accessibilityRole="alert">{error}</Text>}</View>;
}
export default function CallScreen(){
 const route=useRoute<any>(),nav=useNavigation<any>(),enabled=useExtensions().calls,accountEpoch=useAccountEpoch(),generation=useRef(0),pending=useRef(false),roomRef=useRef<Room|null>(null);
 const [access,setAccess]=useState<CallAccess|null>(null),[connection,setConnection]=useState('Chưa tham gia'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const stop=useCallback(()=>{generation.current++;const room=roomRef.current;roomRef.current=null;if(room)void room.disconnect().catch(()=>{});setAccess(null);setConnection('Đã rời cuộc gọi');void AudioSession.stopAudioSession().catch(()=>{});},[]);
 useFocusEffect(useCallback(()=>{stop();return stop;},[stop,enabled,accountEpoch,route.params?.callId]));
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state!=='active')stop();});return()=>sub.remove();},[stop]);
 useEffect(()=>{if(!access)return;const token=generation.current;const timer=setInterval(()=>{void checkCall(access.callId).catch(()=>{if(token===generation.current){stop();setError('Cuộc gọi kết thúc hoặc quyền tham gia đã thay đổi.');}});},15000);return()=>clearInterval(timer);},[access,stop]);
 async function join(){if(pending.current||!enabled)return;pending.current=true;setBusy(true);setError('');const token=generation.current;try{
  if(Platform.OS==='android'&&!(await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)==='granted'))throw Error('Cần quyền micro để tham gia cuộc gọi.');
  const value=await callAccess(route.params.callId);if(token!==generation.current||AppState.currentState!=='active')return;
  await pauseMusicPlayback();await AudioSession.startAudioSession();if(token!==generation.current){await AudioSession.stopAudioSession();return;}
  roomRef.current=new Room({adaptiveStream:true,dynacast:true});setAccess(value);setConnection('Đang kết nối…');
 }catch(e){if(token===generation.current)setError((e as Error).message||String(e));}finally{pending.current=false;setBusy(false);}}
 async function finish(){setBusy(true);try{await endCall(route.params.callId);stop();}catch(e){setError((e as Error).message||String(e));}finally{setBusy(false);}}
 const liveRoom=roomRef.current;
 return <ScreenScaffold title="Cuộc gọi MyMap" subtitle={connection}>
 {!enabled?<ActionButton title="Bật cuộc gọi trong Cài đặt" onPress={()=>nav.navigate('Settings')}/>:access&&liveRoom?<LiveKitRoom room={liveRoom} serverUrl={access.url} token={access.token} connect audio={false} video={false} onConnected={()=>{if(roomRef.current===liveRoom)setConnection(access.mode==='video'?'Cuộc gọi video':access.mode==='ptt'?'Bộ đàm trực tiếp':'Cuộc gọi thoại');}} onDisconnected={()=>{if(roomRef.current===liveRoom)stop();}} onError={()=>{if(roomRef.current===liveRoom){stop();setError('Kết nối cuộc gọi bị gián đoạn. Nhấn tham gia để thử lại.');}}}><Controls mode={access.mode} onLeave={stop}/></LiveKitRoom>:<GlassSurface style={{padding:20,gap:12}}><Text>Chỉ tham gia khi bạn nhấn nút. Micro và camera ban đầu tắt. Rời màn hình hoặc đưa app vào nền sẽ ngắt cuộc gọi.</Text><ActionButton title="Tham gia cuộc gọi" disabled={busy} onPress={()=>void join()}/></GlassSurface>}
 {enabled&&access?.canEnd&&<ActionButton title="Kết thúc cho mọi người" disabled={busy} onPress={()=>Alert.alert('Kết thúc cuộc gọi?','Mọi thành viên sẽ rời phòng gọi.',[{text:'Hủy',style:'cancel'},{text:'Kết thúc',style:'destructive',onPress:()=>void finish()}])}/>} {!!error&&<Text accessibilityRole="alert">{error}</Text>}
 </ScreenScaffold>;
}
