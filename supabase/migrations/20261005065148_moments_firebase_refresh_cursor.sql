begin;
-- Claim-less Firebase tokens authenticate REST requests, but Realtime requires
-- a role claim. A small authenticated cursor avoids failed websocket retries.
create function public.mm_cursor() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();result jsonb;
begin
 with visible as materialized (
 select m.id,m.created_at from public.mm_moments m
 where (m.owner_id=me or m.audience @> array[me]) and private.mm_view(m.id)
 ), replies as(select r.created_at from public.mm_replies r join visible m on m.id=r.moment_id)
 select jsonb_build_object('moments',(select count(*) from visible),'latest',(select max(created_at) from visible),
 'replies',(select count(*) from replies),'last_reply',(select max(created_at) from replies)) into result;
 return result;
end $$;
revoke all on function public.mm_cursor() from public;
grant execute on function public.mm_cursor() to authenticated,anon;
do $$ declare t text;begin
 foreach t in array array['mm_moments','mm_replies'] loop
  if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
   execute format('alter publication supabase_realtime drop table public.%I',t);
  end if;
 end loop;
end $$;
commit;
