begin;
-- First Firebase login can link to an older Supabase profile with a null avatar.
-- Keep that existing avatar during identity provisioning. Replacing it with the
-- OAuth URL would violate the new private Storage guard and recursively resolve
-- the not-yet-provisioned identity. User avatar edits go through mm_profile_update.
do $$
declare definition text:=pg_get_functiondef('private.vc_current_user_id()'::regprocedure);
begin
 if position('avatar_path = coalesce(public.vc_profiles.avatar_path, excluded.avatar_path),' in definition)>0 then
  execute replace(definition,'avatar_path = coalesce(public.vc_profiles.avatar_path, excluded.avatar_path),','avatar_path = public.vc_profiles.avatar_path,');
 elsif position('avatar_path = public.vc_profiles.avatar_path,' in definition)=0 then raise exception 'Unexpected identity provisioning definition';end if;
end $$;
commit;
