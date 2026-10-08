-- Replace __MYMAP_ANON_KEY__ with the existing project's legacy anon key when applying.
-- This is a public API key, not the LiveKit secret or service-role key.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('mymap-livekit-cleanup','* * * * *',$job$
 select net.http_post(url:='https://uwlxysystowwnfvdmfzo.supabase.co/functions/v1/mymap-call-maintenance',headers:=jsonb_build_object('Content-Type','application/json','apikey','__MYMAP_ANON_KEY__','Authorization','Bearer __MYMAP_ANON_KEY__'),body:='{}'::jsonb,timeout_milliseconds:=15000);
$job$);
commit;
