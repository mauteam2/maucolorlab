-- No tenant data, defaults, chemistry or commercial plan seeded by this migration.
create role elifora_pilot_operator nologin nobypassrls;
grant usage on schema app_private to elifora_pilot_operator;
create table app_private.pilot_admissions (
 request_id uuid primary key, owner_user_id uuid not null references public.profiles(user_id),
 organization_id uuid not null references public.organizations(id), location_id uuid not null,
 membership_id uuid not null references public.salon_memberships(id), definition jsonb not null,
 operator_actor text not null, reason text not null, correlation_id uuid not null,
 created_at timestamptz not null default statement_timestamp(),
 foreign key(organization_id,location_id) references public.locations(organization_id,id)
);
alter table app_private.pilot_admissions enable row level security;
alter table app_private.pilot_admissions force row level security;
revoke all on app_private.pilot_admissions from public,anon,authenticated,service_role,elifora_pilot_operator;
create trigger pilot_admission_immutable before update or delete on app_private.pilot_admissions for each row execute function app_private.live_immutable();

-- Only an explicitly assumed non-login operator role can invoke this procedure.
-- Provider invitation, readiness approval and SaaS plan approval are separate steps.
create function app_private.pilot_provision(p_request_id uuid,p_owner_user_id uuid,p_definition jsonb,p_actor text,p_reason text,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old app_private.pilot_admissions%rowtype; org uuid:=gen_random_uuid(); loc uuid:=gen_random_uuid(); member uuid:=gen_random_uuid();
begin
 if coalesce(current_setting('app.settings.elifora_environment',true),'') not in ('staging','pilot') then raise exception 'PILOT_ENVIRONMENT_REQUIRED';end if;
 if p_request_id is null or p_owner_user_id is null or p_correlation_id is null or p_definition is null
  or not app_private.salon_keys(p_definition,array['name','location_name','timezone','base_currency'])
  or jsonb_typeof(p_definition)<>'object' or pg_column_size(p_definition)>2048
  or char_length(trim(coalesce(p_actor,''))) not between 3 and 80 or char_length(trim(coalesce(p_reason,''))) not between 5 and 500
  or char_length(trim(coalesce(p_definition->>'name',''))) not between 1 and 160
  or char_length(trim(coalesce(p_definition->>'location_name',''))) not between 1 and 160
  or coalesce(p_definition->>'base_currency','') !~ '^[A-Z]{3}$'
  or not exists(select 1 from pg_timezone_names where name=p_definition->>'timezone')
  or exists(select 1 from jsonb_each(p_definition) e where jsonb_typeof(e.value)<>'string')
 then raise exception 'VALIDATION_FAILED';end if;
 perform pg_advisory_xact_lock(hashtextextended('pilot-admission:'||p_owner_user_id::text,92));
 -- A confirmed provider identity is required; user metadata has no authority.
 if not exists(select 1 from auth.users where id=p_owner_user_id and email_confirmed_at is not null and (banned_until is null or banned_until<statement_timestamp())) then raise exception 'PILOT_OWNER_NOT_CONFIRMED';end if;
 select * into old from app_private.pilot_admissions where request_id=p_request_id;
 if found then
  if old.owner_user_id<>p_owner_user_id or old.definition<>p_definition or old.operator_actor<>p_actor or old.reason<>p_reason then raise exception 'PILOT_ADMISSION_CONFLICT';end if;
  return jsonb_build_object('organization_id',old.organization_id,'location_id',old.location_id,'membership_id',old.membership_id);
 end if;
 if exists(select 1 from app_private.pilot_admissions where owner_user_id=p_owner_user_id) then raise exception 'PILOT_OWNER_ALREADY_ADMITTED';end if;
 insert into public.organizations(id,name,slug,base_currency) values(org,trim(p_definition->>'name'),'pilot-'||org::text,p_definition->>'base_currency');
 insert into public.locations(id,organization_id,name,timezone) values(loc,org,trim(p_definition->>'location_name'),p_definition->>'timezone');
 insert into public.salon_memberships(id,organization_id,user_id,role_code,status,joined_at) values(member,org,p_owner_user_id,'owner','active',statement_timestamp());
 insert into app_private.pilot_admissions values(p_request_id,p_owner_user_id,org,loc,member,p_definition,p_actor,p_reason,p_correlation_id,statement_timestamp());
 insert into public.audit_events(organization_id,location_id,action,entity_type,entity_id,reason,correlation_id,metadata)
 values(org,loc,'pilot.admit','organization',org,p_reason,p_correlation_id,jsonb_build_object('operator_actor',p_actor,'request_id',p_request_id));
 return jsonb_build_object('organization_id',org,'location_id',loc,'membership_id',member);
end$$;
revoke all on function app_private.pilot_provision(uuid,uuid,jsonb,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.pilot_provision(uuid,uuid,jsonb,text,text,uuid) to elifora_pilot_operator;

-- Authenticated, no-tenant release attestation. Verification only, never a signing oracle.
create function public.pilot_release_status(p_challenge text,p_signature text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.require_active_session();
 if coalesce(p_challenge,'') !~ '^[a-f0-9]{64}$' or coalesce(p_signature,'') !~ '^[a-f0-9]{64}$' then raise exception 'VALIDATION_FAILED';end if;
 return jsonb_build_object(
  'migrationHead',(select max(version) from supabase_migrations.schema_migrations),
  'signingMatches',exists(select 1 from app_private.color_engine_keys where id=1 and encode(extensions.hmac(convert_to(p_challenge,'UTF8'),secret,'sha256'),'hex')=p_signature),
  'privateStorage',exists(select 1 from storage.buckets where id='live-technical' and not public),
  'colorEngineVersion','color-engine/1.1.0',
  'catalogs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version',version,'state',state,'pilotKey',pilot_key)) from public.brand_catalog_releases where state='PUBLISHED' and scope='GLOBAL'),'[]'::jsonb));
end$$;
revoke all on function public.pilot_release_status(text,text) from public,anon,service_role;
grant execute on function public.pilot_release_status(text,text) to authenticated;
