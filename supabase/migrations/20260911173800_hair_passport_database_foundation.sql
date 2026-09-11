-- ELIFORA Phase 1C-1. Additive database foundation; no callable write service.
-- Existing client data is untouched. Composite identity supports tenant-safe FKs.
alter table public.clients add constraint clients_organization_id_id_key unique(organization_id,id);

create role elifora_hair_writer nologin nobypassrls;
grant authenticated to elifora_hair_writer;
grant elifora_hair_writer to postgres;
grant usage on schema public,app_private to elifora_hair_writer;

insert into public.permissions(code,description) values
 ('hair_passport.read','Read organization technical hair history.'),
 ('hair_passport.create','Create an organization client hair passport.'),
 ('hair_passport.update','Update current passport state and technical regions.'),
 ('hair_passport.add_observation','Append technical evidence and observations.'),
 ('hair_passport.add_test','Record physical hair tests.'),
 ('hair_passport.add_history','Append chemical and color history.');
insert into public.role_permissions(role_code,permission_code)
select r.code,p.code from public.roles r cross join public.permissions p
where p.code like 'hair_passport.%' and
 (r.code in ('owner','manager','colorist') or
  (r.code='assistant' and p.code='hair_passport.read'));

-- Shared organization history requires an effective permission at an active location.
-- Reuse the existing membership-backed helper; phone/identity matches never authorize.
create function app_private.can_access_hair(target_org uuid,permission text)
returns boolean language sql stable security invoker set search_path=''
as $$ select app_private.can_access_clients(target_org,permission); $$;
revoke all on function app_private.can_access_hair(uuid,text) from public,anon;
grant execute on function app_private.can_access_hair(uuid,text) to authenticated;

create table public.hair_passports (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 client_id uuid not null,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','ARCHIVED')),
 current_observation_id uuid,
 version bigint not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(user_id) on delete restrict,
 updated_by uuid not null references public.profiles(user_id) on delete restrict,
 correlation_id uuid not null default gen_random_uuid(),
 unique(organization_id,client_id),
 unique(organization_id,client_id,id),
 unique(organization_id,id),
 foreign key(organization_id,client_id) references public.clients(organization_id,id) on delete restrict,
 check(updated_at>=created_at)
);

create table public.hair_regions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 client_id uuid not null,
 passport_id uuid not null,
 created_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(user_id) on delete restrict,
 correlation_id uuid not null default gen_random_uuid(),
 unique(organization_id,passport_id,id),
 foreign key(organization_id,client_id,passport_id)
  references public.hair_passports(organization_id,client_id,id) on delete restrict,
 region_type text not null check(region_type in
  ('ROOT','MID_LENGTHS','ENDS','FACE_FRAME','CROWN','NAPE','BANDED_AREA','BLEACHED_AREA','HIGHLIGHTED_AREA','CUSTOM')),
 label text check(label is null or char_length(trim(label)) between 1 and 120),
 status text not null default 'ACTIVE' check(status in ('ACTIVE','ARCHIVED')),
 current_observation_id uuid,
 version bigint not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references public.profiles(user_id) on delete restrict,
 check(region_type<>'CUSTOM' or label is not null),
 check(updated_at>=created_at)
);
create unique index hair_regions_default_unique on public.hair_regions(organization_id,passport_id,region_type)
 where region_type in ('ROOT','MID_LENGTHS','ENDS') and status='ACTIVE';

