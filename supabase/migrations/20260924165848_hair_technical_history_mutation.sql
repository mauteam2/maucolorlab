-- Phase 1C-2B2B2: atomic append-only history, region links and provenance.
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
  if TG_TABLE_NAME='hair_regions' and (new.passport_id<>old.passport_id or new.region_type<>old.region_type) then
   raise exception using errcode='23514',message='region identity is immutable';
  end if;
 end if;
 if TG_OP='INSERT' and TG_TABLE_NAME='hair_regions'
  and app_private.can_initialize_hair_region(new.organization_id,new.passport_id,new.region_type) then
  v_permission:='hair_passport.create';
 end if;
 -- Each append permission can create only its own evidence class.
 if TG_OP='INSERT' and TG_TABLE_NAME='hair_evidence' then
  if new.source_type='PHYSICAL_TEST' and app_private.can_access_hair(new.organization_id,'hair_passport.add_test') then
   v_permission:='hair_passport.add_test';
  elsif new.source_type in ('HISTORICAL','IMPORTED_UNVERIFIED')
   and app_private.can_access_hair(new.organization_id,'hair_passport.add_history') then
   v_permission:='hair_passport.add_history';
  end if;
 end if;
 if auth.uid() is null or not app_private.can_access_hair(new.organization_id,v_permission) then
  raise exception using errcode='42501',message='technical write unavailable';
 end if;
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
 elsif TG_TABLE_NAME='hair_history_events' then
  select e.source_type into v_source from public.hair_evidence e
   where e.organization_id=new.organization_id and e.passport_id=v_passport and e.id=new.evidence_id;
  if v_source not in ('HISTORICAL','IMPORTED_UNVERIFIED') then
   raise exception using errcode='23514',message='historical evidence required';
  end if;
 end if;
 return new;
end $$;

alter policy hair_evidence_insert on public.hair_evidence
 with check(created_by=(select auth.uid()) and (
  app_private.can_access_hair(organization_id,'hair_passport.add_observation')
  or (source_type='PHYSICAL_TEST' and app_private.can_access_hair(organization_id,'hair_passport.add_test'))
  or (source_type in ('HISTORICAL','IMPORTED_UNVERIFIED') and app_private.can_access_hair(organization_id,'hair_passport.add_history'))));

create policy hair_history_created_audit on public.audit_events for insert to elifora_hair_writer
 with check(actor_user_id=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.add_history')
  and action='hair_history_event.created' and entity_type='hair_history_events');

