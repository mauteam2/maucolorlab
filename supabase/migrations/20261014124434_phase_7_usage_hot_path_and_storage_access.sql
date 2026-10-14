-- Explicit uncapped quotas do not need a history aggregate on every write.
-- Metered categories still require an authoritative active usage period.
do $migration$ declare body text;begin
 body:=pg_get_functiondef('app_private.saas_quota(uuid,text,bigint)'::regprocedure);
 body:=replace(body,' if code=''LOCATIONS'' then',
  ' if bound is null then
   if code in (''ENGINE_EXECUTIONS'',''STORAGE_BYTES'') and not exists(select 1 from app_private.saas_usage_periods where organization_id=org and period_start<=statement_timestamp() and period_end>statement_timestamp()) then
    raise exception using errcode=''P0001'',message=''USAGE_PERIOD_UNKNOWN'';end if;
   return;
 end if;
 if code=''LOCATIONS'' then');execute body;
end $migration$;

-- Until an authoritative byte meter is configured, only explicitly uncapped
-- storage is permitted. Missing quotas/finite unmeasured limits fail closed.
-- Original photo registration, actor, location and session RLS remain required.
create function app_private.saas_storage_allowed(object_path text) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare org uuid;loc uuid;pv uuid;bound bigint;begin
 if auth.uid() is null then return false;end if;
 select p.organization_id,s.location_id into org,loc from public.live_photos p join public.live_sessions s on s.id=p.session_id
  where p.object_path=saas_storage_allowed.object_path and p.uploaded_by=auth.uid();
 if org is null or not app_private.user_has_permission(org,loc,'live_session.contribute') then return false;end if;
 perform pg_advisory_xact_lock_shared(hashtextextended(org::text||':saas',71));
 pv:=(app_private.saas_current(org)->>'plan_version_id')::uuid;
 select limit_value into bound from app_private.saas_plan_quotas where plan_version_id=pv and code='STORAGE_BYTES';
 return found and bound is null;
end$$;
revoke all on function app_private.saas_storage_allowed(text) from public,anon,service_role;
grant execute on function app_private.saas_storage_allowed(text) to authenticated;
create policy saas_photo_upload_quota on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'live-technical' or app_private.saas_storage_allowed(name));

create function public.saas_storage_access(p_membership_id uuid,p_location_id uuid,p_object_path text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ctx jsonb;org uuid;pv uuid;begin
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,'live_session.contribute');if ctx ? 'code' then return ctx;end if;
 org:=(ctx->>'organization_id')::uuid;
 if not exists(select 1 from public.live_photos p join public.live_sessions s on s.id=p.session_id where p.organization_id=org and s.location_id=p_location_id and p.object_path=p_object_path and p.uploaded_by=auth.uid()) then return jsonb_build_object('code','FORBIDDEN');end if;
 if not app_private.saas_storage_allowed(p_object_path) then return jsonb_build_object('code','QUOTA_UNKNOWN');end if;
 return jsonb_build_object('data',jsonb_build_object('allowed',true));
end$$;
revoke all on function public.saas_storage_access(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.saas_storage_access(uuid,uuid,text) to authenticated;
