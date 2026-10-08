begin;
create table public.mm_calls(id uuid primary key default gen_random_uuid(),room_id uuid not null references public.mm_rooms(id) on delete cascade,owner_id uuid not null references public.vc_profiles(id),mode text not null check(mode in('voice','video','ptt')),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '4 hours',ended_at timestamptz,last_cleanup timestamptz);
create index mm_calls_room_time on public.mm_calls(room_id,created_at desc);
alter table public.mm_calls enable row level security;
revoke all on public.mm_calls from public,anon,authenticated;
grant select on public.mm_calls to anon,authenticated;
create policy mm_calls_read on public.mm_calls for select to anon,authenticated using(private.mm_room_member(room_id) and not private.mm_blocked(private.mm_user(),owner_id));
create function public.mm_start_call(p_room uuid,p_mode text) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();r public.mm_rooms;result uuid;begin
 if p_mode is null or p_mode not in('voice','video','ptt') then raise exception 'invalid_mode';end if;
 select * into r from public.mm_rooms where id=p_room for update;
 if not found or not(me=any(r.members)) or exists(select 1 from unnest(r.members)m where private.mm_blocked(me,m)) then raise exception 'call_not_allowed';end if;
 select id into result from public.mm_calls where room_id=p_room and ended_at is null and expires_at>now() order by created_at desc limit 1;
 if found then return result;end if;
 perform private.mm_rate(me,'start_call',10);
 insert into public.mm_calls(room_id,owner_id,mode) values(p_room,me,p_mode) returning id into result;
 insert into public.vc_notifications(user_id,type,title,body,payload) select member,'call','Cuộc gọi MyMap',case p_mode when 'video' then 'Mời tham gia cuộc gọi video' when 'ptt' then 'Mời tham gia bộ đàm trực tiếp' else 'Mời tham gia cuộc gọi thoại' end,jsonb_build_object('roomId',p_room,'callId',result) from unnest(r.members) as users(member) where member<>me;
 return result;
end $$;
create function public.mm_call_authorize(p_call uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();c public.mm_calls;r public.mm_rooms;begin
 select * into c from public.mm_calls where id=p_call and ended_at is null and expires_at>now();
 if not found then raise exception 'call_finished';end if;
 select * into r from public.mm_rooms where id=c.room_id;
 if not(me=any(r.members)) or exists(select 1 from unnest(r.members)m where private.mm_blocked(me,m)) then raise exception 'call_not_allowed';end if;
 perform private.mm_rate(me,'call_token',30);
 return jsonb_build_object('identity',me,'name',(select display_name from public.vc_profiles where id=me),'room','mymap-call-'||c.id::text,'callId',c.id,'chatRoom',c.room_id,'mode',c.mode,'expiresAt',c.expires_at);
end $$;
create function public.mm_end_call(p_call uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin
 update public.mm_calls set ended_at=coalesce(ended_at,now()) where id=p_call and(owner_id=me or exists(select 1 from public.mm_rooms where id=mm_calls.room_id and owner_id=me));
 if not found then raise exception 'owner_only';end if;
end $$;
-- Ending a call in SQL is insufficient: connected WebRTC participants must be disconnected.
-- Membership changes close the entire call; remaining members may create a new call.
create function private.mm_call_membership_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin if old.members is distinct from new.members then update public.mm_calls set ended_at=coalesce(ended_at,now()) where room_id=new.id and ended_at is null;end if;return new;end $$;
create trigger mm_call_membership_changed after update on public.mm_rooms for each row execute function private.mm_call_membership_changed();
create function private.mm_call_block_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin update public.mm_calls c set ended_at=coalesce(ended_at,now()) from public.mm_rooms r where c.room_id=r.id and new.owner_id=any(r.members) and new.target_id=any(r.members) and c.ended_at is null;return new;end $$;
create trigger mm_call_block_changed after insert on private.mm_blocks for each row execute function private.mm_call_block_changed();
create table private.mm_call_cleanup_lease(id boolean primary key default true check(id),claimed_at timestamptz not null);
alter table private.mm_call_cleanup_lease enable row level security;
revoke all on private.mm_call_cleanup_lease from public,anon,authenticated;
create function public.mm_call_cleanup_jobs() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 insert into private.mm_call_cleanup_lease values(true,now()) on conflict(id) do update set claimed_at=excluded.claimed_at where mm_call_cleanup_lease.claimed_at<now()-interval '40 seconds';
 if not found then return '[]';end if;
 update public.mm_calls set ended_at=now() where ended_at is null and expires_at<=now();
 select coalesce(jsonb_agg(id),'[]') into result from(select id from public.mm_calls where ended_at is not null and(last_cleanup is null or ended_at>now()-interval '3 minutes') order by ended_at limit 40)q;
 return result;
end $$;
create function public.mm_call_cleanup_done(p_call uuid) returns void language sql security definer set search_path='' as $$
 update public.mm_calls set last_cleanup=now() where id=p_call and ended_at is not null;
$$;
revoke all on function private.mm_call_membership_changed(),private.mm_call_block_changed(),public.mm_call_cleanup_jobs(),public.mm_call_cleanup_done(uuid) from public,anon,authenticated;
grant execute on function public.mm_call_cleanup_jobs(),public.mm_call_cleanup_done(uuid) to service_role;
revoke all on function public.mm_start_call(uuid,text),public.mm_call_authorize(uuid),public.mm_end_call(uuid) from public;
grant execute on function public.mm_start_call(uuid,text),public.mm_call_authorize(uuid),public.mm_end_call(uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
