begin;

-- Supabase assigns the `anon` database role when a valid Firebase ID token
-- does not contain a custom `role` claim. Firebase Cloud Functions require a
-- Blaze project, so support that documented fallback without weakening RLS:
-- only JWTs from this exact Firebase project (or native Supabase sessions)
-- are accepted by MyMap policies and identity-aware RPCs.
create or replace function private.vc_is_trusted_request()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when coalesce(auth.jwt() ->> 'sub', '') = '' then false
    when auth.jwt() ->> 'iss' = 'https://uwlxysystowwnfvdmfzo.supabase.co/auth/v1'
      then auth.jwt() ->> 'role' = 'authenticated'
    when auth.jwt() ->> 'iss' = 'https://securetoken.google.com/mymap-a3ae4'
      then auth.jwt() ->> 'aud' = 'mymap-a3ae4'
    else false
  end
$function$;

revoke all on function private.vc_is_trusted_request() from public;
grant usage on schema private to authenticated, anon;
grant execute on function private.vc_is_trusted_request() to authenticated, anon;
grant execute on function private.vc_current_user_id() to authenticated, anon;

-- Existing policies were authored for Supabase's authenticated role. Extend
-- those same policies to Firebase's claim-less `anon` role while preserving
-- every other role already listed on each policy.
do $migration$
declare
  item record;
  role_list text;
begin
  for item in
    select schemaname, tablename, policyname, roles::text[] as roles
    from pg_policies
    where schemaname = 'public'
      and tablename like 'vc\_%' escape '\'
      and 'authenticated' = any(roles::text[])
      and not ('anon' = any(roles::text[]))
  loop
    select string_agg(quote_ident(role_name), ', ' order by role_name)
      into role_list
    from (
      select distinct unnest(item.roles || array['anon']) as role_name
    ) role_names;

    execute format(
      'alter policy %I on %I.%I to %s',
      item.policyname,
      item.schemaname,
      item.tablename,
      role_list
    );
  end loop;
end
$migration$;

-- A restrictive policy is added to every RLS-enabled MyMap table. Even if a
-- future permissive policy accidentally includes anon, a publishable key
-- without a valid Firebase JWT still cannot read or mutate application data.
do $migration$
declare
  item record;
begin
  for item in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and c.relname like 'vc\_%' escape '\'
  loop
    execute format(
      'drop policy if exists vc_trusted_identity_guard on %I.%I',
      item.schema_name,
      item.table_name
    );
    execute format(
      'create policy vc_trusted_identity_guard on %I.%I as restrictive for all to authenticated, anon using (private.vc_is_trusted_request()) with check (private.vc_is_trusted_request())',
      item.schema_name,
      item.table_name
    );
  end loop;
end
$migration$;

-- Match the privileges already assigned to authenticated. Base tables are
-- eligible only when RLS is enabled; views remain protected by
-- security_invoker and the guarded underlying tables.
do $migration$
declare
  item record;
begin
  for item in
    select
      grants.table_schema,
      grants.table_name,
      string_agg(distinct grants.privilege_type, ', ' order by grants.privilege_type) as privileges
    from information_schema.role_table_grants grants
    join pg_class relation on relation.relname = grants.table_name
    join pg_namespace namespace
      on namespace.oid = relation.relnamespace
     and namespace.nspname = grants.table_schema
    where grants.grantee = 'authenticated'
      and grants.table_schema = 'public'
      and grants.table_name like 'vc\_%' escape '\'
      and (relation.relkind in ('v', 'm') or relation.relrowsecurity)
    group by grants.table_schema, grants.table_name
  loop
    execute format(
      'grant %s on table %I.%I to anon',
      item.privileges,
      item.table_schema,
      item.table_name
    );
  end loop;
end
$migration$;

-- PostgREST requires EXECUTE for RPC discovery. Every security-definer MyMap
-- RPC has already been verified to resolve vc_current_user_id(), which rejects
-- requests without a trusted Firebase/Supabase subject.
do $migration$
declare
  item record;
  function_signature text;
begin
  for item in
    select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname like 'vc\_%' escape '\'
  loop
    function_signature := format(
      '%I.%I(%s)',
      item.schema_name,
      item.proname,
      item.arguments
    );
    execute 'revoke execute on function ' || function_signature || ' from public';
    execute 'grant execute on function ' || function_signature || ' to authenticated, anon';
  end loop;
end
$migration$;

-- Fail closed if the fallback role is only partially configured.
do $migration$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename like 'vc\_%' escape '\'
      and 'authenticated' = any(roles::text[])
      and not ('anon' = any(roles::text[]))
  ) then
    raise exception 'Some MyMap authenticated policies do not include the Firebase fallback role';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and c.relname like 'vc\_%' escape '\'
      and not exists (
        select 1
        from pg_policy policy
        where policy.polrelid = c.oid
          and policy.polname = 'vc_trusted_identity_guard'
          and not policy.polpermissive
      )
  ) then
    raise exception 'Some MyMap RLS tables are missing the trusted identity guard';
  end if;
end
$migration$;

commit;
