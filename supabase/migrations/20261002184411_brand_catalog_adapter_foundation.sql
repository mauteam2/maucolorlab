-- No manufacturer/product data is seeded. Catalog maintenance is a controlled technical
-- operation; the public application only reads releases and stores server-signed drafts.
create table app_private.catalog_operators(user_id uuid primary key references public.profiles(user_id),active boolean not null default true);
revoke all on app_private.catalog_operators from public,anon,authenticated,service_role;
create function app_private.is_catalog_operator() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from app_private.catalog_operators where user_id=auth.uid() and active);
$$;
revoke all on function app_private.is_catalog_operator() from public,anon,service_role;
grant execute on function app_private.is_catalog_operator() to authenticated;
insert into public.permissions(code,description) values ('brand_catalog.manage','Review organization-only technical catalogs.');
insert into public.role_permissions(role_code,permission_code) select code,'brand_catalog.manage' from public.roles where code in ('owner','manager');
create table public.brand_catalog_releases(
 id uuid primary key default gen_random_uuid(),series_id uuid not null,version integer not null check(version>0),previous_id uuid references public.brand_catalog_releases(id),
 scope text not null check(scope in ('GLOBAL','ORGANIZATION')),organization_id uuid references public.organizations(id),
 state text not null default 'DRAFT' check(state in ('DRAFT','TECHNICAL_REVIEW','GOLDEN_TEST','APPROVED','PUBLISHED','RETIRED')),
 golden_receipt text check(char_length(golden_receipt) between 1 and 1000),created_by uuid not null references public.profiles(user_id),created_at timestamptz not null default statement_timestamp(),
 unique(series_id,version),check((scope='GLOBAL')=(organization_id is null)),check((version=1)=(previous_id is null))
);
create index brand_catalog_org_idx on public.brand_catalog_releases(organization_id,state,id);
create index brand_catalog_previous_idx on public.brand_catalog_releases(previous_id);
create index brand_catalog_creator_idx on public.brand_catalog_releases(created_by);
create table public.catalog_brands(id uuid primary key default gen_random_uuid(),catalog_id uuid not null references public.brand_catalog_releases(id),display_name text not null check(char_length(display_name) between 1 and 160),unique(catalog_id,id),unique(catalog_id,display_name));
create table public.catalog_product_lines(id uuid primary key default gen_random_uuid(),catalog_id uuid not null,brand_id uuid not null,display_name text not null check(char_length(display_name) between 1 and 160),foreign key(catalog_id,brand_id) references public.catalog_brands(catalog_id,id),unique(catalog_id,brand_id,id),unique(catalog_id,brand_id,display_name));
create table public.catalog_products(
 id uuid primary key default gen_random_uuid(),series_id uuid not null,version integer not null check(version>0),catalog_id uuid not null,brand_id uuid not null,line_id uuid not null,
 manufacturer_code text not null check(char_length(manufacturer_code) between 1 and 100),display_name text not null check(char_length(display_name) between 1 and 160),
 product_type text not null check(product_type in ('SHADE','DEVELOPER','LIGHTENER','TONER','CORRECTOR','ACTIVATOR','TREATMENT','BOND')),
 professional_category text not null check(char_length(professional_category) between 1 and 100),country_region text check(char_length(country_region)<=100),manufacturer_source_reference text check(char_length(manufacturer_source_reference)<=1000),
 verification_status text not null default 'UNVERIFIED' check(verification_status in ('ELIFORA_VERIFIED','SALON_VERIFIED','UNVERIFIED','DEPRECATED')),active boolean not null default true,
 verified_by uuid references public.profiles(user_id),verified_at timestamptz,pigment_vector_version text not null default 'pigment-vector/1.0.0' check(pigment_vector_version='pigment-vector/1.0.0'),
 foreign key(catalog_id,brand_id,line_id) references public.catalog_product_lines(catalog_id,brand_id,id),unique(series_id,version),unique(catalog_id,id),unique(catalog_id,line_id,manufacturer_code),
 check(verification_status not in ('ELIFORA_VERIFIED','SALON_VERIFIED') or (verified_by is not null and verified_at is not null))
);
create index catalog_products_verified_by_idx on public.catalog_products(verified_by);
create index catalog_products_lookup_idx on public.catalog_products(catalog_id,brand_id,product_type,id);
create table public.catalog_technical_facts(
 catalog_id uuid not null,product_id uuid not null,key text not null check(key in ('level_effect','neutral','ash','blue','violet','green','red','copper','gold','pearl','beige','natural_base','opacity','coverage_strength','deposit_strength','lift_behavior','shade_level','tone_family','mixing_ratio','processing_minutes','developer_strength','lift_levels','grey_coverage','deposit_capability')),
 value jsonb,unit text check(unit in ('SOURCE_SCALE','LEVEL','LEVELS','PERCENT','MINUTES','RATIO','CATEGORY','BOOLEAN')),
 source text not null check(source in ('MANUFACTURER_DOCUMENTATION','ELIFORA_EXPERT_VALIDATED','SALON_VALIDATED','IMPORTED_UNVERIFIED','UNKNOWN')),
 verification_status text not null check(verification_status in ('ELIFORA_VERIFIED','SALON_VERIFIED','UNVERIFIED','DEPRECATED')),source_reference text check(char_length(source_reference) between 1 and 1000),version integer not null check(version>0),
 verified_by uuid references public.profiles(user_id),verified_at timestamptz,confidence numeric check(confidence between 0 and 1),
 primary key(product_id,key),foreign key(catalog_id,product_id) references public.catalog_products(catalog_id,id),
 check(value is null or jsonb_typeof(value) in ('number','string','boolean')),
 check(source<>'UNKNOWN' or (value is null and unit is null and confidence is null and verification_status='UNVERIFIED')),
 check(verification_status not in ('ELIFORA_VERIFIED','SALON_VERIFIED') or (value is not null and unit is not null and source_reference is not null and verified_by is not null and verified_at is not null and confidence is not null and source not in ('UNKNOWN','IMPORTED_UNVERIFIED'))),
 check(verification_status<>'ELIFORA_VERIFIED' or source in ('MANUFACTURER_DOCUMENTATION','ELIFORA_EXPERT_VALIDATED')),
 check(verification_status<>'SALON_VERIFIED' or source='SALON_VALIDATED'),
 check(key not in ('level_effect','neutral','ash','blue','violet','green','red','copper','gold','pearl','beige','natural_base','opacity','coverage_strength','deposit_strength','lift_behavior') or value is null or (jsonb_typeof(value)='number' and unit='SOURCE_SCALE'))
);
create index catalog_facts_catalog_idx on public.catalog_technical_facts(catalog_id,product_id);
create index catalog_facts_verifier_idx on public.catalog_technical_facts(verified_by);
create table public.catalog_compatibility_rules(
 id uuid primary key default gen_random_uuid(),catalog_id uuid not null,version integer not null check(version>0),product_id uuid not null,developer_id uuid not null,
 technique text not null check(char_length(technique) between 1 and 100),application_context text not null check(char_length(application_context) between 1 and 100),
 outcome text not null check(outcome in ('VERIFIED_ALLOWED','VERIFIED_RESTRICTED','NOT_RECOMMENDED','INCOMPATIBLE','UNKNOWN')),
 reason text not null check(char_length(reason) between 1 and 500),source text not null check(source in ('MANUFACTURER_DOCUMENTATION','ELIFORA_EXPERT_VALIDATED','SALON_VALIDATED','IMPORTED_UNVERIFIED','UNKNOWN')),source_reference text check(char_length(source_reference)<=1000),
 verified_by uuid references public.profiles(user_id),verified_at timestamptz,conditions text[] not null default '{}',restrictions text[] not null default '{}',
 foreign key(catalog_id,product_id) references public.catalog_products(catalog_id,id),foreign key(catalog_id,developer_id) references public.catalog_products(catalog_id,id),
 unique(catalog_id,product_id,developer_id,technique,application_context),
 check(conditions <@ array['NO_LIFT','NO_GREY_COVERAGE','STANDARD_REGION_ONLY']::text[] and cardinality(conditions)<=3 and cardinality(restrictions)<=10),
 check(outcome not like 'VERIFIED_%' or (source not in ('UNKNOWN','IMPORTED_UNVERIFIED') and source_reference is not null and verified_by is not null and verified_at is not null)),
 check(outcome<>'VERIFIED_RESTRICTED' or cardinality(conditions)+cardinality(restrictions)>0)
);
create index catalog_compatibility_developer_idx on public.catalog_compatibility_rules(catalog_id,developer_id);
create index catalog_compatibility_verifier_idx on public.catalog_compatibility_rules(verified_by);
create table public.brand_catalog_audit(
 id uuid primary key default gen_random_uuid(),catalog_id uuid not null references public.brand_catalog_releases(id),organization_id uuid references public.organizations(id),actor_id uuid not null references public.profiles(user_id),
 action text not null,entity_id uuid not null,correlation_id uuid not null,occurred_at timestamptz not null default statement_timestamp()
);
create index brand_catalog_audit_catalog_idx on public.brand_catalog_audit(catalog_id,occurred_at);
create index brand_catalog_audit_org_idx on public.brand_catalog_audit(organization_id);
create index brand_catalog_audit_actor_idx on public.brand_catalog_audit(actor_id);

