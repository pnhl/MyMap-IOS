begin;
create table public.mm_documents(
 id uuid primary key, owner_id uuid not null references public.vc_profiles(id),
 kind text not null check(kind in ('trip','collection','vehicle','parking','expense','maintenance','journal','road_report','event','review')),
 payload jsonb not null check(octet_length(payload::text)<=100000),
 members uuid[] not null default '{}',version integer not null default 1,
 updated_at timestamptz not null default now(),expires_at timestamptz,
 check(cardinality(members)<=30)
);
create index mm_documents_owner on public.mm_documents(owner_id,updated_at desc);
create index mm_documents_members on public.mm_documents using gin(members);
alter table public.mm_documents enable row level security;
grant select on public.mm_documents to anon,authenticated;
create policy mm_documents_read on public.mm_documents for select to anon,authenticated using(
 private.vc_is_trusted_request() and (expires_at is null or expires_at>now()) and
 (owner_id=private.mm_user() or private.mm_user()=any(members) or kind in ('road_report','review','event')));
create function public.mm_doc_save(p_id uuid,p_kind text,p_payload jsonb,p_version integer,p_members uuid[],p_expires timestamptz default null)
returns integer language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user(); existing public.mm_documents; member uuid; result integer;
begin
 if p_payload is null or octet_length(p_payload::text)>100000 or jsonb_typeof(p_payload)<>'object' then raise exception 'invalid_document'; end if;
 if p_kind='road_report' then
  if p_expires is null or p_expires<=now() or p_expires>now()+interval '24 hours' then raise exception 'invalid_report_expiry'; end if;
  if (p_payload->>'latitude')::float8 not between -90 and 90 or (p_payload->>'longitude')::float8 not between -180 and 180
   or p_payload->>'category' not in ('hazard','pothole','flood','accident','closure','broken_light') then raise exception 'invalid_report'; end if;
 end if;
 if exists(select 1 from public.mm_documents where owner_id=me and updated_at>now()-interval '1 minute' group by owner_id having count(*)>=30) then raise exception 'rate_limited'; end if;
 select * into existing from public.mm_documents where id=p_id for update;
 if found then
  if existing.owner_id<>me and not(me=any(existing.members) and existing.kind in ('trip','collection','journal')) then raise exception 'not_owner'; end if;
  if existing.version<>p_version then raise exception 'version_conflict'; end if;
  if existing.owner_id<>me and (p_kind<>existing.kind or coalesce(p_members,'{}')<>existing.members) then raise exception 'members_owner_only'; end if;
 else
  if p_version<>0 then raise exception 'version_conflict'; end if;
 end if;
 foreach member in array coalesce(p_members,'{}') loop
  if not private.mm_friends(me,member) then raise exception 'recipient_not_friend'; end if;
 end loop;
 insert into public.mm_documents(id,owner_id,kind,payload,members,version,expires_at)
 values(p_id,me,p_kind,p_payload,coalesce(p_members,'{}'),1,p_expires)
 on conflict(id) do update set payload=excluded.payload,members=excluded.members,version=mm_documents.version+1,updated_at=now(),expires_at=excluded.expires_at
 returning version into result;
 return result;
end $$;
create function public.mm_doc_delete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();
begin delete from public.mm_documents where id=p_id and owner_id=me; if not found then raise exception 'not_owner'; end if; end $$;
create table public.mm_road_votes(
 report_id uuid not null references public.mm_documents(id) on delete cascade,
 user_id uuid not null references public.vc_profiles(id),confirmed boolean not null,updated_at timestamptz not null default now(),primary key(report_id,user_id));
alter table public.mm_road_votes enable row level security;
grant select on public.mm_road_votes to anon,authenticated;
create policy mm_road_vote_read on public.mm_road_votes for select to anon,authenticated using(private.vc_is_trusted_request());
create function public.mm_road_vote(p_id uuid,p_confirmed boolean) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();
begin
 if not exists(select 1 from public.mm_documents where id=p_id and kind='road_report' and expires_at>now()) then raise exception 'report_expired';end if;
 insert into public.mm_road_votes(report_id,user_id,confirmed) values(p_id,me,p_confirmed)
 on conflict(report_id,user_id) do update set confirmed=excluded.confirmed,updated_at=now();
end $$;
create table private.mm_friend_privacy(
 owner_id uuid not null references public.vc_profiles(id),recipient_id uuid not null references public.vc_profiles(id),
 mode text not null check(mode in ('precise','fuzzy','frozen')),latitude float8,longitude float8,
 primary key(owner_id,recipient_id));
