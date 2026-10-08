begin;
create table private.mm_global_privacy(owner_id uuid primary key references public.vc_profiles(id),mode text not null check(mode in ('precise','fuzzy','frozen')),latitude float8,longitude float8);
create function public.mm_set_global_privacy(p_mode text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();lat float8;lon float8;
begin
 if p_mode is null or p_mode not in ('precise','fuzzy','frozen') then raise exception 'invalid_mode';end if;
 select latitude,longitude into lat,lon from public.vc_live_presence where user_id=me;
 insert into private.mm_global_privacy values(me,p_mode,lat,lon) on conflict(owner_id) do update set mode=excluded.mode,latitude=excluded.latitude,longitude=excluded.longitude;
end $$;
create or replace function private.mm_precise_for(p_owner uuid,p_recipient uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select mode='precise' from private.mm_global_privacy where owner_id=p_owner),true)
 and coalesce((select mode='precise' from private.mm_friend_privacy where owner_id=p_owner and recipient_id=p_recipient),true);
$$;
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
 left join private.mm_friend_privacy per on per.owner_id=p.user_id and per.recipient_id=me
 left join private.mm_global_privacy global on global.owner_id=p.user_id
 left join lateral(select case when global.mode='frozen' or per.mode='frozen' then 'frozen' when global.mode='fuzzy' or per.mode='fuzzy' then 'fuzzy' else 'precise' end mode,
 case when global.mode='frozen' then global.latitude else per.latitude end latitude,
 case when global.mode='frozen' then global.longitude else per.longitude end longitude) g on true
 where p.user_id<>me and p.expires_at>now() and (g.mode is distinct from 'frozen' or g.latitude is not null)
 and exists(select 1 from public.vc_connections c where c.status='accepted' and c.share_exact_location and
 ((c.requester_id=me and c.addressee_id=p.user_id) or(c.addressee_id=me and c.requester_id=p.user_id)));
 return result;
end $$;


revoke all on function public.mm_set_global_privacy(text) from public;
grant execute on function public.mm_set_global_privacy(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
