begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('mymap-avatars','mymap-avatars',false,2097152,array['image/jpeg']) on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/jpeg'];
create function private.mm_avatar_write(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(p_name~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$' and split_part(p_name,'/',1)=private.mm_user()::text,false);
$$;
create function private.mm_avatar_read(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select private.mm_avatar_write(p_name) or exists(select 1 from public.vc_profiles p where p.avatar_path=p_name and private.mm_visible('profile',p.id) and not private.mm_blocked(private.mm_user(),p.id) and (private.mm_friends(private.mm_user(),p.id) or exists(select 1 from private.mm_social_settings s where s.owner_id=p.id and s.is_public)));
$$;
revoke all on function private.mm_avatar_write(text),private.mm_avatar_read(text) from public;
grant execute on function private.mm_avatar_write(text),private.mm_avatar_read(text) to anon,authenticated;
create policy mm_avatar_read on storage.objects for select to anon,authenticated using(bucket_id='mymap-avatars' and private.mm_avatar_read(name));
create policy mm_avatar_insert on storage.objects for insert to anon,authenticated with check(bucket_id='mymap-avatars' and private.mm_avatar_write(name));
create policy mm_avatar_delete on storage.objects for delete to anon,authenticated using(bucket_id='mymap-avatars' and private.mm_avatar_write(name));
-- Restrict profile mutations to owned rows; raw UPDATE must not attach another person's media.
revoke insert,delete,truncate,references,trigger on public.vc_profiles from anon,authenticated;
drop policy if exists vc_profiles_select_connected on public.vc_profiles;
create policy vc_profiles_read_connected on public.vc_profiles for select to anon,authenticated using(id=private.mm_user() or (private.mm_friends(private.mm_user(),id) and private.mm_visible('profile',id)));
create function private.mm_profile_avatar_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.avatar_path is distinct from old.avatar_path and new.avatar_path is not null and (not private.mm_avatar_write(new.avatar_path) or not exists(select 1 from storage.objects where bucket_id='mymap-avatars' and name=new.avatar_path)) then raise exception 'invalid_avatar';end if;
 return new;
end $$;
create trigger mm_profile_avatar_guard before update of avatar_path on public.vc_profiles for each row execute function private.mm_profile_avatar_guard();
revoke all on function private.mm_profile_avatar_guard() from public;
drop function public.mm_profile_update(text,text);
create function public.mm_profile_update(p_name text,p_bio text,p_avatar text default null,p_update_avatar boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin
 if p_name is null or length(trim(p_name)) not between 1 and 80 or p_bio is null or length(trim(p_bio))>500 or p_update_avatar is null then raise exception 'invalid_profile';end if;
 perform private.mm_rate(me,'profile_update',10);
 update public.vc_profiles set display_name=trim(p_name),bio=trim(p_bio),avatar_path=case when p_update_avatar then p_avatar else avatar_path end,updated_at=now() where id=me;
end $$;
create or replace function public.mm_profile_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin return(select jsonb_build_object('name',display_name,'bio',bio,'id',id,'avatar_path',avatar_path) from public.vc_profiles where id=me);end $$;
revoke all on function public.mm_profile_update(text,text,text,boolean) from public;
grant execute on function public.mm_profile_update(text,text,text,boolean) to anon,authenticated;
alter function public.mm_social_state() rename to mm_social_state_without_id;
alter function public.mm_social_state_without_id() set schema private;
revoke all on function private.mm_social_state_without_id() from public,anon,authenticated;
create function public.mm_social_state() returns jsonb language sql stable security definer set search_path='' as $$select private.mm_social_state_without_id()||jsonb_build_object('profileId',private.mm_user());$$;
revoke all on function public.mm_social_state() from public;
grant execute on function public.mm_social_state() to anon,authenticated;
commit;