create function public.mm_set_friend_privacy(p_target uuid,p_mode text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();
begin
 if not private.mm_friends(me,p_target) then raise exception 'recipient_not_friend'; end if;
 insert into private.mm_friend_privacy(owner_id,recipient_id,mode,latitude,longitude)
 select me,p_target,p_mode,p.latitude,p.longitude from public.vc_live_presence p where p.user_id=me
 on conflict(owner_id,recipient_id) do update set mode=excluded.mode,latitude=excluded.latitude,longitude=excluded.longitude;
 if not found then insert into private.mm_friend_privacy(owner_id,recipient_id,mode) values(me,p_target,p_mode)
 on conflict(owner_id,recipient_id) do update set mode=excluded.mode; end if;
end $$;
create function private.mm_precise_for(p_owner uuid,p_recipient uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select mode='precise' from private.mm_friend_privacy where owner_id=p_owner and recipient_id=p_recipient),true);
$$;
-- Keep existing friend/identity rules; a restrictive guard also protects direct REST reads.
create policy mm_presence_precision_guard on public.vc_live_presence as restrictive for select to anon,authenticated using(
 user_id=private.mm_user() or private.mm_precise_for(user_id,private.mm_user()));
create function public.mm_live_friends() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user(); result jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'user_id',p.user_id,'display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_path,
 'latitude',case g.mode when 'fuzzy' then round(p.latitude::numeric,2)::float8 when 'frozen' then g.latitude else p.latitude end,
 'longitude',case g.mode when 'fuzzy' then round(p.longitude::numeric,2)::float8 when 'frozen' then g.longitude else p.longitude end,
 'heading',case when g.mode in ('fuzzy','frozen') then null else p.heading_deg end,
 'speed_kmh',case when g.mode in ('fuzzy','frozen') then null else p.speed_kmh end,
 'battery_level',p.battery_level,'is_charging',p.is_charging,'status_text',p.status_text,'status_icon',p.status_icon,
 'is_fuzzy',p.is_fuzzy or g.mode='fuzzy','is_frozen',p.is_frozen or g.mode='frozen','updated_at',p.updated_at,
 'music_title',p.music_title,'music_artist',p.music_artist,'music_is_playing',p.music_is_playing,'streak_days',0,'ranking_score',0)),'[]'::jsonb)
 into result from public.vc_live_presence p join public.vc_profiles u on u.id=p.user_id
 left join private.mm_friend_privacy g on g.owner_id=p.user_id and g.recipient_id=me
 where p.user_id<>me and p.expires_at>now() and (g.mode is distinct from 'frozen' or g.latitude is not null)
 and exists(select 1 from public.vc_connections c where c.status='accepted' and c.share_exact_location and
 ((c.requester_id=me and c.addressee_id=p.user_id) or(c.addressee_id=me and c.requester_id=p.user_id)));
 return result;
end $$;
create function public.mm_clear_presence() returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user(); begin delete from public.vc_live_presence where user_id=me;end $$;
create table public.mm_rooms(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.vc_profiles(id),
 name text not null default '',members uuid[] not null,created_at timestamptz not null default now(),check(cardinality(members) between 2 and 30));
create index mm_rooms_members on public.mm_rooms using gin(members);
create function private.mm_room_member(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mm_rooms where id=p_room and private.mm_user()=any(members));
$$;
create table public.mm_messages(
 id uuid primary key,room_id uuid not null references public.mm_rooms(id) on delete cascade,
 sender_id uuid not null references public.vc_profiles(id),kind text not null check(kind in ('text','voice','photo','video')),
 body text not null check(length(body) between 1 and 2000),duration_seconds real not null default 0 check(duration_seconds between 0 and 60),
 created_at timestamptz not null default now());
create index mm_messages_room_time on public.mm_messages(room_id,created_at desc);
create index mm_messages_sender on public.mm_messages(sender_id);
create table public.mm_room_states(
 room_id uuid not null references public.mm_rooms(id) on delete cascade,user_id uuid not null references public.vc_profiles(id),
 read_at timestamptz,typing_until timestamptz,primary key(room_id,user_id));
create table public.mm_message_reactions(
 message_id uuid not null references public.mm_messages(id) on delete cascade,user_id uuid not null references public.vc_profiles(id),
 emoji text not null check(length(emoji) between 1 and 16),primary key(message_id,user_id));
alter table public.mm_rooms enable row level security;alter table public.mm_messages enable row level security;
alter table public.mm_room_states enable row level security;alter table public.mm_message_reactions enable row level security;
grant select on public.mm_rooms,public.mm_messages,public.mm_room_states,public.mm_message_reactions to anon,authenticated;
create policy mm_rooms_read on public.mm_rooms for select to anon,authenticated using(private.mm_room_member(id));
create policy mm_messages_read on public.mm_messages for select to anon,authenticated using(private.mm_room_member(room_id));
create policy mm_room_states_read on public.mm_room_states for select to anon,authenticated using(private.mm_room_member(room_id));
create policy mm_message_reactions_read on public.mm_message_reactions for select to anon,authenticated using(
 exists(select 1 from public.mm_messages m where m.id=message_id and private.mm_room_member(m.room_id)));
