import {AppState} from 'react-native';
import {getCurrentUser} from './auth';
import {supabase} from './supabase';
import {sharedCoordinate} from './sharingPrivacy';
import type {MapChatMessage,FriendInteractionEvent,FriendInteractionType} from './realtimeFriends';
async function identity(){const user=await getCurrentUser();if(!user||user.is_anonymous)throw new Error('Đăng nhập để gửi lời nhắn cho bạn bè.');return user.id;}
async function rpc<T>(name:string,args:Record<string,unknown>={}){const{data,error}=await supabase.rpc(name,args);if(error)throw error;return data as T;}
export async function getMapChatMessages(){const user=await getCurrentUser();if(!user||user.is_anonymous)return[];const data=await rpc<MapChatMessage[]>('mm_map_notes');if(user.id!==(await getCurrentUser())?.id)return[];return data.filter(m=>Number.isFinite(m.latitude)&&Math.abs(m.latitude)<=90&&Number.isFinite(m.longitude)&&Math.abs(m.longitude)<=180);}
export async function postMapChatMessage(input:{message:string;latitude:number;longitude:number;emoji?:string;targetFriendId?:string}){
 const owner=await identity();if(!input.message.trim()||input.message.length>500)throw new Error('Lời nhắn cần 1–500 ký tự.');const point=await sharedCoordinate(input);if(!point)throw new Error('Vị trí đang ẩn hoặc đang chờ lịch chia sẻ trễ.');if(owner!==await identity())throw new Error('Tài khoản đã thay đổi.');
 return rpc<MapChatMessage>('mm_post_map_note',{p_message:input.message,p_emoji:input.emoji||'💬',p_lat:point.latitude,p_lon:point.longitude,p_target:input.targetFriendId||null});
}
function poll<T extends{id:string}>(load:()=>Promise<T[]>,callback:(value:T)=>void,seedOnly:boolean){let alive=true,busy=false,first=true;const seen=new Set<string>();async function update(){if(!alive||busy||AppState.currentState!=='active')return;busy=true;try{const values=await load();if(!alive)return;for(const value of values){if(!seen.has(value.id)){seen.add(value.id);if(!first||!seedOnly)callback(value);}}first=false;if(seen.size>500){const keep=[...seen].slice(-250);seen.clear();keep.forEach(id=>seen.add(id));}}catch{}finally{busy=false;}}const timer=setInterval(()=>void update(),10000);void update();return()=>{alive=false;clearInterval(timer);};}
export function subscribeToMapChat(callback:(value:MapChatMessage)=>void){return poll(getMapChatMessages,callback,false);}
export async function sendFriendInteraction(targetFriendId:string,type:FriendInteractionType,metadata?:Record<string,unknown>){await identity();if(type==='voice')throw new Error('Ghi âm được gửi qua hội thoại riêng.');return rpc<FriendInteractionEvent>('mm_friend_interaction',{p_target:targetFriendId,p_type:type,p_metadata:metadata||{}});}
export function subscribeToFriendInteractions(_currentUserId:string,callback:(value:FriendInteractionEvent)=>void){return poll(async()=>{const owner=await identity();const result=await rpc<FriendInteractionEvent[]>('mm_friend_interactions');return owner===await identity()?result:[];},callback,true);}
