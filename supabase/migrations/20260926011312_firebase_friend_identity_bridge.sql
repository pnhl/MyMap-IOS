begin;

-- Firebase Authentication uses string subjects, while the original MyMap
-- schema stores UUID user ids linked to auth.users. Keep UUIDs internally and
-- map each external identity to a stable profile id so existing friendships
-- can survive the authentication migration.

insert into public.vc_profiles (id, display_name, avatar_path)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Người dùng'
  ),
  coalesce(
    nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(u.raw_user_meta_data ->> 'picture', '')
  )
from auth.users u
on conflict (id) do nothing;

alter table public.vc_profiles
  drop constraint if exists vc_profiles_id_fkey;

-- Repoint every MyMap user foreign key from auth.users to vc_profiles. This
-- retains the existing UUID data model without requiring Firebase users to be
-- inserted into Supabase's protected auth schema.
do $migration$
declare
  item record;
  replacement text;
begin
  for item in
    select
      n.nspname as schema_name,
      t.relname as table_name,
      c.conname as constraint_name,
      pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and n.nspname = 'public'
      and t.relname like 'vc\_%' escape '\'
      and t.relname <> 'vc_profiles'
  loop
    replacement := replace(
      item.definition,
      'REFERENCES auth.users(id)',
      'REFERENCES public.vc_profiles(id)'
    );
    if replacement = item.definition then
      raise exception 'Unable to rewrite %.% constraint %',
        item.schema_name, item.table_name, item.constraint_name;
    end if;

    execute format(
      'alter table %I.%I drop constraint %I',
      item.schema_name,
      item.table_name,
      item.constraint_name
    );
    execute format(
      'alter table %I.%I add constraint %I %s',
      item.schema_name,
      item.table_name,
      item.constraint_name,
      replacement
    );
  end loop;
end
$migration$;

create table if not exists private.vc_external_identities (
  issuer text not null,
  subject text not null,
  user_id uuid not null references public.vc_profiles(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (issuer, subject),
  unique (issuer, user_id)
);

alter table private.vc_external_identities enable row level security;
revoke all on table private.vc_external_identities from public, anon, authenticated;

insert into private.vc_external_identities (issuer, subject, user_id, email)
select
  'https://uwlxysystowwnfvdmfzo.supabase.co/auth/v1',
  u.id::text,
  u.id,
  lower(u.email)
from auth.users u
on conflict (issuer, subject) do update
set email = excluded.email,
    updated_at = now();

create or replace function private.vc_current_user_id()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  claims jsonb := auth.jwt();
  token_issuer text := claims ->> 'iss';
  token_subject text := claims ->> 'sub';
  token_email text := lower(nullif(claims ->> 'email', ''));
  resolved_user_id uuid;
  display_name text;
  avatar_path text;
begin
  if token_subject is null or token_subject = '' then
    raise exception using message = 'not_authenticated', errcode = '28000';
  end if;

  if token_issuer not in (
    'https://uwlxysystowwnfvdmfzo.supabase.co/auth/v1',
    'https://securetoken.google.com/mymap-a3ae4'
  ) then
    raise exception using message = 'invalid_auth_issuer', errcode = '28000';
  end if;

  -- Native Supabase sessions already use the canonical UUID.
  if token_issuer = 'https://uwlxysystowwnfvdmfzo.supabase.co/auth/v1'
     and token_subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return token_subject::uuid;
  end if;

  select identity.user_id
    into resolved_user_id
  from private.vc_external_identities identity
  where identity.issuer = token_issuer
    and identity.subject = token_subject;

  if resolved_user_id is not null then
    return resolved_user_id;
  end if;

  -- Serialize first-login provisioning for this external identity.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(token_issuer || ':' || token_subject, 0)
  );

  select identity.user_id
    into resolved_user_id
  from private.vc_external_identities identity
  where identity.issuer = token_issuer
    and identity.subject = token_subject;

  if resolved_user_id is not null then
    return resolved_user_id;
  end if;

  -- Preserve existing friendships when the Firebase account uses the same
  -- verified email as the earlier Supabase account.
  if token_email is not null and coalesce((claims ->> 'email_verified')::boolean, false) then
    select u.id
      into resolved_user_id
    from auth.users u
    where lower(u.email) = token_email
    order by u.created_at
    limit 1;
  end if;

  resolved_user_id := coalesce(resolved_user_id, gen_random_uuid());
  display_name := coalesce(
    nullif(claims ->> 'name', ''),
    nullif(claims ->> 'display_name', ''),
    nullif(split_part(coalesce(token_email, ''), '@', 1), ''),
    'Người dùng'
  );
  avatar_path := coalesce(
    nullif(claims ->> 'picture', ''),
    nullif(claims ->> 'avatar_url', '')
  );

  insert into public.vc_profiles (id, display_name, avatar_path)
  values (resolved_user_id, display_name, avatar_path)
  on conflict (id) do update
  set display_name = coalesce(public.vc_profiles.display_name, excluded.display_name),
      avatar_path = coalesce(public.vc_profiles.avatar_path, excluded.avatar_path),
      updated_at = now();

  insert into private.vc_external_identities (issuer, subject, user_id, email)
  values (token_issuer, token_subject, resolved_user_id, token_email);

  return resolved_user_id;
