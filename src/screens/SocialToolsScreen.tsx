import React,{useCallback,useRef,useState} from 'react';
import {Alert,Share,Switch,View} from 'react-native';
import {useFocusEffect,useNavigation} from '@react-navigation/native';
import {useExtensions} from '../hooks/useExtensions';
import {useAccountEpoch} from '../hooks/useAccountEpoch';
import {getSocialState,socialAction,activityFeed,type SocialState,type ActivityEntry} from '../services/socialTools';
import {listConnections,type FriendConnection} from '../services/friendDiscovery';
import {ScreenScaffold} from '../ui/ScreenScaffold';
import {GlassSurface} from '../ui/glass';
import {Text} from '../ui/Text';
import {TextInput} from '../ui/TextInput';
import {ActionButton} from '../ui/ActionButton';
export default function SocialToolsScreen(){
 const accountEpoch=useAccountEpoch();
 const enabled=useExtensions().socialTools,nav=useNavigation<any>(),generation=useRef(0),pending=useRef(false);
 const[state,setState]=useState<SocialState|null>(null),[friends,setFriends]=useState<FriendConnection[]>([]),[feed,setFeed]=useState<ActivityEntry[]>([]),[target,setTarget]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async(token:number)=>{const[s,f,a]=await Promise.all([getSocialState(),listConnections(),activityFeed()]);if(token!==generation.current)return;setState(s);setFriends(f.filter(v=>v.direction==='accepted'));setFeed(a);},[]);
 useFocusEffect(useCallback(()=>{const token=++generation.current;setState(null);setFriends([]);setFeed([]);setError('');setTarget('');if(enabled)void load(token).catch(e=>{if(token===generation.current)setError((e as Error).message||String(e));});return()=>{generation.current++;};},[enabled,load,accountEpoch]));
 async function run(action:'publish'|'block'|'close'|'follow',on:boolean,id?:string){if(pending.current)return;pending.current=true;setBusy(true);setError('');const token=generation.current;try{await socialAction(action,on,id);await load(token);}catch(e){if(token===generation.current)setError((e as Error).message||String(e));}finally{pending.current=false;setBusy(false);}}
 const confirmBlock=(friend:FriendConnection)=>Alert.alert(`Chặn ${friend.display_name}?`,'Tin nhắn trực tiếp và chia sẻ vị trí giữa hai người sẽ dừng.',[{text:'Hủy',style:'cancel'},{text:'Chặn',style:'destructive',onPress:()=>void run('block',true,friend.user_id)}]);
 return <ScreenScaffold title="Bạn thân và cộng đồng" subtitle="Chọn người theo dõi và kiểm soát nội dung chia sẻ">
 {!enabled?<ActionButton title="Bật tiện ích trong Cài đặt" onPress={()=>nav.navigate('Settings')}/>:<>
 {!!error&&<Text accessibilityRole="alert">{error}</Text>}{state&&<>
 <GlassSurface style={{padding:18,gap:10}}><View style={{flexDirection:'row',alignItems:'center',gap:12}}><Text style={{flex:1}}>Cho phép người khác theo dõi hồ sơ</Text><Switch value={state.publicProfile} disabled={busy} onValueChange={value=>void run('publish',value)} accessibilityLabel="Cho phép theo dõi"/></View><Text>{state.followers} người theo dõi. Theo dõi chỉ hiển thị sự kiện và đánh giá bạn công khai.</Text>{state.publicProfile&&<><Text selectable>Mã hồ sơ: {state.profileId}</Text><ActionButton title="Chia sẻ mã hồ sơ" onPress={()=>void Share.share({message:`Theo dõi hồ sơ công khai của tôi trên MyMap. Mã hồ sơ: ${state.profileId}`}).catch(()=>setError('Chưa thể mở bảng chia sẻ.'))}/></>}</GlassSurface>
 {state.moderator&&<ActionButton title="Kiểm duyệt báo cáo cộng đồng" onPress={()=>nav.navigate('Moderation')}/>}
 <Text style={{fontSize:19,fontWeight:'700'}}>Bạn thân</Text>{friends.map(f=><GlassSurface key={f.user_id} style={{padding:16,gap:10}}><Text>{f.display_name}</Text><ActionButton title={state.closeFriends.some(v=>v.id===f.user_id)?'Bỏ khỏi bạn thân':'Thêm vào bạn thân'} disabled={busy} onPress={()=>void run('close',!state.closeFriends.some(v=>v.id===f.user_id),f.user_id)}/><ActionButton title="Chặn người này" disabled={busy} onPress={()=>confirmBlock(f)}/></GlassSurface>)}
 <Text style={{fontSize:19,fontWeight:'700'}}>Đang theo dõi</Text>{state.following.map(f=><ActionButton key={f.id} title={`Bỏ theo dõi ${f.name}`} disabled={busy} onPress={()=>void run('follow',false,f.id)}/>)}<TextInput value={target} onChangeText={setTarget} placeholder="Mã hồ sơ MyMap (UUID)" autoCapitalize="none" maxLength={36}/><ActionButton title="Theo dõi hồ sơ công khai" disabled={busy||target.length!==36} onPress={()=>void run('follow',true,target)}/>
 <Text style={{fontSize:19,fontWeight:'700'}}>Đã chặn</Text>{state.blocked.map(f=><ActionButton key={f.id} title={`Bỏ chặn ${f.name}`} disabled={busy} onPress={()=>void run('block',false,f.id)}/>)}
 <Text style={{fontSize:19,fontWeight:'700'}}>Hoạt động gần đây</Text>{!feed.length&&<Text>Chưa có nội dung được chia sẻ với bạn.</Text>}{feed.map(item=><GlassSurface key={item.id} style={{padding:16,gap:8}}><Text style={{fontWeight:'700'}}>{item.title||'Nội dung mới'}</Text><Text>{item.display_name} · {new Date(item.updated_at).toLocaleString('vi-VN')}</Text><ActionButton title="Mở nội dung" onPress={()=>nav.navigate('SharedContent',{documentId:item.id})}/></GlassSurface>)}
 </>}
 </>}
 </ScreenScaffold>;
}
