begin;
create or replace function public.mm_call_authorize(p_call uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();c public.mm_calls;r public.mm_rooms;begin
 select * into c from public.mm_calls where id=p_call and ended_at is null and expires_at>now();
 if not found then raise exception 'call_finished';end if;
 select * into r from public.mm_rooms where id=c.room_id;
 if not(me=any(r.members)) or exists(select 1 from unnest(r.members)m where private.mm_blocked(me,m)) then raise exception 'call_not_allowed';end if;
 perform private.mm_rate(me,'call_token',30);
 return jsonb_build_object('identity',me,'name',(select display_name from public.vc_profiles where id=me),'room','mymap-call-'||c.id::text,'callId',c.id,'chatRoom',c.room_id,'mode',c.mode,'expiresAt',c.expires_at,'canEnd',me=c.owner_id or me=r.owner_id);
end $$;
commit;
