-- Preserve terminal immutability while allowing the exact append-only accounting
-- delta. The signed service also validates actor, input, bowl and correction chain.
create or replace function app_private.live_head_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='DELETE' then raise exception using errcode='23514',message='LIVE_SESSION_IMMUTABLE';end if;
 if tg_op='UPDATE' then
  if new.record_version<>old.record_version+1 or new.original_recipe_id<>old.original_recipe_id or new.organization_id<>old.organization_id or new.client_id<>old.client_id or new.location_id<>old.location_id or new.started_by<>old.started_by or new.created_at<>old.created_at then raise exception using errcode='23514',message='LIVE_SESSION_IMMUTABLE';end if;
  if old.status in ('COMPLETED','CANCELLED','ABORTED') and (
   (to_jsonb(new)-'payload'-'record_version'-'updated_at'-'content_hash') is distinct from (to_jsonb(old)-'payload'-'record_version'-'updated_at'-'content_hash') or
   (new.payload-'materialReconciliations'-'recordVersion'-'updatedAt') is distinct from (old.payload-'materialReconciliations'-'recordVersion'-'updatedAt') or
   jsonb_typeof(new.payload->'materialReconciliations') is distinct from 'array' or
   jsonb_array_length(new.payload->'materialReconciliations')<>jsonb_array_length(coalesce(old.payload->'materialReconciliations','[]'))+1 or
   ((new.payload->'materialReconciliations')-(jsonb_array_length(new.payload->'materialReconciliations')-1)) is distinct from coalesce(old.payload->'materialReconciliations','[]')
  ) then raise exception using errcode='23514',message='LIVE_SESSION_IMMUTABLE';end if;
 end if;
 if new.payload->>'id'<>new.id::text or new.payload->>'clientId'<>new.client_id::text or new.payload->>'status'<>new.status or (new.payload->>'recordVersion')::bigint<>new.record_version or new.payload->>'controllerUserId'<>new.controller_user_id::text or new.payload->>'controllerDeviceId'<>new.controller_device_id::text then raise exception using errcode='23514',message='LIVE_RESULT_INVALID';end if;
 return new;
end $$;

-- Manual archive has the same active-operation invariant as merge. Its private
-- probe derives organization from fresh clients.archive authority and exposes no
-- technical payload, including activity in another branch of this organization.
create function app_private.client_archive_has_active_operation(member uuid,loc uuid,cid uuid) returns boolean language plpgsql volatile security definer set search_path='' as $$declare ctx jsonb;org uuid;ids uuid[];begin
 ctx:=app_private.hair_write_context(member,loc,'clients.archive');
 if ctx ? 'code' then raise exception using errcode='42501',message='FORBIDDEN';end if;
 org:=(ctx->>'organization_id')::uuid;
 if not exists(select 1 from public.clients where id=cid and organization_id=org) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 ids:=app_private.crm_family(org,cid);
 return exists(select 1 from public.salon_appointments a where a.organization_id=org and a.client_id=any(ids) and a.status not in ('COMPLETED','CANCELLED','NO_SHOW')) or exists(select 1 from public.live_sessions s where s.organization_id=org and s.client_id=any(ids) and s.status not in ('COMPLETED','CANCELLED','ABORTED'));
end $$;
revoke all on function app_private.client_archive_has_active_operation(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.client_archive_has_active_operation(uuid,uuid,uuid) to elifora_client_service;
do $$declare d text;n text;begin
 d:=pg_get_functiondef('app_private.execute_client_operation(uuid,uuid,text,jsonb,uuid)'::regprocedure);
 n:='if (p_operation=''archive'' and v_client.status=''ARCHIVED'')';
 if position(n in d)=0 then raise exception 'client archive guard definition mismatch';end if;
 execute replace(d,n,'if p_operation=''archive'' and app_private.client_archive_has_active_operation(p_membership_id,p_location_id,v_client.id) then return app_private.client_error(''CRM_MERGE_ACTIVE_OPERATION'',p_correlation_id);end if; '||n);
end $$;
