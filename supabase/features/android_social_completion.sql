begin;
create table private.mm_blocks(owner_id uuid not null references public.vc_profiles(id),target_id uuid not null references public.vc_profiles(id),created_at timestamptz not null default now(),primary key(owner_id,target_id),check(owner_id<>target_id));
create index mm_blocks_target on private.mm_blocks(target_id);
create table private.mm_close_friends(owner_id uuid not null references public.vc_profiles(id),target_id uuid not null references public.vc_profiles(id),primary key(owner_id,target_id),check(owner_id<>target_id));
create table private.mm_social_settings(owner_id uuid primary key references public.vc_profiles(id),is_public boolean not null default false);
create table private.mm_follows(owner_id uuid not null references public.vc_profiles(id),target_id uuid not null references public.vc_profiles(id),created_at timestamptz not null default now(),primary key(owner_id,target_id),check(owner_id<>target_id));
create index mm_follows_target on private.mm_follows(target_id);
create table private.mm_group_invites(room_id uuid not null references public.mm_rooms(id) on delete cascade,target_id uuid not null references public.vc_profiles(id),sender_id uuid not null references public.vc_profiles(id),expires_at timestamptz not null default now()+interval '7 days',primary key(room_id,target_id));
create index mm_group_invites_target on private.mm_group_invites(target_id);
create table private.mm_content_reports(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.vc_profiles(id),kind text not null,target_id uuid not null,reason text not null,note text not null,created_at timestamptz not null default now(),status text not null default 'pending',resolution text,unique(owner_id,kind,target_id));
create table private.mm_hidden_content(kind text not null,target_id uuid not null,primary key(kind,target_id));
create table private.mm_moderators(user_id uuid primary key references public.vc_profiles(id));
alter table private.mm_blocks enable row level security;
alter table private.mm_close_friends enable row level security;
alter table private.mm_social_settings enable row level security;
alter table private.mm_follows enable row level security;
alter table private.mm_group_invites enable row level security;
alter table private.mm_content_reports enable row level security;
alter table private.mm_hidden_content enable row level security;
alter table private.mm_moderators enable row level security;
revoke all on private.mm_blocks,private.mm_close_friends,private.mm_social_settings,private.mm_follows,private.mm_group_invites,private.mm_content_reports,private.mm_hidden_content,private.mm_moderators from public,anon,authenticated;
alter table public.mm_rooms add column is_group boolean not null default false;
update public.mm_rooms set is_group=true where cardinality(members)>2;
alter table public.vc_profiles add column bio text not null default '' check(length(bio)<=500);
create function private.mm_group_kind() returns trigger language plpgsql set search_path='' as $$
begin new.is_group:=new.is_group or cardinality(new.members)>2;return new;end $$;
create trigger mm_group_kind before insert or update on public.mm_rooms for each row execute function private.mm_group_kind();

