import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Image,KeyboardAvoidingView,Platform,Pressable,RefreshControl,StyleSheet,View} from 'react-native';
import {useFocusEffect,useIsFocused,useNavigation,useRoute} from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {createAudioPlayer,setAudioModeAsync,setIsAudioActiveAsync,type AudioPlayer} from 'expo-audio';
import {VideoView,useVideoPlayer} from 'expo-video';
import {ScreenScaffold,EmptyGlass} from '../ui/ScreenScaffold';
import {GlassSurface} from '../ui/glass';
import {ActionButton as GlassButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
import {TextInput} from '../ui/TextInput';
import {useAppTheme} from '../ui/theme';
import {listConnections,type FriendConnection} from '../services/friendDiscovery';
import {chatIdentity,listChatRooms,createChatRoom,getChatPage,chatActivity,chatReactions,updateChatState,reactToMessage,chatMediaUrl,queueChat,flushChat,pendingChat,discardChat,recallChat,type ChatRoom,type ChatMessage,type ChatState,type ChatReaction} from '../services/privateChat';
import {pauseMusicPlayback} from '../services/musicPlayback';
import {ChatAudioRecorder} from '../components/ChatAudioRecorder';
import {subscribeAuthState} from '../services/auth';
import {GroupRoomTools} from '../components/GroupRoomTools';
import {getGroupInvitations,answerGroupInvitation,missingMessages,reportContent,type GroupInvitation} from '../services/socialTools';
import {startCall,type CallMode} from '../services/calls';
import {useExtensions} from '../hooks/useExtensions';

function Clip({uri}:{uri:string}){const focused=useIsFocused(),player=useVideoPlayer(uri);useEffect(()=>{if(!focused)player.pause();},[focused,player]);useEffect(()=>{const subscription=AppState.addEventListener('change',state=>{if(state!=='active')player.pause();});return()=>subscription.remove();},[player]);return <VideoView player={player} style={{height:210,borderRadius:12}} nativeControls contentFit="contain"/>;}
function Attachment({message,onError}:{message:ChatMessage;onError:(value:string)=>void}){
 const focused=useIsFocused(),live=useRef(false);useEffect(()=>{live.current=focused;if(!focused)audio.current?.pause();return()=>{live.current=false;audio.current?.pause();};},[focused]);
 const [uri,setUri]=useState<string|null>(null),[expired,setExpired]=useState(false);const audio=useRef<AudioPlayer|null>(null);
 useEffect(()=>{let alive=true;setUri(null);setExpired(false);void chatMediaUrl(message.body).then(url=>{if(alive)setUri(url);}).catch(()=>{if(alive)setExpired(true);});const sub=AppState.addEventListener('change',state=>{if(state!=='active')audio.current?.pause();});return()=>{alive=false;sub.remove();audio.current?.remove();};},[message.body]);
 useEffect(()=>{if(!uri)return;const timeout=setTimeout(()=>{setUri(null);setExpired(true);audio.current?.remove();audio.current=null;},290000);return()=>clearTimeout(timeout);},[uri]);
 async function play(){try{await pauseMusicPlayback();await setIsAudioActiveAsync(true);await setAudioModeAsync({allowsRecording:false,playsInSilentMode:true,shouldPlayInBackground:false,interruptionMode:'doNotMix'});const fresh=await chatMediaUrl(message.body);if(!live.current)return;audio.current?.remove();audio.current=createAudioPlayer(fresh);audio.current.play();}catch(e){onError(e instanceof Error?e.message:String(e));}}
 if(message.kind==='voice')return <GlassButton title={`Nghe ghi âm · ${Math.ceil(message.duration_seconds)}s`} icon="play" onPress={()=>void play()}/>;
 if(expired)return <GlassButton title="Tải lại tệp" icon="refresh" onPress={()=>void chatMediaUrl(message.body).then(url=>{setUri(url);setExpired(false);}).catch(e=>onError(String(e)))}/>;
 if(!uri)return <Text>Đang tải tệp…</Text>;
 return message.kind==='photo'?<Image source={{uri}} style={{height:240,borderRadius:12}} resizeMode="contain"/>:<Clip uri={uri}/>;
}

export default function ChatScreen(){
 const route=useRoute<any>(),nav=useNavigation<any>(),extensions=useExtensions(),{theme}=useAppTheme();
 const [invitations,setInvitations]=useState<GroupInvitation[]>([]),messagesRef=useRef<ChatMessage[]>([]);
 const [rooms,setRooms]=useState<ChatRoom[]>([]),[room,setRoom]=useState<string|null>(route.params?.roomId||null);
 const [friends,setFriends]=useState<FriendConnection[]>([]),[selected,setSelected]=useState<string[]>([]),[name,setName]=useState('');
 const [messages,setMessages]=useState<ChatMessage[]>([]),[states,setStates]=useState<ChatState[]>([]),[reactions,setReactions]=useState<ChatReaction[]>([]);
 const [outbox,setOutbox]=useState<Awaited<ReturnType<typeof pendingChat>>>([]),[me,setMe]=useState(''),[text,setText]=useState('');
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[creating,setCreating]=useState(false);
 const pending=useRef(false),request=useRef(0),typingAt=useRef(0),roomRef=useRef(room);
 roomRef.current=room;
 messagesRef.current=messages;
 useEffect(()=>{let owner:string|undefined;return subscribeAuthState((_event,session)=>{const next=session?.user.id||'local';if(owner!==undefined&&owner!==next){request.current++;setInvitations([]);setRooms([]);setRoom(null);setFriends([]);setSelected([]);setMessages([]);setOutbox([]);setStates([]);setReactions([]);setText('');setMe('');}owner=next;});},[]);
 useEffect(()=>{setMessages([]);setOutbox([]);setStates([]);setReactions([]);setText('');},[room]);
 useEffect(()=>{if(route.params?.roomId)setRoom(route.params.roomId);},[route.params?.roomId]);
 const refresh=useCallback(async()=>{
  const token=++request.current,target=roomRef.current;
  try{
   const [identity,allRooms,connections,invites]=await Promise.all([chatIdentity(),listChatRooms(),listConnections(),getGroupInvitations()]);
   if(token!==request.current)return;setMe(identity);setRooms(allRooms);setFriends(connections.filter(c=>c.direction==='accepted'));
   setInvitations(invites);
   if(target&&!allRooms.some(r=>r.id===target)){setRoom(null);setMessages([]);setOutbox([]);return;}
   if(target){const [page,activity,queued,missing]=await Promise.all([getChatPage(target),chatActivity(target),pendingChat(target),missingMessages(target,messagesRef.current.map(m=>m.id))]);if(token!==request.current||target!==roomRef.current)return;
    setMessages(old=>[...old.filter(m=>!missing.includes(m.id)&&page.length&&(m.created_at<page[0]!.created_at||(m.created_at===page[0]!.created_at&&m.id<page[0]!.id))),...page]);setStates(activity);setOutbox(queued);const nextReactions=await chatReactions(page.map(m=>m.id));if(token!==request.current||target!==roomRef.current)return;setReactions(nextReactions);await updateChatState(target,true,false);
   }
  }catch(e){if(token===request.current)setError((e as{message?:string}).message||String(e));}
 },[]);
 useFocusEffect(useCallback(()=>{void refresh();const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh();},5000);return()=>{request.current++;clearInterval(timer);};},[refresh,room]));
 useEffect(()=>{const sub=AppState.addEventListener('change',value=>{if(value!=='active'&&roomRef.current)void updateChatState(roomRef.current,false,false).catch(()=>{});});return()=>sub.remove();},[]);
 async function action(work:()=>Promise<void>){if(pending.current)return;pending.current=true;setBusy(true);setError(null);const token=request.current;try{await work();if(token===request.current)await refresh();}catch(e){if(token===request.current)setError((e as{message?:string}).message||String(e));}finally{pending.current=false;setBusy(false);}}
 async function send(kind:ChatMessage['kind'],body:string,duration=0,mime?:string){const target=roomRef.current,token=request.current;if(!target)return;await queueChat(target,kind,body,duration,mime);if(token!==request.current||target!==roomRef.current)return;if(kind==='text')setText('');const queued=await pendingChat(target);if(token!==request.current||target!==roomRef.current)return;setOutbox(queued);await flushChat();if(token===request.current)await refresh();}
 async function attach(){const target=roomRef.current;if(!target)return;const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();if(!permission.granted)throw new Error('Cần quyền thư viện để gửi ảnh hoặc video.');const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images','videos'],quality:.85,videoMaxDuration:60});if(result.canceled||target!==roomRef.current)return;const asset=result.assets[0];if(!asset)return;await send(asset.type==='video'?'video':'photo',asset.uri,asset.type==='video'?Math.min(60,(asset.duration||0)/1000):0,asset.mimeType|| (asset.type==='video'?'video/mp4':'image/jpeg'));}
 function enter(value:string){setText(value);if(room&&Date.now()-typingAt.current>3000){typingAt.current=Date.now();void updateChatState(room,false,Boolean(value.trim())).catch(()=>{});}}
 const label=(id:string)=>id===me?'Bạn':friends.find(f=>f.user_id===id)?.display_name||'Thành viên';
 const current=rooms.find(r=>r.id===room),typing=states.filter(s=>s.user_id!==me&&s.typing_until&&Date.parse(s.typing_until)>Date.now());
 return <ScreenScaffold title={room?(current?.name||'Hội thoại riêng'):'Tin nhắn'} subtitle="Tin nhắn, ảnh, video và lời nhắn âm thanh" refreshControl={<RefreshControl refreshing={busy} onRefresh={()=>void action(refresh)}/>}>
  {!!error&&<Text style={{color:theme.colors.danger}}>{error}</Text>}
  {!room?<>
   {invitations.map(i=><GlassSurface key={i.roomId} style={s.card}><Text style={s.title}>{i.name||'Nhóm bạn bè'}</Text><Text>{i.senderName} mời bạn · hết hạn {new Date(i.expiresAt).toLocaleDateString('vi-VN')}</Text><GlassButton title="Chấp nhận lời mời" disabled={busy} onPress={()=>void action(()=>answerGroupInvitation(i.roomId,true))}/><GlassButton title="Từ chối" disabled={busy} onPress={()=>void action(()=>answerGroupInvitation(i.roomId,false))}/></GlassSurface>)}
   <GlassButton title="Tạo hội thoại" icon="message-plus-outline" onPress={()=>setCreating(!creating)}/>
   {creating&&<GlassSurface style={s.card}><TextInput value={name} onChangeText={setName} placeholder="Tên nhóm (tùy chọn)" maxLength={80}/>{friends.map(f=><Pressable key={f.user_id} onPress={()=>setSelected(ids=>ids.includes(f.user_id)?ids.filter(id=>id!==f.user_id):[...ids,f.user_id])} style={s.friend}><Text style={{color:theme.colors.text}}>{selected.includes(f.user_id)?'☑':'☐'} {f.display_name}</Text></Pressable>)}<GlassButton title="Bắt đầu" disabled={busy||!selected.length||selected.length>29} onPress={()=>void action(async()=>{const id=await createChatRoom(selected,name);setRoom(id);setCreating(false);setSelected([]);})}/></GlassSurface>}
   {rooms.map(r=><GlassSurface key={r.id} style={s.card}><Pressable onPress={()=>setRoom(r.id)}><Text style={[s.title,{color:theme.colors.text}]}>{r.name||r.members.filter(id=>id!==me).map(label).join(', ')}</Text><Text style={{color:theme.colors.muted}}>{r.members.length} thành viên</Text></Pressable></GlassSurface>)}
   {!rooms.length&&!creating&&<EmptyGlass title="Chưa có hội thoại" body="Chọn bạn đã kết nối để bắt đầu nhắn tin."/>}
  </>:<>
   <GlassButton title="Danh sách hội thoại" icon="arrow-left" onPress={()=>setRoom(null)}/>
   {current&&<GroupRoomTools key={`${current.id}:${me}`} room={current} me={me} friends={friends} onChanged={refresh}/>}
   {extensions.calls&&current&&(['voice','video','ptt'] as CallMode[]).map(mode=><GlassButton key={mode} title={mode==='video'?'Gọi video':mode==='ptt'?'Mở bộ đàm':'Gọi thoại'} disabled={busy} onPress={()=>void action(async()=>{const target=roomRef.current;if(!target)return;const id=await startCall(target,mode);if(target===roomRef.current)nav.navigate('Call',{callId:id});})}/>)}
   {messages.length>=50&&<GlassButton title="Tải tin nhắn trước" disabled={busy} onPress={()=>void action(async()=>{const target=room,token=request.current;const older=await getChatPage(target,messages[0]);if(target!==roomRef.current||token!==request.current)return;setMessages(old=>[...older,...old].filter((m,i,a)=>a.findIndex(v=>v.id===m.id)===i));})}/>}
   {messages.map(m=><GlassSurface key={m.id} style={[s.card,m.sender_id===me&&{borderColor:theme.colors.primary}]}>
    <View style={s.row}><Text style={{color:theme.colors.primary}}>{label(m.sender_id)}</Text><Text style={{color:theme.colors.faint,fontSize:11}}>{new Date(m.created_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</Text></View>
    {m.kind==='text'?<Text selectable style={{color:theme.colors.text,lineHeight:22}}>{m.body}</Text>:<Attachment message={m} onError={setError}/>}
    <View style={s.row}>{['❤️','👍','😂'].map(emoji=><Pressable accessibilityLabel={`Phản ứng ${emoji}`} key={emoji} onPress={()=>void action(async()=>{const mine=reactions.find(r=>r.message_id===m.id&&r.user_id===me);await reactToMessage(m.id,mine?.emoji===emoji?'':emoji);})} style={s.reaction}><Text>{emoji} {reactions.filter(r=>r.message_id===m.id&&r.emoji===emoji).length||''}</Text></Pressable>)}</View>
    {m.sender_id===me&&<GlassButton title="Thu hồi tin nhắn" disabled={busy} onPress={()=>void action(async()=>{await recallChat(m);if(m.room_id===roomRef.current)setMessages(old=>old.filter(value=>value.id!==m.id));})}/>}
    {extensions.communityTools&&m.sender_id!==me&&<GlassButton title="Báo cáo tin nhắn" disabled={busy} onPress={()=>void action(()=>reportContent('message',m.id,'other'))}/>}
    {m.sender_id===me&&<Text style={{color:theme.colors.faint,fontSize:11}}>{states.filter(v=>v.user_id!==me&&v.read_at&&v.read_at>=m.created_at).length?'Đã đọc':'Đã gửi'}</Text>}
   </GlassSurface>)}
   {outbox.map(o=><GlassSurface key={o.id} style={s.card}><Text style={{color:theme.colors.text}}>{o.canceled?'Đã hủy · đang chờ xác nhận':o.kind==='text'?o.body:'Tệp đính kèm đang chờ gửi'}</Text><Text style={{color:theme.colors.danger}}>{o.error||'Chờ đồng bộ'}</Text><GlassButton title={o.canceled?'Xác nhận hủy với máy chủ':'Thử gửi lại'} disabled={busy} onPress={()=>void action(flushChat)}/><GlassButton title="Hủy tin chờ" disabled={busy||o.canceled} onPress={()=>void action(()=>discardChat(o.id))}/></GlassSurface>)}
   {!!typing.length&&<Text style={{color:theme.colors.muted}}>{typing.map(t=>label(t.user_id)).join(', ')} đang nhập…</Text>}
   <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}><GlassSurface style={s.card}><TextInput value={text} onChangeText={enter} placeholder="Nhắn tin…" multiline maxLength={2000}/><View style={s.row}><GlassButton title="Gửi" icon="send" disabled={busy||!text.trim()} onPress={()=>void action(()=>send('text',text))}/><GlassButton title="Ảnh/video" icon="image-outline" disabled={busy} onPress={()=>void action(attach)}/></View><ChatAudioRecorder key={room} disabled={busy} onError={setError} onRecorded={async(uri,duration)=>{if(room!==roomRef.current)return;await send('voice',uri,duration,'audio/mp4');}}/></GlassSurface></KeyboardAvoidingView>
  </>}
 </ScreenScaffold>;
}
const s=StyleSheet.create({card:{padding:16,gap:12},title:{fontSize:17,fontWeight:'700'},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},friend:{paddingVertical:14,minHeight:48},reaction:{padding:8,minWidth:48}});