create function public.mm_create_room(p_name text,p_members uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();targets uuid[];m uuid;result uuid;
begin
 if length(p_name)>80 then raise exception 'invalid_name';end if;
 targets:=array(select distinct unnest(array_append(coalesce(p_members,'{}'),me)));
 if cardinality(targets)<2 or cardinality(targets)>30 then raise exception 'invalid_members';end if;
 foreach m in array targets loop if not private.mm_friends(me,m) then raise exception 'recipient_not_friend';end if;end loop;
 if cardinality(targets)=2 then select id into result from public.mm_rooms where cardinality(members)=2 and members @> targets and targets @> members limit 1;if found then return result;end if;end if;
 insert into public.mm_rooms(owner_id,name,members) values(me,trim(p_name),targets) returning id into result;return result;
end $$;
create function public.mm_send_message(p_id uuid,p_room uuid,p_kind text,p_body text,p_duration real default 0) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();
begin
 if not private.mm_room_member(p_room) then raise exception 'not_room_member';end if;
 if exists(select 1 from public.mm_messages where sender_id=me and created_at>now()-interval '1 minute' group by sender_id having count(*)>=40) then raise exception 'rate_limited';end if;
 if p_kind<>'text' and(p_body<>p_room::text||'/'||me::text||'/'||p_id::text or not exists(select 1 from storage.objects where bucket_id='mymap-chat' and name=p_body)) then raise exception 'media_not_uploaded';end if;
 insert into public.mm_messages(id,room_id,sender_id,kind,body,duration_seconds) values(p_id,p_room,me,p_kind,trim(p_body),p_duration)
 on conflict(id) do nothing;
end $$;
create function public.mm_chat_state(p_room uuid,p_read boolean,p_typing boolean) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();
begin
 if not private.mm_room_member(p_room) then raise exception 'not_room_member';end if;
 insert into public.mm_room_states(room_id,user_id,read_at,typing_until) values(p_room,me,case when p_read then now() end,case when p_typing then now()+interval '8 seconds' end)
 on conflict(room_id,user_id) do update set read_at=case when p_read then now() else mm_room_states.read_at end,typing_until=case when p_typing then now()+interval '8 seconds' else null end;
end $$;
create function public.mm_chat_react(p_message uuid,p_emoji text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();
begin
 if not exists(select 1 from public.mm_messages m where m.id=p_message and private.mm_room_member(m.room_id)) then raise exception 'not_room_member';end if;
 if p_emoji='' then delete from public.mm_message_reactions where message_id=p_message and user_id=me;
 else insert into public.mm_message_reactions(message_id,user_id,emoji) values(p_message,me,p_emoji) on conflict(message_id,user_id) do update set emoji=excluded.emoji;end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('mymap-chat','mymap-chat',false,26214400,array['audio/mp4','audio/m4a','image/jpeg','video/mp4'])
 on conflict(id) do nothing;
create function private.mm_chat_object(p_name text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare room uuid;
begin
 begin room:=split_part(p_name,'/',1)::uuid;exception when invalid_text_representation then return false;end;
 return private.mm_room_member(room);
end $$;
create policy mm_chat_storage_read on storage.objects for select to anon,authenticated using(bucket_id='mymap-chat' and private.mm_chat_object(name));
create policy mm_chat_storage_insert on storage.objects for insert to anon,authenticated with check(bucket_id='mymap-chat' and private.mm_chat_object(name) and split_part(name,'/',2)=private.mm_user()::text);
create policy mm_chat_storage_delete on storage.objects for delete to anon,authenticated using(bucket_id='mymap-chat' and split_part(name,'/',2)=private.mm_user()::text);
-- Every public RPC verifies trusted identity internally; deny implicit PUBLIC execution.
revoke all on function public.mm_doc_save(uuid,text,jsonb,integer,uuid[],timestamptz),public.mm_doc_delete(uuid),public.mm_road_vote(uuid,boolean),
 public.mm_set_friend_privacy(uuid,text),public.mm_live_friends(),public.mm_clear_presence(),
 public.mm_create_room(text,uuid[]),public.mm_send_message(uuid,uuid,text,text,real),public.mm_chat_state(uuid,boolean,boolean),public.mm_chat_react(uuid,text) from public;
grant execute on function public.mm_doc_save(uuid,text,jsonb,integer,uuid[],timestamptz),public.mm_doc_delete(uuid),public.mm_road_vote(uuid,boolean),
 public.mm_set_friend_privacy(uuid,text),public.mm_live_friends(),public.mm_clear_presence(),
 public.mm_create_room(text,uuid[]),public.mm_send_message(uuid,uuid,text,text,real),public.mm_chat_state(uuid,boolean,boolean),public.mm_chat_react(uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