end
$function$;

revoke all on function private.vc_current_user_id() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.vc_current_user_id() to authenticated;

-- Preserve every existing MyMap RPC while swapping only its identity lookup.
do $migration$
declare
  item record;
  definition text;
begin
  for item in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname like 'vc\_%' escape '\'
      and pg_get_functiondef(p.oid) ilike '%auth.uid()%'
  loop
    definition := pg_get_functiondef(item.oid);
    definition := replace(definition, 'auth.uid()', 'private.vc_current_user_id()');
    definition := replace(definition, 'AUTH.UID()', 'private.vc_current_user_id()');
    execute definition;
  end loop;
end
$migration$;

-- Apply the same identity bridge to MyMap row-level security policies without
-- changing their roles, commands, permissiveness, or ownership predicates.
do $migration$
declare
  item record;
  statement text;
  using_expression text;
  check_expression text;
begin
  for item in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename like 'vc\_%' escape '\'
      and (
        coalesce(qual, '') ilike '%auth.uid()%'
        or coalesce(with_check, '') ilike '%auth.uid()%'
      )
  loop
    using_expression := replace(
      replace(item.qual, 'auth.uid()', 'private.vc_current_user_id()'),
      'AUTH.UID()', 'private.vc_current_user_id()'
    );
    check_expression := replace(
      replace(item.with_check, 'auth.uid()', 'private.vc_current_user_id()'),
      'AUTH.UID()', 'private.vc_current_user_id()'
    );

    statement := format(
      'alter policy %I on %I.%I',
      item.policyname,
      item.schemaname,
      item.tablename
    );
    if item.qual is not null then
      statement := statement || format(' using (%s)', using_expression);
    end if;
    if item.with_check is not null then
      statement := statement || format(' with check (%s)', check_expression);
    end if;
    execute statement;
  end loop;
end
$migration$;

-- Columns already emitted by the app's continuous-presence payload.
alter table public.vc_live_presence
  add column if not exists is_charging boolean not null default false,
  add column if not exists status_text text,
  add column if not exists status_icon text,
  add column if not exists speed_kmh double precision,
  add column if not exists is_fuzzy boolean not null default false,
  add column if not exists is_frozen boolean not null default false,
  add column if not exists music_title text,
  add column if not exists music_artist text,
  add column if not exists music_is_playing boolean not null default false;

