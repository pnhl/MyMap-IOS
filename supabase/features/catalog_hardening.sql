begin;
create or replace function public.mm_doc_save(p_id uuid,p_kind text,p_payload jsonb,p_version integer,p_members uuid[],p_expires timestamptz default null)
returns integer language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user(); existing public.mm_documents; member uuid; result integer; is_existing boolean;
begin
 if p_payload is null or octet_length(p_payload::text)>100000 or jsonb_typeof(p_payload)<>'object' then raise exception 'invalid_document'; end if;
 if p_kind='road_report' then
  if p_expires is null or p_expires<=now() or p_expires>now()+interval '24 hours' then raise exception 'invalid_report_expiry'; end if;
  if not (p_payload ?& array['latitude','longitude','category']) or jsonb_typeof(p_payload->'latitude')<>'number' or jsonb_typeof(p_payload->'longitude')<>'number' or (p_payload->>'latitude')::float8 not between -90 and 90 or (p_payload->>'longitude')::float8 not between -180 and 180
   or p_payload->>'category' not in ('hazard','pothole','flood','accident','closure','broken_light') then raise exception 'invalid_report'; end if;
 end if;
 if exists(select 1 from public.mm_documents where owner_id=me and updated_at>now()-interval '1 minute' group by owner_id having count(*)>=30) then raise exception 'rate_limited'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from public.mm_documents where id=p_id for update;
 is_existing:=found;
 if is_existing then
  if p_kind is distinct from existing.kind then raise exception 'document_kind_immutable';end if;
  if existing.owner_id<>me and not(me=any(existing.members) and existing.kind in ('trip','collection','journal')) then raise exception 'not_owner'; end if;
  if existing.version is distinct from p_version then raise exception 'version_conflict'; end if;
  if existing.owner_id<>me and (p_kind<>existing.kind or coalesce(p_members,'{}')<>existing.members) then raise exception 'members_owner_only'; end if;
 else
  if p_version is distinct from 0 then raise exception 'version_conflict'; end if;
 end if;
 if cardinality(coalesce(p_members,'{}'))>30 then raise exception 'invalid_members';end if;
 if not is_existing or existing.owner_id=me then
 foreach member in array coalesce(p_members,'{}') loop
  if not private.mm_friends(me,member) then raise exception 'recipient_not_friend'; end if;
 end loop;
 end if;
 insert into public.mm_documents(id,owner_id,kind,payload,members,version,expires_at)
 values(p_id,me,p_kind,p_payload,coalesce(p_members,'{}'),1,p_expires)
 on conflict(id) do update set payload=excluded.payload,members=excluded.members,version=mm_documents.version+1,updated_at=now(),expires_at=excluded.expires_at
 returning version into result;
 return result;
end $$;

create or replace function public.mm_live_friends() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user(); result jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'user_id',p.user_id,'display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_path,
 'latitude',case g.mode when 'fuzzy' then round(p.latitude::numeric,2)::float8 when 'frozen' then g.latitude else p.latitude end,
 'longitude',case g.mode when 'fuzzy' then round(p.longitude::numeric,2)::float8 when 'frozen' then g.longitude else p.longitude end,
 'heading',case when g.mode in ('fuzzy','frozen') then null else p.heading_deg end,
 'speed_kmh',case when g.mode in ('fuzzy','frozen') then null else p.speed_kmh end,
 'battery_level',p.battery_level,'is_charging',p.is_charging,'status_text',p.status_text,'status_icon',p.status_icon,
 'is_fuzzy',coalesce(p.is_fuzzy,false) or coalesce(g.mode='fuzzy',false),'is_frozen',coalesce(p.is_frozen,false) or coalesce(g.mode='frozen',false),'updated_at',p.updated_at,
 'music_title',p.music_title,'music_artist',p.music_artist,'music_is_playing',p.music_is_playing,'streak_days',0,'ranking_score',0)),'[]'::jsonb)
 into result from public.vc_live_presence p join public.vc_profiles u on u.id=p.user_id
 left join private.mm_friend_privacy g on g.owner_id=p.user_id and g.recipient_id=me
 where p.user_id<>me and p.expires_at>now() and (g.mode is distinct from 'frozen' or g.latitude is not null)
 and exists(select 1 from public.vc_connections c where c.status='accepted' and c.share_exact_location and
 ((c.requester_id=me and c.addressee_id=p.user_id) or(c.addressee_id=me and c.requester_id=p.user_id)));
 return result;
end $$;

create or replace function public.mm_send_message(p_id uuid,p_room uuid,p_kind text,p_body text,p_duration real default 0) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();
begin
 if exists(select 1 from public.mm_messages where id=p_id and sender_id=me and room_id=p_room and kind=p_kind and body=trim(p_body) and duration_seconds=p_duration) then return;end if;
 if exists(select 1 from public.mm_messages where id=p_id) then raise exception 'message_id_conflict';end if;
 if not private.mm_room_member(p_room) then raise exception 'not_room_member';end if;
 if exists(select 1 from public.mm_messages where sender_id=me and created_at>now()-interval '1 minute' group by sender_id having count(*)>=40) then raise exception 'rate_limited';end if;
 if p_kind<>'text' and(p_body<>p_room::text||'/'||me::text||'/'||p_id::text or not exists(select 1 from storage.objects where bucket_id='mymap-chat' and name=p_body)) then raise exception 'media_not_uploaded';end if;
 insert into public.mm_messages(id,room_id,sender_id,kind,body,duration_seconds) values(p_id,p_room,me,p_kind,trim(p_body),p_duration)
 on conflict(id) do nothing;
end $$;

create table private.mm_presence_pauses(owner_id uuid primary key references public.vc_profiles(id),until_at timestamptz not null);
create function public.mm_set_presence_pause(p_private boolean,p_until timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user(); pause_until timestamptz:=case when p_private then 'infinity'::timestamptz else coalesce(p_until,now()) end;
begin
 insert into private.mm_presence_pauses values(me,pause_until) on conflict(owner_id) do update set until_at=excluded.until_at;
 delete from public.vc_live_presence where user_id=me;
end $$;
create function private.mm_presence_pause_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.mm_presence_pauses where owner_id=new.user_id and until_at>now()) then return null;end if;
 return new;
end $$;
create trigger mm_presence_pause_guard before insert or update on public.vc_live_presence for each row execute function private.mm_presence_pause_guard();
revoke all on function public.mm_set_presence_pause(boolean,timestamptz) from public;
grant execute on function public.mm_set_presence_pause(boolean,timestamptz) to anon,authenticated;
notify pgrst,'reload schema';
commit;
