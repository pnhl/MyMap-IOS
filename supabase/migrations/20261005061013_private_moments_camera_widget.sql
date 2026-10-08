begin;
-- Firebase tokens can use the anon role; identity is verified before every RPC.
create function private.mm_user() returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not private.vc_is_trusted_request() then raise exception 'not_authenticated' using errcode='28000'; end if;
 return private.vc_current_user_id();
end $$;
create function private.mm_friends(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select a=b or exists(select 1 from public.vc_connections c where c.status='accepted' and
 ((c.requester_id=a and c.addressee_id=b) or (c.requester_id=b and c.addressee_id=a)));
$$;
create table public.mm_groups(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.vc_profiles(id),
 name text not null check(length(name) between 1 and 80), members uuid[] not null,
 created_at timestamptz not null default now(), check(cardinality(members) between 1 and 30)
);
create table public.mm_moments(
 id uuid primary key, owner_id uuid not null references public.vc_profiles(id),
 kind text not null check(kind in ('photo','video')), media_path text not null unique, cover_path text not null,
 caption text not null default '' check(length(caption)<=500), captured_at timestamptz not null,
 duration_seconds real not null default 0 check(duration_seconds between 0 and 15),
 latitude double precision check(latitude between -90 and 90), longitude double precision check(longitude between -180 and 180),
 audience uuid[] not null default '{}', group_id uuid references public.mm_groups(id),
 created_at timestamptz not null default now(), check(cardinality(audience)<=30),
 check((latitude is null)=(longitude is null))
);
create index mm_moments_owner_time on public.mm_moments(owner_id,captured_at desc);
create index mm_moments_group_time on public.mm_moments(group_id,captured_at desc);
create index mm_moments_audience on public.mm_moments using gin(audience);
create index mm_groups_owner on public.mm_groups(owner_id);
create table public.mm_replies(
 id uuid primary key, moment_id uuid not null references public.mm_moments(id) on delete cascade,
 owner_id uuid not null references public.vc_profiles(id), kind text not null check(kind in ('text','emoji','voice')),
 body text not null check(length(body) between 1 and 500), created_at timestamptz not null default now()
);
create index mm_replies_moment_time on public.mm_replies(moment_id,created_at);
create index mm_replies_owner on public.mm_replies(owner_id);
create function private.mm_view(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();
begin
 return exists(select 1 from public.mm_moments m where m.id=p_id and
 (m.owner_id=me or (me=any(m.audience) and private.mm_friends(me,m.owner_id) and
 (m.group_id is null or exists(select 1 from public.mm_groups g where g.id=m.group_id and me=any(g.members))))));
end $$;
alter table public.mm_groups enable row level security;
alter table public.mm_moments enable row level security;
alter table public.mm_replies enable row level security;
grant select on public.mm_groups,public.mm_moments,public.mm_replies to authenticated,anon;
create policy mm_group_read on public.mm_groups for select to authenticated,anon using(private.mm_user()=any(members));
create policy mm_moment_read on public.mm_moments for select to authenticated,anon using(private.mm_view(id));
create policy mm_reply_read on public.mm_replies for select to authenticated,anon using(private.mm_view(moment_id));
create function public.mm_identity() returns uuid language sql security definer set search_path='' as $$ select private.mm_user(); $$;
create function public.mm_create_group(p_name text,p_members uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user(); result uuid; member uuid;
begin
 foreach member in array p_members loop
  if not private.mm_friends(me,member) then raise exception 'recipient_not_friend'; end if;
 end loop;
 insert into public.mm_groups(owner_id,name,members) values(me,trim(p_name),array(select distinct unnest(p_members||array[me]))) returning id into result;
 return result;
end $$;
create function public.mm_leave_group(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();
begin
 if exists(select 1 from public.mm_groups where id=p_id and owner_id=me) then raise exception 'owner_cannot_leave'; end if;
 update public.mm_groups set members=array_remove(members,me) where id=p_id and me=any(members);
end $$;
create function public.mm_publish(p_id uuid,p_kind text,p_caption text,p_captured_at timestamptz,
 p_duration real,p_recipients uuid[],p_group uuid default null,p_lat double precision default null,p_lon double precision default null)
 returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user(); targets uuid[]:=coalesce(p_recipients,'{}'); member uuid; root text:=me::text||'/'||p_id::text; existing public.mm_moments;
begin
 select * into existing from public.mm_moments where id=p_id;
 if found then
  if existing.owner_id<>me then raise exception 'not_owner'; end if;
  return p_id; -- Retried uploads cannot widen the original audience.
 end if;
 if p_group is not null then
  select members into targets from public.mm_groups where id=p_group and me=any(members);
  if targets is null then raise exception 'not_group_member'; end if;
 end if;
 targets:=array(select distinct unnest(array_remove(targets,me)));
 foreach member in array targets loop
  if not private.mm_friends(me,member) then raise exception 'recipient_not_friend'; end if;
 end loop;
 if not exists(select 1 from storage.objects where bucket_id='mymap-moments' and name=root||case when p_kind='photo' then '/photo.jpg' else '/video.mp4' end) then raise exception 'media_not_uploaded'; end if;
 insert into public.mm_moments(id,owner_id,kind,media_path,cover_path,caption,captured_at,duration_seconds,audience,group_id,latitude,longitude)
 values(p_id,me,p_kind,root||case when p_kind='photo' then '/photo.jpg' else '/video.mp4' end,
 root||case when p_kind='photo' then '/photo.jpg' else '/cover.jpg' end,p_caption,p_captured_at,p_duration,targets,p_group,p_lat,p_lon);
 return p_id;
end $$;
create function public.mm_feed(p_group uuid default null,p_author uuid default null,p_limit integer default 100)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user(); result jsonb;
begin
 select coalesce(jsonb_agg(row_data order by captured_at desc),'[]') into result from(
 select m.captured_at,jsonb_build_object('id',m.id,'owner_id',m.owner_id,'kind',m.kind,'media_path',m.media_path,
 'cover_path',m.cover_path,'caption',m.caption,'captured_at',m.captured_at,'duration_seconds',m.duration_seconds,
 'latitude',m.latitude,'longitude',m.longitude,'group_id',m.group_id,'author_name',coalesce(p.display_name,'MyMap')) as row_data
 from public.mm_moments m join public.vc_profiles p on p.id=m.owner_id
 where private.mm_view(m.id) and (p_group is null or m.group_id=p_group) and (p_author is null or m.owner_id=p_author)
 order by m.captured_at desc limit least(greatest(p_limit,1),100)) items;
 return result;
end $$;
create function public.mm_reply(p_id uuid,p_moment uuid,p_kind text,p_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();
begin
 if not private.mm_view(p_moment) then raise exception 'not_allowed'; end if;
 if p_kind='voice' and p_body<>me::text||'/'||p_moment::text||'/'||p_id::text||'.m4a' then raise exception 'invalid_voice_path'; end if;
 if exists(select 1 from public.mm_replies where id=p_id and owner_id<>me) then raise exception 'not_owner'; end if;
 insert into public.mm_replies(id,moment_id,owner_id,kind,body) values(p_id,p_moment,me,p_kind,p_body) on conflict(id) do nothing;
 return p_id;
end $$;
create function public.mm_delete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();
begin
 if not exists(select 1 from public.mm_moments where id=p_id and owner_id=me) then raise exception 'not_owner'; end if;
 delete from public.mm_moments where id=p_id and owner_id=me;
end $$;
create function private.mm_object_read(p_path text) returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();
begin
 return split_part(p_path,'/',1)=me::text or exists(select 1 from public.mm_moments m where
 (m.media_path=p_path or m.cover_path=p_path) and private.mm_view(m.id)) or
 exists(select 1 from public.mm_replies r where r.kind='voice' and r.body=p_path and private.mm_view(r.moment_id));
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('mymap-moments','mymap-moments',false,26214400,array['image/jpeg','video/mp4','audio/mp4','audio/x-m4a']) on conflict(id) do nothing;
create policy mm_storage_read on storage.objects for select to authenticated,anon using(bucket_id='mymap-moments' and private.mm_object_read(name));
create policy mm_storage_insert on storage.objects for insert to authenticated,anon with check(bucket_id='mymap-moments' and split_part(name,'/',1)=private.mm_user()::text);
create policy mm_storage_update on storage.objects for update to authenticated,anon using(bucket_id='mymap-moments' and split_part(name,'/',1)=private.mm_user()::text) with check(bucket_id='mymap-moments' and split_part(name,'/',1)=private.mm_user()::text);
create policy mm_storage_delete on storage.objects for delete to authenticated,anon using(bucket_id='mymap-moments' and split_part(name,'/',1)=private.mm_user()::text);
-- No implicit PUBLIC execution, including helper functions invoked by policies.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('private','public') and p.proname like 'mm_%' loop
 execute format('revoke all on function %s from public',f.signature);
 execute format('grant execute on function %s to authenticated,anon',f.signature);
 end loop;
end $$;
commit;
