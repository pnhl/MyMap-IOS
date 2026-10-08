begin;
create table private.mm_chat_cancellations(id uuid primary key,owner_id uuid not null references public.vc_profiles(id),room_id uuid not null references public.mm_rooms(id) on delete cascade,created_at timestamptz not null default now());
revoke all on private.mm_chat_cancellations from public,anon,authenticated;
create function public.mm_cancel_message(p_id uuid,p_room uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user(); existing public.mm_messages; canceled_owner uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
 if not private.mm_room_member(p_room) then raise exception 'not_room_member';end if;
 select * into existing from public.mm_messages where id=p_id;
 if found and (existing.sender_id<>me or existing.room_id<>p_room) then raise exception 'not_sender';end if;
 select owner_id into canceled_owner from private.mm_chat_cancellations where id=p_id;
 if found and canceled_owner<>me then raise exception 'not_sender';end if;
 perform private.mm_rate(me,'chat_cancel',60);
 insert into private.mm_chat_cancellations(id,owner_id,room_id) values(p_id,me,p_room) on conflict(id) do nothing;
 delete from public.mm_messages where id=p_id and sender_id=me;
 delete from public.vc_notifications where payload->>'messageId'=p_id::text;
end $$;
create or replace function public.mm_send_message(p_id uuid,p_room uuid,p_kind text,p_body text,p_duration real default 0) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
 if exists(select 1 from private.mm_chat_cancellations where id=p_id) then raise exception 'message_canceled';end if;
 if not private.mm_room_member(p_room) then raise exception 'not_room_member';end if;
 if p_kind is null or p_kind not in ('text','voice','photo','video') or p_body is null or length(trim(p_body)) not between 1 and 2000 or p_duration is null or p_duration not between 0 and 60 then raise exception 'invalid_message';end if;
 if exists(select 1 from public.mm_messages where id=p_id and sender_id=me and room_id=p_room and kind=p_kind and body=trim(p_body) and duration_seconds=p_duration) then return;end if;
 if exists(select 1 from public.mm_messages where id=p_id) then raise exception 'message_id_conflict';end if;
 perform private.mm_rate(me,'chat_send',40);
 if p_kind<>'text' and(p_body<>p_room::text||'/'||me::text||'/'||p_id::text or not exists(select 1 from storage.objects where bucket_id='mymap-chat' and name=p_body)) then raise exception 'media_not_uploaded';end if;
 insert into public.mm_messages(id,room_id,sender_id,kind,body,duration_seconds) values(p_id,p_room,me,p_kind,trim(p_body),p_duration);
end $$;
create or replace function private.mm_chat_object(p_name text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare room uuid;message uuid;
begin
 begin room:=split_part(p_name,'/',1)::uuid;message:=split_part(p_name,'/',3)::uuid;exception when invalid_text_representation then return false;end;
 return private.mm_room_member(room) and not exists(select 1 from private.mm_chat_cancellations where id=message);
end $$;
create or replace function public.mm_create_room(p_name text,p_members uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();targets uuid[];m uuid;result uuid;
begin
 if p_name is null or length(p_name)>80 then raise exception 'invalid_name';end if;
 targets:=array(select distinct unnest(array_append(coalesce(p_members,'{}'),me)) order by 1);
 if cardinality(targets)<2 or cardinality(targets)>30 or array_position(targets,null) is not null then raise exception 'invalid_members';end if;
 foreach m in array targets loop if not private.mm_friends(me,m) then raise exception 'recipient_not_friend';end if;end loop;
 if cardinality(targets)=2 then
  perform pg_advisory_xact_lock(hashtextextended(array_to_string(targets,','),2));
  select id into result from public.mm_rooms where cardinality(members)=2 and members @> targets and targets @> members limit 1;
  if found then return result;end if;
 end if;
 perform private.mm_rate(me,'chat_room',20);
 insert into public.mm_rooms(owner_id,name,members) values(me,trim(p_name),targets) returning id into result;return result;
end $$;
revoke all on function public.mm_cancel_message(uuid,uuid) from public;
grant execute on function public.mm_cancel_message(uuid,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