create or replace function public.vc_upsert_presence(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := private.vc_current_user_id();
begin
  insert into public.vc_live_presence (
    user_id,
    latitude,
    longitude,
    heading_deg,
    speed_mps,
    battery_level,
    is_charging,
    status_text,
    status_icon,
    speed_kmh,
    is_fuzzy,
    is_frozen,
    music_title,
    music_artist,
    music_is_playing,
    updated_at,
    expires_at
  ) values (
    current_user_id,
    (p_payload ->> 'latitude')::double precision,
    (p_payload ->> 'longitude')::double precision,
    nullif(p_payload ->> 'heading_deg', '')::double precision,
    nullif(p_payload ->> 'speed_mps', '')::double precision,
    nullif(p_payload ->> 'battery_level', '')::real,
    coalesce((p_payload ->> 'is_charging')::boolean, false),
    nullif(p_payload ->> 'status_text', ''),
    nullif(p_payload ->> 'status_icon', ''),
    nullif(p_payload ->> 'speed_kmh', '')::double precision,
    coalesce((p_payload ->> 'is_fuzzy')::boolean, false),
    coalesce((p_payload ->> 'is_frozen')::boolean, false),
    nullif(p_payload ->> 'music_title', ''),
    nullif(p_payload ->> 'music_artist', ''),
    coalesce((p_payload ->> 'music_is_playing')::boolean, false),
    now(),
    now() + interval '5 minutes'
  )
  on conflict (user_id) do update
  set latitude = excluded.latitude,
      longitude = excluded.longitude,
      heading_deg = excluded.heading_deg,
      speed_mps = excluded.speed_mps,
      battery_level = excluded.battery_level,
      is_charging = excluded.is_charging,
      status_text = excluded.status_text,
      status_icon = excluded.status_icon,
      speed_kmh = excluded.speed_kmh,
      is_fuzzy = excluded.is_fuzzy,
      is_frozen = excluded.is_frozen,
      music_title = excluded.music_title,
      music_artist = excluded.music_artist,
      music_is_playing = excluded.music_is_playing,
      updated_at = excluded.updated_at,
      expires_at = excluded.expires_at;
end
$function$;

revoke all on function public.vc_upsert_presence(jsonb) from public, anon;
grant execute on function public.vc_upsert_presence(jsonb) to authenticated;

drop policy if exists vc_profiles_select_connected on public.vc_profiles;
create policy vc_profiles_select_connected
on public.vc_profiles
for select
to authenticated
using (
  id = private.vc_current_user_id()
  or exists (
    select 1
    from public.vc_connections connection
    where connection.status = 'accepted'::public.vc_connection_status
      and (
        (connection.requester_id = private.vc_current_user_id() and connection.addressee_id = vc_profiles.id)
        or
        (connection.addressee_id = private.vc_current_user_id() and connection.requester_id = vc_profiles.id)
      )
  )
);

create or replace view public.vc_live_friends
with (security_invoker = true)
as
select
  presence.user_id as id,
  presence.user_id,
  profile.display_name,
  profile.username,
  profile.avatar_path as avatar_url,
  presence.latitude,
  presence.longitude,
  presence.heading_deg as heading,
  presence.speed_mps,
  coalesce(presence.speed_kmh, presence.speed_mps * 3.6, 0) as speed_kmh,
  presence.battery_level,
  presence.is_charging,
  coalesce(presence.status_text, presence.activity_type, 'Đang trực tuyến') as status_text,
  coalesce(presence.status_icon, 'map-marker') as status_icon,
  presence.is_fuzzy,
  presence.is_frozen,
  presence.music_title,
  presence.music_artist,
  presence.music_is_playing,
  presence.updated_at,
  0::integer as ranking_score,
  0::integer as streak_days
from public.vc_live_presence presence
join public.vc_profiles profile on profile.id = presence.user_id
where presence.user_id <> private.vc_current_user_id()
  and (presence.expires_at is null or presence.expires_at > now())
  and exists (
    select 1
    from public.vc_connections connection
    where connection.status = 'accepted'::public.vc_connection_status
      and connection.share_exact_location = true
      and (
        (connection.requester_id = private.vc_current_user_id() and connection.addressee_id = presence.user_id)
        or
        (connection.addressee_id = private.vc_current_user_id() and connection.requester_id = presence.user_id)
      )
  );

revoke all on public.vc_live_friends from public, anon;
grant select on public.vc_live_friends to authenticated;

-- Fail the migration instead of silently leaving a partial UUID-auth bridge.
do $migration$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname like 'vc\_%' escape '\'
      and pg_get_functiondef(p.oid) ilike '%auth.uid()%'
  ) then
    raise exception 'Some MyMap functions still depend on auth.uid()';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename like 'vc\_%' escape '\'
      and (
        coalesce(qual, '') ilike '%auth.uid()%'
        or coalesce(with_check, '') ilike '%auth.uid()%'
      )
  ) then
    raise exception 'Some MyMap policies still depend on auth.uid()';
  end if;
end
$migration$;

commit;