create function app_private.can_read_catalog(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.brand_catalog_releases c where c.id=p_id and (
  c.scope='GLOBAL' and c.state in ('PUBLISHED','RETIRED') and exists(select 1 from public.salon_memberships m where m.user_id=auth.uid() and m.status='active' and app_private.can_access_clients(m.organization_id,'color_plan.read'))
  or c.scope='ORGANIZATION' and app_private.can_access_clients(c.organization_id,'color_plan.read')
  or app_private.is_catalog_operator()));
$$;
revoke all on function app_private.can_read_catalog(uuid) from public,anon,service_role;
grant execute on function app_private.can_read_catalog(uuid) to authenticated;
alter table public.brand_catalog_releases enable row level security;
revoke all on public.brand_catalog_releases from public,anon,authenticated,service_role;
grant select on public.brand_catalog_releases to authenticated;
create policy brand_catalog_read on public.brand_catalog_releases for select to authenticated using(app_private.can_read_catalog(id));
do $$ declare t text;begin
 foreach t in array array['catalog_brands','catalog_product_lines','catalog_products','catalog_technical_facts','catalog_compatibility_rules','brand_catalog_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy catalog_read on public.%I for select to authenticated using(app_private.can_read_catalog(catalog_id))',t);
 end loop;
end $$;