create function private.mm_blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.mm_blocks where(owner_id=a and target_id=b)or(owner_id=b and target_id=a));
$$;
create or replace function private.mm_friends(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select a=b or not private.mm_blocked(a,b) and exists(select 1 from public.vc_connections c where c.status='accepted' and((c.requester_id=a and c.addressee_id=b)or(c.requester_id=b and c.addressee_id=a)));
$$;
create function private.mm_visible(p_kind text,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.mm_hidden_content where kind=p_kind and target_id=p_id);
$$;
create function private.mm_read_document(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mm_documents d where d.id=p_id and(d.expires_at is null or d.expires_at>now()) and(d.owner_id=private.mm_user() or private.mm_user()=any(d.members) or d.kind in('event','review','road_report')) and not private.mm_blocked(d.owner_id,private.mm_user()) and private.mm_visible('document',d.id));
$$;
drop policy mm_documents_read on public.mm_documents;
create policy mm_documents_read on public.mm_documents for select to anon,authenticated using(private.mm_read_document(id));
drop policy mm_rooms_read on public.mm_rooms;
create policy mm_rooms_read on public.mm_rooms for select to anon,authenticated using(private.mm_room_member(id) and(is_group or not exists(select 1 from unnest(members) m where private.mm_blocked(private.mm_user(),m))));
drop policy mm_messages_read on public.mm_messages;
create policy mm_messages_read on public.mm_messages for select to anon,authenticated using(private.mm_room_member(room_id) and not private.mm_blocked(private.mm_user(),sender_id) and private.mm_visible('message',id));
drop policy mm_room_states_read on public.mm_room_states;
create policy mm_room_states_read on public.mm_room_states for select to anon,authenticated using(private.mm_room_member(room_id) and not private.mm_blocked(private.mm_user(),user_id));
create function public.mm_social_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin
 return jsonb_build_object('publicProfile',coalesce((select is_public from private.mm_social_settings where owner_id=me),false),
 'blocked',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name)) from private.mm_blocks b join public.vc_profiles p on p.id=b.target_id where b.owner_id=me),'[]'),
 'closeFriends',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name)) from private.mm_close_friends c join public.vc_profiles p on p.id=c.target_id where c.owner_id=me and private.mm_friends(me,c.target_id)),'[]'),
 'following',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name)) from private.mm_follows f join public.vc_profiles p on p.id=f.target_id join private.mm_social_settings s on s.owner_id=f.target_id and s.is_public where f.owner_id=me and not private.mm_blocked(me,f.target_id)),'[]'),
 'followers',coalesce((select count(*) from private.mm_follows where target_id=me),0),
 'moderator',exists(select 1 from private.mm_moderators where user_id=me));
