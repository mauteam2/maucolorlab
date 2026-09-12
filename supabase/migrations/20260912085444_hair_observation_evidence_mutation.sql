-- Phase 1C-2B2A: one atomic observation + evidence append and current selection.
-- Reuse the existing writer and 24-hour receipts; no new tables or read format.
create function app_private.can_select_new_hair_observation(p_org uuid,p_passport uuid,p_region uuid,p_observation uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select app_private.can_access_hair(p_org,'hair_passport.add_observation') and exists(
  select 1 from public.hair_observations o where o.id=p_observation and o.organization_id=p_org
   and o.passport_id=p_passport and o.region_id is not distinct from p_region
   and o.created_by=auth.uid() and o.created_at=statement_timestamp());
$$;
revoke all on function app_private.can_select_new_hair_observation(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function app_private.can_select_new_hair_observation(uuid,uuid,uuid,uuid) to elifora_hair_writer;

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
revoke all on function app_private.guard_hair_record() from public,anon,authenticated;




alter policy hair_passports_update on public.hair_passports
 using(app_private.can_access_hair(organization_id,'hair_passport.update') or app_private.can_access_hair(organization_id,'hair_passport.add_observation'))
 with check(updated_by=(select auth.uid()) and (app_private.can_access_hair(organization_id,'hair_passport.update') or
  app_private.can_select_new_hair_observation(organization_id,id,null::uuid,current_observation_id)));

alter policy hair_regions_update on public.hair_regions
 using(app_private.can_access_hair(organization_id,'hair_passport.update') or app_private.can_access_hair(organization_id,'hair_passport.add_observation'))
 with check(updated_by=(select auth.uid()) and (app_private.can_access_hair(organization_id,'hair_passport.update') or
  app_private.can_select_new_hair_observation(organization_id,passport_id,id,current_observation_id)));


-- Preserve legacy .added events for existing consumers; the service also appends
-- the requested .created events with source, region and supplied field names.
create policy hair_observation_created_audit on public.audit_events for insert to elifora_hair_writer
 with check(actor_user_id=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.add_observation')
  and ((action='hair_observation.created' and entity_type='hair_observations') or
       (action='hair_evidence.created' and entity_type='hair_evidence')));

create function app_private.hair_observation_evidence(p_evidence jsonb,p_now timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 v_source text; v_observed_state text:='UNKNOWN'; v_observed timestamptz;
 v_confidence_state text:='UNKNOWN'; v_confidence numeric; v_verified uuid; v_until timestamptz;
 v_conf jsonb; v_date jsonb;
begin
 if jsonb_typeof(p_evidence) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_EVIDENCE'; end if;
 v_source:=p_evidence->>'source';
 if v_source is null or v_source not in ('AI_ESTIMATE','PROFESSIONAL_VERIFIED','PHYSICAL_TEST','HISTORICAL','IMPORTED_UNVERIFIED')
  or exists(select 1 from jsonb_object_keys(p_evidence) k where k not in ('source','observed_at','confidence','context','relevant_until','attestation')) then
  raise exception using errcode='22023',message='INVALID_EVIDENCE';
 end if;
 if v_source='PROFESSIONAL_VERIFIED' then
  if p_evidence->>'attestation' is distinct from 'PERSONALLY_ASSESSED' or p_evidence ? 'observed_at' then
   raise exception using errcode='22023',message='INVALID_EVIDENCE';
  end if;
  v_verified:=auth.uid(); v_observed_state:='KNOWN'; v_observed:=p_now;
 else
  if p_evidence ? 'attestation' then raise exception using errcode='22023',message='INVALID_EVIDENCE'; end if;
  v_date:=coalesce(p_evidence->'observed_at','{"state":"UNKNOWN","value":null}'::jsonb);
  if jsonb_typeof(v_date) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_EVIDENCE'; end if;
  v_observed_state:=v_date->>'state';
  if not (v_date ?& array['state','value']) or exists(select 1 from jsonb_object_keys(v_date) k where k not in ('state','value'))
   or v_observed_state is null or v_observed_state not in ('KNOWN','UNKNOWN')
   or (v_observed_state='UNKNOWN' and v_date->'value'<>'null'::jsonb)
   or (v_observed_state='KNOWN' and jsonb_typeof(v_date->'value') is distinct from 'string') then
   raise exception using errcode='22023',message='INVALID_EVIDENCE';
  end if;
  if v_observed_state='KNOWN' then
   if v_date->>'value' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
    raise exception using errcode='22023',message='INVALID_EVIDENCE';
   end if;
   v_observed:=(v_date->>'value')::timestamptz;
   if v_observed>p_now then raise exception using errcode='22023',message='INVALID_EVIDENCE'; end if;
  end if;
 end if;
 if p_evidence ? 'context' and (jsonb_typeof(p_evidence->'context') not in ('null','string') or
  (jsonb_typeof(p_evidence->'context')='string' and (trim(p_evidence->>'context')='' or char_length(p_evidence->>'context')>2000))) then
  raise exception using errcode='22023',message='INVALID_EVIDENCE';
 end if;
 if p_evidence ? 'relevant_until' and p_evidence->'relevant_until'<>'null'::jsonb then
  if jsonb_typeof(p_evidence->'relevant_until') is distinct from 'string' or
   p_evidence->>'relevant_until' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
   raise exception using errcode='22023',message='INVALID_EVIDENCE';
  end if;
  v_until:=(p_evidence->>'relevant_until')::timestamptz;
  if v_observed is null or v_until<v_observed then raise exception using errcode='22023',message='INVALID_EVIDENCE'; end if;
 end if;
 v_conf:=coalesce(p_evidence->'confidence','{"state":"UNKNOWN","value":null}'::jsonb);
 if jsonb_typeof(v_conf) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_CONFIDENCE'; end if;
 v_confidence_state:=v_conf->>'state';
 if not(v_conf ?& array['state','value']) or exists(select 1 from jsonb_object_keys(v_conf) k where k not in ('state','value'))
  or v_confidence_state is null or v_confidence_state not in ('KNOWN','UNKNOWN')
  or (v_confidence_state='UNKNOWN' and v_conf->'value'<>'null'::jsonb)
  or (v_confidence_state='KNOWN' and jsonb_typeof(v_conf->'value') is distinct from 'number') then
  raise exception using errcode='22023',message='INVALID_CONFIDENCE';
 end if;
 if v_confidence_state='KNOWN' then
  v_confidence:=(v_conf->>'value')::numeric;
  if v_confidence not between 0 and 1 then raise exception using errcode='22023',message='INVALID_CONFIDENCE'; end if;
 end if;
 return jsonb_build_object('source_type',v_source,'observed_at_state',v_observed_state,'observed_at',v_observed,
  'confidence_state',v_confidence_state,'confidence',v_confidence,'verified_by',v_verified,
  'relevant_until',v_until,'context',p_evidence->'context');
exception when invalid_datetime_format or datetime_field_overflow then
 raise exception using errcode='22023',message='INVALID_EVIDENCE';
end $$;
revoke all on function app_private.hair_observation_evidence(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function app_private.hair_observation_evidence(jsonb,timestamptz) to elifora_hair_writer;

create function app_private.execute_hair_observation(p_membership_id uuid,p_location_id uuid,p_client_id uuid,p_payload jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare
 v_actor uuid:=auth.uid(); v_org uuid; v_context jsonb; v_status text; v_request uuid; v_region_id uuid;
 v_passport public.hair_passports%rowtype; v_region public.hair_regions%rowtype;
 v_observation public.hair_observations%rowtype; v_evidence public.hair_evidence%rowtype;
 v_version bigint; v_expected bigint; v_unverified boolean; v_previous uuid; v_previous_evidence uuid;
 v_patch jsonb; v_hash text; v_receipt app_private.hair_core_mutation_receipts%rowtype; v_result jsonb; v_fields jsonb;
begin
 if p_correlation_id is null then raise exception using errcode='22004',message='correlation identifier is required'; end if;
 if v_actor is null then return app_private.client_error('UNAUTHENTICATED',p_correlation_id); end if;
 if p_membership_id is null or p_location_id is null or p_client_id is null or jsonb_typeof(p_payload) is distinct from 'object'
  or pg_column_size(p_payload)>32768 then return app_private.client_error('VALIDATION_FAILED',p_correlation_id); end if;
 v_context:=app_private.hair_write_context(p_membership_id,p_location_id,'hair_passport.add_observation');
 if v_context ? 'code' then return app_private.client_error(v_context->>'code',p_correlation_id); end if;
 v_org:=(v_context->>'organization_id')::uuid;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('request_id','expected_version','region_id','technical','evidence','replace_unverified'))
  or jsonb_typeof(p_payload->'request_id') is distinct from 'string'
  or jsonb_typeof(p_payload->'expected_version') is distinct from 'number'
  or (p_payload ? 'replace_unverified' and jsonb_typeof(p_payload->'replace_unverified') is distinct from 'boolean')
  or (p_payload ? 'region_id' and jsonb_typeof(p_payload->'region_id') not in ('string','null')) then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 end if;
 if (p_payload->>'expected_version')::numeric not between 1 and 9007199254740990 or
  (p_payload->>'expected_version')::numeric<>trunc((p_payload->>'expected_version')::numeric) then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 end if;
 v_expected:=(p_payload->>'expected_version')::numeric::bigint;
 v_request:=(p_payload->>'request_id')::uuid; v_region_id:=(p_payload->>'region_id')::uuid;
 v_patch:=app_private.hair_core_patch(p_payload->'technical');
 if v_patch='{}'::jsonb then return app_private.client_error('INVALID_OBSERVATION',p_correlation_id); end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 v_context:=app_private.hair_write_context(p_membership_id,p_location_id,'hair_passport.add_observation');
 if v_context ? 'code' then return app_private.client_error(v_context->>'code',p_correlation_id); end if;
 if (v_context->>'organization_id')::uuid<>v_org then return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation_id); end if;
 select status into v_status from public.clients where id=p_client_id and organization_id=v_org;
 if not found then return app_private.client_error('CLIENT_NOT_FOUND',p_correlation_id); end if;
 if v_status='ARCHIVED' then return app_private.client_error('CLIENT_ARCHIVED',p_correlation_id); end if;
 select * into v_passport from public.hair_passports where organization_id=v_org and client_id=p_client_id and status='ACTIVE';
 if not found then return app_private.client_error('HAIR_PASSPORT_NOT_FOUND',p_correlation_id); end if;
 if v_region_id is not null then
  select * into v_region from public.hair_regions where id=v_region_id and organization_id=v_org and passport_id=v_passport.id and status='ACTIVE';
  if not found then return app_private.client_error('HAIR_REGION_NOT_FOUND',p_correlation_id); end if;
  v_version:=v_region.version; v_unverified:=v_region.has_unverified_state; v_previous:=v_region.current_observation_id;
 else
  v_version:=v_passport.version; v_unverified:=v_passport.has_unverified_state; v_previous:=v_passport.current_observation_id;
 end if;
 v_hash:=encode(extensions.digest(jsonb_build_array('add_observation',p_membership_id,p_location_id,p_client_id,p_payload-'request_id')::text,'sha256'),'hex');
 delete from app_private.hair_core_mutation_receipts where organization_id=v_org and actor_id=v_actor and expires_at<now();
 select * into v_receipt from app_private.hair_core_mutation_receipts where organization_id=v_org and actor_id=v_actor and request_id=v_request;
 if found then
  if v_receipt.payload_hash<>v_hash then return app_private.client_error('CONFLICT',p_correlation_id); end if;
  return v_receipt.response||jsonb_build_object('correlationId',p_correlation_id);
 end if;
 if v_version<>v_expected or (v_unverified and not coalesce((p_payload->>'replace_unverified')::boolean,false)) then
  return app_private.client_error('CONFLICT',p_correlation_id);
 end if;
 -- Time-sensitive evidence validation follows successful receipt replay.
 select * into v_evidence from jsonb_populate_record(null::public.hair_evidence,
  app_private.hair_observation_evidence(p_payload->'evidence',statement_timestamp()));
 if v_previous is not null then
  select evidence_id into v_previous_evidence from public.hair_observations where id=v_previous and organization_id=v_org and passport_id=v_passport.id;
 end if;
 insert into public.hair_evidence(organization_id,client_id,passport_id,source_type,observed_at_state,observed_at,
  confidence_state,confidence,verified_by,relevant_until,context,location_id,supersedes_id,correlation_id)
 values(v_org,p_client_id,v_passport.id,v_evidence.source_type,v_evidence.observed_at_state,v_evidence.observed_at,
  v_evidence.confidence_state,v_evidence.confidence,v_evidence.verified_by,v_evidence.relevant_until,v_evidence.context,p_location_id,v_previous_evidence,p_correlation_id)
 returning * into v_evidence;
 select * into v_observation from jsonb_populate_record(null::public.hair_observations,
  jsonb_build_object('natural_level_state','NOT_ASSESSED','perceived_level_state','NOT_ASSESSED','grey_ratio_state','NOT_ASSESSED','thickness_state','NOT_ASSESSED','density_state','NOT_ASSESSED','porosity_state','NOT_ASSESSED','elasticity_state','NOT_ASSESSED','tone_state','NOT_ASSESSED','cosmetic_color_history_state','NOT_ASSESSED','bleach_history_state','NOT_ASSESSED','chemical_history_state','NOT_ASSESSED')||v_patch);
 insert into public.hair_observations(organization_id,client_id,passport_id,region_id,evidence_id,supersedes_id,correlation_id,natural_level_state,natural_level,perceived_level_state,perceived_level,grey_ratio_state,grey_ratio,thickness_state,thickness,density_state,density,porosity_state,porosity,elasticity_state,elasticity,tone_state,tone,cosmetic_color_history_state,cosmetic_color_history,bleach_history_state,bleach_history,chemical_history_state,chemical_history,technical_notes,integrity_notes)
 values(v_org,p_client_id,v_passport.id,v_region_id,v_evidence.id,v_previous,p_correlation_id,v_observation.natural_level_state,v_observation.natural_level,v_observation.perceived_level_state,v_observation.perceived_level,v_observation.grey_ratio_state,v_observation.grey_ratio,v_observation.thickness_state,v_observation.thickness,v_observation.density_state,v_observation.density,v_observation.porosity_state,v_observation.porosity,v_observation.elasticity_state,v_observation.elasticity,v_observation.tone_state,v_observation.tone,v_observation.cosmetic_color_history_state,v_observation.cosmetic_color_history,v_observation.bleach_history_state,v_observation.bleach_history,v_observation.chemical_history_state,v_observation.chemical_history,v_observation.technical_notes,v_observation.integrity_notes) returning * into v_observation;
 if v_region_id is null then
  update public.hair_passports set current_observation_id=v_observation.id,has_unverified_state=false,correlation_id=p_correlation_id
   where id=v_passport.id and organization_id=v_org returning version into v_version;
 else
  update public.hair_regions set current_observation_id=v_observation.id,has_unverified_state=false,correlation_id=p_correlation_id
   where id=v_region_id and organization_id=v_org returning version into v_version;
 end if;
 if not found then raise exception using errcode='42501',message='current selection unavailable'; end if;
 select jsonb_agg(k order by k) into v_fields from jsonb_object_keys(p_payload->'technical') k;
 insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,metadata,correlation_id)
 values(v_actor,v_org,'hair_evidence.created','hair_evidence',v_evidence.id,
  jsonb_build_object('client_id',p_client_id,'passport_id',v_passport.id,'region_id',v_region_id,'source_type',v_evidence.source_type,'observation_id',v_observation.id),p_correlation_id),
 (v_actor,v_org,'hair_observation.created','hair_observations',v_observation.id,
  jsonb_build_object('client_id',p_client_id,'passport_id',v_passport.id,'region_id',v_region_id,'source_type',v_evidence.source_type,'fields',v_fields,'evidence_id',v_evidence.id),p_correlation_id);
 v_result:=jsonb_build_object('correlationId',p_correlation_id,'data',jsonb_build_object('client_id',p_client_id,'passport_id',v_passport.id,
  'target_version',v_version,'observation',app_private.hair_observation_read_model(v_observation,v_evidence)));
 insert into app_private.hair_core_mutation_receipts(organization_id,actor_id,request_id,payload_hash,response)
  values(v_org,v_actor,v_request,v_hash,v_result);
 return v_result;
exception
 when sqlstate '22023' then
  return app_private.client_error(case when sqlerrm in ('INVALID_EVIDENCE','INVALID_CONFIDENCE') then sqlerrm else 'INVALID_OBSERVATION' end,p_correlation_id);
 when check_violation or not_null_violation then return app_private.client_error('INVALID_OBSERVATION',p_correlation_id);
 when invalid_text_representation or numeric_value_out_of_range then return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 when insufficient_privilege then return app_private.client_error('FORBIDDEN',p_correlation_id);
end $$;
grant create on schema app_private to elifora_hair_writer;
alter function app_private.execute_hair_observation(uuid,uuid,uuid,jsonb,uuid) owner to elifora_hair_writer;
revoke create on schema app_private from elifora_hair_writer;
revoke all on function app_private.execute_hair_observation(uuid,uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function app_private.execute_hair_observation(uuid,uuid,uuid,jsonb,uuid) to authenticated;
create function public.hair_observation_operation(p_membership_id uuid,p_location_id uuid,p_client_id uuid,p_payload jsonb,p_correlation_id uuid default gen_random_uuid())
returns jsonb language sql security invoker set search_path='' as $$
 select app_private.execute_hair_observation(p_membership_id,p_location_id,p_client_id,p_payload,p_correlation_id);
$$;
revoke all on function public.hair_observation_operation(uuid,uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function public.hair_observation_operation(uuid,uuid,uuid,jsonb,uuid) to authenticated;
