-- Only the server engine can sign a plan. Callers retain JWT/RLS; no service-role writes.
create table app_private.color_engine_keys(id integer primary key check(id=1),secret bytea not null check(octet_length(secret)=32));
insert into app_private.color_engine_keys values(1,extensions.gen_random_bytes(32));
revoke all on app_private.color_engine_keys from public,anon,authenticated,service_role,elifora_color_writer;
create function app_private.verify_color_signature(p_envelope text,p_signature text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and octet_length(p_envelope)<=2097152 and p_signature ~ '^[a-f0-9]{64}$'
  and p_signature=encode(extensions.hmac(convert_to(p_envelope,'UTF8'),secret,'sha256'),'hex') from app_private.color_engine_keys where id=1;
$$;
revoke all on function app_private.verify_color_signature(text,text) from public,anon,authenticated,service_role;
grant execute on function app_private.verify_color_signature(text,text) to elifora_color_writer;
create table public.color_plans(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,client_id uuid not null,target_version_id uuid not null,passport_id uuid not null,
 passport_version bigint not null check(passport_version>0),hair_fingerprint text not null check(hair_fingerprint ~ '^[a-f0-9]{64}$'),
 input_fingerprint text not null check(input_fingerprint ~ '^[a-f0-9]{64}$'),target_fingerprint text not null check(target_fingerprint ~ '^[a-f0-9]{64}$'),
 color_engine_version text not null check(color_engine_version='color-engine/1.0.0'),confidence_engine_version text not null check(confidence_engine_version='confidence-engine/1.0.0'),
 risk_engine_version text not null check(risk_engine_version='risk-engine/1.0.0'),
 status text not null check(status in ('DRAFT','REQUIRES_ASSESSMENT','REQUIRES_TEST','REQUIRES_RECOVERY','BLOCKED_BY_RISK')),
 execution_status text not null default 'REQUIRES_BRAND_ADAPTER' check(execution_status='REQUIRES_BRAND_ADAPTER'),
 recipe_id text check(recipe_id ~ '^[a-f0-9]{64}$'),recipe_version integer check(recipe_version=1),parent_recipe_id text check(parent_recipe_id is null),
 created_at timestamptz not null default statement_timestamp(),created_by uuid not null references public.profiles(user_id),location_id uuid not null,
 request_id uuid not null,correlation_id uuid not null,payload jsonb not null check(jsonb_typeof(payload)='object'),
 signed_envelope text not null,signature text not null,
 unique(organization_id,client_id,id),unique(organization_id,created_by,request_id),
 foreign key(organization_id,client_id,target_version_id) references public.color_target_versions(organization_id,client_id,id),
 foreign key(organization_id,client_id,passport_id) references public.hair_passports(organization_id,client_id,id),
 foreign key(organization_id,location_id) references public.locations(organization_id,id),
 check((status='DRAFT' and recipe_id is not null and recipe_version=1) or (status<>'DRAFT' and recipe_id is null and recipe_version is null))
);
create index color_plans_client_idx on public.color_plans(organization_id,client_id,created_at desc,id);
create index color_plans_target_idx on public.color_plans(organization_id,client_id,target_version_id);
create index color_plans_passport_idx on public.color_plans(organization_id,client_id,passport_id);
create index color_plans_actor_idx on public.color_plans(created_by);
create index color_plans_location_idx on public.color_plans(organization_id,location_id);
alter table public.color_plans enable row level security;
alter table public.color_plans force row level security;
revoke all on public.color_plans from public,anon,authenticated,service_role;
-- Signature/envelope contain internal binding metadata and are never projected to callers.
grant select(id,organization_id,client_id,target_version_id,passport_id,passport_version,hair_fingerprint,input_fingerprint,target_fingerprint,
 color_engine_version,confidence_engine_version,risk_engine_version,status,execution_status,recipe_id,recipe_version,parent_recipe_id,created_at,created_by,location_id,request_id,correlation_id,payload)
 on public.color_plans to authenticated;
grant select,insert on public.color_plans to elifora_color_writer;
create policy color_plans_read on public.color_plans for select to authenticated using(app_private.can_access_clients(organization_id,'color_plan.read') and app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy color_plans_insert on public.color_plans for insert to elifora_color_writer with check(created_by=(select auth.uid()) and app_private.can_access_clients(organization_id,'color_plan.create'));
create function app_private.guard_color_plan()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v jsonb;
begin
 if TG_OP<>'INSERT' then raise exception using errcode='23514',message='immutable color plan'; end if;
 if not coalesce(app_private.verify_color_signature(new.signed_envelope,new.signature),false) then raise exception using errcode='23514',message='COLOR_PLAN_SIGNATURE_INVALID'; end if;
 v:=new.signed_envelope::jsonb;
 if v->'result'<>new.payload or (v->>'actorId')::uuid<>auth.uid() or new.created_by<>auth.uid()
  or (v->>'organizationId')::uuid<>new.organization_id or (v->>'clientId')::uuid<>new.client_id
  or (v->>'targetId')::uuid<>new.target_version_id or (v->>'locationId')::uuid<>new.location_id or (v->>'requestId')::uuid<>new.request_id
  or (v->>'expiresAt')::timestamptz<statement_timestamp() or (v->>'expiresAt')::timestamptz>statement_timestamp()+interval '5 minutes'
  or new.payload->>'engineVersion'<>new.color_engine_version or new.payload->>'status'<>new.status
  or new.payload#>>'{metadata,passportId}'<>new.passport_id::text or (new.payload#>>'{metadata,passportVersion}')::bigint<>new.passport_version
  or new.payload#>>'{metadata,inputFingerprint}'<>new.input_fingerprint or new.payload#>>'{metadata,hairFingerprint}'<>new.hair_fingerprint
  or new.payload#>>'{metadata,targetFingerprint}'<>new.target_fingerprint
  or new.payload#>>'{metadata,targetId}'<>new.target_version_id::text
  or new.payload#>>'{metadata,confidenceVersion}'<>new.confidence_engine_version or new.payload#>>'{metadata,riskVersion}'<>new.risk_engine_version then
  raise exception using errcode='23514',message='COLOR_INPUT_INVALID'; end if;
 if new.status='DRAFT' then
  if new.payload#>>'{recipeDraft,executionStatus}'<>'REQUIRES_BRAND_ADAPTER' or new.payload#>>'{recipeDraft,origin}'<>'ENGINE'
   or new.payload#>>'{recipeDraft,id}'<>new.recipe_id or (new.payload#>>'{recipeDraft,version}')::integer<>1
   or new.payload#>'{recipeDraft,parentVersionId}' is distinct from 'null'::jsonb
   or new.payload#>>'{safetyGate,canProgress}'<>'true' or new.payload->'primaryStrategy'='null'::jsonb then
   raise exception using errcode='23514',message='COLOR_INPUT_INVALID'; end if;
 elsif new.payload->'recipeDraft' is distinct from 'null'::jsonb or new.payload->'primaryStrategy' is distinct from 'null'::jsonb
  or new.payload->'alternatives'<>'[]'::jsonb then raise exception using errcode='23514',message='COLOR_INPUT_INVALID'; end if;
 return new;
end $$;
revoke all on function app_private.guard_color_plan() from public,anon,authenticated;
create trigger color_plans_guard before insert or update or delete on public.color_plans for each row execute function app_private.guard_color_plan();
create function app_private.audit_color_plan()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,metadata,correlation_id)
 values(auth.uid(),new.organization_id,'color_plan.generated','color_plans',new.id,jsonb_build_object('client_id',new.client_id,'target_version_id',new.target_version_id,
  'status',new.status,'engine_version',new.color_engine_version,'input_fingerprint',new.input_fingerprint),new.correlation_id);return new;
end $$;
revoke all on function app_private.audit_color_plan() from public,anon,authenticated;
create trigger color_plans_audit after insert on public.color_plans for each row execute function app_private.audit_color_plan();
create function app_private.color_plan_model(p public.color_plans)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('id',p.id,'clientId',p.client_id,'targetId',p.target_version_id,'createdAt',p.created_at,'createdBy',p.created_by,'result',p.payload);
$$;
revoke all on function app_private.color_plan_model(public.color_plans) from public,anon,service_role;
grant execute on function app_private.color_plan_model(public.color_plans) to elifora_color_writer;
create function app_private.execute_color_plan(p_membership uuid,p_location uuid,p_client uuid,p_operation text,p_payload jsonb,p_correlation uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare v_context jsonb;v_org uuid;v_actor uuid:=auth.uid();v_target public.color_target_versions%rowtype;v_plan public.color_plans%rowtype;
 v_snapshot jsonb;v_token text;v_packet jsonb;v_result jsonb;v_target_id uuid;v_request uuid;v_permission text;v_archived boolean;
begin
 if p_correlation is null then raise exception using errcode='22023',message='correlation required';end if;
 if v_actor is null then return app_private.client_error('UNAUTHENTICATED',p_correlation);end if;
 if p_client is null or p_membership is null or p_location is null or p_operation is null or p_operation not in ('prepare','store','read')
  or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>2200000 then return app_private.client_error('VALIDATION_FAILED',p_correlation);end if;
 v_permission:=case when p_operation='read' then 'color_plan.read' else 'color_plan.create' end;
 v_context:=app_private.hair_write_context(p_membership,p_location,v_permission);
 if v_context ? 'code' then return app_private.client_error(v_context->>'code',p_correlation);end if;
 v_org:=(v_context->>'organization_id')::uuid;
 if not app_private.can_access_clients(v_org,'clients.read') or not app_private.can_access_hair(v_org,'hair_passport.read') then return app_private.client_error('FORBIDDEN',p_correlation);end if;
 if p_operation<>'read' then perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));end if;
 v_context:=app_private.hair_write_context(p_membership,p_location,v_permission);
 if v_context ? 'code' then return app_private.client_error(v_context->>'code',p_correlation);end if;
 if v_context->>'organization_id'<>v_org::text then return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation);end if;
 v_archived:=coalesce((p_payload->>'include_archived')::boolean,false);
 if not exists(select 1 from public.clients where organization_id=v_org and id=p_client and (status='ACTIVE' or p_operation='read' and v_archived))
  then return app_private.client_error('CLIENT_NOT_FOUND',p_correlation);end if;
 if p_operation='read' then
  if exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('plan_id','include_archived')) or not(p_payload ? 'plan_id')
   or (p_payload ? 'include_archived' and jsonb_typeof(p_payload->'include_archived') is distinct from 'boolean') then return app_private.client_error('VALIDATION_FAILED',p_correlation);end if;
  select * into v_plan from public.color_plans where organization_id=v_org and client_id=p_client and id=(p_payload->>'plan_id')::uuid;
  if not found then return app_private.client_error('COLOR_PLAN_NOT_FOUND',p_correlation);end if;
  return jsonb_build_object('data',app_private.color_plan_model(v_plan),'correlationId',p_correlation);
 elsif p_operation='store' then
  if exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('envelope','signature')) or not(p_payload ?& array['envelope','signature'])
   or jsonb_typeof(p_payload->'envelope') is distinct from 'string' or not coalesce(app_private.verify_color_signature(p_payload->>'envelope',p_payload->>'signature'),false)
   then return app_private.client_error('COLOR_PLAN_SIGNATURE_INVALID',p_correlation);end if;
  v_packet:=(p_payload->>'envelope')::jsonb;
  if exists(select 1 from jsonb_object_keys(v_packet) x where x not in ('organizationId','actorId','membershipId','locationId','clientId','targetId','requestId','sourceToken','expiresAt','result'))
   or not(v_packet ?& array['organizationId','actorId','membershipId','locationId','clientId','targetId','requestId','sourceToken','expiresAt','result'])
   or v_packet->>'organizationId'<>v_org::text or v_packet->>'actorId'<>v_actor::text or v_packet->>'membershipId'<>p_membership::text
   or v_packet->>'locationId'<>p_location::text or v_packet->>'clientId'<>p_client::text then return app_private.client_error('COLOR_INPUT_INVALID',p_correlation);end if;
  v_target_id:=(v_packet->>'targetId')::uuid;v_request:=(v_packet->>'requestId')::uuid;v_result:=v_packet->'result';
 else
  if exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('target_id','request_id')) or not(p_payload ?& array['target_id','request_id']) then return app_private.client_error('VALIDATION_FAILED',p_correlation);end if;
  v_target_id:=(p_payload->>'target_id')::uuid;v_request:=(p_payload->>'request_id')::uuid;
 end if;
 if v_target_id is null or v_request is null then return app_private.client_error('VALIDATION_FAILED',p_correlation);end if;
 select * into v_plan from public.color_plans where organization_id=v_org and created_by=v_actor and request_id=v_request;
 if found then
  if v_plan.client_id<>p_client or v_plan.target_version_id<>v_target_id then return app_private.client_error('COLOR_PLAN_VERSION_CONFLICT',p_correlation);end if;
  return jsonb_build_object('data',case when p_operation='prepare' then jsonb_build_object('existing',app_private.color_plan_model(v_plan)) else app_private.color_plan_model(v_plan) end,'correlationId',p_correlation);
 end if;
 select * into v_target from public.color_target_versions where organization_id=v_org and client_id=p_client and id=v_target_id;
 if not found then return app_private.client_error('COLOR_TARGET_NOT_FOUND',p_correlation);end if;
 if exists(select 1 from public.color_target_versions where organization_id=v_org and series_id=v_target.series_id and version>v_target.version) then return app_private.client_error('TARGET_VERSION_CONFLICT',p_correlation);end if;
 -- Revalidate active region coverage. A target remains historically readable after a region is archived.
 perform app_private.color_target_definition(v_target.definition,v_org,p_client,v_target.passport_id);
 v_snapshot:=public.hair_confidence_snapshot(p_membership,p_location,p_client,false,p_correlation);
 if v_snapshot ? 'code' then return v_snapshot;end if;
 v_token:=encode(extensions.digest(convert_to((v_snapshot#>'{data,pages}')::text,'UTF8'),'sha256'),'hex');
 if p_operation='prepare' then return jsonb_build_object('data',jsonb_build_object('existing',null,'target',app_private.color_target_model(v_target),'snapshot',v_snapshot->'data','sourceToken',v_token),'correlationId',p_correlation);end if;
 if v_packet->>'sourceToken'<>v_token then return app_private.client_error('COLOR_PLAN_SOURCE_CONFLICT',p_correlation);end if;
 if v_result#>>'{metadata,passportId}'<>v_target.passport_id::text or (v_result#>>'{metadata,targetVersion}')::bigint<>v_target.version
  or (v_result#>>'{metadata,passportVersion}')::bigint<>(v_snapshot#>>'{data,pages,0,passport,version}')::bigint
  or v_result->>'evaluatedAt' is null or (v_result->>'evaluatedAt')::timestamptz>statement_timestamp()
  or (v_result->>'evaluatedAt')::timestamptz<statement_timestamp()-interval '5 minutes' then return app_private.client_error('COLOR_INPUT_INVALID',p_correlation);end if;
 insert into public.color_plans(organization_id,client_id,target_version_id,passport_id,passport_version,hair_fingerprint,input_fingerprint,target_fingerprint,
  color_engine_version,confidence_engine_version,risk_engine_version,status,recipe_id,recipe_version,created_by,location_id,request_id,correlation_id,payload,signed_envelope,signature)
 values(v_org,p_client,v_target_id,v_target.passport_id,(v_result#>>'{metadata,passportVersion}')::bigint,v_result#>>'{metadata,hairFingerprint}',v_result#>>'{metadata,inputFingerprint}',v_result#>>'{metadata,targetFingerprint}',
  v_result->>'engineVersion',v_result#>>'{metadata,confidenceVersion}',v_result#>>'{metadata,riskVersion}',v_result->>'status',v_result#>>'{recipeDraft,id}',(v_result#>>'{recipeDraft,version}')::integer,
  v_actor,p_location,v_request,p_correlation,v_result,p_payload->>'envelope',p_payload->>'signature') returning * into v_plan;
 return jsonb_build_object('data',app_private.color_plan_model(v_plan),'correlationId',p_correlation);
exception when invalid_text_representation or numeric_value_out_of_range or not_null_violation then return app_private.client_error('VALIDATION_FAILED',p_correlation);
 when check_violation then return app_private.client_error(case when SQLERRM in ('COLOR_TARGET_INVALID','COLOR_TARGET_INCOMPLETE','COLOR_PLAN_SIGNATURE_INVALID','COLOR_INPUT_INVALID') then SQLERRM else 'COLOR_INPUT_INVALID' end,p_correlation);
end $$;
grant create on schema app_private to elifora_color_writer;
alter function app_private.execute_color_plan(uuid,uuid,uuid,text,jsonb,uuid) owner to elifora_color_writer;
revoke create on schema app_private from elifora_color_writer;
revoke all on function app_private.execute_color_plan(uuid,uuid,uuid,text,jsonb,uuid) from public,anon,service_role;
grant execute on function app_private.execute_color_plan(uuid,uuid,uuid,text,jsonb,uuid) to authenticated;
create function public.color_plan_operation(p_membership_id uuid,p_location_id uuid,p_client_id uuid,p_operation text,p_payload jsonb,p_correlation_id uuid)
returns jsonb language sql volatile security invoker set search_path='' set row_security='on' as $$
 select app_private.execute_color_plan(p_membership_id,p_location_id,p_client_id,p_operation,p_payload,p_correlation_id);
$$;
revoke all on function public.color_plan_operation(uuid,uuid,uuid,text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.color_plan_operation(uuid,uuid,uuid,text,jsonb,uuid) to authenticated;
