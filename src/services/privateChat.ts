import * as Crypto from 'expo-crypto';
import {File,Directory,Paths} from 'expo-file-system';
import {getDb} from '../db/database';
import {getCurrentUser} from './auth';
import {accountApi} from './accountApi';

export type ChatRoom={id:string;name:string;members:string[];created_at:string;owner_id:string;is_group:boolean};
export type ChatMessage={id:string;room_id:string;sender_id:string;kind:'text'|'voice'|'photo'|'video';body:string;duration_seconds:number;created_at:string};
export type ChatState={user_id:string;read_at:string|null;typing_until:string|null};
export type ChatReaction={message_id:string;user_id:string;emoji:string};
type Outgoing={id:string;account:string;room:string;kind:ChatMessage['kind'];body:string;mime?:string;duration:number;createdAt:number;error?:string;canceled?:boolean};
let setup:Promise<void>|null=null;
let flushing:Promise<void>|null=null;
async function signedIn(){const user=await getCurrentUser();if(!user||user.is_anonymous)throw new Error('Đăng nhập để nhắn tin riêng.');return user.id;}
async function database(){const db=await getDb();setup??=db.execAsync('CREATE TABLE IF NOT EXISTS chat_outbox(id TEXT PRIMARY KEY,account TEXT NOT NULL,payload TEXT NOT NULL);').catch(e=>{setup=null;throw e;});await setup;return db;}
async function rpc<T>(name:string,args:Record<string,unknown>={},api?:Awaited<ReturnType<typeof accountApi>>){const bound=api||await accountApi();await bound.assertCurrent();const{data,error}=await bound.client.rpc(name,args);await bound.assertCurrent();if(error)throw error;return data as T;}
export async function chatIdentity(){await signedIn();return rpc<string>('mm_identity');}
export async function listChatRooms(){const api=await accountApi();const{data,error}=await api.client.from('mm_rooms').select('*').order('created_at',{ascending:false}).limit(100);await api.assertCurrent();if(error)throw error;return data as ChatRoom[];}
export async function createChatRoom(members:string[],name=''){await signedIn();return rpc<string>('mm_create_room',{p_name:name.trim(),p_members:[...new Set(members)]});}
export async function getChatPage(room:string,before?:Pick<ChatMessage,'id'|'created_at'>){const api=await accountApi();let query=api.client.from('mm_messages').select('*').eq('room_id',room).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(50);if(before){if(!/^[a-f0-9-]{36}$/i.test(before.id)||!Number.isFinite(Date.parse(before.created_at)))throw new Error('Mốc tin nhắn không hợp lệ.');query=query.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`);}const{data,error}=await query;await api.assertCurrent();if(error)throw error;return(data as ChatMessage[]).reverse();}
export async function chatActivity(room:string){const api=await accountApi();const{data,error}=await api.client.from('mm_room_states').select('*').eq('room_id',room);await api.assertCurrent();if(error)throw error;return data as ChatState[];}
export async function chatReactions(ids:string[]){if(!ids.length)return[];const api=await accountApi();const{data,error}=await api.client.from('mm_message_reactions').select('*').in('message_id',ids.slice(-100));await api.assertCurrent();if(error)throw error;return data as ChatReaction[];}
export async function updateChatState(room:string,read=false,typing=false){await signedIn();await rpc('mm_chat_state',{p_room:room,p_read:read,p_typing:typing});}
export async function reactToMessage(message:string,emoji:string){await signedIn();await rpc('mm_chat_react',{p_message:message,p_emoji:emoji});}
export async function chatMediaUrl(path:string){const api=await accountApi();const{data,error}=await api.client.storage.from('mymap-chat').createSignedUrl(path,300);await api.assertCurrent();if(error)throw error;return data.signedUrl;}
export async function pendingChat(room?:string){const owner=await signedIn(),db=await database();const rows=await db.getAllAsync<{payload:string}>('SELECT payload FROM chat_outbox WHERE account=?',owner);if(owner!==await signedIn())throw new Error('Tài khoản đã thay đổi.');return rows.map(r=>JSON.parse(r.payload)as Outgoing).filter(o=>!room||o.room===room).sort((a,b)=>a.createdAt-b.createdAt);}
function removeOwnedMedia(item:Outgoing){if(item.kind==='text')return;const dir=new Directory(Paths.document,'private_chat');if(!item.body.startsWith(dir.uri.replace(/\/$/,'')+'/')||item.body.slice(dir.uri.replace(/\/$/,'').length+1).includes('/'))throw new Error('Tệp nằm ngoài thư mục tin nhắn.');const file=new File(item.body);if(file.exists)file.delete();}
export async function recallChat(message:Pick<ChatMessage,'id'|'room_id'|'kind'|'body'>){const api=await accountApi();await rpc('mm_cancel_message',{p_id:message.id,p_room:message.room_id},api);if(message.kind!=='text'){const{error}=await api.client.storage.from('mymap-chat').remove([message.body]);await api.assertCurrent();if(error)throw error;}}
export async function discardChat(id:string){const owner=await signedIn(),db=await database(),item=(await pendingChat()).find(o=>o.id===id);if(!item)return;await db.runAsync('UPDATE chat_outbox SET payload=? WHERE account=? AND id=?',JSON.stringify({...item,canceled:true,error:'Đã hủy trên máy; chờ xác nhận với máy chủ.'}),owner,id);if(flushing)await flushing;await flushChat();}
export async function queueChat(room:string,kind:ChatMessage['kind'],body:string,duration=0,mime?:string){
 const owner=await signedIn(),id=Crypto.randomUUID();
 if(kind==='text'&&(!body.trim()||body.trim().length>2000))throw new Error('Tin nhắn cần từ 1 đến 2.000 ký tự.');
 if(kind==='voice'&&(!Number.isFinite(duration)||duration<=0||duration>60))throw new Error('Ghi âm cần từ 1 đến 60 giây.');
 if(kind!=='text'){
  const source=new File(body);if(!source.exists||source.size<=0||source.size>25*1024*1024)throw new Error('Tệp cần nhỏ hơn 25 MB.');
  const dir=new Directory(Paths.document,'private_chat');dir.create({intermediates:true,idempotent:true});const file=new File(dir,id);source.copy(file);body=file.uri;
 }
 const outgoing:Outgoing={id,account:owner,room,kind,body:kind==='text'?body.trim():body,duration,mime,createdAt:Date.now()};
 const db=await database();await db.runAsync('INSERT INTO chat_outbox(id,account,payload) VALUES(?,?,?)',id,owner,JSON.stringify(outgoing));return id;
}
export async function flushChat(){if(flushing)return flushing;flushing=sendPending().finally(()=>{flushing=null;});return flushing;}
async function sendPending(){
 const owner=await signedIn(),api=await accountApi();if(api.owner!==owner)throw Error('Tài khoản đã thay đổi.');const canonical=await rpc<string>('mm_identity',{},api),db=await database();
 for(const snapshot of await pendingChat()){
  if(owner!==await signedIn())return;
  let item=(await pendingChat()).find(o=>o.id===snapshot.id);if(!item)continue;
  try{
   if(item.canceled){await rpc('mm_cancel_message',{p_id:item.id,p_room:item.room},api);if(item.kind!=='text')await api.client.storage.from('mymap-chat').remove([`${item.room}/${canonical}/${item.id}`]);removeOwnedMedia(item);await db.runAsync('DELETE FROM chat_outbox WHERE id=? AND account=?',item.id,owner);continue;}
   const itemId=item.id;let body=item.body;
   if(item.kind!=='text'){
    body=`${item.room}/${canonical}/${item.id}`;
    const file=new File(item.body);
    const{error}=await api.client.storage.from('mymap-chat').upload(body,await file.arrayBuffer(),{upsert:false,contentType:item.mime||'audio/mp4'});
    if(error){
     // The object may have uploaded before the connection failed. It is owned by this sender and UUID.
     const{data:exists,error:lookup}=await api.client.storage.from('mymap-chat').list(`${item.room}/${canonical}`,{search:item.id,limit:1});
     if(lookup||!exists?.some(f=>f.name===itemId))throw error;
    }
   }
   if(owner!==await signedIn())return;
   const latest=(await pendingChat()).find(o=>o.id===item!.id);if(!latest)continue;
   if(latest.canceled){item=latest;await rpc('mm_cancel_message',{p_id:item.id,p_room:item.room},api);if(item.kind!=='text')await api.client.storage.from('mymap-chat').remove([body]);removeOwnedMedia(item);await db.runAsync('DELETE FROM chat_outbox WHERE id=? AND account=?',item.id,owner);continue;}
   await rpc('mm_send_message',{p_id:item.id,p_room:item.room,p_kind:item.kind,p_body:body,p_duration:item.duration},api);
   await db.runAsync("DELETE FROM chat_outbox WHERE id=? AND account=? AND coalesce(json_extract(payload,'$.canceled'),0)=0",item.id,owner);
   removeOwnedMedia(item);
  }catch(error){if(owner!==await signedIn())return;const current=(await pendingChat()).find(o=>o.id===item!.id);if(current){const message=(error as{message?:string})?.message||String(error);await db.runAsync('UPDATE chat_outbox SET payload=? WHERE id=? AND account=?',JSON.stringify({...current,error:message}),item.id,owner);}}
 }
}
export async function sendVoicePing(friend:string,uri:string,duration:number){const room=await createChatRoom([friend]);const id=await queueChat(room,'voice',uri,duration,'audio/mp4');await flushChat();const pending=(await pendingChat(room)).find(o=>o.id===id);if(pending){const error=new Error('Ghi âm đã lưu để thử gửi lại trong Tin nhắn. '+(pending.error||''));Object.assign(error,{queued:true});throw error;}return room;}
