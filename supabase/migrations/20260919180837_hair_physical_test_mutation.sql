create or replace function app_private.guard_hair_record()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare
 v_passport uuid;
 v_region uuid;
 v_source text;
 v_permission text:=TG_ARGV[0];
begin
 if TG_OP='DELETE' or (TG_OP='UPDATE' and TG_TABLE_NAME not in ('hair_passports','hair_regions')) then
  raise exception using errcode='23514',message='technical facts are append-only';
 end if;
 if TG_OP='UPDATE' then
  v_permission:='hair_passport.update';
  -- add_observation permits only selection of this statement's newly appended fact.
  -- It never grants editing of core values, labels, lifecycle or ownership.
  if new.current_observation_id is distinct from old.current_observation_id and not new.has_unverified_state
   and (to_jsonb(new)-array['current_observation_id','has_unverified_state','correlation_id'])=
       (to_jsonb(old)-array['current_observation_id','has_unverified_state','correlation_id'])
   and app_private.can_select_new_hair_observation(new.organization_id,
    coalesce((to_jsonb(new)->>'passport_id')::uuid,new.id),
    case when TG_TABLE_NAME='hair_regions' then new.id else null end,new.current_observation_id) then
   v_permission:='hair_passport.add_observation';
  end if;
  if new.id<>old.id or new.organization_id<>old.organization_id or new.client_id<>old.client_id
   or new.created_by<>old.created_by or new.created_at<>old.created_at then
   raise exception using errcode='23514',message='technical ownership is immutable';
  end if;
  if TG_TABLE_NAME='hair_regions' then
   if new.passport_id<>old.passport_id or new.region_type<>old.region_type then
    raise exception using errcode='23514',message='region identity is immutable';
   end if;
  end if;
 end if;
 if TG_OP='INSERT' and TG_TABLE_NAME='hair_regions' then
  if app_private.can_initialize_hair_region(new.organization_id,new.passport_id,new.region_type) then
   v_permission:='hair_passport.create';
  end if;
 end if;
 -- Physical-test-only writers can create physical provenance, never other sources.
 if TG_OP='INSERT' and TG_TABLE_NAME='hair_evidence' then
  if new.source_type='PHYSICAL_TEST' and app_private.can_access_hair(new.organization_id,'hair_passport.add_test') then
   v_permission:='hair_passport.add_test';
  end if;
 end if;
 if auth.uid() is null or not app_private.can_access_hair(new.organization_id,v_permission) then
  raise exception using errcode='42501',message='technical write unavailable';
 end if;
 -- Match Phase 1B's organization lock: archive and technical writes serialize.
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,0));
 if not exists(select 1 from public.clients c where c.id=new.client_id
  and c.organization_id=new.organization_id and c.status='ACTIVE') then
  raise exception using errcode='42501',message='technical write unavailable';
 end if;
 if TG_TABLE_NAME='hair_passports' then
  v_passport:=new.id;
 else
  v_passport:=new.passport_id;
  if not exists(select 1 from public.hair_passports p where p.id=v_passport
   and p.organization_id=new.organization_id and p.client_id=new.client_id and p.status='ACTIVE') then
   raise exception using errcode='42501',message='technical write unavailable';
  end if;
 end if;
 if TG_OP='INSERT' then
  new.created_by:=auth.uid();
  new.created_at:=statement_timestamp();
 end if;
 if TG_TABLE_NAME in ('hair_passports','hair_regions') then
  new.updated_by:=auth.uid();
  new.updated_at:=statement_timestamp();
  if TG_OP='UPDATE' then
   if new.version<>old.version then
    raise exception using errcode='23514',message='version is database controlled';
   end if;
   new.version:=old.version+1;
   if new.correlation_id=old.correlation_id then new.correlation_id:=gen_random_uuid(); end if;
  else
   new.version:=1;
  end if;
  if new.current_observation_id is not null then
   select o.region_id into v_region from public.hair_observations o
    where o.id=new.current_observation_id and o.organization_id=new.organization_id and o.passport_id=v_passport;
   if not found then raise exception using errcode='23514',message='current observation scope mismatch'; end if;
   if TG_TABLE_NAME='hair_passports' then
    if v_region is not null then raise exception using errcode='23514',message='current observation scope mismatch'; end if;
   elsif v_region is distinct from new.id then
    raise exception using errcode='23514',message='current observation scope mismatch';
   end if;
  end if;
 end if;
 if TG_TABLE_NAME='hair_evidence' then
  if new.verified_by is not null and new.verified_by<>auth.uid() then
   raise exception using errcode='23514',message='verification actor must be the authenticated professional';
  end if;
 elsif TG_TABLE_NAME in ('hair_observations','hair_physical_tests') then
  if new.region_id is not null and not exists(select 1 from public.hair_regions r
   where r.id=new.region_id and r.organization_id=new.organization_id and r.passport_id=v_passport and r.status='ACTIVE') then
   raise exception using errcode='23514',message='active region scope mismatch';
  end if;
  if new.supersedes_id is not null then
   if TG_TABLE_NAME='hair_observations' then
    select o.region_id into v_region from public.hair_observations o
     where o.organization_id=new.organization_id and o.passport_id=v_passport and o.id=new.supersedes_id;
   else
    select t.region_id into v_region from public.hair_physical_tests t
     where t.organization_id=new.organization_id and t.passport_id=v_passport and t.id=new.supersedes_id
      and t.test_type=new.test_type;
   end if;
   if not found or v_region is distinct from new.region_id then
    raise exception using errcode='23514',message='correction scope mismatch';
   end if;
  end if;
  if TG_TABLE_NAME='hair_physical_tests' then
   select e.source_type into v_source from public.hair_evidence e
    where e.organization_id=new.organization_id and e.passport_id=v_passport and e.id=new.evidence_id;
   if v_source is distinct from 'PHYSICAL_TEST' or new.performed_by<>auth.uid() then
    raise exception using errcode='23514',message='physical test evidence and performer required';
   end if;
  end if;
 end if;
 return new;
