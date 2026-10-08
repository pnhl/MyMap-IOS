begin;
create function private.mm_validate_catalog_content() returns trigger language plpgsql set search_path='' as $$
declare place jsonb;starts numeric;ends numeric;
begin
 if new.kind not in ('journal','event','review') then return new;end if;
 if jsonb_typeof(new.payload->'name') is distinct from 'string' or length(trim(new.payload->>'name')) not between 1 and 100
 or jsonb_typeof(new.payload->'note') is distinct from 'string' or length(trim(new.payload->>'note')) not between 1 and 4000 then raise exception 'invalid_content';end if;
 place:=new.payload->'place';
 if new.kind in ('event','review') or place is not null and place<>'null'::jsonb then
  if jsonb_typeof(place) is distinct from 'object' or jsonb_typeof(place->'name') is distinct from 'string' or length(trim(place->>'name')) not between 1 and 300
  or jsonb_typeof(place->'latitude') is distinct from 'number' or jsonb_typeof(place->'longitude') is distinct from 'number'
  then raise exception 'invalid_place';end if;
  if (place->>'latitude')::numeric not between -90 and 90 or (place->>'longitude')::numeric not between -180 and 180 then raise exception 'invalid_place';end if;
 end if;
 if new.kind='event' then
  if jsonb_typeof(new.payload->'startsAt') is distinct from 'number' or jsonb_typeof(new.payload->'endsAt') is distinct from 'number' then raise exception 'invalid_event_time';end if;
  starts:=(new.payload->>'startsAt')::numeric;ends:=(new.payload->>'endsAt')::numeric;
  if ends<=starts or ends-starts>604800000 or ends<946684800000 or ends>4102444800000 or new.expires_at is null or abs(extract(epoch from new.expires_at)*1000-ends)>1 then raise exception 'invalid_event_time';end if;
 elsif new.kind='review' then
  if jsonb_typeof(new.payload->'rating') is distinct from 'number' or (new.payload->>'rating')::numeric not in (1,2,3,4,5)
  or jsonb_typeof(new.payload->'visitedAt') is distinct from 'number' then raise exception 'invalid_review';end if;
 elsif jsonb_typeof(new.payload->'at') is distinct from 'number' then raise exception 'invalid_journal_time';
 end if;
 return new;
end $$;
create trigger mm_validate_catalog_content before insert or update on public.mm_documents for each row execute function private.mm_validate_catalog_content();

create function public.mm_nearby_content(p_kind text,p_lat float8,p_lon float8,p_radius integer default 2000) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();result jsonb;
begin
 if p_kind not in ('event','review') or p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 or p_radius not between 100 and 10000 then raise exception 'invalid_area';end if;
 select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) into result from (
  select d.id,d.kind,d.payload,d.updated_at,u.display_name from public.mm_documents d join public.vc_profiles u on u.id=d.owner_id
  where d.kind=p_kind and(d.expires_at is null or d.expires_at>now())
  and jsonb_typeof(d.payload->'place'->'latitude')='number' and jsonb_typeof(d.payload->'place'->'longitude')='number'
  and abs((d.payload->'place'->>'latitude')::float8-p_lat)<=p_radius/111000.0
  and abs((d.payload->'place'->>'longitude')::float8-p_lon)<=p_radius/(111000.0*greatest(0.01,cos(radians(p_lat))))
  order by d.updated_at desc limit 100
 )q;
 return result;
end $$;

create table public.mm_trip_ballots(document_id uuid not null references public.mm_documents(id) on delete cascade,user_id uuid not null references public.vc_profiles(id),stop_id text not null,updated_at timestamptz not null default now(),primary key(document_id,user_id));
alter table public.mm_trip_ballots enable row level security;
create policy mm_trip_ballots_read on public.mm_trip_ballots for select to anon,authenticated using(
 exists(select 1 from public.mm_documents d where d.id=document_id and(d.owner_id=private.mm_user() or private.mm_user()=any(d.members))));
grant select on public.mm_trip_ballots to anon,authenticated;
create function public.mm_trip_vote(p_id uuid,p_stop text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();doc public.mm_documents;
begin
 select * into doc from public.mm_documents where id=p_id and kind='trip' for share;
 if not found or not(doc.owner_id=me or me=any(doc.members)) then raise exception 'not_trip_member';end if;
 if p_stop is null then delete from public.mm_trip_ballots where document_id=p_id and user_id=me;return;end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(doc.payload->'stops','[]'::jsonb)) s where s->>'id'=p_stop) then raise exception 'invalid_stop';end if;
 perform private.mm_rate(me,'trip_vote',30);
 insert into public.mm_trip_ballots(document_id,user_id,stop_id) values(p_id,me,p_stop) on conflict(document_id,user_id) do update set stop_id=excluded.stop_id,updated_at=now();
end $$;
revoke all on function public.mm_nearby_content(text,float8,float8,integer),public.mm_trip_vote(uuid,text) from public;
grant execute on function public.mm_nearby_content(text,float8,float8,integer),public.mm_trip_vote(uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
