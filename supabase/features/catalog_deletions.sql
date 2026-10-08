begin;
create table private.mm_rate_limits(owner_id uuid not null,bucket text not null,window_at timestamptz not null,counter integer not null,primary key(owner_id,bucket));
create function private.mm_rate(p_owner uuid,p_bucket text,p_max integer) returns void language plpgsql security definer set search_path='' as $$
declare c integer;begin
 insert into private.mm_rate_limits values(p_owner,p_bucket,now(),1)
 on conflict(owner_id,bucket) do update set
 counter=case when mm_rate_limits.window_at<now()-interval '1 minute' then 1 else mm_rate_limits.counter+1 end,
 window_at=case when mm_rate_limits.window_at<now()-interval '1 minute' then now() else mm_rate_limits.window_at end
 returning counter into c;
 if c>p_max then raise exception 'rate_limited';end if;
end $$;
create table private.mm_doc_tombstones(id uuid primary key,owner_id uuid not null,members uuid[] not null default '{}',deleted_at timestamptz not null default now());
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
 perform private.mm_rate(me,'document',30);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if exists(select 1 from private.mm_doc_tombstones where id=p_id) then raise exception 'document_deleted';end if;
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


create or replace function public.mm_doc_delete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();d public.mm_documents;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into d from public.mm_documents where id=p_id for update;
 if found and d.owner_id<>me then raise exception 'not_owner';end if;
 if exists(select 1 from private.mm_doc_tombstones where id=p_id and owner_id<>me) then raise exception 'not_owner';end if;
 insert into private.mm_doc_tombstones(id,owner_id,members) values(p_id,me,coalesce(d.members,'{}')) on conflict(id) do nothing;
 delete from public.mm_documents where id=p_id and owner_id=me;
end $$;
create function public.mm_doc_deletions() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();result jsonb;begin
 select coalesce(jsonb_agg(id),'[]') into result from private.mm_doc_tombstones where owner_id=me or me=any(members);
 return result;
end $$;
revoke all on function public.mm_doc_deletions() from public;
grant execute on function public.mm_doc_deletions() to anon,authenticated;
notify pgrst,'reload schema';
commit;
