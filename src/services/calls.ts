import {accountApi,accountRpc} from './accountApi';
import {uuid} from './socialTools';
import {extensionSnapshot,initializeExtensions} from './extensionPreferences';
export type CallMode='voice'|'video'|'ptt';
export type CallAccess={token:string;url:string;mode:CallMode;callId:string;chatRoom:string;expiresAt:string;canEnd:boolean};
async function enabled(){await initializeExtensions();if(!extensionSnapshot().calls)throw Error('Bật tiện ích gọi thoại/video trong Cài đặt trước.');}
export async function startCall(room:string,mode:CallMode){await enabled();return accountRpc<string>('mm_start_call',{p_room:uuid(room),p_mode:mode});}
export async function callAccess(id:string):Promise<CallAccess>{
 await enabled();const api=await accountApi();
 const{data,error}=await api.client.functions.invoke('mymap-livekit',{body:{callId:uuid(id)}});
 await api.assertCurrent();if(error)throw Error('Chưa tham gia được cuộc gọi. Kiểm tra kết nối hoặc thử mở lại hội thoại.');
 if(data?.callId!==id||!data.token||!/^wss:\/\//.test(data.url)||!['voice','video','ptt'].includes(data.mode)||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=Date.now())throw Error('Cuộc gọi đã hết hạn hoặc không còn khả dụng.');
 return data;
}
export async function checkCall(id:string){return accountRpc('mm_call_authorize',{p_call:uuid(id)});}
export async function endCall(id:string){await accountRpc('mm_end_call',{p_call:uuid(id)});}