end $$;
create function public.mm_social_action(p_action text,p_target uuid default null,p_enabled boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin
 if p_enabled is null then raise exception 'invalid_action';end if;
 perform private.mm_rate(me,'social_action',30);
 if p_action='publish' then
  insert into private.mm_social_settings values(me,p_enabled) on conflict(owner_id) do update set is_public=excluded.is_public;
  if not p_enabled then delete from private.mm_follows where target_id=me;end if;return;
 end if;
 if p_target is null or p_target=me or not exists(select 1 from public.vc_profiles where id=p_target) then raise exception 'invalid_target';end if;
 if p_action='block' then
  if p_enabled then
   insert into private.mm_blocks values(me,p_target,now()) on conflict do nothing;
   delete from private.mm_follows where(owner_id=me and target_id=p_target)or(owner_id=p_target and target_id=me);
   delete from private.mm_close_friends where(owner_id=me and target_id=p_target)or(owner_id=p_target and target_id=me);
   delete from private.mm_group_invites where(sender_id=me and target_id=p_target)or(sender_id=p_target and target_id=me);
  else delete from private.mm_blocks where owner_id=me and target_id=p_target;end if;
 elsif p_action='close' then
  if p_enabled then if not private.mm_friends(me,p_target) then raise exception 'recipient_not_friend';end if;insert into private.mm_close_friends values(me,p_target) on conflict do nothing;
  else delete from private.mm_close_friends where owner_id=me and target_id=p_target;end if;
 elsif p_action='follow' then
  if p_enabled then if private.mm_blocked(me,p_target) or not private.mm_visible('profile',p_target) or not exists(select 1 from private.mm_social_settings where owner_id=p_target and is_public) then raise exception 'profile_not_public';end if;insert into private.mm_follows values(me,p_target,now()) on conflict do nothing;
  else delete from private.mm_follows where owner_id=me and target_id=p_target;end if;
 else raise exception 'invalid_action';end if;
end $$;

create function public.mm_group_action(p_room uuid,p_action text,p_target uuid default null,p_name text default '') returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();r public.mm_rooms;begin
 select * into r from public.mm_rooms where id=p_room for update;
 if not found or not r.is_group or not(me=any(r.members)) then raise exception 'not_group_member';end if;
 perform private.mm_rate(me,'group_action',30);
 if p_action='leave' then
  if r.owner_id=me then raise exception 'transfer_ownership_first';end if;
  update public.mm_rooms set members=array_remove(members,me) where id=p_room;
  delete from public.mm_room_states where room_id=p_room and user_id=me;return;
 end if;
 if r.owner_id<>me then raise exception 'owner_only';end if;
 if p_action='rename' then
  if p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception 'invalid_name';end if;
  update public.mm_rooms set name=trim(p_name) where id=p_room;
 elsif p_action='transfer' then
  if p_target is null or p_target=me or not(p_target=any(r.members)) then raise exception 'invalid_target';end if;
  update public.mm_rooms set owner_id=p_target where id=p_room;
 elsif p_action='remove' then
  if p_target is null or p_target=me or not(p_target=any(r.members)) then raise exception 'invalid_target';end if;
  update public.mm_rooms set members=array_remove(members,p_target) where id=p_room;
  delete from public.mm_room_states where room_id=p_room and user_id=p_target;
 elsif p_action='invite' then
  if p_target is null or p_target=any(r.members) or cardinality(r.members)>=30 or not private.mm_friends(me,p_target) then raise exception 'invalid_target';end if;
  insert into private.mm_group_invites(room_id,target_id,sender_id) values(p_room,p_target,me) on conflict(room_id,target_id) do update set sender_id=me,expires_at=now()+interval '7 days';
 elsif p_action='cancel_invite' then delete from private.mm_group_invites where room_id=p_room and target_id=p_target;
 else raise exception 'invalid_action';end if;
end $$;
create function public.mm_group_invitations() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin return coalesce((select jsonb_agg(jsonb_build_object('roomId',r.id,'name',r.name,'senderName',p.display_name,'expiresAt',i.expires_at)) from private.mm_group_invites i join public.mm_rooms r on r.id=i.room_id join public.vc_profiles p on p.id=i.sender_id where i.target_id=me and i.expires_at>now() and private.mm_friends(me,r.owner_id)),'[]');end $$;
create function public.mm_answer_group_invite(p_room uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();r public.mm_rooms;begin
 if p_accept is null then raise exception 'invalid_action';end if;
 select * into r from public.mm_rooms where id=p_room for update;
 if not found or not exists(select 1 from private.mm_group_invites where room_id=p_room and target_id=me and expires_at>now()) then raise exception 'invitation_expired';end if;
 if p_accept then
  if cardinality(r.members)>=30 or not private.mm_friends(me,r.owner_id) or exists(select 1 from unnest(r.members)m where private.mm_blocked(me,m)) then raise exception 'group_unavailable';end if;
  update public.mm_rooms set members=array(select distinct unnest(array_append(r.members,me)) order by 1) where id=p_room;
 end if;
 delete from private.mm_group_invites where room_id=p_room and target_id=me;
end $$;
create function private.mm_message_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.mm_rooms r,unnest(r.members)m where r.id=new.room_id and private.mm_blocked(new.sender_id,m)) then raise exception 'blocked_conversation';end if;
 return new;
end $$;
create trigger mm_message_guard before insert on public.mm_messages for each row execute function private.mm_message_guard();
create function public.mm_missing_messages(p_room uuid,p_ids uuid[]) returns uuid[] language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin
 if cardinality(p_ids)>200 or not private.mm_room_member(p_room) then raise exception 'invalid_request';end if;
 return array(select wanted.message_id from unnest(p_ids) as wanted(message_id) where not exists(select 1 from public.mm_messages m where m.id=wanted.message_id and m.room_id=p_room and not private.mm_blocked(me,m.sender_id) and private.mm_visible('message',m.id)));
end $$;
create or replace function private.mm_chat_object(p_name text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare room uuid;sender uuid;message uuid;begin
 if cardinality(string_to_array(p_name,'/'))<>3 then return false;end if;
 begin room:=split_part(p_name,'/',1)::uuid;sender:=split_part(p_name,'/',2)::uuid;message:=split_part(p_name,'/',3)::uuid;exception when invalid_text_representation then return false;end;
 return private.mm_room_member(room) and not private.mm_blocked(private.mm_user(),sender) and private.mm_visible('message',message) and not exists(select 1 from private.mm_chat_cancellations where id=message);
end $$;
alter function public.mm_live_friends() set schema private;
alter function private.mm_live_friends() rename to mm_unfiltered_live_friends;
revoke all on function private.mm_unfiltered_live_friends() from public,anon,authenticated;
create function public.mm_live_friends() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin return coalesce((select jsonb_agg(value) from jsonb_array_elements(private.mm_unfiltered_live_friends()) where private.mm_friends(me,(value->>'user_id')::uuid)),'[]');end $$;

create table public.mm_content_comments(id uuid primary key default gen_random_uuid(),document_id uuid not null references public.mm_documents(id) on delete cascade,user_id uuid not null references public.vc_profiles(id),body text not null check(length(body) between 1 and 1000),created_at timestamptz not null default now());
create index mm_content_comments_document on public.mm_content_comments(document_id,created_at);
create table public.mm_content_reactions(document_id uuid not null references public.mm_documents(id) on delete cascade,user_id uuid not null references public.vc_profiles(id),primary key(document_id,user_id));
create table public.mm_event_rsvps(document_id uuid not null references public.mm_documents(id) on delete cascade,user_id uuid not null references public.vc_profiles(id),status text not null check(status in('going','interested')),primary key(document_id,user_id));
alter table public.mm_content_comments enable row level security;
alter table public.mm_content_reactions enable row level security;
alter table public.mm_event_rsvps enable row level security;
revoke all on public.mm_content_comments,public.mm_content_reactions,public.mm_event_rsvps from public,anon,authenticated;
grant select on public.mm_content_comments to anon,authenticated;
create policy mm_content_comments_read on public.mm_content_comments for select to anon,authenticated using(private.mm_read_document(document_id) and not private.mm_blocked(private.mm_user(),user_id) and private.mm_visible('comment',id));
create function public.mm_content_action(p_document uuid,p_action text,p_text text default '',p_comment uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();d public.mm_documents;begin
 select * into d from public.mm_documents where id=p_document for share;
 if not found or not private.mm_read_document(p_document) then raise exception 'content_unavailable';end if;
 perform private.mm_rate(me,'content_action',20);
 if p_action='comment' then
  if p_text is null or length(trim(p_text)) not between 1 and 1000 then raise exception 'invalid_comment';end if;
  insert into public.mm_content_comments(document_id,user_id,body) values(p_document,me,trim(p_text));
 elsif p_action='delete_comment' then delete from public.mm_content_comments where id=p_comment and document_id=p_document and(user_id=me or d.owner_id=me);
 elsif p_action='like' then insert into public.mm_content_reactions values(p_document,me) on conflict do nothing;
 elsif p_action='unlike' then delete from public.mm_content_reactions where document_id=p_document and user_id=me;
 elsif p_action in('going','interested','cancel_rsvp') then
  if d.kind<>'event' or d.expires_at<=now() then raise exception 'event_finished';end if;
  if p_action='cancel_rsvp' then delete from public.mm_event_rsvps where document_id=p_document and user_id=me;
  else insert into public.mm_event_rsvps values(p_document,me,p_action) on conflict(document_id,user_id) do update set status=excluded.status;end if;
 else raise exception 'invalid_action';end if;
end $$;
create function public.mm_content_details(p_document uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin
 if not private.mm_read_document(p_document) then raise exception 'content_unavailable';end if;
 return jsonb_build_object('likes',(select count(*) from public.mm_content_reactions where document_id=p_document and not private.mm_blocked(me,user_id)),
 'liked',exists(select 1 from public.mm_content_reactions where document_id=p_document and user_id=me),
 'going',(select count(*) from public.mm_event_rsvps where document_id=p_document and status='going' and not private.mm_blocked(me,user_id)),
 'interested',(select count(*) from public.mm_event_rsvps where document_id=p_document and status='interested' and not private.mm_blocked(me,user_id)),
 'rsvp',(select status from public.mm_event_rsvps where document_id=p_document and user_id=me),
 'comments',coalesce((select jsonb_agg(row_to_json(q)) from(select c.id,c.user_id,c.body,c.created_at,p.display_name,(c.user_id=me or exists(select 1 from public.mm_documents where id=p_document and owner_id=me)) as can_delete from public.mm_content_comments c join public.vc_profiles p on p.id=c.user_id where c.document_id=p_document and not private.mm_blocked(me,c.user_id) and private.mm_visible('comment',c.id) order by c.created_at desc,c.id desc limit 50)q),'[]'));
end $$;
create function public.mm_report_content(p_kind text,p_target uuid,p_reason text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();allowed boolean:=false;begin
 if p_reason is null or p_reason not in('spam','harassment','scam','privacy','dangerous','other') or p_note is null or length(p_note)>1000 then raise exception 'invalid_report';end if;
 if p_kind='document' then allowed:=private.mm_read_document(p_target);
 elsif p_kind='message' then allowed:=exists(select 1 from public.mm_messages m where m.id=p_target and private.mm_room_member(m.room_id));
 elsif p_kind='comment' then allowed:=exists(select 1 from public.mm_content_comments c where c.id=p_target and private.mm_read_document(c.document_id));
 elsif p_kind='profile' then allowed:=exists(select 1 from public.vc_profiles where id=p_target and id<>me);
 end if;
 if not allowed then raise exception 'content_unavailable';end if;
 perform private.mm_rate(me,'content_report',10);
 insert into private.mm_content_reports(owner_id,kind,target_id,reason,note) values(me,p_kind,p_target,p_reason,p_note) on conflict(owner_id,kind,target_id) do update set reason=excluded.reason,note=excluded.note;
end $$;
create function public.mm_moderation_queue() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin
 if not exists(select 1 from private.mm_moderators where user_id=me) then raise exception 'moderator_only';end if;
 return coalesce((select jsonb_agg(row_to_json(q)) from(select id,kind,target_id,reason,note,created_at,status from private.mm_content_reports where status='pending' order by created_at limit 100)q),'[]');
end $$;
create function public.mm_moderate(p_report uuid,p_hide boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();r private.mm_content_reports;begin
 if not exists(select 1 from private.mm_moderators where user_id=me) then raise exception 'moderator_only';end if;
 if p_hide is null or p_note is null or length(trim(p_note)) not between 1 and 1000 then raise exception 'invalid_resolution';end if;
 select * into r from private.mm_content_reports where id=p_report for update;
 if not found then raise exception 'report_missing';end if;
 if p_hide then insert into private.mm_hidden_content values(r.kind,r.target_id) on conflict do nothing;else delete from private.mm_hidden_content where kind=r.kind and target_id=r.target_id;end if;
 update private.mm_content_reports set status='resolved',resolution=trim(p_note) where id=p_report;
end $$;
create function public.mm_activity_feed(p_before timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin
 return coalesce((select jsonb_agg(row_to_json(q)) from(select d.id,d.kind,d.owner_id,d.payload->>'name' as title,d.updated_at,p.display_name from public.mm_documents d join public.vc_profiles p on p.id=d.owner_id
 where d.kind in('trip','collection','journal','event','review') and(p_before is null or d.updated_at<p_before) and(d.expires_at is null or d.expires_at>now()) and private.mm_read_document(d.id)
 and(d.owner_id=me or me=any(d.members) or d.kind in('event','review') and exists(select 1 from private.mm_follows where owner_id=me and target_id=d.owner_id))
 order by d.updated_at desc,d.id desc limit 50)q),'[]');
end $$;
revoke all on function private.mm_blocked(uuid,uuid),private.mm_visible(text,uuid),private.mm_read_document(uuid),private.mm_message_guard() from public;
grant execute on function private.mm_blocked(uuid,uuid),private.mm_visible(text,uuid),private.mm_read_document(uuid) to anon,authenticated;
revoke all on function public.mm_social_state(),public.mm_social_action(text,uuid,boolean),public.mm_group_action(uuid,text,uuid,text),public.mm_group_invitations(),public.mm_answer_group_invite(uuid,boolean),public.mm_missing_messages(uuid,uuid[]),public.mm_content_action(uuid,text,text,uuid),public.mm_content_details(uuid),public.mm_report_content(text,uuid,text,text),public.mm_moderation_queue(),public.mm_moderate(uuid,boolean,text),public.mm_activity_feed(timestamptz),public.mm_live_friends() from public;
grant execute on function public.mm_social_state(),public.mm_social_action(text,uuid,boolean),public.mm_group_action(uuid,text,uuid,text),public.mm_group_invitations(),public.mm_answer_group_invite(uuid,boolean),public.mm_missing_messages(uuid,uuid[]),public.mm_content_action(uuid,text,text,uuid),public.mm_content_details(uuid),public.mm_report_content(text,uuid,text,text),public.mm_moderation_queue(),public.mm_moderate(uuid,boolean,text),public.mm_activity_feed(timestamptz),public.mm_live_friends() to anon,authenticated;
-- Security-definer discovery functions must respect the same visibility rules as RLS.
alter function public.mm_nearby_content(text,float8,float8,integer) set schema private;
alter function private.mm_nearby_content(text,float8,float8,integer) rename to mm_unfiltered_nearby_content;
revoke all on function private.mm_unfiltered_nearby_content(text,float8,float8,integer) from public,anon,authenticated;
create function public.mm_nearby_content(p_kind text,p_lat float8,p_lon float8,p_radius integer default 2000) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(private.mm_unfiltered_nearby_content(p_kind,p_lat,p_lon,p_radius)) where private.mm_read_document((value->>'id')::uuid);
$$;
alter function public.mm_nearby_reports(float8,float8,integer) set schema private;
alter function private.mm_nearby_reports(float8,float8,integer) rename to mm_unfiltered_nearby_reports;
revoke all on function private.mm_unfiltered_nearby_reports(float8,float8,integer) from public,anon,authenticated;
create function public.mm_nearby_reports(p_lat float8,p_lon float8,p_radius integer default 2000) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(private.mm_unfiltered_nearby_reports(p_lat,p_lon,p_radius)) where private.mm_read_document((value->>'id')::uuid);
$$;
alter function public.vc_list_connections() set schema private;
alter function private.vc_list_connections() rename to mm_unfiltered_connections;
revoke all on function private.mm_unfiltered_connections() from public,anon,authenticated;
create function public.vc_list_connections() returns table(connection_id uuid,user_id uuid,username text,display_name text,avatar_path text,relationship_status public.vc_connection_status,direction text,created_at timestamptz) language sql stable security definer set search_path='' as $$
 select c.* from private.mm_unfiltered_connections() c where not private.mm_blocked(private.mm_user(),c.user_id) and private.mm_visible('profile',c.user_id);
$$;
create function private.mm_document_write_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin if private.mm_blocked(private.mm_user(),new.owner_id) or not private.mm_visible('document',new.id) then raise exception 'content_unavailable';end if;return new;end $$;
create trigger mm_document_write_guard before insert or update on public.mm_documents for each row execute function private.mm_document_write_guard();
revoke all on function private.mm_document_write_guard() from public;
revoke all on function public.mm_nearby_content(text,float8,float8,integer),public.mm_nearby_reports(float8,float8,integer),public.vc_list_connections() from public;
grant execute on function public.mm_nearby_content(text,float8,float8,integer),public.mm_nearby_reports(float8,float8,integer),public.vc_list_connections() to anon,authenticated;
notify pgrst,'reload schema';
commit;
