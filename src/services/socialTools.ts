import {accountRpc} from './accountApi';
export type Person = {id: string; name: string};
export type SocialState = {profileId:string;publicProfile: boolean; blocked: Person[]; closeFriends: Person[]; following: Person[]; followers: number; moderator: boolean};
export type GroupInvitation = {roomId: string; name: string; senderName: string; expiresAt: string};
export type ActivityEntry = {id: string; kind: string; owner_id: string; title: string; display_name: string; updated_at: string};
export function uuid(value: string) { if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new Error('Mã nội dung không hợp lệ.'); return value; }
export async function getSocialState() { return accountRpc<SocialState>('mm_social_state'); }
export async function socialAction(action: 'publish'|'block'|'close'|'follow', enabled: boolean, target?: string) {
  return accountRpc<void>('mm_social_action',{p_action:action,p_enabled:enabled,p_target:target?uuid(target):null});
}
export async function groupAction(room: string, action: 'rename'|'invite'|'remove'|'transfer'|'leave'|'cancel_invite', target?: string, name = '') {
  if (action==='rename' && (!name.trim() || name.trim().length>80)) throw new Error('Tên nhóm cần từ 1 đến 80 ký tự.');
  return accountRpc<void>('mm_group_action',{p_room:uuid(room),p_action:action,p_target:target?uuid(target):null,p_name:name.trim()});
}
export async function getGroupInvitations() { return accountRpc<GroupInvitation[]>('mm_group_invitations'); }
export async function answerGroupInvitation(room: string, accept: boolean) { return accountRpc<void>('mm_answer_group_invite',{p_room:uuid(room),p_accept:accept}); }
export async function missingMessages(room: string, ids: string[]) {const missing:string[]=[];for(let offset=0;offset<ids.length;offset+=200)missing.push(...await accountRpc<string[]>('mm_missing_messages',{p_room:uuid(room),p_ids:ids.slice(offset,offset+200).map(uuid)}));return missing;}
export async function activityFeed() { return accountRpc<ActivityEntry[]>('mm_activity_feed'); }
export type ContentDetails = {likes: number; liked: boolean; going: number; interested: number; rsvp: 'going'|'interested'|null; comments: Array<{id:string;user_id:string;body:string;created_at:string;display_name:string;can_delete:boolean}>};
export async function getContentDetails(document: string) { return accountRpc<ContentDetails>('mm_content_details',{p_document:uuid(document)}); }
export async function contentAction(document: string, action: 'comment'|'delete_comment'|'like'|'unlike'|'going'|'interested'|'cancel_rsvp', text = '', comment?: string) {
  if (action==='comment' && (!text.trim() || text.trim().length>1000)) throw new Error('Bình luận cần từ 1 đến 1.000 ký tự.');
  return accountRpc<void>('mm_content_action',{p_document:uuid(document),p_action:action,p_text:text.trim(),p_comment:comment?uuid(comment):null});
}
export async function reportContent(kind: 'profile'|'document'|'message'|'comment', target: string, reason: 'spam'|'harassment'|'scam'|'privacy'|'dangerous'|'other', note = '') {
  if (note.length>1000) throw new Error('Ghi chú báo cáo tối đa 1.000 ký tự.');
  return accountRpc<void>('mm_report_content',{p_kind:kind,p_target:uuid(target),p_reason:reason,p_note:note});
}
export type ModerationReport = {id:string;kind:string;target_id:string;reason:string;note:string;created_at:string;status:string;hidden:boolean;subject:{name?:string;text?:string;type?:string}|null};
export async function moderationQueue() { return accountRpc<ModerationReport[]>('mm_moderation_queue'); }
export async function moderate(report: string, hide: boolean, note: string) {
  if (!note.trim() || note.trim().length>1000) throw new Error('Cần ghi lý do xử lý.');
  return accountRpc<void>('mm_moderate',{p_report:uuid(report),p_hide:hide,p_note:note.trim()});
}
