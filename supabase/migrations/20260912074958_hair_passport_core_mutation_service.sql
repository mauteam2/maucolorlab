-- ELIFORA Phase 1C-2B1: mutable, explicitly unverified technical state.
-- No evidence or historical facts are created or modified.

alter table public.hair_passports
 add column has_unverified_state boolean not null default false,
 add column natural_level_state text not null default 'NOT_ASSESSED'
  check(natural_level_state in ('NOT_ASSESSED','UNKNOWN','KNOWN')),
 add column natural_level numeric,
 add check((natural_level_state='KNOWN' and natural_level is not null and natural_level between 1 and 10)
  or (natural_level_state<>'KNOWN' and natural_level is null)),
 add column perceived_level_state text not null default 'NOT_ASSESSED'
  check(perceived_level_state in ('NOT_ASSESSED','UNKNOWN','KNOWN')),
 add column perceived_level numeric,
 add check((perceived_level_state='KNOWN' and perceived_level is not null and perceived_level between 1 and 10)
  or (perceived_level_state<>'KNOWN' and perceived_level is null)),
 add column grey_ratio_state text not null default 'NOT_ASSESSED'
  check(grey_ratio_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column grey_ratio numeric,
 add check((grey_ratio_state='KNOWN' and grey_ratio is not null and grey_ratio between 0 and 1)
  or (grey_ratio_state<>'KNOWN' and grey_ratio is null)),
 add column thickness_state text not null default 'NOT_ASSESSED'
  check(thickness_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column thickness text,
 add check((thickness_state='KNOWN' and thickness is not null and thickness in ('FINE','MEDIUM','COARSE'))
  or (thickness_state<>'KNOWN' and thickness is null)),
 add column density_state text not null default 'NOT_ASSESSED'
  check(density_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column density text,
 add check((density_state='KNOWN' and density is not null and density in ('LOW','MEDIUM','HIGH'))
  or (density_state<>'KNOWN' and density is null)),
 add column porosity_state text not null default 'NOT_ASSESSED'
  check(porosity_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column porosity text,
 add check((porosity_state='KNOWN' and porosity is not null and porosity in ('LOW','MEDIUM','HIGH'))
  or (porosity_state<>'KNOWN' and porosity is null)),
 add column elasticity_state text not null default 'NOT_ASSESSED'
  check(elasticity_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column elasticity text,
 add check((elasticity_state='KNOWN' and elasticity is not null and elasticity in ('LOW','NORMAL','HIGH'))
  or (elasticity_state<>'KNOWN' and elasticity is null)),
 add column tone_state text not null default 'NOT_ASSESSED'
  check(tone_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column tone text,
 add check((tone_state='KNOWN' and tone is not null and char_length(trim(tone)) between 1 and 120)
  or (tone_state<>'KNOWN' and tone is null)),
 add column cosmetic_color_history_state text not null default 'NOT_ASSESSED'
  check(cosmetic_color_history_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column cosmetic_color_history text,
 add check((cosmetic_color_history_state='KNOWN' and cosmetic_color_history is not null and char_length(trim(cosmetic_color_history)) between 1 and 2000)
  or (cosmetic_color_history_state<>'KNOWN' and cosmetic_color_history is null)),
 add column bleach_history_state text not null default 'NOT_ASSESSED'
  check(bleach_history_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column bleach_history text,
 add check((bleach_history_state='KNOWN' and bleach_history is not null and char_length(trim(bleach_history)) between 1 and 2000)
  or (bleach_history_state<>'KNOWN' and bleach_history is null)),
 add column chemical_history_state text not null default 'NOT_ASSESSED'
  check(chemical_history_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column chemical_history text,
 add check((chemical_history_state='KNOWN' and chemical_history is not null and char_length(trim(chemical_history)) between 1 and 2000)
  or (chemical_history_state<>'KNOWN' and chemical_history is null)),
 add column technical_notes text check(technical_notes is null or char_length(trim(technical_notes)) between 1 and 4000),
 add column integrity_notes text check(integrity_notes is null or char_length(trim(integrity_notes)) between 1 and 2000);

alter table public.hair_regions
 add column has_unverified_state boolean not null default false,
 add column natural_level_state text not null default 'NOT_ASSESSED'
  check(natural_level_state in ('NOT_ASSESSED','UNKNOWN','KNOWN')),
 add column natural_level numeric,
 add check((natural_level_state='KNOWN' and natural_level is not null and natural_level between 1 and 10)
  or (natural_level_state<>'KNOWN' and natural_level is null)),
 add column perceived_level_state text not null default 'NOT_ASSESSED'
  check(perceived_level_state in ('NOT_ASSESSED','UNKNOWN','KNOWN')),
 add column perceived_level numeric,
 add check((perceived_level_state='KNOWN' and perceived_level is not null and perceived_level between 1 and 10)
  or (perceived_level_state<>'KNOWN' and perceived_level is null)),
 add column grey_ratio_state text not null default 'NOT_ASSESSED'
  check(grey_ratio_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column grey_ratio numeric,
 add check((grey_ratio_state='KNOWN' and grey_ratio is not null and grey_ratio between 0 and 1)
  or (grey_ratio_state<>'KNOWN' and grey_ratio is null)),
 add column thickness_state text not null default 'NOT_ASSESSED'
  check(thickness_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column thickness text,
 add check((thickness_state='KNOWN' and thickness is not null and thickness in ('FINE','MEDIUM','COARSE'))
  or (thickness_state<>'KNOWN' and thickness is null)),
 add column density_state text not null default 'NOT_ASSESSED'
  check(density_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column density text,
 add check((density_state='KNOWN' and density is not null and density in ('LOW','MEDIUM','HIGH'))
  or (density_state<>'KNOWN' and density is null)),
 add column porosity_state text not null default 'NOT_ASSESSED'
  check(porosity_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column porosity text,
 add check((porosity_state='KNOWN' and porosity is not null and porosity in ('LOW','MEDIUM','HIGH'))
  or (porosity_state<>'KNOWN' and porosity is null)),
 add column elasticity_state text not null default 'NOT_ASSESSED'
  check(elasticity_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column elasticity text,
 add check((elasticity_state='KNOWN' and elasticity is not null and elasticity in ('LOW','NORMAL','HIGH'))
  or (elasticity_state<>'KNOWN' and elasticity is null)),
 add column tone_state text not null default 'NOT_ASSESSED'
  check(tone_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column tone text,
 add check((tone_state='KNOWN' and tone is not null and char_length(trim(tone)) between 1 and 120)
  or (tone_state<>'KNOWN' and tone is null)),
 add column cosmetic_color_history_state text not null default 'NOT_ASSESSED'
  check(cosmetic_color_history_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column cosmetic_color_history text,
 add check((cosmetic_color_history_state='KNOWN' and cosmetic_color_history is not null and char_length(trim(cosmetic_color_history)) between 1 and 2000)
  or (cosmetic_color_history_state<>'KNOWN' and cosmetic_color_history is null)),
 add column bleach_history_state text not null default 'NOT_ASSESSED'
  check(bleach_history_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column bleach_history text,
 add check((bleach_history_state='KNOWN' and bleach_history is not null and char_length(trim(bleach_history)) between 1 and 2000)
  or (bleach_history_state<>'KNOWN' and bleach_history is null)),
 add column chemical_history_state text not null default 'NOT_ASSESSED'
  check(chemical_history_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 add column chemical_history text,
 add check((chemical_history_state='KNOWN' and chemical_history is not null and char_length(trim(chemical_history)) between 1 and 2000)
  or (chemical_history_state<>'KNOWN' and chemical_history is null)),
 add column technical_notes text check(technical_notes is null or char_length(trim(technical_notes)) between 1 and 4000),
 add column integrity_notes text check(integrity_notes is null or char_length(trim(integrity_notes)) between 1 and 2000);


-- Only the three defaults of a passport created in this statement may use create permission.
create function app_private.can_initialize_hair_region(p_org uuid,p_passport uuid,p_type text)
returns boolean language sql stable security invoker set search_path='' as $$
 select p_type in ('ROOT','MID_LENGTHS','ENDS')
  and app_private.can_access_hair(p_org,'hair_passport.create')
  and exists(select 1 from public.hair_passports p where p.organization_id=p_org and p.id=p_passport
   and p.created_by=auth.uid() and p.version=1 and p.status='ACTIVE' and p.created_at=statement_timestamp());
$$;
revoke all on function app_private.can_initialize_hair_region(uuid,uuid,text) from public,anon,authenticated;
grant execute on function app_private.can_initialize_hair_region(uuid,uuid,text) to elifora_hair_writer;
alter policy hair_regions_insert on public.hair_regions with check(created_by=(select auth.uid()) and
 (app_private.can_access_hair(organization_id,'hair_passport.update') or
  app_private.can_initialize_hair_region(organization_id,passport_id,region_type)));

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



-- Pure DTO projection; the relational values carry no claimed evidence/provenance.
create function app_private.hair_unverified_overlay(p_row jsonb,p_assessment jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select case when (p_row->>'has_unverified_state')::boolean then
  jsonb_build_object('state','UNVERIFIED','values',jsonb_build_object(
   'natural_level',jsonb_build_object('state',p_row->'natural_level_state','value',p_row->'natural_level'),
   'perceived_level',jsonb_build_object('state',p_row->'perceived_level_state','value',p_row->'perceived_level'),
   'grey_ratio',jsonb_build_object('state',p_row->'grey_ratio_state','value',p_row->'grey_ratio'),
   'thickness',jsonb_build_object('state',p_row->'thickness_state','value',p_row->'thickness'),
   'density',jsonb_build_object('state',p_row->'density_state','value',p_row->'density'),
   'porosity',jsonb_build_object('state',p_row->'porosity_state','value',p_row->'porosity'),
   'elasticity',jsonb_build_object('state',p_row->'elasticity_state','value',p_row->'elasticity'),
   'tone',jsonb_build_object('state',p_row->'tone_state','value',p_row->'tone'),
   'cosmetic_color_history',jsonb_build_object('state',p_row->'cosmetic_color_history_state','value',p_row->'cosmetic_color_history'),
   'bleach_history',jsonb_build_object('state',p_row->'bleach_history_state','value',p_row->'bleach_history'),
   'chemical_history',jsonb_build_object('state',p_row->'chemical_history_state','value',p_row->'chemical_history'),
   'technical_notes',p_row->'technical_notes',
   'integrity_notes',p_row->'integrity_notes'))
 else p_assessment end;
$$;
revoke all on function app_private.hair_unverified_overlay(jsonb,jsonb) from public,anon;
grant execute on function app_private.hair_unverified_overlay(jsonb,jsonb) to authenticated;

-- Preserve existing membership RLS and workspace error semantics.
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
 if v_org is null then
  -- RLS intentionally hides inaccessible memberships. Match workspace bootstrap
  -- without revealing whether a forged reference identifies a hidden row.
  if not exists(select 1 from public.list_workspace_contexts()) then
   return app_private.client_error('MEMBERSHIP_REVOKED',p_correlation_id);
  end if;
  return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation_id);
 end if;
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
  app_private.hair_unverified_overlay(to_jsonb(v_passport),coalesce((select jsonb_build_object('state','ASSESSED','observation',a.dto) from assessments a
   where a.id=v_passport.current_observation_id and a.region_id is null),
   jsonb_build_object('state','NOT_ASSESSED','observation',null))),
  coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'type',r.region_type,'label',r.label,
    'status',r.status,'version',r.version,'updated_at',r.updated_at,
    'assessment',app_private.hair_unverified_overlay(to_jsonb(r),case when a.id is null then jsonb_build_object('state','NOT_ASSESSED','observation',null)
     else jsonb_build_object('state','ASSESSED','observation',a.dto) end)) order by r.created_at,r.id)
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


-- Validated, flattened partial patch. JSON is transport only, never stored as core state.
create function app_private.hair_core_patch(p_patch jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb; s text; flattened jsonb:='{}';
begin
 if jsonb_typeof(p_patch) is distinct from 'object' then
  raise exception using errcode='23514',message='invalid technical state';
 end if;
 for k,v in select key,value from jsonb_each(p_patch) loop
  if k in ('technical_notes','integrity_notes') then
   if jsonb_typeof(v) not in ('string','null') or
    (jsonb_typeof(v)='string' and (char_length(v#>>'{}')>case k when 'technical_notes' then 4000 else 2000 end or trim(v#>>'{}')='')) then
    raise exception using errcode='23514',message='invalid technical state';
   end if;
   flattened:=flattened||jsonb_build_object(k,v);
  else
   if k not in ('natural_level','perceived_level','grey_ratio','thickness','density','porosity','elasticity','tone','cosmetic_color_history','bleach_history','chemical_history') or jsonb_typeof(v) is distinct from 'object' then
    raise exception using errcode='23514',message='invalid technical state';
   end if;
   if not (v ?& array['state','value']) or exists(select 1 from jsonb_object_keys(v) x where x not in ('state','value')) then
    raise exception using errcode='23514',message='invalid technical state';
   end if;
   s:=v->>'state';
   if s is null or s not in ('KNOWN','UNKNOWN','NOT_ASSESSED','NOT_APPLICABLE') or
    (s='NOT_APPLICABLE' and k in ('natural_level','perceived_level')) or
    (s<>'KNOWN' and v->'value'<>'null'::jsonb) or
    (s='KNOWN' and jsonb_typeof(v->'value') is distinct from
     case when k in ('natural_level','perceived_level','grey_ratio') then 'number' else 'string' end) then
    raise exception using errcode='23514',message='invalid technical state';
   end if;
   if s='KNOWN' then
    if (k in ('natural_level','perceived_level') and (v->>'value')::numeric not between 1 and 10)
     or (k='grey_ratio' and (v->>'value')::numeric not between 0 and 1)
     or (k='thickness' and v->>'value' not in ('FINE','MEDIUM','COARSE'))
     or (k in ('density','porosity') and v->>'value' not in ('LOW','MEDIUM','HIGH'))
     or (k='elasticity' and v->>'value' not in ('LOW','NORMAL','HIGH')) then
     raise exception using errcode='23514',message='invalid technical state';
    end if;
    if k in ('tone','cosmetic_color_history','bleach_history','chemical_history') and
     (trim(v->>'value')='' or char_length(v->>'value')>case k when 'tone' then 120 else 2000 end) then
     raise exception using errcode='23514',message='invalid technical state';
    end if;
   end if;
   flattened:=flattened||jsonb_build_object(k||'_state',s,k,v->'value');
  end if;
 end loop;
 return flattened;
end $$;
revoke all on function app_private.hair_core_patch(jsonb) from public,anon,authenticated;
grant execute on function app_private.hair_core_patch(jsonb) to elifora_hair_writer;

-- RLS-backed selected-context check, reused before and after the organization lock.
create function app_private.hair_write_context(p_membership uuid,p_location uuid,p_permission text)
returns jsonb language plpgsql stable security invoker set search_path='' set row_security='on' as $$
declare m public.salon_memberships%rowtype;
begin
 select * into m from public.salon_memberships where id=p_membership and user_id=auth.uid();
 if not found then
  return jsonb_build_object('code',case when exists(select 1 from public.list_workspace_contexts())
   then 'TENANT_CONTEXT_INVALID' else 'MEMBERSHIP_REVOKED' end);
 end if;
 if m.status='revoked' then return jsonb_build_object('code','MEMBERSHIP_REVOKED'); end if;
 if m.status<>'active' or (m.location_id is not null and m.location_id<>p_location)
  or not exists(select 1 from public.organizations where id=m.organization_id and archived_at is null)
  or not exists(select 1 from public.locations where id=p_location and organization_id=m.organization_id and archived_at is null) then
  return jsonb_build_object('code','TENANT_CONTEXT_INVALID');
 end if;
 if not exists(select 1 from public.role_permissions where role_code=m.role_code and permission_code=p_permission) then
  return jsonb_build_object('code','FORBIDDEN');
 end if;
 return jsonb_build_object('organization_id',m.organization_id);
end $$;
revoke all on function app_private.hair_write_context(uuid,uuid,text) from public,anon,authenticated;
grant execute on function app_private.hair_write_context(uuid,uuid,text) to elifora_hair_writer;

create table app_private.hair_core_mutation_receipts (
 organization_id uuid not null references public.organizations(id),
 actor_id uuid not null references public.profiles(user_id), request_id uuid not null,
 payload_hash text not null, response jsonb not null,
 expires_at timestamptz not null default (now()+interval '24 hours'),
 primary key(organization_id,actor_id,request_id)
);
create index hair_core_receipts_actor on app_private.hair_core_mutation_receipts(actor_id);
alter table app_private.hair_core_mutation_receipts enable row level security;
alter table app_private.hair_core_mutation_receipts force row level security;
revoke all on app_private.hair_core_mutation_receipts from public,anon,authenticated,service_role;
grant select,insert,delete on app_private.hair_core_mutation_receipts to elifora_hair_writer;
create policy hair_core_receipts_read on app_private.hair_core_mutation_receipts for select to elifora_hair_writer
 using(actor_id=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy hair_core_receipts_insert on app_private.hair_core_mutation_receipts for insert to elifora_hair_writer
 with check(actor_id=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy hair_core_receipts_expire on app_private.hair_core_mutation_receipts for delete to elifora_hair_writer
 using(actor_id=(select auth.uid()) and expires_at<now() and app_private.can_access_hair(organization_id,'hair_passport.read'));
grant usage on schema extensions to elifora_hair_writer;

create function app_private.execute_hair_core_operation(
 p_membership_id uuid,p_location_id uuid,p_client_id uuid,p_operation text,p_payload jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare
 v_actor uuid:=auth.uid(); v_org uuid; v_context jsonb; v_permission text; v_allowed text[];
 v_request uuid; v_expected bigint; v_hash text; v_receipt app_private.hair_core_mutation_receipts%rowtype;
 v_client_status text; v_passport public.hair_passports%rowtype; v_region public.hair_regions%rowtype;
 v_patch jsonb; v_base jsonb; v_response jsonb; v_snapshot jsonb; v_region_id uuid;
begin
 if p_correlation_id is null then raise exception using errcode='22023',message='correlation identifier is required'; end if;
 if v_actor is null then return app_private.client_error('UNAUTHENTICATED',p_correlation_id); end if;
 if p_membership_id is null or p_location_id is null or p_client_id is null or p_operation is null
  or p_operation not in ('create_passport','update_passport','create_region','update_region')
  or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>32768 then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 end if;
 v_permission:=case when p_operation='create_passport' then 'hair_passport.create' else 'hair_passport.update' end;
 v_context:=app_private.hair_write_context(p_membership_id,p_location_id,v_permission);
 if v_context ? 'code' then return app_private.client_error(v_context->>'code',p_correlation_id); end if;
 v_org:=(v_context->>'organization_id')::uuid;
 v_allowed:=case p_operation
  when 'create_passport' then array['request_id','technical']
  when 'update_passport' then array['request_id','expected_version','technical']
  when 'create_region' then array['request_id','region_type','label','technical']
  else array['request_id','region_id','expected_version','label','technical'] end;
 if exists(select 1 from jsonb_object_keys(p_payload) k where not(k=any(v_allowed))) then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 end if;
 if jsonb_typeof(p_payload->'request_id') is distinct from 'string' then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 end if;
 v_request:=(p_payload->>'request_id')::uuid;
 v_patch:=app_private.hair_core_patch(coalesce(p_payload->'technical','{}'));
 if p_operation like 'update_%' then
  if jsonb_typeof(p_payload->'expected_version') is distinct from 'number' then
   return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
  end if;
  if (p_payload->>'expected_version')::numeric not between 1 and 9007199254740991 or
   (p_payload->>'expected_version')::numeric<>trunc((p_payload->>'expected_version')::numeric) then
   return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
  end if;
  v_expected:=(p_payload->>'expected_version')::numeric::bigint;
  if v_patch='{}'::jsonb and (p_operation='update_passport' or not (p_payload ? 'label')) then
   return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
  end if;
 end if;
 if p_operation='create_region' and (p_payload->>'region_type' is null or p_payload->>'region_type' not in
  ('ROOT','MID_LENGTHS','ENDS','FACE_FRAME','CROWN','NAPE','BANDED_AREA','BLEACHED_AREA','HIGHLIGHTED_AREA','CUSTOM')) then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 end if;
 if p_payload ? 'label' and (jsonb_typeof(p_payload->'label') not in ('string','null') or
  (jsonb_typeof(p_payload->'label')='string' and (trim(p_payload->>'label')='' or char_length(p_payload->>'label')>120))) then
  return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 end if;
 if p_operation='update_region' then
  if jsonb_typeof(p_payload->'region_id') is distinct from 'string' then return app_private.client_error('VALIDATION_FAILED',p_correlation_id); end if;
  v_region_id:=(p_payload->>'region_id')::uuid;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 v_context:=app_private.hair_write_context(p_membership_id,p_location_id,v_permission);
 if v_context ? 'code' then return app_private.client_error(v_context->>'code',p_correlation_id); end if;
 if (v_context->>'organization_id')::uuid<>v_org then return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation_id); end if;
 select status into v_client_status from public.clients where id=p_client_id and organization_id=v_org;
 if not found then return app_private.client_error('CLIENT_NOT_FOUND',p_correlation_id); end if;
 if v_client_status='ARCHIVED' then return app_private.client_error('CLIENT_ARCHIVED',p_correlation_id); end if;
 select * into v_passport from public.hair_passports where organization_id=v_org and client_id=p_client_id;
 if (p_operation<>'create_passport' and v_passport.id is null) or v_passport.status='ARCHIVED' then
  return app_private.client_error(case when p_operation='create_passport' then 'HAIR_PASSPORT_ALREADY_EXISTS' else 'HAIR_PASSPORT_NOT_FOUND' end,p_correlation_id);
 end if;
 if p_operation='update_region' then
  select * into v_region from public.hair_regions where id=v_region_id and organization_id=v_org
   and client_id=p_client_id and passport_id=v_passport.id and status='ACTIVE' for update;
  if not found then return app_private.client_error('HAIR_REGION_NOT_FOUND',p_correlation_id); end if;
 end if;
 v_hash:=encode(extensions.digest(jsonb_build_array(p_operation,p_membership_id,p_location_id,p_client_id,p_payload-'request_id')::text,'sha256'),'hex');
 delete from app_private.hair_core_mutation_receipts where organization_id=v_org and actor_id=v_actor and expires_at<now();
 select * into v_receipt from app_private.hair_core_mutation_receipts where organization_id=v_org and actor_id=v_actor and request_id=v_request;
 if found then
  if v_receipt.payload_hash<>v_hash then return app_private.client_error('CONFLICT',p_correlation_id); end if;
  return v_receipt.response||jsonb_build_object('correlationId',p_correlation_id);
 end if;
 if p_operation='create_passport' then
  if v_passport.id is not null then return app_private.client_error('HAIR_PASSPORT_ALREADY_EXISTS',p_correlation_id); end if;
  -- Populate only the explicitly validated technical columns, preserving database defaults.
  select * into v_passport from jsonb_populate_record(null::public.hair_passports,
   jsonb_build_object('has_unverified_state',v_patch<>'{}'::jsonb)||
   jsonb_build_object('natural_level_state','NOT_ASSESSED','perceived_level_state','NOT_ASSESSED','grey_ratio_state','NOT_ASSESSED','thickness_state','NOT_ASSESSED','density_state','NOT_ASSESSED','porosity_state','NOT_ASSESSED','elasticity_state','NOT_ASSESSED','tone_state','NOT_ASSESSED','cosmetic_color_history_state','NOT_ASSESSED','bleach_history_state','NOT_ASSESSED','chemical_history_state','NOT_ASSESSED')||v_patch);
  insert into public.hair_passports(organization_id,client_id,created_by,updated_by,correlation_id,has_unverified_state,natural_level_state,natural_level,perceived_level_state,perceived_level,grey_ratio_state,grey_ratio,thickness_state,thickness,density_state,density,porosity_state,porosity,elasticity_state,elasticity,tone_state,tone,cosmetic_color_history_state,cosmetic_color_history,bleach_history_state,bleach_history,chemical_history_state,chemical_history,technical_notes,integrity_notes)
  values(v_org,p_client_id,v_actor,v_actor,p_correlation_id,v_passport.has_unverified_state,v_passport.natural_level_state,v_passport.natural_level,v_passport.perceived_level_state,v_passport.perceived_level,v_passport.grey_ratio_state,v_passport.grey_ratio,v_passport.thickness_state,v_passport.thickness,v_passport.density_state,v_passport.density,v_passport.porosity_state,v_passport.porosity,v_passport.elasticity_state,v_passport.elasticity,v_passport.tone_state,v_passport.tone,v_passport.cosmetic_color_history_state,v_passport.cosmetic_color_history,v_passport.bleach_history_state,v_passport.bleach_history,v_passport.chemical_history_state,v_passport.chemical_history,v_passport.technical_notes,v_passport.integrity_notes) returning * into v_passport;
  insert into public.hair_regions(organization_id,client_id,passport_id,region_type,created_by,updated_by,correlation_id)
   select v_org,p_client_id,v_passport.id,t,v_actor,v_actor,p_correlation_id from unnest(array['ROOT','MID_LENGTHS','ENDS']) t;
 elsif p_operation='update_passport' then
  if v_passport.version<>v_expected then return app_private.client_error('CONFLICT',p_correlation_id); end if;
  v_base:=to_jsonb(v_passport);
  if not v_passport.has_unverified_state and v_passport.current_observation_id is not null then
   select v_base||jsonb_object_agg(k,value) into v_base from public.hair_observations o,
    lateral jsonb_each(to_jsonb(o)) kv(k,value) where o.id=v_passport.current_observation_id
     and o.organization_id=v_org and o.passport_id=v_passport.id and k=any(array['natural_level_state','natural_level','perceived_level_state','perceived_level','grey_ratio_state','grey_ratio','thickness_state','thickness','density_state','density','porosity_state','porosity','elasticity_state','elasticity','tone_state','tone','cosmetic_color_history_state','cosmetic_color_history','bleach_history_state','bleach_history','chemical_history_state','chemical_history','technical_notes','integrity_notes']);
  end if;
  select * into v_passport from jsonb_populate_record(v_passport,v_base||v_patch);
  update public.hair_passports set has_unverified_state=true,correlation_id=p_correlation_id,
   natural_level_state=v_passport.natural_level_state,
   natural_level=v_passport.natural_level,
   perceived_level_state=v_passport.perceived_level_state,
   perceived_level=v_passport.perceived_level,
   grey_ratio_state=v_passport.grey_ratio_state,
   grey_ratio=v_passport.grey_ratio,
   thickness_state=v_passport.thickness_state,
   thickness=v_passport.thickness,
   density_state=v_passport.density_state,
   density=v_passport.density,
   porosity_state=v_passport.porosity_state,
   porosity=v_passport.porosity,
   elasticity_state=v_passport.elasticity_state,
   elasticity=v_passport.elasticity,
   tone_state=v_passport.tone_state,
   tone=v_passport.tone,
   cosmetic_color_history_state=v_passport.cosmetic_color_history_state,
   cosmetic_color_history=v_passport.cosmetic_color_history,
   bleach_history_state=v_passport.bleach_history_state,
   bleach_history=v_passport.bleach_history,
   chemical_history_state=v_passport.chemical_history_state,
   chemical_history=v_passport.chemical_history,
   technical_notes=v_passport.technical_notes,
   integrity_notes=v_passport.integrity_notes
   where id=v_passport.id and organization_id=v_org returning * into v_passport;
 elsif p_operation='create_region' then
  if p_payload->>'region_type'='CUSTOM' and p_payload->>'label' is null then return app_private.client_error('VALIDATION_FAILED',p_correlation_id); end if;
  select * into v_region from jsonb_populate_record(null::public.hair_regions,
   jsonb_build_object('has_unverified_state',v_patch<>'{}'::jsonb)||
   jsonb_build_object('natural_level_state','NOT_ASSESSED','perceived_level_state','NOT_ASSESSED','grey_ratio_state','NOT_ASSESSED','thickness_state','NOT_ASSESSED','density_state','NOT_ASSESSED','porosity_state','NOT_ASSESSED','elasticity_state','NOT_ASSESSED','tone_state','NOT_ASSESSED','cosmetic_color_history_state','NOT_ASSESSED','bleach_history_state','NOT_ASSESSED','chemical_history_state','NOT_ASSESSED')||v_patch);
  insert into public.hair_regions(organization_id,client_id,passport_id,region_type,label,created_by,updated_by,correlation_id,has_unverified_state,natural_level_state,natural_level,perceived_level_state,perceived_level,grey_ratio_state,grey_ratio,thickness_state,thickness,density_state,density,porosity_state,porosity,elasticity_state,elasticity,tone_state,tone,cosmetic_color_history_state,cosmetic_color_history,bleach_history_state,bleach_history,chemical_history_state,chemical_history,technical_notes,integrity_notes)
   values(v_org,p_client_id,v_passport.id,p_payload->>'region_type',p_payload->>'label',v_actor,v_actor,p_correlation_id,v_region.has_unverified_state,v_region.natural_level_state,v_region.natural_level,v_region.perceived_level_state,v_region.perceived_level,v_region.grey_ratio_state,v_region.grey_ratio,v_region.thickness_state,v_region.thickness,v_region.density_state,v_region.density,v_region.porosity_state,v_region.porosity,v_region.elasticity_state,v_region.elasticity,v_region.tone_state,v_region.tone,v_region.cosmetic_color_history_state,v_region.cosmetic_color_history,v_region.bleach_history_state,v_region.bleach_history,v_region.chemical_history_state,v_region.chemical_history,v_region.technical_notes,v_region.integrity_notes) returning * into v_region;
 else
  if v_region.version<>v_expected then return app_private.client_error('CONFLICT',p_correlation_id); end if;
  if p_payload ? 'label' then v_region.label:=p_payload->>'label'; end if;
  if v_region.region_type='CUSTOM' and v_region.label is null then return app_private.client_error('VALIDATION_FAILED',p_correlation_id); end if;
  v_base:=to_jsonb(v_region);
  if v_patch<>'{}'::jsonb and not v_region.has_unverified_state and v_region.current_observation_id is not null then
   select v_base||jsonb_object_agg(k,value) into v_base from public.hair_observations o,
    lateral jsonb_each(to_jsonb(o)) kv(k,value) where o.id=v_region.current_observation_id
     and o.organization_id=v_org and o.passport_id=v_passport.id and k=any(array['natural_level_state','natural_level','perceived_level_state','perceived_level','grey_ratio_state','grey_ratio','thickness_state','thickness','density_state','density','porosity_state','porosity','elasticity_state','elasticity','tone_state','tone','cosmetic_color_history_state','cosmetic_color_history','bleach_history_state','bleach_history','chemical_history_state','chemical_history','technical_notes','integrity_notes']);
  end if;
  select * into v_region from jsonb_populate_record(v_region,v_base||v_patch);
  update public.hair_regions set label=v_region.label,has_unverified_state=(v_region.has_unverified_state or v_patch<>'{}'::jsonb),correlation_id=p_correlation_id,
   natural_level_state=v_region.natural_level_state,
   natural_level=v_region.natural_level,
   perceived_level_state=v_region.perceived_level_state,
   perceived_level=v_region.perceived_level,
   grey_ratio_state=v_region.grey_ratio_state,
   grey_ratio=v_region.grey_ratio,
   thickness_state=v_region.thickness_state,
   thickness=v_region.thickness,
   density_state=v_region.density_state,
   density=v_region.density,
   porosity_state=v_region.porosity_state,
   porosity=v_region.porosity,
   elasticity_state=v_region.elasticity_state,
   elasticity=v_region.elasticity,
   tone_state=v_region.tone_state,
   tone=v_region.tone,
   cosmetic_color_history_state=v_region.cosmetic_color_history_state,
   cosmetic_color_history=v_region.cosmetic_color_history,
   bleach_history_state=v_region.bleach_history_state,
   bleach_history=v_region.bleach_history,
   chemical_history_state=v_region.chemical_history_state,
   chemical_history=v_region.chemical_history,
   technical_notes=v_region.technical_notes,
   integrity_notes=v_region.integrity_notes
   where id=v_region.id and organization_id=v_org returning * into v_region;
 end if;
 -- Reuse the validated read projection; receipts exclude tests/history and unrelated regions.
 v_snapshot:=public.hair_passport_snapshot(p_membership_id,p_location_id,p_client_id,'{}',p_correlation_id);
 if v_snapshot ? 'code' then raise exception using errcode='42501',message='technical result unavailable'; end if;
 if p_operation in ('create_passport','update_passport') then
  v_response:=jsonb_build_object('data',jsonb_build_object('kind','PASSPORT',
   'passport',v_snapshot#>'{data,passport}','core',v_snapshot#>'{data,core}',
   'regions',case when p_operation='create_passport' then v_snapshot#>'{data,regions}' else '[]'::jsonb end),'correlationId',p_correlation_id);
 else
  v_response:=jsonb_build_object('data',jsonb_build_object('kind','REGION','client_id',p_client_id,'passport_id',v_passport.id,
   'region',(select value from jsonb_array_elements(v_snapshot#>'{data,regions}') where value->>'id'=v_region.id::text)), 'correlationId',p_correlation_id);
 end if;
 insert into app_private.hair_core_mutation_receipts(organization_id,actor_id,request_id,payload_hash,response)
  values(v_org,v_actor,v_request,v_hash,v_response);
 return v_response;
exception
 when invalid_text_representation or numeric_value_out_of_range then return app_private.client_error('VALIDATION_FAILED',p_correlation_id);
 when check_violation or not_null_violation then return app_private.client_error('INVALID_TECHNICAL_STATE',p_correlation_id);
 when unique_violation then return app_private.client_error(case when p_operation='create_passport' then 'HAIR_PASSPORT_ALREADY_EXISTS' else 'HAIR_REGION_ALREADY_EXISTS' end,p_correlation_id);
 when insufficient_privilege then return app_private.client_error('FORBIDDEN',p_correlation_id);
end $$;
grant create on schema app_private to elifora_hair_writer;
alter function app_private.execute_hair_core_operation(uuid,uuid,uuid,text,jsonb,uuid) owner to elifora_hair_writer;
revoke create on schema app_private from elifora_hair_writer;
revoke all on function app_private.execute_hair_core_operation(uuid,uuid,uuid,text,jsonb,uuid) from public,anon;
grant execute on function app_private.execute_hair_core_operation(uuid,uuid,uuid,text,jsonb,uuid) to authenticated;
create function public.hair_core_operation(p_membership_id uuid,p_location_id uuid,p_client_id uuid,
 p_operation text,p_payload jsonb,p_correlation_id uuid default gen_random_uuid())
returns jsonb language sql security invoker set search_path='' as $$
 select app_private.execute_hair_core_operation(p_membership_id,p_location_id,p_client_id,p_operation,p_payload,p_correlation_id);
$$;
revoke all on function public.hair_core_operation(uuid,uuid,uuid,text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.hair_core_operation(uuid,uuid,uuid,text,jsonb,uuid) to authenticated;