create table public.hair_evidence (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 client_id uuid not null,
 passport_id uuid not null,
 created_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(user_id) on delete restrict,
 correlation_id uuid not null default gen_random_uuid(),
 unique(organization_id,passport_id,id),
 foreign key(organization_id,client_id,passport_id)
  references public.hair_passports(organization_id,client_id,id) on delete restrict,
 source_type text not null check(source_type in
  ('AI_ESTIMATE','PROFESSIONAL_VERIFIED','PHYSICAL_TEST','HISTORICAL','IMPORTED_UNVERIFIED')),
 observed_at_state text not null default 'UNKNOWN' check(observed_at_state in ('UNKNOWN','KNOWN')),
 observed_at timestamptz,
 verified_by uuid references public.profiles(user_id) on delete restrict,
 confidence_state text not null default 'UNKNOWN' check(confidence_state in ('UNKNOWN','KNOWN')),
 confidence numeric,
 relevant_until timestamptz,
 location_id uuid,
 context text check(context is null or char_length(trim(context)) between 1 and 2000),
 supersedes_id uuid,
 check((observed_at_state='KNOWN' and observed_at is not null and observed_at<=created_at)
  or (observed_at_state='UNKNOWN' and observed_at is null)),
 check((confidence_state='KNOWN' and confidence is not null and confidence between 0 and 1)
  or (confidence_state='UNKNOWN' and confidence is null)),
 check((source_type='PROFESSIONAL_VERIFIED' and verified_by is not null and observed_at_state='KNOWN')
  or (source_type<>'PROFESSIONAL_VERIFIED' and verified_by is null)),
 check(relevant_until is null or (observed_at is not null and relevant_until>=observed_at)),
 check(supersedes_id is null or supersedes_id<>id),
 foreign key(organization_id,location_id) references public.locations(organization_id,id) on delete restrict,
 foreign key(organization_id,passport_id,supersedes_id)
  references public.hair_evidence(organization_id,passport_id,id) on delete restrict
);

