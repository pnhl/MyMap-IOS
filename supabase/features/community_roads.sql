begin;
create function public.mm_nearby_reports(p_lat float8,p_lon float8,p_radius integer default 2000) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();result jsonb;
begin
 if p_lat is null or p_lon is null or p_lat not between -85 and 85 or p_lon not between -180 and 180 or p_radius not between 100 and 5000 then raise exception 'invalid_area';end if;
 select coalesce(jsonb_agg(row_to_json(r)),'[]') into result from (
  select d.id,d.payload,d.expires_at,u.display_name,
   (select count(*) from public.mm_road_votes v where v.report_id=d.id and v.confirmed) confirmations,
   (select count(*) from public.mm_road_votes v where v.report_id=d.id and not v.confirmed) rejections
  from public.mm_documents d join public.vc_profiles u on u.id=d.owner_id
  where d.kind='road_report' and d.expires_at>now()
  and abs((d.payload->>'latitude')::float8-p_lat)<=p_radius/111320.0
  and abs((d.payload->>'longitude')::float8-p_lon)<=p_radius/(111320.0*cos(radians(p_lat)))
  order by d.updated_at desc limit 100
 ) r;
 return result;
end $$;
revoke all on function public.mm_nearby_reports(float8,float8,integer) from public;
grant execute on function public.mm_nearby_reports(float8,float8,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
