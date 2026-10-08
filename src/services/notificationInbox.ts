import * as Notifications from 'expo-notifications';
import {supabase} from './supabase';
import {getCurrentUser} from './auth';
export type InboxItem={id:string;title:string;body:string;at:number;read:boolean;roomId?:string;callId?:string;localId?:string};
export async function listInbox(){
 const local=await Notifications.getPresentedNotificationsAsync().catch(()=>[]);
 const items:InboxItem[]=local.map(n=>({id:'device:'+n.request.identifier,localId:n.request.identifier,title:n.request.content.title||'Thông báo MyMap',body:n.request.content.body||'',at:n.date,read:false}));
 const user=await getCurrentUser();if(!user||user.is_anonymous)return items;
 const{data,error}=await supabase.from('vc_notifications').select('id,title,body,payload,created_at,read_at').order('created_at',{ascending:false}).limit(100);
 if(error)throw error;
 if(user.id!==(await getCurrentUser())?.id)return[];
 return [...items,...(data||[]).map(n=>({id:n.id,title:n.title,body:n.body||'',at:Date.parse(n.created_at),read:Boolean(n.read_at),roomId:typeof n.payload?.roomId==='string'?n.payload.roomId:undefined,callId:typeof n.payload?.callId==='string'?n.payload.callId:undefined}))].sort((a,b)=>b.at-a.at);
}
export async function readNotification(item:InboxItem){if(item.localId){await Notifications.dismissNotificationAsync(item.localId);return;}const{error}=await supabase.rpc('mm_read_notification',{p_id:item.id});if(error)throw error;}