-- One typed assessment snapshot, at whole-passport or region scope.
-- No current pointer means NOT_ASSESSED; each field also has explicit state.
create table public.hair_observations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 client_id uuid not null,
 passport_id uuid not null,
 created_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(user_id) on delete restrict,
 correlation_id uuid not null default gen_random_uuid(),
 unique(organization_id,passport_id,id),
 foreign key(organization_id,client_id,passport_id)
  references public.hair_passports(organization_id,client_id,id) on delete restrict,
 region_id uuid,
 evidence_id uuid not null,
 supersedes_id uuid,
 natural_level_state text not null default 'NOT_ASSESSED'
  check(natural_level_state in ('NOT_ASSESSED','UNKNOWN','KNOWN')),
 natural_level numeric,
 check((natural_level_state='KNOWN' and natural_level is not null and natural_level between 1 and 10)
  or (natural_level_state<>'KNOWN' and natural_level is null)),
 perceived_level_state text not null default 'NOT_ASSESSED'
  check(perceived_level_state in ('NOT_ASSESSED','UNKNOWN','KNOWN')),
 perceived_level numeric,
 check((perceived_level_state='KNOWN' and perceived_level is not null and perceived_level between 1 and 10)
  or (perceived_level_state<>'KNOWN' and perceived_level is null)),
 grey_ratio_state text not null default 'NOT_ASSESSED'
  check(grey_ratio_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 grey_ratio numeric,
 check((grey_ratio_state='KNOWN' and grey_ratio is not null and grey_ratio between 0 and 1)
  or (grey_ratio_state<>'KNOWN' and grey_ratio is null)),
 thickness_state text not null default 'NOT_ASSESSED'
  check(thickness_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 thickness text,
 check((thickness_state='KNOWN' and thickness is not null and thickness in ('FINE','MEDIUM','COARSE'))
  or (thickness_state<>'KNOWN' and thickness is null)),
 density_state text not null default 'NOT_ASSESSED'
  check(density_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 density text,
 check((density_state='KNOWN' and density is not null and density in ('LOW','MEDIUM','HIGH'))
  or (density_state<>'KNOWN' and density is null)),
 porosity_state text not null default 'NOT_ASSESSED'
  check(porosity_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 porosity text,
 check((porosity_state='KNOWN' and porosity is not null and porosity in ('LOW','MEDIUM','HIGH'))
  or (porosity_state<>'KNOWN' and porosity is null)),
 elasticity_state text not null default 'NOT_ASSESSED'
  check(elasticity_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 elasticity text,
 check((elasticity_state='KNOWN' and elasticity is not null and elasticity in ('LOW','NORMAL','HIGH'))
  or (elasticity_state<>'KNOWN' and elasticity is null)),
 tone_state text not null default 'NOT_ASSESSED'
  check(tone_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 tone text,
 check((tone_state='KNOWN' and tone is not null and char_length(trim(tone)) between 1 and 120)
  or (tone_state<>'KNOWN' and tone is null)),
 cosmetic_color_history_state text not null default 'NOT_ASSESSED'
  check(cosmetic_color_history_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 cosmetic_color_history text,
 check((cosmetic_color_history_state='KNOWN' and cosmetic_color_history is not null and char_length(trim(cosmetic_color_history)) between 1 and 2000)
  or (cosmetic_color_history_state<>'KNOWN' and cosmetic_color_history is null)),
 bleach_history_state text not null default 'NOT_ASSESSED'
  check(bleach_history_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 bleach_history text,
 check((bleach_history_state='KNOWN' and bleach_history is not null and char_length(trim(bleach_history)) between 1 and 2000)
  or (bleach_history_state<>'KNOWN' and bleach_history is null)),
 chemical_history_state text not null default 'NOT_ASSESSED'
  check(chemical_history_state in ('NOT_ASSESSED','UNKNOWN','KNOWN','NOT_APPLICABLE')),
 chemical_history text,
 check((chemical_history_state='KNOWN' and chemical_history is not null and char_length(trim(chemical_history)) between 1 and 2000)
  or (chemical_history_state<>'KNOWN' and chemical_history is null)),
 technical_notes text check(technical_notes is null or char_length(trim(technical_notes)) between 1 and 4000),
 integrity_notes text check(integrity_notes is null or char_length(trim(integrity_notes)) between 1 and 2000),
 check(supersedes_id is null or supersedes_id<>id),
 foreign key(organization_id,passport_id,region_id)
  references public.hair_regions(organization_id,passport_id,id) on delete restrict,
 foreign key(organization_id,passport_id,evidence_id)
  references public.hair_evidence(organization_id,passport_id,id) on delete restrict,
 foreign key(organization_id,passport_id,supersedes_id)
  references public.hair_observations(organization_id,passport_id,id) on delete restrict
);
alter table public.hair_passports add constraint hair_passports_current_observation_fk
 foreign key(organization_id,id,current_observation_id)
 references public.hair_observations(organization_id,passport_id,id) on delete restrict;
alter table public.hair_regions add constraint hair_regions_current_observation_fk
 foreign key(organization_id,passport_id,current_observation_id)
 references public.hair_observations(organization_id,passport_id,id) on delete restrict;

create table public.hair_physical_tests (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 client_id uuid not null,
 passport_id uuid not null,
 created_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(user_id) on delete restrict,
 correlation_id uuid not null default gen_random_uuid(),
 unique(organization_id,passport_id,id),
 foreign key(organization_id,client_id,passport_id)
  references public.hair_passports(organization_id,client_id,id) on delete restrict,
 region_id uuid,
 evidence_id uuid not null,
 test_type text not null check(test_type in ('POROSITY','ELASTICITY','STRAND')),
 result_state text not null check(result_state in ('UNKNOWN','KNOWN','NOT_APPLICABLE')),
 result text,
 performed_by uuid not null references public.profiles(user_id) on delete restrict,
 performed_at timestamptz not null,
 notes text check(notes is null or char_length(trim(notes)) between 1 and 2000),
 supersedes_id uuid,
 check((result_state='KNOWN' and result is not null and char_length(trim(result)) between 1 and 1000)
  or (result_state<>'KNOWN' and result is null)),
 check(performed_at<=created_at),
 check(supersedes_id is null or supersedes_id<>id),
 foreign key(organization_id,passport_id,region_id)
  references public.hair_regions(organization_id,passport_id,id) on delete restrict,
 foreign key(organization_id,passport_id,evidence_id)
  references public.hair_evidence(organization_id,passport_id,id) on delete restrict,
 foreign key(organization_id,passport_id,supersedes_id)
  references public.hair_physical_tests(organization_id,passport_id,id) on delete restrict
);

create table public.hair_history_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 client_id uuid not null,
 passport_id uuid not null,
 created_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(user_id) on delete restrict,
 correlation_id uuid not null default gen_random_uuid(),
 unique(organization_id,passport_id,id),
 foreign key(organization_id,client_id,passport_id)
  references public.hair_passports(organization_id,client_id,id) on delete restrict,
 evidence_id uuid not null,
 category text not null check(category in
  ('COLOR','BLEACH_LIGHTENING','TONER_GLOSS','PERM','RELAXER_STRAIGHTENING','KERATIN_SMOOTHING','OTHER_CHEMICAL')),
 date_precision text not null default 'UNKNOWN' check(date_precision in ('UNKNOWN','EXACT','APPROXIMATE')),
 performed_on date,
 product_state text not null default 'UNKNOWN' check(product_state in ('UNKNOWN','KNOWN','NOT_APPLICABLE')),
 product_description text,
 description text not null check(char_length(trim(description)) between 1 and 2000),
 attributed_salon text check(attributed_salon is null or char_length(trim(attributed_salon)) between 1 and 160),
 attributed_professional text check(attributed_professional is null or char_length(trim(attributed_professional)) between 1 and 160),
 location_id uuid,
 supersedes_id uuid,
 check((date_precision='UNKNOWN' and performed_on is null)
  or (date_precision<>'UNKNOWN' and performed_on is not null and performed_on>=date '1900-01-01'
   and performed_on<=(created_at at time zone 'UTC')::date)),
 check((product_state='KNOWN' and product_description is not null and char_length(trim(product_description)) between 1 and 500)
  or (product_state<>'KNOWN' and product_description is null)),
 check(supersedes_id is null or supersedes_id<>id),
 foreign key(organization_id,location_id) references public.locations(organization_id,id) on delete restrict,
 foreign key(organization_id,passport_id,evidence_id)
  references public.hair_evidence(organization_id,passport_id,id) on delete restrict,
 foreign key(organization_id,passport_id,supersedes_id)
  references public.hair_history_events(organization_id,passport_id,id) on delete restrict
);

create table public.hair_history_regions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 client_id uuid not null,
 passport_id uuid not null,
 created_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(user_id) on delete restrict,
 correlation_id uuid not null default gen_random_uuid(),
 unique(organization_id,passport_id,id),
 foreign key(organization_id,client_id,passport_id)
  references public.hair_passports(organization_id,client_id,id) on delete restrict,
 history_event_id uuid not null,
 region_id uuid not null,
 unique(organization_id,passport_id,history_event_id,region_id),
 foreign key(organization_id,passport_id,history_event_id)
  references public.hair_history_events(organization_id,passport_id,id) on delete restrict,
 foreign key(organization_id,passport_id,region_id)
  references public.hair_regions(organization_id,passport_id,id) on delete restrict
);

-- Timeline and relationship lookup paths, including referencing sides of FKs.
create index hair_passports_current on public.hair_passports(organization_id,id,current_observation_id);
create index hair_regions_current on public.hair_regions(organization_id,passport_id,current_observation_id);
create index hair_observations_region_timeline on public.hair_observations(organization_id,passport_id,region_id,created_at desc,id);
create index hair_evidence_timeline on public.hair_evidence(organization_id,passport_id,created_at desc,id);
create index hair_tests_timeline on public.hair_physical_tests(organization_id,passport_id,performed_at desc,id);
create index hair_history_timeline on public.hair_history_events(organization_id,passport_id,performed_on desc,id);

create index hair_passports_created_by on public.hair_passports(created_by);
create index hair_passports_updated_by on public.hair_passports(updated_by);

create index hair_regions_created_by on public.hair_regions(created_by);
create index hair_regions_client_parent on public.hair_regions(organization_id,client_id,passport_id);
create index hair_regions_updated_by on public.hair_regions(updated_by);

create index hair_evidence_created_by on public.hair_evidence(created_by);
create index hair_evidence_client_parent on public.hair_evidence(organization_id,client_id,passport_id);
create index hair_evidence_supersedes on public.hair_evidence(organization_id,passport_id,supersedes_id) where supersedes_id is not null;

create index hair_observations_created_by on public.hair_observations(created_by);
create index hair_observations_client_parent on public.hair_observations(organization_id,client_id,passport_id);
create index hair_observations_supersedes on public.hair_observations(organization_id,passport_id,supersedes_id) where supersedes_id is not null;
create index hair_observations_evidence on public.hair_observations(organization_id,passport_id,evidence_id);

create index hair_physical_tests_created_by on public.hair_physical_tests(created_by);
create index hair_physical_tests_client_parent on public.hair_physical_tests(organization_id,client_id,passport_id);
create index hair_physical_tests_supersedes on public.hair_physical_tests(organization_id,passport_id,supersedes_id) where supersedes_id is not null;
create index hair_physical_tests_evidence on public.hair_physical_tests(organization_id,passport_id,evidence_id);

create index hair_history_events_created_by on public.hair_history_events(created_by);
create index hair_history_events_client_parent on public.hair_history_events(organization_id,client_id,passport_id);
create index hair_history_events_supersedes on public.hair_history_events(organization_id,passport_id,supersedes_id) where supersedes_id is not null;
create index hair_history_events_evidence on public.hair_history_events(organization_id,passport_id,evidence_id);

create index hair_history_regions_created_by on public.hair_history_regions(created_by);
create index hair_history_regions_client_parent on public.hair_history_regions(organization_id,client_id,passport_id);

create index hair_evidence_verifier on public.hair_evidence(verified_by) where verified_by is not null;
create index hair_evidence_location on public.hair_evidence(organization_id,location_id) where location_id is not null;
create index hair_history_location on public.hair_history_events(organization_id,location_id) where location_id is not null;
create index hair_tests_performer on public.hair_physical_tests(performed_by);
create index hair_tests_region on public.hair_physical_tests(organization_id,passport_id,region_id);
create index hair_history_regions_region on public.hair_history_regions(organization_id,passport_id,region_id);

-- Internal write guard. No SECURITY DEFINER and no new public functions.
create function app_private.guard_hair_record()
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

create function app_private.audit_hair_record()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare
 v_changed jsonb:='[]'::jsonb;
 v_before jsonb;
 v_after jsonb:=to_jsonb(new);
 v_action text:=TG_ARGV[0];
begin
 if TG_OP='UPDATE' then
  v_action:=TG_ARGV[1];
  v_before:=to_jsonb(old);
  select coalesce(jsonb_agg(k order by k),'[]'::jsonb) into v_changed
   from jsonb_object_keys(v_after) k
   where v_after->k is distinct from v_before->k
    and k not in ('updated_at','updated_by','version','correlation_id');
 end if;
 insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,metadata,correlation_id)
 values(auth.uid(),new.organization_id,v_action,TG_TABLE_NAME,new.id,
  jsonb_build_object('client_id',new.client_id,
   'passport_id',case when TG_TABLE_NAME='hair_passports' then new.id else (v_after->>'passport_id')::uuid end,
   'changed_fields',v_changed),new.correlation_id);
 return new;
end $$;
revoke all on function app_private.audit_hair_record() from public,anon,authenticated;
grant insert on public.audit_events to elifora_hair_writer;
create policy hair_audit_append on public.audit_events for insert to elifora_hair_writer
 with check(actor_user_id=(select auth.uid())
  and app_private.can_access_hair(organization_id,'hair_passport.read')
  and action in ('hair_passport.created','hair_passport.updated','hair_region.created','hair_region.updated',
   'hair_evidence.added','hair_observation.added','hair_test.recorded','hair_history.recorded','hair_history.region_added')
  and entity_type in ('hair_passports','hair_regions','hair_evidence','hair_observations',
   'hair_physical_tests','hair_history_events','hair_history_regions'));

alter table public.hair_passports enable row level security;
alter table public.hair_passports force row level security;
revoke all on public.hair_passports from public,anon,authenticated,service_role;
grant select on public.hair_passports to authenticated;
grant insert,update on public.hair_passports to elifora_hair_writer;
create policy hair_passports_read on public.hair_passports for select to authenticated
 using(app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy hair_passports_insert on public.hair_passports for insert to elifora_hair_writer
 with check(created_by=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.create'));
create policy hair_passports_update on public.hair_passports for update to elifora_hair_writer
 using(app_private.can_access_hair(organization_id,'hair_passport.update'))
 with check(updated_by=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.update'));
create trigger hair_passports_guard before insert or update or delete on public.hair_passports
 for each row execute function app_private.guard_hair_record('hair_passport.create');
create trigger hair_passports_audit after insert or update on public.hair_passports
 for each row execute function app_private.audit_hair_record('hair_passport.created','hair_passport.updated');

alter table public.hair_regions enable row level security;
alter table public.hair_regions force row level security;
revoke all on public.hair_regions from public,anon,authenticated,service_role;
grant select on public.hair_regions to authenticated;
grant insert,update on public.hair_regions to elifora_hair_writer;
create policy hair_regions_read on public.hair_regions for select to authenticated
 using(app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy hair_regions_insert on public.hair_regions for insert to elifora_hair_writer
 with check(created_by=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.update'));
create policy hair_regions_update on public.hair_regions for update to elifora_hair_writer
 using(app_private.can_access_hair(organization_id,'hair_passport.update'))
 with check(updated_by=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.update'));
create trigger hair_regions_guard before insert or update or delete on public.hair_regions
 for each row execute function app_private.guard_hair_record('hair_passport.update');
create trigger hair_regions_audit after insert or update on public.hair_regions
 for each row execute function app_private.audit_hair_record('hair_region.created','hair_region.updated');

alter table public.hair_evidence enable row level security;
alter table public.hair_evidence force row level security;
revoke all on public.hair_evidence from public,anon,authenticated,service_role;
grant select on public.hair_evidence to authenticated;
grant insert on public.hair_evidence to elifora_hair_writer;
create policy hair_evidence_read on public.hair_evidence for select to authenticated
 using(app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy hair_evidence_insert on public.hair_evidence for insert to elifora_hair_writer
 with check(created_by=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.add_observation'));
create trigger hair_evidence_guard before insert or update or delete on public.hair_evidence
 for each row execute function app_private.guard_hair_record('hair_passport.add_observation');
create trigger hair_evidence_audit after insert on public.hair_evidence
 for each row execute function app_private.audit_hair_record('hair_evidence.added');

alter table public.hair_observations enable row level security;
alter table public.hair_observations force row level security;
revoke all on public.hair_observations from public,anon,authenticated,service_role;
grant select on public.hair_observations to authenticated;
grant insert on public.hair_observations to elifora_hair_writer;
create policy hair_observations_read on public.hair_observations for select to authenticated
 using(app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy hair_observations_insert on public.hair_observations for insert to elifora_hair_writer
 with check(created_by=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.add_observation'));
create trigger hair_observations_guard before insert or update or delete on public.hair_observations
 for each row execute function app_private.guard_hair_record('hair_passport.add_observation');
create trigger hair_observations_audit after insert on public.hair_observations
 for each row execute function app_private.audit_hair_record('hair_observation.added');

alter table public.hair_physical_tests enable row level security;
alter table public.hair_physical_tests force row level security;
revoke all on public.hair_physical_tests from public,anon,authenticated,service_role;
grant select on public.hair_physical_tests to authenticated;
grant insert on public.hair_physical_tests to elifora_hair_writer;
create policy hair_physical_tests_read on public.hair_physical_tests for select to authenticated
 using(app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy hair_physical_tests_insert on public.hair_physical_tests for insert to elifora_hair_writer
 with check(created_by=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.add_test'));
create trigger hair_physical_tests_guard before insert or update or delete on public.hair_physical_tests
 for each row execute function app_private.guard_hair_record('hair_passport.add_test');
create trigger hair_physical_tests_audit after insert on public.hair_physical_tests
 for each row execute function app_private.audit_hair_record('hair_test.recorded');

alter table public.hair_history_events enable row level security;
alter table public.hair_history_events force row level security;
revoke all on public.hair_history_events from public,anon,authenticated,service_role;
grant select on public.hair_history_events to authenticated;
grant insert on public.hair_history_events to elifora_hair_writer;
create policy hair_history_events_read on public.hair_history_events for select to authenticated
 using(app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy hair_history_events_insert on public.hair_history_events for insert to elifora_hair_writer
 with check(created_by=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.add_history'));
create trigger hair_history_events_guard before insert or update or delete on public.hair_history_events
 for each row execute function app_private.guard_hair_record('hair_passport.add_history');
create trigger hair_history_events_audit after insert on public.hair_history_events
 for each row execute function app_private.audit_hair_record('hair_history.recorded');

alter table public.hair_history_regions enable row level security;
alter table public.hair_history_regions force row level security;
revoke all on public.hair_history_regions from public,anon,authenticated,service_role;
grant select on public.hair_history_regions to authenticated;
grant insert on public.hair_history_regions to elifora_hair_writer;
create policy hair_history_regions_read on public.hair_history_regions for select to authenticated
 using(app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy hair_history_regions_insert on public.hair_history_regions for insert to elifora_hair_writer
 with check(created_by=(select auth.uid()) and app_private.can_access_hair(organization_id,'hair_passport.add_history'));
create trigger hair_history_regions_guard before insert or update or delete on public.hair_history_regions
 for each row execute function app_private.guard_hair_record('hair_passport.add_history');
create trigger hair_history_regions_audit after insert on public.hair_history_regions
 for each row execute function app_private.audit_hair_record('hair_history.region_added');