end $$;

alter policy hair_evidence_insert on public.hair_evidence with check(created_by=(select auth.uid()) and (app_private.can_access_hair(organization_id,'hair_passport.add_observation') or (source_type='PHYSICAL_TEST' and app_private.can_access_hair(organization_id,'hair_passport.add_test'))));

-- Live physical tests append independently; no current assessment is changed.
create policy hair_physical_test_created_audit on public.audit_events for insert to elifora_hair_writer
 with check(actor_user_id=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.add_test')
  and action='hair_physical_test.created' and entity_type='hair_physical_tests');

create function app_private.execute_hair_physical_test(p_membership_id uuid,p_location_id uuid,p_client_id uuid,p_payload jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare
 v_actor uuid:=auth.uid(); v_org uuid; v_context jsonb; v_status text; v_request uuid; v_region_id uuid; v_location uuid;
 v_passport public.hair_passports%rowtype; v_test public.hair_physical_tests%rowtype; v_evidence public.hair_evidence%rowtype;
 v_hash text; v_receipt app_private.hair_core_mutation_receipts%rowtype; v_result jsonb; v_state text;
begin
 if p_correlation_id is null then raise exception using errcode='22004',message='correlation identifier is required'; end if;
 if v_actor is null then return app_private.client_error('UNAUTHENTICATED',p_correlation_id); end if;
 if p_membership_id is null or p_location_id is null or p_client_id is null or jsonb_typeof(p_payload) is distinct from 'object'
  or pg_column_size(p_payload)>32768 then return app_private.client_error('INVALID_PHYSICAL_TEST',p_correlation_id); end if;
 v_context:=app_private.hair_write_context(p_membership_id,p_location_id,'hair_passport.add_test');
 if v_context ? 'code' then return app_private.client_error(v_context->>'code',p_correlation_id); end if;
 v_org:=(v_context->>'organization_id')::uuid;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('request_id','type','region_id','result','notes','location_id'))
  or jsonb_typeof(p_payload->'request_id') is distinct from 'string'
  or jsonb_typeof(p_payload->'type') is distinct from 'string'
  or p_payload->>'type' not in ('POROSITY','ELASTICITY','STRAND')
  or (p_payload ? 'region_id' and jsonb_typeof(p_payload->'region_id') not in ('string','null'))
  or (p_payload ? 'location_id' and jsonb_typeof(p_payload->'location_id') is distinct from 'string')
  or (p_payload ? 'notes' and (jsonb_typeof(p_payload->'notes') not in ('string','null')
    or (jsonb_typeof(p_payload->'notes')='string' and (char_length(trim(p_payload->>'notes'))=0 or char_length(p_payload->>'notes')>2000)))) then
  return app_private.client_error('INVALID_PHYSICAL_TEST',p_correlation_id);
 end if;
 v_request:=(p_payload->>'request_id')::uuid; v_region_id:=(p_payload->>'region_id')::uuid;
 v_location:=coalesce((p_payload->>'location_id')::uuid,p_location_id);
 -- Phase 1C-1 defines bounded textual facts within controlled state/value results,
 -- not per-test outcome enums. Preserve that contract without inventing risk labels.
 if jsonb_typeof(p_payload->'result') is distinct from 'object' then
  return app_private.client_error('INVALID_TEST_RESULT',p_correlation_id);
 end if;
 v_state:=p_payload#>>'{result,state}';
 if exists(select 1 from jsonb_object_keys(p_payload->'result') k where k not in ('state','value'))
  or jsonb_typeof(p_payload#>'{result,state}') is distinct from 'string'
  or v_state not in ('KNOWN','UNKNOWN','NOT_APPLICABLE')
  or not (p_payload->'result' ? 'value')
  or (v_state='KNOWN' and (jsonb_typeof(p_payload#>'{result,value}') is distinct from 'string'
    or char_length(trim(p_payload#>>'{result,value}'))=0 or char_length(p_payload#>>'{result,value}')>1000))
  or (v_state<>'KNOWN' and jsonb_typeof(p_payload#>'{result,value}') is distinct from 'null') then
  return app_private.client_error('INVALID_TEST_RESULT',p_correlation_id);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 v_context:=app_private.hair_write_context(p_membership_id,p_location_id,'hair_passport.add_test');
 if v_context ? 'code' then return app_private.client_error(v_context->>'code',p_correlation_id); end if;
 if (v_context->>'organization_id')::uuid<>v_org then return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation_id); end if;
 select status into v_status from public.clients where id=p_client_id and organization_id=v_org;
 if not found then return app_private.client_error('CLIENT_NOT_FOUND',p_correlation_id); end if;
 if v_status='ARCHIVED' then return app_private.client_error('CLIENT_ARCHIVED',p_correlation_id); end if;
 select * into v_passport from public.hair_passports where organization_id=v_org and client_id=p_client_id and status='ACTIVE';
 if not found then return app_private.client_error('HAIR_PASSPORT_NOT_FOUND',p_correlation_id); end if;
 if v_region_id is not null and not exists(select 1 from public.hair_regions where id=v_region_id
  and organization_id=v_org and passport_id=v_passport.id and status='ACTIVE') then
  return app_private.client_error('HAIR_REGION_NOT_FOUND',p_correlation_id);
 end if;
 if not exists(select 1 from public.locations where id=v_location and organization_id=v_org and archived_at is null) then
  return app_private.client_error('LOCATION_NOT_FOUND',p_correlation_id);
 end if;
 v_hash:=encode(extensions.digest(jsonb_build_array('add_physical_test',p_membership_id,p_location_id,p_client_id,p_payload-'request_id')::text,'sha256'),'hex');
 delete from app_private.hair_core_mutation_receipts where organization_id=v_org and actor_id=v_actor and expires_at<now();
 select * into v_receipt from app_private.hair_core_mutation_receipts where organization_id=v_org and actor_id=v_actor and request_id=v_request;
 if found then
  if v_receipt.payload_hash<>v_hash then return app_private.client_error('CONFLICT',p_correlation_id); end if;
  return v_receipt.response||jsonb_build_object('correlationId',p_correlation_id);
 end if;
 insert into public.hair_evidence(organization_id,client_id,passport_id,source_type,observed_at_state,observed_at,
  confidence_state,location_id,correlation_id)
 values(v_org,p_client_id,v_passport.id,'PHYSICAL_TEST','KNOWN',statement_timestamp(),'UNKNOWN',v_location,p_correlation_id)
 returning * into v_evidence;
 insert into public.hair_physical_tests(organization_id,client_id,passport_id,region_id,evidence_id,
  test_type,result_state,result,performed_by,performed_at,notes,correlation_id)
 values(v_org,p_client_id,v_passport.id,v_region_id,v_evidence.id,p_payload->>'type',v_state,p_payload#>>'{result,value}',
  v_actor,statement_timestamp(),p_payload->>'notes',p_correlation_id) returning * into v_test;
 insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,metadata,correlation_id)
 values(v_actor,v_org,'hair_physical_test.created','hair_physical_tests',v_test.id,
  jsonb_build_object('client_id',p_client_id,'passport_id',v_passport.id,'region_id',v_region_id,'test_type',v_test.test_type,'evidence_id',v_evidence.id),p_correlation_id);
 v_result:=jsonb_build_object('correlationId',p_correlation_id,'data',jsonb_build_object('client_id',p_client_id,'passport_id',v_passport.id,
  'test',jsonb_build_object('id',v_test.id,'region_id',v_test.region_id,'type',v_test.test_type,
   'result',jsonb_build_object('state',v_test.result_state,'value',v_test.result),
   'performed_by',v_test.performed_by,'performed_at',v_test.performed_at,'recorded_at',v_test.created_at,
   'recorded_by',v_test.created_by,'notes',v_test.notes,'supersedes_id',v_test.supersedes_id,
   'evidence',app_private.hair_evidence_read_model(v_evidence))));
 insert into app_private.hair_core_mutation_receipts(organization_id,actor_id,request_id,payload_hash,response)
  values(v_org,v_actor,v_request,v_hash,v_result);
 return v_result;
exception
 when check_violation or not_null_violation then return app_private.client_error('INVALID_PHYSICAL_TEST',p_correlation_id);
 when invalid_text_representation then return app_private.client_error('INVALID_PHYSICAL_TEST',p_correlation_id);
 when insufficient_privilege then return app_private.client_error('FORBIDDEN',p_correlation_id);
end $$;
grant create on schema app_private to elifora_hair_writer;
alter function app_private.execute_hair_physical_test(uuid,uuid,uuid,jsonb,uuid) owner to elifora_hair_writer;
revoke create on schema app_private from elifora_hair_writer;
revoke all on function app_private.execute_hair_physical_test(uuid,uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function app_private.execute_hair_physical_test(uuid,uuid,uuid,jsonb,uuid) to authenticated;
create function public.hair_physical_test_operation(p_membership_id uuid,p_location_id uuid,p_client_id uuid,p_payload jsonb,p_correlation_id uuid default gen_random_uuid())
returns jsonb language sql security invoker set search_path='' as $$
 select app_private.execute_hair_physical_test(p_membership_id,p_location_id,p_client_id,p_payload,p_correlation_id);
$$;
revoke all on function public.hair_physical_test_operation(uuid,uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function public.hair_physical_test_operation(uuid,uuid,uuid,jsonb,uuid) to authenticated;
