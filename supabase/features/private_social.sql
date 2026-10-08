begin;
create table private.mm_map_notes(id uuid primary key default gen_random_uuid(),sender_id uuid not null references public.vc_profiles(id),target_id uuid references public.vc_profiles(id),message text not null,emoji text not null,latitude float8 not null,longitude float8 not null,created_at timestamptz not null default now());
revoke all on private.mm_map_notes from public,anon,authenticated;
create index mm_map_notes_time on private.mm_map_notes(created_at desc);
create function public.mm_post_map_note(p_message text,p_emoji text,p_lat float8,p_lon float8,p_target uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();note private.mm_map_notes;sender public.vc_profiles;
begin
 if p_message is null or length(trim(p_message)) not between 1 and 500 or p_emoji is null or length(p_emoji) not between 1 and 8 or p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then raise exception 'invalid_note';end if;
 if p_target is not null and not private.mm_friends(me,p_target) then raise exception 'recipient_not_friend';end if;
 if exists(select 1 from private.mm_presence_pauses where owner_id=me and until_at>now()) then raise exception 'sharing_paused';end if;
 perform private.mm_rate(me,'map_note',15);
 insert into private.mm_map_notes(sender_id,target_id,message,emoji,latitude,longitude) values(me,p_target,trim(p_message),p_emoji,p_lat,p_lon) returning * into note;
 select * into sender from public.vc_profiles where id=me;
 return jsonb_build_object('id',note.id,'userId',me,'userName',sender.display_name,'avatarUrl',sender.avatar_path,'message',note.message,'emoji',note.emoji,'latitude',note.latitude,'longitude',note.longitude,'createdAt',extract(epoch from note.created_at)*1000);
end $$;
create function public.mm_map_notes() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();result jsonb;
begin
 select coalesce(jsonb_agg(q.data),'[]'::jsonb) into result from(
 select jsonb_build_object('id',n.id,'userId',n.sender_id,'userName',p.display_name,'avatarUrl',p.avatar_path,'message',n.message,'emoji',n.emoji,
 'latitude',case when n.sender_id=me then n.latitude when g.mode='frozen' then g.latitude when f.mode='frozen' then f.latitude when g.mode='fuzzy' or f.mode='fuzzy' then round(n.latitude::numeric,2)::float8 else n.latitude end,
 'longitude',case when n.sender_id=me then n.longitude when g.mode='frozen' then g.longitude when f.mode='frozen' then f.longitude when g.mode='fuzzy' or f.mode='fuzzy' then round(n.longitude::numeric,2)::float8 else n.longitude end,
 'createdAt',extract(epoch from n.created_at)*1000) as data
 from private.mm_map_notes n join public.vc_profiles p on p.id=n.sender_id
 left join private.mm_global_privacy g on g.owner_id=n.sender_id left join private.mm_friend_privacy f on f.owner_id=n.sender_id and f.recipient_id=me
 where n.created_at>now()-interval '30 minutes'
 and(n.sender_id=me or (n.target_id is null or n.target_id=me) and private.mm_friends(me,n.sender_id)
 and not exists(select 1 from private.mm_presence_pauses where owner_id=n.sender_id and until_at>now())
 and(g.mode is distinct from 'frozen' or g.latitude is not null) and(f.mode is distinct from 'frozen' or f.latitude is not null))
 order by n.created_at desc limit 30
 )q;
 return result;
end $$;
create function public.mm_friend_interaction(p_target uuid,p_type text,p_metadata jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();sender public.vc_profiles;event jsonb;
begin
 if p_type not in ('peek','heart','invite','buzz','emoji_bomb') or p_type is null or not private.mm_friends(me,p_target) or me=p_target then raise exception 'invalid_interaction';end if;
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>2000 then raise exception 'invalid_metadata';end if;
 perform private.mm_rate(me,'friend_interaction',30);
 select * into sender from public.vc_profiles where id=me;
 event:=jsonb_build_object('id',gen_random_uuid(),'senderId',me,'senderName',sender.display_name,'targetFriendId',p_target,'type',p_type,'timestamp',extract(epoch from now())*1000,
 'metadata',jsonb_build_object('targetName',left(p_metadata->>'targetName',100),'activity',left(p_metadata->>'activity',100),'note',left(p_metadata->>'note',500),'emoji',left(p_metadata->>'emoji',8),'count',case when jsonb_typeof(p_metadata->'count')='number' then least(50,greatest(1,(p_metadata->>'count')::numeric)) else 1 end));
 insert into public.vc_notifications(user_id,type,title,body,payload) values(p_target,'friend_interaction','Tương tác từ '||coalesce(sender.display_name,'Bạn bè'),case p_type when 'heart' then 'Gửi bạn một trái tim' when 'buzz' then 'Gửi bạn một lần rung' when 'invite' then 'Mời bạn gặp mặt' when 'peek' then 'Đang xem vị trí bạn chia sẻ' else 'Gửi bạn một hiệu ứng biểu tượng' end,event);
 return event;
end $$;
create function public.mm_friend_interactions() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();result jsonb;
begin
 select coalesce(jsonb_agg(q.payload),'[]'::jsonb) into result from(select payload from public.vc_notifications where user_id=me and type='friend_interaction' and created_at>now()-interval '2 minutes' order by created_at asc limit 100)q;return result;
end $$;
revoke all on function public.mm_post_map_note(text,text,float8,float8,uuid),public.mm_map_notes(),public.mm_friend_interaction(uuid,text,jsonb),public.mm_friend_interactions() from public;
grant execute on function public.mm_post_map_note(text,text,float8,float8,uuid),public.mm_map_notes(),public.mm_friend_interaction(uuid,text,jsonb),public.mm_friend_interactions() to anon,authenticated;
notify pgrst,'reload schema';
commit;
