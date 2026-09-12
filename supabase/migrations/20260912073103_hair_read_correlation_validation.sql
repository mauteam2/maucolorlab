-- Generate omitted correlation IDs at the call-site default, outside the STABLE
-- read body. An explicit null violates the RPC contract and is an argument error.
create or replace function public.hair_passport_snapshot(
 p_membership_id uuid,p_location_id uuid,p_client_id uuid,
 p_options jsonb default '{}'::jsonb,p_correlation_id uuid default gen_random_uuid())
returns jsonb language plpgsql stable security invoker set search_path='' set row_security='on'
as $$
declare
 v_actor uuid:=auth.uid(); v_org uuid; v_role text; v_membership_status text;
 v_scope_location uuid; v_client_status text; v_passport public.hair_passports%rowtype;
 v_include_archived boolean; v_limit integer; v_tests_offset integer; v_history_offset integer;
 v_core jsonb; v_regions jsonb; v_tests jsonb; v_history jsonb;
 v_tests_more boolean; v_history_more boolean;
begin
 if p_correlation_id is null then
  raise exception using errcode='22023',message='correlation identifier is required';
 end if;
 if v_actor is null then return app_private.client_error('UNAUTHENTICATED',p_correlation_id); end if;
 if p_client_id is null or p_membership_id is null or p_location_id is null
  or p_options is null or jsonb_typeof(p_options)<>'object' or pg_column_size(p_options)>1024 then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 end if;
 if exists(select 1 from jsonb_object_keys(p_options) k
  where k not in ('include_archived','page_size','tests_offset','history_offset'))
  or (p_options ? 'include_archived' and jsonb_typeof(p_options->'include_archived')<>'boolean') then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 end if;
 if exists(select 1 from jsonb_each(p_options) kv
  where kv.key in ('page_size','tests_offset','history_offset')
   and case when jsonb_typeof(kv.value)='number' then
    kv.value::text::numeric not between 0 and 10000
     or kv.value::text::numeric<>trunc(kv.value::text::numeric)
    else true end) then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 end if;
 v_include_archived:=coalesce((p_options->>'include_archived')::boolean,false);
 v_limit:=coalesce((p_options->>'page_size')::numeric::integer,50);
 v_tests_offset:=coalesce((p_options->>'tests_offset')::numeric::integer,0);
 v_history_offset:=coalesce((p_options->>'history_offset')::numeric::integer,0);
 if v_limit not between 1 and 100 or v_tests_offset>10000 or v_history_offset>10000 then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 end if;
 -- A membership reference never authorizes another user's membership.
 select m.organization_id,m.role_code,m.status,m.location_id
 into v_org,v_role,v_membership_status,v_scope_location
 from public.salon_memberships m where m.id=p_membership_id and m.user_id=v_actor;
 if v_org is null then return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation_id); end if;
 if v_membership_status='revoked' then return app_private.client_error('MEMBERSHIP_REVOKED',p_correlation_id); end if;
 if v_membership_status<>'active'
  or (v_scope_location is not null and v_scope_location<>p_location_id)
  or not exists(select 1 from public.organizations o where o.id=v_org and o.archived_at is null)
  or not exists(select 1 from public.locations l where l.id=p_location_id and l.organization_id=v_org and l.archived_at is null) then
  return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation_id);
 end if;
 if not exists(select 1 from public.role_permissions rp where rp.role_code=v_role and rp.permission_code='hair_passport.read') then
  return app_private.client_error('FORBIDDEN',p_correlation_id);
 end if;
 select c.status into v_client_status from public.clients c where c.id=p_client_id and c.organization_id=v_org;
 if v_client_status is null or (v_client_status='ARCHIVED' and not v_include_archived) then
  return app_private.client_error('CLIENT_NOT_FOUND',p_correlation_id);
 end if;
 select p.* into v_passport from public.hair_passports p where p.organization_id=v_org and p.client_id=p_client_id;
 if not found or (v_passport.status='ARCHIVED' and not v_include_archived) then
  return app_private.client_error('HAIR_PASSPORT_NOT_FOUND',p_correlation_id);
 end if;

 -- Fixed set-based projections: no per-region/test/history SQL lookup loop.
 with current_ids as (
  select v_passport.current_observation_id as id
  union
  select r.current_observation_id from public.hair_regions r
   where r.organization_id=v_org and r.passport_id=v_passport.id
 ), assessments as materialized (
  select o.id,o.region_id,app_private.hair_observation_read_model(o,e) as dto
  from current_ids i join public.hair_observations o on o.id=i.id
  join public.hair_evidence e on e.organization_id=o.organization_id and e.passport_id=o.passport_id and e.id=o.evidence_id
  where o.organization_id=v_org and o.passport_id=v_passport.id
 )
 select
  coalesce((select jsonb_build_object('state','ASSESSED','observation',a.dto) from assessments a
   where a.id=v_passport.current_observation_id and a.region_id is null),
   jsonb_build_object('state','NOT_ASSESSED','observation',null)),
  coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'type',r.region_type,'label',r.label,
    'status',r.status,'version',r.version,'updated_at',r.updated_at,
    'assessment',case when a.id is null then jsonb_build_object('state','NOT_ASSESSED','observation',null)
     else jsonb_build_object('state','ASSESSED','observation',a.dto) end) order by r.created_at,r.id)
   from public.hair_regions r left join assessments a on a.id=r.current_observation_id and a.region_id=r.id
   where r.organization_id=v_org and r.passport_id=v_passport.id),'[]'::jsonb)
 into v_core,v_regions;

 with page as materialized (
  select t.* from public.hair_physical_tests t where t.organization_id=v_org and t.passport_id=v_passport.id
  order by t.performed_at desc,t.id offset v_tests_offset limit v_limit+1
 ), selected as (
  select t.* from page t order by t.performed_at desc,t.id limit v_limit
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'region_id',t.region_id,'type',t.test_type,
  'result',jsonb_build_object('state',t.result_state,'value',t.result),
  'performed_by',t.performed_by,'performed_at',t.performed_at,'recorded_at',t.created_at,
  'recorded_by',t.created_by,'notes',t.notes,'supersedes_id',t.supersedes_id,
  'evidence',app_private.hair_evidence_read_model(e)) order by t.performed_at desc,t.id),'[]'::jsonb),
  (select count(*)>v_limit from page)
 into v_tests,v_tests_more
 from selected t join public.hair_evidence e on e.organization_id=t.organization_id and e.passport_id=t.passport_id and e.id=t.evidence_id;

 with page as materialized (
  select h.* from public.hair_history_events h where h.organization_id=v_org and h.passport_id=v_passport.id
  order by h.performed_on desc,h.id offset v_history_offset limit v_limit+1
 ), selected as materialized (
  select h.* from page h order by h.performed_on desc,h.id limit v_limit
 ), affected as (
  select hr.history_event_id,jsonb_agg(hr.region_id order by hr.region_id) as region_ids
  from public.hair_history_regions hr join selected h on h.id=hr.history_event_id
   and h.organization_id=hr.organization_id and h.passport_id=hr.passport_id
  where hr.organization_id=v_org and hr.passport_id=v_passport.id group by hr.history_event_id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',h.id,'category',h.category,'performed_on',jsonb_build_object('state',h.date_precision,'value',h.performed_on),
  'product',jsonb_build_object('state',h.product_state,'value',h.product_description),
  'description',h.description,'attributed_salon',h.attributed_salon,'attributed_professional',h.attributed_professional,
  'location_id',h.location_id,'region_ids',coalesce(a.region_ids,'[]'::jsonb),
  'recorded_at',h.created_at,'recorded_by',h.created_by,'supersedes_id',h.supersedes_id,
  'evidence',app_private.hair_evidence_read_model(e)) order by h.performed_on desc,h.id),'[]'::jsonb),
  (select count(*)>v_limit from page)
 into v_history,v_history_more
 from selected h join public.hair_evidence e on e.organization_id=h.organization_id and e.passport_id=h.passport_id and e.id=h.evidence_id
 left join affected a on a.history_event_id=h.id;

 return jsonb_build_object('correlationId',p_correlation_id,'data',jsonb_build_object(
  'passport',jsonb_build_object('id',v_passport.id,'client_id',p_client_id,'status',v_passport.status,
   'client_status',v_client_status,'version',v_passport.version,'created_at',v_passport.created_at,'updated_at',v_passport.updated_at),
  'core',v_core,'regions',v_regions,
  'physical_tests',jsonb_build_object('items',v_tests,'offset',v_tests_offset,'page_size',v_limit,'has_more',v_tests_more,
   'next_offset',case when v_tests_more then v_tests_offset+v_limit else null end),
  'history',jsonb_build_object('items',v_history,'offset',v_history_offset,'page_size',v_limit,'has_more',v_history_more,
   'next_offset',case when v_history_more then v_history_offset+v_limit else null end)));
end $$;