-- Only a database-maintained operator can transition a central release. Salon
-- managers can transition their own scope, but never assert central verification.
create function app_private.transition_brand_catalog(p_catalog_id uuid,p_state text,p_receipt text,p_correlation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare c public.brand_catalog_releases%rowtype; expected text;
begin
 if auth.uid() is null or p_correlation_id is null then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_catalog_id::text,1));
 select * into c from public.brand_catalog_releases where id=p_catalog_id for update;
 if not found or not (c.scope='GLOBAL' and app_private.is_catalog_operator() or c.scope='ORGANIZATION' and app_private.can_access_clients(c.organization_id,'brand_catalog.manage')) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 expected:=case c.state when 'DRAFT' then 'TECHNICAL_REVIEW' when 'TECHNICAL_REVIEW' then 'GOLDEN_TEST' when 'GOLDEN_TEST' then 'APPROVED' when 'APPROVED' then 'PUBLISHED' when 'PUBLISHED' then 'RETIRED' end;
 if p_state is distinct from expected then raise exception using errcode='23514',message='CATALOG_STATE_CONFLICT';end if;
 if p_state='APPROVED' and (p_receipt is null or char_length(p_receipt) not between 1 and 1000) then raise exception using errcode='23514',message='GOLDEN_RECEIPT_REQUIRED';end if;
 if p_state='PUBLISHED' and ((select count(*) from public.catalog_products where catalog_id=c.id)>100 or (select count(*) from public.catalog_compatibility_rules where catalog_id=c.id)>1000 or (select count(*) from public.catalog_brands where catalog_id=c.id)>100 or (select count(*) from public.catalog_product_lines where catalog_id=c.id)>100) then raise exception using errcode='23514',message='CATALOG_SIZE_LIMIT';end if;
 if p_state='PUBLISHED' and c.previous_id is not null then
  update public.brand_catalog_releases set state='RETIRED' where series_id=c.series_id and state='PUBLISHED';
  insert into public.brand_catalog_audit(catalog_id,organization_id,actor_id,action,entity_id,correlation_id) select id,organization_id,auth.uid(),'catalog.deprecated',id,p_correlation_id from public.brand_catalog_releases where series_id=c.series_id and state='RETIRED';
 end if;
 update public.brand_catalog_releases set state=p_state,golden_receipt=case when p_state='APPROVED' then p_receipt else golden_receipt end where id=c.id;
 insert into public.brand_catalog_audit(catalog_id,organization_id,actor_id,action,entity_id,correlation_id) values(c.id,c.organization_id,auth.uid(),case when p_state='PUBLISHED' then 'catalog.version_published' when p_state='RETIRED' then 'catalog.deprecated' else 'catalog.'||lower(p_state) end,c.id,p_correlation_id);
