import React,{useState} from 'react';
import {Alert,View} from 'react-native';
import {groupAction} from '../services/socialTools';
import type {ChatRoom} from '../services/privateChat';
import type {FriendConnection} from '../services/friendDiscovery';
import {ActionButton} from '../ui/ActionButton';
import {TextInput} from '../ui/TextInput';
import {Text} from '../ui/Text';
import {GlassSurface} from '../ui/glass';
export function GroupRoomTools({room,me,friends,onChanged}:{room:ChatRoom;me:string;friends:FriendConnection[];onChanged:()=>Promise<void>}){
 const[open,setOpen]=useState(false),[name,setName]=useState(room.name),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 async function run(action:Parameters<typeof groupAction>[1],target?:string){if(busy)return;setBusy(true);setNotice('');try{await groupAction(room.id,action,target,name);await onChanged();setNotice(action==='invite'?'Đã gửi lời mời. Người nhận cần chấp nhận để vào nhóm.':'Đã cập nhật nhóm.');}catch(e){setNotice((e as Error).message||String(e));}finally{setBusy(false);}}
 function confirm(action:'remove'|'transfer'|'leave',target?:string){Alert.alert(action==='transfer'?'Chuyển quyền quản trị?':action==='leave'?'Rời nhóm?':'Xóa thành viên khỏi nhóm?',action==='transfer'?'Bạn sẽ mất quyền quản trị nhóm.':'Quyền đọc hội thoại và tham gia cuộc gọi sẽ kết thúc.',[{text:'Hủy',style:'cancel'},{text:'Xác nhận',style:'destructive',onPress:()=>void run(action,target)}]);}
 if(!room.is_group)return null;
 const owner=room.owner_id===me,label=(id:string)=>id===me?'Bạn':friends.find(f=>f.user_id===id)?.display_name||id.slice(0,8);
 return <GlassSurface style={{padding:16,gap:10}}><ActionButton title={open?'Đóng quản lý nhóm':'Quản lý nhóm'} icon="account-group-outline" onPress={()=>setOpen(!open)}/>{open&&<>
 {owner&&<><TextInput value={name} onChangeText={setName} maxLength={80} placeholder="Tên nhóm"/><ActionButton title="Lưu tên nhóm" disabled={busy||!name.trim()} onPress={()=>void run('rename')}/></>}
 {room.members.map(id=><View key={id} style={{gap:6}}><Text>{label(id)}{id===room.owner_id?' · Quản trị viên':''}</Text>{owner&&id!==me&&<><ActionButton title="Chuyển quyền quản trị" disabled={busy} onPress={()=>confirm('transfer',id)}/><ActionButton title="Xóa khỏi nhóm" disabled={busy} onPress={()=>confirm('remove',id)}/></>}</View>)}
 {owner&&friends.filter(f=>!room.members.includes(f.user_id)).map(f=><ActionButton key={f.user_id} title={`Mời ${f.display_name}`} disabled={busy||room.members.length>=30} onPress={()=>void run('invite',f.user_id)}/>)}
 {!owner?<ActionButton title="Rời nhóm" disabled={busy} onPress={()=>confirm('leave')}/>:<Text>Chuyển quyền quản trị cho thành viên khác trước khi rời nhóm.</Text>}
 </>}{!!notice&&<Text accessibilityRole="alert">{notice}</Text>}</GlassSurface>;
}
