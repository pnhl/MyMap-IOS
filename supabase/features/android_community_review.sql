begin;
alter table private.mm_content_reports add column resolved_by uuid references public.vc_profiles(id),add column resolved_at timestamptz;
create table private.mm_moderation_decisions(id bigint generated always as identity primary key,report_id uuid not null references private.mm_content_reports(id),moderator_id uuid not null references public.vc_profiles(id),hidden boolean not null,note text not null,created_at timestamptz not null default now());
alter table private.mm_moderation_decisions enable row level security;
revoke all on private.mm_moderation_decisions from public,anon,authenticated;
create or replace function public.mm_moderation_queue() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin
 if not exists(select 1 from private.mm_moderators where user_id=me) then raise exception 'moderator_only';end if;
 return coalesce((select jsonb_agg(row_to_json(q)) from(select r.id,r.kind,r.target_id,r.reason,r.note,r.created_at,r.status,
 case r.kind when 'profile' then(select jsonb_build_object('name',display_name,'text',bio) from public.vc_profiles where id=r.target_id)
 when 'document' then(select jsonb_build_object('name',payload->>'name','text',coalesce(payload->>'note',payload->>'category'),'type',kind) from public.mm_documents where id=r.target_id)
 when 'message' then(select jsonb_build_object('text',case when kind='text' then body else 'Tệp đính kèm: '||kind end,'type',kind) from public.mm_messages where id=r.target_id)
 when 'comment' then(select jsonb_build_object('text',body) from public.mm_content_comments where id=r.target_id)end as subject,
 exists(select 1 from private.mm_hidden_content h where h.kind=r.kind and h.target_id=r.target_id) as hidden
 from private.mm_content_reports r where r.status='pending' order by r.created_at limit 100)q),'[]');
end $$;
create or replace function public.mm_moderate(p_report uuid,p_hide boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();r private.mm_content_reports;begin
 if not exists(select 1 from private.mm_moderators where user_id=me) then raise exception 'moderator_only';end if;
 if p_hide is null or p_note is null or length(trim(p_note)) not between 1 and 1000 then raise exception 'invalid_resolution';end if;
 select * into r from private.mm_content_reports where id=p_report for update;
 if not found or r.status<>'pending' then raise exception 'report_already_processed';end if;
 if p_hide then insert into private.mm_hidden_content values(r.kind,r.target_id) on conflict do nothing;else delete from private.mm_hidden_content where kind=r.kind and target_id=r.target_id;end if;
 update private.mm_content_reports set status='resolved',resolution=trim(p_note),resolved_by=me,resolved_at=now() where kind=r.kind and target_id=r.target_id and status='pending';
 insert into private.mm_moderation_decisions(report_id,moderator_id,hidden,note) values(p_report,me,p_hide,trim(p_note));
end $$;
-- Confidence is a lower bound on community confirmations, not verification by an authority.
create function private.mm_vote_confidence(positive bigint,negative bigint) returns float8 language sql immutable set search_path='' as $$
 select case when positive+negative=0 then null else greatest(0,((positive::float8/(positive+negative))+3.8416/(2*(positive+negative))-1.96*sqrt((positive::float8/(positive+negative))*(1-positive::float8/(positive+negative))/(positive+negative)+3.8416/(4*power(positive+negative,2))))/(1+3.8416/(positive+negative))) end;
$$;
create or replace function public.mm_nearby_reports(p_lat float8,p_lon float8,p_radius integer default 2000) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(value||jsonb_build_object('confidence',private.mm_vote_confidence((value->>'confirmations')::bigint,(value->>'rejections')::bigint))),'[]') from jsonb_array_elements(private.mm_unfiltered_nearby_reports(p_lat,p_lon,p_radius)) where private.mm_read_document((value->>'id')::uuid);
$$;
revoke all on function private.mm_vote_confidence(bigint,bigint) from public;
create function public.mm_profile_update(p_name text,p_bio text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin
 if p_name is null or length(trim(p_name)) not between 1 and 80 or p_bio is null or length(trim(p_bio))>500 then raise exception 'invalid_profile';end if;
 perform private.mm_rate(me,'profile_update',10);
 update public.vc_profiles set display_name=trim(p_name),bio=trim(p_bio),updated_at=now() where id=me;
end $$;
create function public.mm_profile_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin return(select jsonb_build_object('name',display_name,'bio',bio,'id',id) from public.vc_profiles where id=me);end $$;
revoke all on function public.mm_profile_update(text,text),public.mm_profile_read() from public;
grant execute on function public.mm_profile_update(text,text),public.mm_profile_read() to anon,authenticated;
notify pgrst,'reload schema';
commit;