end $$;
revoke all on function app_private.transition_brand_catalog(uuid,text,text,uuid) from public,anon,service_role;
grant execute on function app_private.transition_brand_catalog(uuid,text,text,uuid) to authenticated;
create function public.brand_catalog_transition(p_catalog_id uuid,p_state text,p_receipt text,p_correlation_id uuid)
returns void language sql volatile security invoker set search_path='' as $$
 select app_private.transition_brand_catalog(p_catalog_id,p_state,p_receipt,p_correlation_id);
$$;
revoke all on function public.brand_catalog_transition(uuid,text,text,uuid) from public,anon,service_role;
grant execute on function public.brand_catalog_transition(uuid,text,text,uuid) to authenticated;

create function app_private.catalog_content_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.brand_catalog_releases%rowtype; v jsonb;
begin
 v:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 select * into c from public.brand_catalog_releases where id=(v->>'catalog_id')::uuid for update;
 if c.state not in ('DRAFT','TECHNICAL_REVIEW') or TG_OP='DELETE' then raise exception using errcode='23514',message='IMMUTABLE_CATALOG_CONTENT';end if;
 if auth.uid() is null or not (c.scope='GLOBAL' and app_private.is_catalog_operator() or c.scope='ORGANIZATION' and app_private.can_access_clients(c.organization_id,'brand_catalog.manage')) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if TG_OP='UPDATE' and (to_jsonb(old)->>'catalog_id' is distinct from v->>'catalog_id' or to_jsonb(old)->>'id' is distinct from v->>'id' or to_jsonb(old)->>'series_id' is distinct from v->>'series_id' or to_jsonb(old)->>'version' is distinct from v->>'version') then raise exception using errcode='23514',message='IMMUTABLE_CATALOG_IDENTITY';end if;
 if c.scope='GLOBAL' and v->>'verification_status'='SALON_VERIFIED' or c.scope='ORGANIZATION' and v->>'verification_status'='ELIFORA_VERIFIED' then raise exception using errcode='23514',message='VERIFICATION_SCOPE_INVALID';end if;
 if TG_TABLE_NAME='catalog_compatibility_rules' and v->>'outcome' like 'VERIFIED_%' and (c.scope='GLOBAL' and v->>'source'='SALON_VALIDATED' or c.scope='ORGANIZATION' and v->>'source'<>'SALON_VALIDATED') then raise exception using errcode='23514',message='VERIFICATION_SCOPE_INVALID';end if;
 if v->>'verification_status' in ('ELIFORA_VERIFIED','SALON_VERIFIED') or v->>'outcome' like 'VERIFIED_%' then
  if (v->>'verified_by')::uuid is distinct from auth.uid() or (v->>'verified_at')::timestamptz>statement_timestamp() then raise exception using errcode='23514',message='VERIFICATION_ACTOR_INVALID';end if;
 end if;
 return new;
end $$;
revoke all on function app_private.catalog_content_guard() from public,anon,authenticated,service_role;
create function app_private.catalog_content_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.brand_catalog_releases%rowtype;v jsonb:=to_jsonb(new);a text;
begin
 select * into c from public.brand_catalog_releases where id=(v->>'catalog_id')::uuid;
 a:=case when TG_TABLE_NAME='catalog_compatibility_rules' then 'catalog.compatibility_changed' when TG_OP='UPDATE' and to_jsonb(old)->>'verification_status' is distinct from v->>'verification_status' then case when v->>'verification_status'='SALON_VERIFIED' then 'catalog.salon_verified_approved' when v->>'verification_status'='DEPRECATED' then 'catalog.product_deprecated' else 'catalog.verification_changed' end when TG_TABLE_NAME='catalog_technical_facts' then 'catalog.technical_value_changed' else 'catalog.product_created' end;
 insert into public.brand_catalog_audit(catalog_id,organization_id,actor_id,action,entity_id,correlation_id) values(c.id,c.organization_id,auth.uid(),a,coalesce((v->>'id')::uuid,(v->>'product_id')::uuid),gen_random_uuid());
 return new;
end $$;
revoke all on function app_private.catalog_content_audit() from public,anon,authenticated,service_role;
do $$ declare t text;begin foreach t in array array['catalog_brands','catalog_product_lines','catalog_products','catalog_technical_facts','catalog_compatibility_rules'] loop
 execute format('create trigger catalog_guard before insert or update or delete on public.%I for each row execute function app_private.catalog_content_guard()',t);
 execute format('create trigger catalog_audit after insert or update on public.%I for each row execute function app_private.catalog_content_audit()',t);