create function app_private.hair_history_evidence(p_evidence jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 v_source text; v_confidence_state text:='UNKNOWN'; v_confidence numeric;
begin
 if jsonb_typeof(p_evidence) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_evidence) k where k not in ('source','confidence','context'))
  or jsonb_typeof(p_evidence->'source') is distinct from 'string' then
  raise exception using errcode='22023',message='INVALID_EVIDENCE';
 end if;
 v_source:=p_evidence->>'source';
 if v_source not in ('HISTORICAL','IMPORTED_UNVERIFIED') then
  raise exception using errcode='22023',message='INVALID_EVIDENCE';
 end if;
 if p_evidence ? 'context' and (jsonb_typeof(p_evidence->'context') not in ('string','null')
  or (jsonb_typeof(p_evidence->'context')='string'
   and (char_length(trim(p_evidence->>'context'))=0 or char_length(p_evidence->>'context')>2000))) then
  raise exception using errcode='22023',message='INVALID_EVIDENCE';
 end if;
 if p_evidence ? 'confidence' then
  if jsonb_typeof(p_evidence->'confidence') is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(p_evidence->'confidence') k where k not in ('state','value'))
   or not (p_evidence->'confidence' ?& array['state','value'])
   or jsonb_typeof(p_evidence#>'{confidence,state}') is distinct from 'string'
   or p_evidence#>>'{confidence,state}' not in ('KNOWN','UNKNOWN') then
   raise exception using errcode='22023',message='INVALID_EVIDENCE';
  end if;
  v_confidence_state:=p_evidence#>>'{confidence,state}';
  if v_confidence_state='KNOWN' then
   if jsonb_typeof(p_evidence#>'{confidence,value}') is distinct from 'number' then
    raise exception using errcode='22023',message='INVALID_EVIDENCE';
   end if;
   v_confidence:=(p_evidence#>>'{confidence,value}')::numeric;
   if v_confidence='NaN'::numeric or v_confidence not between 0 and 1 then
    raise exception using errcode='22023',message='INVALID_EVIDENCE';
   end if;
  elsif jsonb_typeof(p_evidence#>'{confidence,value}') is distinct from 'null' then
   raise exception using errcode='22023',message='INVALID_EVIDENCE';
  end if;
 end if;
 return jsonb_build_object('source_type',v_source,'observed_at_state','UNKNOWN','confidence_state',v_confidence_state,
  'confidence',v_confidence,'context',p_evidence->'context');
end $$;
revoke all on function app_private.hair_history_evidence(jsonb) from public,anon,authenticated;
grant execute on function app_private.hair_history_evidence(jsonb) to elifora_hair_writer;

create function app_private.execute_hair_history(p_membership_id uuid,p_location_id uuid,p_client_id uuid,p_payload jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare
 v_actor uuid:=auth.uid(); v_org uuid; v_context jsonb; v_status text; v_request uuid; v_location uuid;
 v_passport public.hair_passports%rowtype; v_event public.hair_history_events%rowtype; v_evidence public.hair_evidence%rowtype;
 v_hash text; v_receipt app_private.hair_core_mutation_receipts%rowtype; v_result jsonb;
 v_category text; v_date_state text; v_date date; v_product_state text; v_product text;
 v_regions uuid[]:='{}'::uuid[]; v_region_json jsonb:='[]'::jsonb;
begin
 if p_correlation_id is null then raise exception using errcode='22004',message='correlation identifier is required'; end if;
 if v_actor is null then return app_private.client_error('UNAUTHENTICATED',p_correlation_id); end if;
 if p_membership_id is null or p_location_id is null or p_client_id is null
  or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>32768 then
  return app_private.client_error('INVALID_HISTORY_EVENT',p_correlation_id);
 end if;
 v_context:=app_private.hair_write_context(p_membership_id,p_location_id,'hair_passport.add_history');
 if v_context ? 'code' then return app_private.client_error(v_context->>'code',p_correlation_id); end if;
 v_org:=(v_context->>'organization_id')::uuid;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in
  ('request_id','category','performed_on','product','description','region_ids','location_id','attributed_salon','attributed_professional','evidence'))
  or jsonb_typeof(p_payload->'request_id') is distinct from 'string'
  or jsonb_typeof(p_payload->'category') is distinct from 'string'
  or jsonb_typeof(p_payload->'description') is distinct from 'string'
  or char_length(trim(p_payload->>'description'))=0 or char_length(p_payload->>'description')>2000
  or (p_payload ? 'region_ids' and jsonb_typeof(p_payload->'region_ids') is distinct from 'array')
  or (p_payload ? 'location_id' and jsonb_typeof(p_payload->'location_id') not in ('string','null'))
  or (p_payload ? 'attributed_salon' and (jsonb_typeof(p_payload->'attributed_salon') not in ('string','null')
   or (jsonb_typeof(p_payload->'attributed_salon')='string' and (char_length(trim(p_payload->>'attributed_salon'))=0 or char_length(p_payload->>'attributed_salon')>160))))
  or (p_payload ? 'attributed_professional' and (jsonb_typeof(p_payload->'attributed_professional') not in ('string','null')
   or (jsonb_typeof(p_payload->'attributed_professional')='string' and (char_length(trim(p_payload->>'attributed_professional'))=0 or char_length(p_payload->>'attributed_professional')>160)))) then
  return app_private.client_error('INVALID_HISTORY_EVENT',p_correlation_id);
 end if;
 v_request:=(p_payload->>'request_id')::uuid; v_category:=p_payload->>'category'; v_location:=(p_payload->>'location_id')::uuid;
 if v_category not in ('COLOR','BLEACH_LIGHTENING','TONER_GLOSS','PERM','RELAXER_STRAIGHTENING','KERATIN_SMOOTHING','OTHER_CHEMICAL') then
  return app_private.client_error('INVALID_HISTORY_CATEGORY',p_correlation_id);
 end if;
 if jsonb_typeof(p_payload->'performed_on') is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_payload->'performed_on') k where k not in ('state','value'))
  or not (p_payload->'performed_on' ?& array['state','value'])
  or jsonb_typeof(p_payload#>'{performed_on,state}') is distinct from 'string' then
  return app_private.client_error('INVALID_HISTORY_DATE',p_correlation_id);
 end if;
 v_date_state:=p_payload#>>'{performed_on,state}';
if v_date_state in ('EXACT','APPROXIMATE')
 and jsonb_typeof(p_payload#>'{performed_on,value}')='string'
 and (p_payload#>>'{performed_on,value}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
  v_date:=(p_payload#>>'{performed_on,value}')::date;
  if v_date<date '1900-01-01' or v_date>(statement_timestamp() at time zone 'UTC')::date then
   return app_private.client_error('INVALID_HISTORY_DATE',p_correlation_id);
  end if;
 elsif v_date_state='UNKNOWN' and jsonb_typeof(p_payload#>'{performed_on,value}')='null' then
  v_date:=null;
 else
  return app_private.client_error('INVALID_HISTORY_DATE',p_correlation_id);
 end if;
 if jsonb_typeof(p_payload->'product') is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_payload->'product') k where k not in ('state','value'))
  or not (p_payload->'product' ?& array['state','value'])
  or jsonb_typeof(p_payload#>'{product,state}') is distinct from 'string' then
  return app_private.client_error('INVALID_HISTORY_EVENT',p_correlation_id);
 end if;
 v_product_state:=p_payload#>>'{product,state}'; v_product:=p_payload#>>'{product,value}';
 if (v_product_state='KNOWN' and (jsonb_typeof(p_payload#>'{product,value}')<>'string'
   or char_length(trim(v_product))=0 or char_length(v_product)>500))
  or (v_product_state in ('UNKNOWN','NOT_APPLICABLE') and jsonb_typeof(p_payload#>'{product,value}')<>'null')
  or v_product_state not in ('KNOWN','UNKNOWN','NOT_APPLICABLE') then
  return app_private.client_error('INVALID_HISTORY_EVENT',p_correlation_id);
 end if;
 if coalesce(jsonb_array_length(p_payload->'region_ids'),0)>100 then
  return app_private.client_error('INVALID_HISTORY_EVENT',p_correlation_id);
 end if;
 if p_payload ? 'region_ids' then
  select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}'::uuid[])
  into v_regions from jsonb_array_elements_text(p_payload->'region_ids');
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 v_context:=app_private.hair_write_context(p_membership_id,p_location_id,'hair_passport.add_history');
 if v_context ? 'code' then return app_private.client_error(v_context->>'code',p_correlation_id); end if;
 if (v_context->>'organization_id')::uuid<>v_org then return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation_id); end if;
 select status into v_status from public.clients where id=p_client_id and organization_id=v_org;
 if not found then return app_private.client_error('CLIENT_NOT_FOUND',p_correlation_id); end if;
 if v_status='ARCHIVED' then return app_private.client_error('CLIENT_ARCHIVED',p_correlation_id); end if;
 select * into v_passport from public.hair_passports where organization_id=v_org and client_id=p_client_id and status='ACTIVE';
 if not found then return app_private.client_error('HAIR_PASSPORT_NOT_FOUND',p_correlation_id); end if;
 if exists(select 1 from unnest(v_regions) supplied(id) where not exists(
  select 1 from public.hair_regions r where r.id=supplied.id and r.organization_id=v_org and r.passport_id=v_passport.id)) then
  return app_private.client_error('HAIR_REGION_NOT_FOUND',p_correlation_id);
 end if;
 if v_location is not null and not exists(select 1 from public.locations l
  where l.id=v_location and l.organization_id=v_org and l.archived_at is null) then
  return app_private.client_error('LOCATION_NOT_FOUND',p_correlation_id);
 end if;
 v_hash:=encode(extensions.digest(jsonb_build_array('add_history',p_membership_id,p_location_id,p_client_id,p_payload-'request_id')::text,'sha256'),'hex');
 delete from app_private.hair_core_mutation_receipts where organization_id=v_org and actor_id=v_actor and expires_at<now();
 select * into v_receipt from app_private.hair_core_mutation_receipts
  where organization_id=v_org and actor_id=v_actor and request_id=v_request;
 if found then
  if v_receipt.payload_hash<>v_hash then return app_private.client_error('CONFLICT',p_correlation_id); end if;
  return v_receipt.response||jsonb_build_object('correlationId',p_correlation_id);
 end if;
 select * into v_evidence from jsonb_populate_record(null::public.hair_evidence,
  app_private.hair_history_evidence(p_payload->'evidence'));
 insert into public.hair_evidence(organization_id,client_id,passport_id,source_type,observed_at_state,confidence_state,
  confidence,context,location_id,correlation_id)
 values(v_org,p_client_id,v_passport.id,v_evidence.source_type,'UNKNOWN',v_evidence.confidence_state,
  v_evidence.confidence,v_evidence.context,v_location,p_correlation_id) returning * into v_evidence;
 insert into public.hair_history_events(organization_id,client_id,passport_id,evidence_id,category,date_precision,performed_on,
  product_state,product_description,description,attributed_salon,attributed_professional,location_id,correlation_id)
 values(v_org,p_client_id,v_passport.id,v_evidence.id,v_category,v_date_state,v_date,v_product_state,v_product,
  p_payload->>'description',p_payload->>'attributed_salon',p_payload->>'attributed_professional',v_location,p_correlation_id)
 returning * into v_event;
 if cardinality(v_regions)>0 then
  insert into public.hair_history_regions(organization_id,client_id,passport_id,history_event_id,region_id,correlation_id)
  select v_org,p_client_id,v_passport.id,v_event.id,id,p_correlation_id from unnest(v_regions) supplied(id);
 end if;
 select coalesce(jsonb_agg(id order by id),'[]'::jsonb) into v_region_json from unnest(v_regions) supplied(id);
 insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,metadata,correlation_id)
 values(v_actor,v_org,'hair_history_event.created','hair_history_events',v_event.id,
  jsonb_build_object('client_id',p_client_id,'passport_id',v_passport.id,'category',v_category,
   'region_ids',v_region_json,'evidence_id',v_evidence.id,'source_type',v_evidence.source_type),p_correlation_id);
 v_result:=jsonb_build_object('correlationId',p_correlation_id,'data',jsonb_build_object(
  'client_id',p_client_id,'passport_id',v_passport.id,'history',jsonb_build_object(
   'id',v_event.id,'category',v_event.category,
   'performed_on',jsonb_build_object('state',v_event.date_precision,'value',v_event.performed_on),
   'product',jsonb_build_object('state',v_event.product_state,'value',v_event.product_description),
   'description',v_event.description,'attributed_salon',v_event.attributed_salon,
   'attributed_professional',v_event.attributed_professional,'location_id',v_event.location_id,
   'region_ids',v_region_json,'recorded_at',v_event.created_at,'recorded_by',v_event.created_by,
   'supersedes_id',v_event.supersedes_id,'evidence',app_private.hair_evidence_read_model(v_evidence))));
 insert into app_private.hair_core_mutation_receipts(organization_id,actor_id,request_id,payload_hash,response)
 values(v_org,v_actor,v_request,v_hash,v_result);
 return v_result;
exception
 when sqlstate '22023' then return app_private.client_error('INVALID_EVIDENCE',p_correlation_id);
 when invalid_datetime_format or datetime_field_overflow then return app_private.client_error('INVALID_HISTORY_DATE',p_correlation_id);
 when invalid_text_representation then return app_private.client_error('INVALID_HISTORY_EVENT',p_correlation_id);
 when check_violation or not_null_violation or unique_violation then return app_private.client_error('INVALID_HISTORY_EVENT',p_correlation_id);
 when insufficient_privilege then return app_private.client_error('FORBIDDEN',p_correlation_id);
end $$;
grant create on schema app_private to elifora_hair_writer;
alter function app_private.execute_hair_history(uuid,uuid,uuid,jsonb,uuid) owner to elifora_hair_writer;
revoke create on schema app_private from elifora_hair_writer;
revoke all on function app_private.execute_hair_history(uuid,uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function app_private.execute_hair_history(uuid,uuid,uuid,jsonb,uuid) to authenticated;

create function public.hair_history_operation(p_membership_id uuid,p_location_id uuid,p_client_id uuid,p_payload jsonb,p_correlation_id uuid default gen_random_uuid())
returns jsonb language sql security invoker set search_path='' as $$
 select app_private.execute_hair_history(p_membership_id,p_location_id,p_client_id,p_payload,p_correlation_id);
$$;
revoke all on function public.hair_history_operation(uuid,uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function public.hair_history_operation(uuid,uuid,uuid,jsonb,uuid) to authenticated;
