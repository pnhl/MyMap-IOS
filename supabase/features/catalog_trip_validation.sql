begin;
create function private.mm_validate_itinerary() returns trigger language plpgsql set search_path='' as $$
declare points jsonb;point jsonb;ids text[]:='{}';
begin
 if new.kind not in ('trip','collection') then return new;end if;
 if jsonb_typeof(new.payload->'name') is distinct from 'string' or length(trim(new.payload->>'name')) not between 1 and 100 then raise exception 'invalid_itinerary';end if;
 if new.kind='trip' then
  if jsonb_typeof(new.payload->'mode') is distinct from 'string' or new.payload->>'mode' not in ('car','motorbike','foot','bike') or jsonb_typeof(new.payload->'startsAt') is distinct from 'number' then raise exception 'invalid_itinerary';end if;
  if (new.payload->>'startsAt')::numeric not between 0 and 4102444800000 then raise exception 'invalid_itinerary';end if;
  points:=new.payload->'stops';
 else points:=new.payload->'places';end if;
 if jsonb_typeof(points) is distinct from 'array' then raise exception 'invalid_itinerary';end if;
 if new.kind='trip' and jsonb_array_length(points) not between 2 and 20 or new.kind='collection' and jsonb_array_length(points)>500 then raise exception 'invalid_itinerary';end if;
 for point in select value from jsonb_array_elements(points) loop
  if jsonb_typeof(point) is distinct from 'object' or jsonb_typeof(point->'id') is distinct from 'string' or length(trim(point->>'id')) not between 1 and 100
  or jsonb_typeof(point->'name') is distinct from 'string' or length(trim(point->>'name')) not between 1 and 300
  or jsonb_typeof(point->'latitude') is distinct from 'number' or jsonb_typeof(point->'longitude') is distinct from 'number' then raise exception 'invalid_itinerary_point';end if;
  if (point->>'id')=any(ids) or (point->>'latitude')::numeric not between -90 and 90 or (point->>'longitude')::numeric not between -180 and 180 then raise exception 'invalid_itinerary_point';end if;
  ids:=array_append(ids,point->>'id');
  if new.kind='trip' then
   if jsonb_typeof(point->'stayMinutes') is distinct from 'number' then raise exception 'invalid_itinerary_point';end if;
   if (point->>'stayMinutes')::numeric not between 0 and 1440 then raise exception 'invalid_itinerary_point';end if;
  elsif jsonb_typeof(point->'note') is distinct from 'string' or length(point->>'note')>2000 then raise exception 'invalid_itinerary_point';end if;
 end loop;
 return new;
end $$;
create trigger mm_validate_itinerary before insert or update on public.mm_documents for each row execute function private.mm_validate_itinerary();
create function private.mm_prune_trip_ballots() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='trip' and new.payload->'stops' is distinct from old.payload->'stops' then
  delete from public.mm_trip_ballots b where b.document_id=new.id and not exists(select 1 from jsonb_array_elements(new.payload->'stops') p where p->>'id'=b.stop_id);
 end if;
 return new;
end $$;
create trigger mm_prune_trip_ballots after update of payload on public.mm_documents for each row execute function private.mm_prune_trip_ballots();
revoke all on function private.mm_validate_itinerary(),private.mm_prune_trip_ballots() from public;
commit;