end loop;end $$;
create function app_private.catalog_release_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare prev public.brand_catalog_releases%rowtype;
begin
 if TG_OP='DELETE' then raise exception using errcode='23514',message='IMMUTABLE_CATALOG';end if;
 if auth.uid() is null or not (new.scope='GLOBAL' and app_private.is_catalog_operator() or new.scope='ORGANIZATION' and app_private.can_access_clients(new.organization_id,'brand_catalog.manage')) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if TG_OP='INSERT' then
  if new.state<>'DRAFT' or new.created_by<>auth.uid() then raise exception using errcode='23514',message='CATALOG_REVIEW_REQUIRED';end if;
  if new.previous_id is not null then
   select * into prev from public.brand_catalog_releases where id=new.previous_id;
   if not found or prev.series_id<>new.series_id or prev.version+1<>new.version or prev.scope<>new.scope or prev.organization_id is distinct from new.organization_id then raise exception using errcode='23514',message='CATALOG_VERSION_CONFLICT';end if;
  end if;
 elsif new.id<>old.id or new.series_id<>old.series_id or new.version<>old.version or new.previous_id is distinct from old.previous_id or new.scope<>old.scope or new.organization_id is distinct from old.organization_id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception using errcode='23514',message='IMMUTABLE_CATALOG_IDENTITY';
 elsif new.state is distinct from (case old.state when 'DRAFT' then 'TECHNICAL_REVIEW' when 'TECHNICAL_REVIEW' then 'GOLDEN_TEST' when 'GOLDEN_TEST' then 'APPROVED' when 'APPROVED' then 'PUBLISHED' when 'PUBLISHED' then 'RETIRED' end) then raise exception using errcode='23514',message='CATALOG_STATE_CONFLICT';
 end if;
 return new;
end $$;
revoke all on function app_private.catalog_release_guard() from public,anon,authenticated,service_role;
create trigger catalog_release_guard before insert or update or delete on public.brand_catalog_releases for each row execute function app_private.catalog_release_guard();

