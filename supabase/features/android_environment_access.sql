begin;
create function public.mm_environment_access() returns void language plpgsql security definer set search_path='' as $$
begin perform private.mm_rate(private.mm_user(),'environment',30);end $$;
revoke all on function public.mm_environment_access() from public;
grant execute on function public.mm_environment_access() to anon,authenticated;
commit;