create function public.brand_catalog_packet(p_catalog_id uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare c public.brand_catalog_releases%rowtype;v jsonb;
begin
 select * into c from public.brand_catalog_releases where id=p_catalog_id;
 if not found then return null;end if;
 if (select count(*) from public.catalog_products where catalog_id=c.id)>100 or (select count(*) from public.catalog_compatibility_rules where catalog_id=c.id)>1000 then raise exception using errcode='23514',message='CATALOG_SIZE_LIMIT';end if;
 v:=jsonb_build_object('release',jsonb_build_object('id',c.id,'version',c.version,'scope',c.scope,'organizationId',c.organization_id,'state',c.state),
 'brands',coalesce((select jsonb_agg(jsonb_build_object('id',id,'catalogId',catalog_id,'displayName',display_name) order by id) from public.catalog_brands where catalog_id=c.id),'[]'::jsonb),
 'lines',coalesce((select jsonb_agg(jsonb_build_object('id',id,'catalogId',catalog_id,'brandId',brand_id,'displayName',display_name) order by id) from public.catalog_product_lines where catalog_id=c.id),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'seriesId',p.series_id,'version',p.version,'catalogId',p.catalog_id,'brandId',p.brand_id,'lineId',p.line_id,'manufacturerCode',p.manufacturer_code,'displayName',p.display_name,'productType',p.product_type,'professionalCategory',p.professional_category,'countryRegion',p.country_region,'manufacturerSourceReference',p.manufacturer_source_reference,'verificationStatus',p.verification_status,'active',p.active,'verifiedBy',p.verified_by,'verifiedAt',p.verified_at,'pigmentVectorVersion',p.pigment_vector_version,
 'facts',coalesce((select jsonb_agg(jsonb_build_object('key',f.key,'value',f.value,'unit',f.unit,'source',f.source,'verificationStatus',f.verification_status,'sourceReference',f.source_reference,'version',f.version,'verifiedBy',f.verified_by,'verifiedAt',f.verified_at,'confidence',f.confidence) order by f.key) from public.catalog_technical_facts f where f.product_id=p.id),'[]'::jsonb)) order by p.id) from public.catalog_products p where p.catalog_id=c.id),'[]'::jsonb),
 'compatibility',coalesce((select jsonb_agg(jsonb_build_object('id',id,'catalogId',catalog_id,'version',version,'productId',product_id,'developerId',developer_id,'technique',technique,'applicationContext',application_context,'outcome',outcome,'reason',reason,'source',source,'sourceReference',source_reference,'verifiedBy',verified_by,'verifiedAt',verified_at,'conditions',to_jsonb(conditions),'restrictions',to_jsonb(restrictions)) order by id) from public.catalog_compatibility_rules where catalog_id=c.id),'[]'::jsonb));
 return jsonb_set(v,'{release,versionFingerprint}',to_jsonb(encode(extensions.digest(convert_to((v#-'{release,state}')::text,'UTF8'),'sha256'),'hex')));
end $$;
revoke all on function public.brand_catalog_packet(uuid) from public,anon,service_role;
grant execute on function public.brand_catalog_packet(uuid) to authenticated;

create role elifora_brand_writer nologin nobypassrls;
grant authenticated to elifora_brand_writer;
grant elifora_brand_writer to postgres;
grant usage on schema public,app_private,extensions to elifora_brand_writer;
grant execute on function app_private.verify_color_signature(text,text),app_private.hair_write_context(uuid,uuid,text),app_private.client_error(text,uuid,text) to elifora_brand_writer;
create table public.brand_recipe_drafts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,client_id uuid not null,plan_id uuid not null,location_id uuid not null,
 catalog_id uuid not null references public.brand_catalog_releases(id),catalog_fingerprint text not null check(catalog_fingerprint ~ '^[a-f0-9]{64}$'),
 version integer not null default 1 check(version=1),status text not null check(status in ('BRAND_READY','BRAND_MATCH_PENDING','BLOCKED_BY_SAFETY','BLOCKED_UNVERIFIED_PRODUCT','BLOCKED_COMPATIBILITY','BLOCKED_MISSING_TECHNICAL_DATA')),
 executable boolean not null default false check(not executable),created_by uuid not null references public.profiles(user_id),created_at timestamptz not null default statement_timestamp(),request_id uuid not null,correlation_id uuid not null,
 allow_salon_verified boolean not null default false,payload jsonb not null check(jsonb_typeof(payload)='object' and pg_column_size(payload)<=2097152),
 foreign key(organization_id,client_id,plan_id) references public.color_plans(organization_id,client_id,id),foreign key(organization_id,location_id) references public.locations(organization_id,id),
 unique(organization_id,created_by,request_id),unique(organization_id,client_id,id)
);
create index brand_recipe_plan_idx on public.brand_recipe_drafts(organization_id,client_id,plan_id);
create index brand_recipe_catalog_idx on public.brand_recipe_drafts(catalog_id);
create index brand_recipe_location_idx on public.brand_recipe_drafts(organization_id,location_id);
create index brand_recipe_creator_idx on public.brand_recipe_drafts(created_by);
alter table public.brand_recipe_drafts enable row level security;
alter table public.brand_recipe_drafts force row level security;
revoke all on public.brand_recipe_drafts from public,anon,authenticated,service_role;
grant select on public.brand_recipe_drafts to authenticated;
grant select,insert on public.brand_recipe_drafts to elifora_brand_writer;
create policy brand_recipe_read on public.brand_recipe_drafts for select to authenticated using(app_private.can_access_clients(organization_id,'color_plan.read') and app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy brand_recipe_insert on public.brand_recipe_drafts for insert to elifora_brand_writer with check(created_by=(select auth.uid()) and app_private.can_access_clients(organization_id,'color_plan.create'));
grant insert on public.audit_events to elifora_brand_writer;
create policy brand_recipe_audit on public.audit_events for insert to elifora_brand_writer with check(actor_user_id=(select auth.uid()) and app_private.can_access_clients(organization_id,'color_plan.create') and action='brand_adapter.evaluated' and entity_type='brand_recipe_drafts');
create function app_private.brand_recipe_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP<>'INSERT' then raise exception using errcode='23514',message='IMMUTABLE_BRAND_RECIPE';end if;
 if new.payload->>'status' is distinct from new.status or new.payload->>'engineVersion'<>'brand-adapter/1.0.0' then raise exception using errcode='23514',message='BRAND_RESULT_INVALID';end if;
 if new.status='BRAND_READY' then
  if new.payload#>>'{recipe,executable}' is distinct from 'false' or new.payload#>>'{recipe,professionalReviewRequired}' is distinct from 'true'
   or new.payload#>>'{recipe,executionStatus}' is distinct from 'BRAND_READY'
   or new.payload#>>'{recipe,compatibility,outcome}' not in ('VERIFIED_ALLOWED','VERIFIED_RESTRICTED')
   or new.payload#>>'{recipe,product,verificationStatus}' not in ('ELIFORA_VERIFIED','SALON_VERIFIED')
   or new.payload#>>'{recipe,developer,verificationStatus}' not in ('ELIFORA_VERIFIED','SALON_VERIFIED') then raise exception using errcode='23514',message='BRAND_RESULT_INVALID';end if;
 elsif new.payload->'recipe' is distinct from 'null'::jsonb then raise exception using errcode='23514',message='BRAND_RESULT_INVALID';end if;
 return new;
end $$;
revoke all on function app_private.brand_recipe_guard() from public,anon,authenticated,service_role;
create trigger brand_recipe_guard before insert or update or delete on public.brand_recipe_drafts for each row execute function app_private.brand_recipe_guard();
create function app_private.brand_recipe_audit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,metadata,correlation_id) values(auth.uid(),new.organization_id,'brand_adapter.evaluated','brand_recipe_drafts',new.id,jsonb_build_object('plan_id',new.plan_id,'catalog_id',new.catalog_id,'status',new.status),new.correlation_id);return new;
end $$;
revoke all on function app_private.brand_recipe_audit() from public,anon,authenticated,service_role;
create trigger brand_recipe_audit after insert on public.brand_recipe_drafts for each row execute function app_private.brand_recipe_audit();

create function app_private.store_brand_recipe(p_membership uuid,p_location uuid,p_envelope text,p_signature text,p_correlation uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare ctx jsonb;e jsonb;c jsonb;s jsonb;tok text;pl public.color_plans%rowtype;r public.brand_recipe_drafts%rowtype;
begin
 if auth.uid() is null then return app_private.client_error('UNAUTHENTICATED',p_correlation);end if;
 if not coalesce(app_private.verify_color_signature(p_envelope,p_signature),false) then return app_private.client_error('COLOR_PLAN_SIGNATURE_INVALID',p_correlation);end if;
 ctx:=app_private.hair_write_context(p_membership,p_location,'color_plan.create');
 if ctx ? 'code' then return app_private.client_error(ctx->>'code',p_correlation);end if;
 e:=p_envelope::jsonb;
 if not (e ?& array['organizationId','actorId','membershipId','locationId','clientId','planId','catalogId','requestId','sourceToken','expiresAt','catalogFingerprint','allowSalonVerified','result']) or exists(select 1 from jsonb_object_keys(e) k where k not in ('organizationId','actorId','membershipId','locationId','clientId','planId','catalogId','requestId','sourceToken','expiresAt','catalogFingerprint','allowSalonVerified','result'))
  or e->>'organizationId' is distinct from ctx->>'organization_id' or e->>'actorId' is distinct from auth.uid()::text or e->>'membershipId' is distinct from p_membership::text or e->>'locationId' is distinct from p_location::text
  or (e->>'expiresAt')::timestamptz<statement_timestamp() or (e->>'expiresAt')::timestamptz>statement_timestamp()+interval '5 minutes' then return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation);end if;
 perform pg_advisory_xact_lock(hashtextextended(e->>'organizationId',0));
 select * into r from public.brand_recipe_drafts where organization_id=(e->>'organizationId')::uuid and created_by=auth.uid() and request_id=(e->>'requestId')::uuid;
 if found then
  if r.plan_id<>(e->>'planId')::uuid or r.catalog_id<>(e->>'catalogId')::uuid or r.client_id<>(e->>'clientId')::uuid or r.allow_salon_verified is distinct from (e->>'allowSalonVerified')::boolean then return app_private.client_error('COLOR_PLAN_VERSION_CONFLICT',p_correlation);end if;
  return jsonb_build_object('id',r.id,'clientId',r.client_id,'planId',r.plan_id,'catalogId',r.catalog_id,'createdAt',r.created_at,'result',r.payload);
 end if;
 select * into pl from public.color_plans where id=(e->>'planId')::uuid and organization_id=(e->>'organizationId')::uuid and client_id=(e->>'clientId')::uuid;
 if not found then return app_private.client_error('COLOR_PLAN_NOT_FOUND',p_correlation);end if;
 if exists(select 1 from public.color_target_versions where organization_id=pl.organization_id and series_id=(select series_id from public.color_target_versions where id=pl.target_version_id) and version>(select version from public.color_target_versions where id=pl.target_version_id)) then return app_private.client_error('TARGET_VERSION_CONFLICT',p_correlation);end if;
 -- Lock a release against retirement while checking and storing its immutable packet.
 perform pg_advisory_xact_lock(hashtextextended(e->>'catalogId',1));
 c:=public.brand_catalog_packet((e->>'catalogId')::uuid);
 if c is null or c#>>'{release,state}'<>'PUBLISHED' or c#>>'{release,versionFingerprint}' is distinct from e->>'catalogFingerprint'
  or c#>>'{release,scope}'='ORGANIZATION' and c#>>'{release,organizationId}' is distinct from e->>'organizationId' then return app_private.client_error('COLOR_PLAN_SOURCE_CONFLICT',p_correlation);end if;
 if jsonb_typeof(e->'allowSalonVerified') is distinct from 'boolean' or (e->>'allowSalonVerified')::boolean and not app_private.can_access_clients(pl.organization_id,'brand_catalog.manage') then return app_private.client_error('FORBIDDEN',p_correlation);end if;
 s:=public.hair_confidence_snapshot(p_membership,p_location,pl.client_id,false,p_correlation);
 if s ? 'code' then return s;end if;
 tok:=encode(extensions.digest(convert_to((s#>'{data,pages}')::text,'UTF8'),'sha256'),'hex');
 if tok is distinct from e->>'sourceToken' or (s#>>'{data,pages,0,passport,version}')::bigint<>pl.passport_version then return app_private.client_error('COLOR_PLAN_SOURCE_CONFLICT',p_correlation);end if;
 if e#>>'{result,status}'='BRAND_READY' then
  if pl.status<>'DRAFT' or pl.payload#>>'{safetyGate,canProgress}' is distinct from 'true'
   or e#>>'{result,recipe,parentRecipeId}' is distinct from pl.recipe_id
   or e#>'{result,recipe,product}' not in (select value from jsonb_array_elements(c->'products'))
   or e#>'{result,recipe,developer}' not in (select value from jsonb_array_elements(c->'products'))
   or e#>'{result,recipe,compatibility}' not in (select value from jsonb_array_elements(c->'compatibility')) then return app_private.client_error('COLOR_INPUT_INVALID',p_correlation);end if;
 end if;
 insert into public.brand_recipe_drafts(organization_id,client_id,plan_id,location_id,catalog_id,catalog_fingerprint,status,created_by,request_id,correlation_id,allow_salon_verified,payload)
 values(pl.organization_id,pl.client_id,pl.id,p_location,(e->>'catalogId')::uuid,e->>'catalogFingerprint',e#>>'{result,status}',auth.uid(),(e->>'requestId')::uuid,p_correlation,(e->>'allowSalonVerified')::boolean,e->'result') returning * into r;
 return jsonb_build_object('id',r.id,'clientId',r.client_id,'planId',r.plan_id,'catalogId',r.catalog_id,'createdAt',r.created_at,'result',r.payload);
exception when invalid_text_representation or not_null_violation or check_violation then return app_private.client_error('VALIDATION_FAILED',p_correlation);
end $$;
grant create on schema app_private to elifora_brand_writer;
alter function app_private.store_brand_recipe(uuid,uuid,text,text,uuid) owner to elifora_brand_writer;
revoke create on schema app_private from elifora_brand_writer;
revoke all on function app_private.store_brand_recipe(uuid,uuid,text,text,uuid) from public,anon,service_role;
grant execute on function app_private.store_brand_recipe(uuid,uuid,text,text,uuid) to authenticated;
create function public.brand_recipe_store(p_membership_id uuid,p_location_id uuid,p_envelope text,p_signature text,p_correlation_id uuid)
returns jsonb language sql volatile security invoker set search_path='' set row_security='on' as $$
 select app_private.store_brand_recipe(p_membership_id,p_location_id,p_envelope,p_signature,p_correlation_id);
$$;
revoke all on function public.brand_recipe_store(uuid,uuid,text,text,uuid) from public,anon,service_role;
grant execute on function public.brand_recipe_store(uuid,uuid,text,text,uuid) to authenticated;

create function public.brand_adapter_snapshot(p_membership_id uuid,p_location_id uuid,p_client_id uuid,p_correlation_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare s jsonb;
begin
 s:=public.hair_confidence_snapshot(p_membership_id,p_location_id,p_client_id,false,p_correlation_id);
 if s ? 'code' then return s;end if;
 return jsonb_build_object('data',s->'data','correlationId',p_correlation_id,'sourceToken',encode(extensions.digest(convert_to((s#>'{data,pages}')::text,'UTF8'),'sha256'),'hex'));
end $$;
revoke all on function public.brand_adapter_snapshot(uuid,uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.brand_adapter_snapshot(uuid,uuid,uuid,uuid) to authenticated;
