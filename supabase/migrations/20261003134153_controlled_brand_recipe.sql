-- Phase 2C: professional selections and verified ratio arithmetic. Never executable.
create table public.controlled_brand_recipes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, client_id uuid not null,
 plan_id uuid not null, location_id uuid not null, catalog_id uuid not null references public.brand_catalog_releases(id),
 product_id uuid not null, developer_id uuid not null, rule_id uuid not null,
 series_id uuid not null default gen_random_uuid(), version integer not null check(version>0), supersedes_id uuid,
 color_grams numeric(8,2) not null check(color_grams>0 and color_grams<=1000),
 developer_grams numeric(8,2) not null check(developer_grams=color_grams),
 white_ratio numeric not null check(white_ratio>=0 and white_ratio<=1),
 executable boolean not null default false check(not executable),
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default statement_timestamp(),
 request_id uuid not null, correlation_id uuid not null,
 payload jsonb not null check(jsonb_typeof(payload)='object' and pg_column_size(payload)<=262144),
 foreign key(organization_id,client_id,plan_id) references public.color_plans(organization_id,client_id,id),
 foreign key(organization_id,location_id) references public.locations(organization_id,id),
 foreign key(catalog_id,product_id) references public.catalog_products(catalog_id,id),
 foreign key(catalog_id,developer_id) references public.catalog_products(catalog_id,id),
 foreign key(catalog_id,rule_id) references public.catalog_compatibility_rules(catalog_id,id),
 unique(organization_id,client_id,id), unique(organization_id,client_id,series_id,version),
 unique(organization_id,created_by,request_id),
 foreign key(organization_id,client_id,supersedes_id) references public.controlled_brand_recipes(organization_id,client_id,id),
 check((version=1)=(supersedes_id is null))
);
create index controlled_recipe_plan_idx on public.controlled_brand_recipes(organization_id,client_id,plan_id);
create index controlled_recipe_location_idx on public.controlled_brand_recipes(organization_id,location_id);
create index controlled_recipe_product_idx on public.controlled_brand_recipes(catalog_id,product_id);
create index controlled_recipe_developer_idx on public.controlled_brand_recipes(catalog_id,developer_id);
create index controlled_recipe_rule_idx on public.controlled_brand_recipes(catalog_id,rule_id);
create index controlled_recipe_parent_idx on public.controlled_brand_recipes(organization_id,client_id,supersedes_id);
create index controlled_recipe_creator_idx on public.controlled_brand_recipes(created_by);
alter table public.controlled_brand_recipes enable row level security;
alter table public.controlled_brand_recipes force row level security;
revoke all on public.controlled_brand_recipes from public,anon,authenticated,service_role;
grant select on public.controlled_brand_recipes to authenticated;
grant select,insert on public.controlled_brand_recipes to elifora_brand_writer;
create policy controlled_recipe_read on public.controlled_brand_recipes for select to authenticated using(
 app_private.can_access_clients(organization_id,'color_plan.read') and app_private.can_access_clients(organization_id,'clients.read') and app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy controlled_recipe_insert on public.controlled_brand_recipes for insert to elifora_brand_writer with check(
 created_by=(select auth.uid()) and app_private.can_access_clients(organization_id,'color_plan.create') and app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy controlled_recipe_audit on public.audit_events for insert to elifora_brand_writer with check(
 actor_user_id=(select auth.uid()) and app_private.can_access_clients(organization_id,'color_plan.create') and
 action='controlled_recipe.created' and entity_type='controlled_brand_recipes');

create function app_private.controlled_recipe_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP<>'INSERT' then raise exception using errcode='23514',message='IMMUTABLE_CONTROLLED_RECIPE';end if;
 if new.payload->>'schemaVersion' is distinct from '3' or new.payload->>'engineVersion' is distinct from 'controlled-brand-recipe/1.0.0'
 or new.payload->>'state' is distinct from 'DRAFT_FOR_PROFESSIONAL_REVIEW' or new.payload->>'executable' is distinct from 'false'
 or new.payload->>'professionalReviewRequired' is distinct from 'true' or new.payload->>'selectionOrigin' is distinct from 'PROFESSIONAL_INPUT'
 or new.payload->>'amountBasis' is distinct from 'USER_ENTERED_COLOR_GRAMS'
 or new.payload#>>'{selected,mixingRatio}' is distinct from '1:1' or new.payload#>>'{selected,executable}' is distinct from 'false'
 or (new.payload->>'colorGrams')::numeric is distinct from new.color_grams
 or (new.payload->>'developerGrams')::numeric is distinct from new.developer_grams
 or (new.payload->>'totalGrams')::numeric is distinct from new.color_grams*2
 or (new.payload#>>'{context,whiteRatio}')::numeric is distinct from new.white_ratio
 or new.payload#>>'{snapshots,catalogId}' is distinct from new.catalog_id::text
 or new.payload#>>'{selected,productId}' is distinct from new.product_id::text
 or new.payload#>>'{selected,developerId}' is distinct from new.developer_id::text
 or new.payload#>>'{selected,compatibilityRuleId}' is distinct from new.rule_id::text
 then raise exception using errcode='23514',message='CONTROLLED_RECIPE_INVALID';end if;
 insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,metadata,correlation_id)
 values(auth.uid(),new.organization_id,'controlled_recipe.created','controlled_brand_recipes',new.id,
 jsonb_build_object('plan_id',new.plan_id,'catalog_id',new.catalog_id,'version',new.version,'supersedes_id',new.supersedes_id),new.correlation_id);
 return new;
end $$;
revoke all on function app_private.controlled_recipe_guard() from public,anon,authenticated,service_role;
create trigger controlled_recipe_guard before insert or update or delete on public.controlled_brand_recipes for each row execute function app_private.controlled_recipe_guard();

create function app_private.controlled_recipe_json(r public.controlled_brand_recipes) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'seriesId',r.series_id,'version',r.version,'supersedesId',r.supersedes_id,
 'clientId',r.client_id,'planId',r.plan_id,'catalogId',r.catalog_id,'createdAt',r.created_at,'createdBy',r.created_by,'result',r.payload);
$$;
revoke all on function app_private.controlled_recipe_json(public.controlled_brand_recipes) from public,anon,service_role;
grant execute on function app_private.controlled_recipe_json(public.controlled_brand_recipes) to authenticated;

create function app_private.store_controlled_recipe(p_membership uuid,p_location uuid,p_envelope text,p_signature text,p_correlation uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare ctx jsonb;e jsonb;q jsonb;v jsonb;packet jsonb;s jsonb;tok text;pl public.color_plans%rowtype;
 r public.controlled_brand_recipes%rowtype;parent public.controlled_brand_recipes%rowtype;
 sid uuid;ver integer;rule public.catalog_compatibility_rules%rowtype;usage public.catalog_rule_sources%rowtype;
 ratio numeric;evidence_id text;
begin
 if auth.uid() is null then return app_private.client_error('UNAUTHENTICATED',p_correlation);end if;
 if octet_length(p_envelope)>262144 or not coalesce(app_private.verify_color_signature(p_envelope,p_signature),false) then
 return app_private.client_error('COLOR_PLAN_SIGNATURE_INVALID',p_correlation);end if;
 ctx:=app_private.hair_write_context(p_membership,p_location,'color_plan.create');
 if ctx ? 'code' then return ctx;end if;
 if not app_private.can_access_clients((ctx->>'organization_id')::uuid,'color_plan.read') or not app_private.can_access_clients((ctx->>'organization_id')::uuid,'clients.read') or
 not app_private.can_access_hair((ctx->>'organization_id')::uuid,'hair_passport.read') then return app_private.client_error('FORBIDDEN',p_correlation);end if;
 e:=p_envelope::jsonb;q:=e->'input';v:=e->'result';
 if not (e ?& array['organizationId','actorId','membershipId','locationId','input','sourceToken','expiresAt','result'])
 or exists(select 1 from jsonb_object_keys(e) k where k not in ('organizationId','actorId','membershipId','locationId','input','sourceToken','expiresAt','result'))
 or e->>'organizationId' is distinct from ctx->>'organization_id' or e->>'actorId' is distinct from auth.uid()::text
 or e->>'membershipId' is distinct from p_membership::text or e->>'locationId' is distinct from p_location::text
 or (e->>'expiresAt')::timestamptz<statement_timestamp() or (e->>'expiresAt')::timestamptz>statement_timestamp()+interval '5 minutes'
 then return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation);end if;
 if not (q ?& array['request_id','client_id','plan_id','catalog_id','product_id','developer_id','color_grams','supersedes_id'])
 or exists(select 1 from jsonb_object_keys(q) k where k not in ('request_id','client_id','plan_id','catalog_id','product_id','developer_id','color_grams','supersedes_id'))
 then return app_private.client_error('VALIDATION_FAILED',p_correlation);end if;
 perform pg_advisory_xact_lock(hashtextextended(ctx->>'organization_id',0));
 select * into r from public.controlled_brand_recipes where organization_id=(ctx->>'organization_id')::uuid and created_by=auth.uid() and request_id=(q->>'request_id')::uuid;
 if found then
  if r.client_id is distinct from (q->>'client_id')::uuid or r.plan_id is distinct from (q->>'plan_id')::uuid or
  r.catalog_id is distinct from (q->>'catalog_id')::uuid or r.product_id is distinct from (q->>'product_id')::uuid or
  r.developer_id is distinct from (q->>'developer_id')::uuid or r.color_grams is distinct from (q->>'color_grams')::numeric or
  r.supersedes_id is distinct from (q->>'supersedes_id')::uuid then return app_private.client_error('CONTROLLED_RECIPE_VERSION_CONFLICT',p_correlation);end if;
  return app_private.controlled_recipe_json(r);
 end if;
 select id,organization_id,client_id,target_version_id,passport_version,status,recipe_id,payload into
 pl.id,pl.organization_id,pl.client_id,pl.target_version_id,pl.passport_version,pl.status,pl.recipe_id,pl.payload
 from public.color_plans where id=(q->>'plan_id')::uuid and organization_id=(ctx->>'organization_id')::uuid and client_id=(q->>'client_id')::uuid;
 if not found then return app_private.client_error('COLOR_PLAN_NOT_FOUND',p_correlation);end if;
 if pl.status<>'DRAFT' or pl.payload#>>'{safetyGate,canProgress}' is distinct from 'true' or v->>'parentRecipeId' is distinct from pl.recipe_id
 then return app_private.client_error('CONTROLLED_RECIPE_CONTEXT_INVALID',p_correlation);end if;
 if exists(select 1 from public.color_target_versions where organization_id=pl.organization_id and
 series_id=(select series_id from public.color_target_versions where id=pl.target_version_id) and
 version>(select version from public.color_target_versions where id=pl.target_version_id)) then return app_private.client_error('TARGET_VERSION_CONFLICT',p_correlation);end if;
 perform pg_advisory_xact_lock(hashtextextended(q->>'catalog_id',1));
 packet:=public.catalog_pilot_packet((q->>'catalog_id')::uuid);
 if packet is null or packet#>>'{catalog,release,state}' is distinct from 'PUBLISHED' or
 packet#>>'{catalog,release,versionFingerprint}' is distinct from v#>>'{snapshots,catalogFingerprint}' or
 packet#>>'{catalog,release,version}' is distinct from v#>>'{snapshots,catalogVersion}' or
 exists(select 1 from jsonb_array_elements(packet->'sources') x where x->>'review_status'<>'APPROVED' or x->>'verification_status'<>'ELIFORA_VERIFIED')
 then return app_private.client_error('COLOR_PLAN_SOURCE_CONFLICT',p_correlation);end if;
 s:=public.hair_confidence_snapshot(p_membership,p_location,pl.client_id,false,p_correlation);
 if s ? 'code' then return s;end if;
 tok:=encode(extensions.digest(convert_to((s#>'{data,pages}')::text,'UTF8'),'sha256'),'hex');
 if tok is distinct from e->>'sourceToken' or (s#>>'{data,pages,0,passport,version}')::bigint<>pl.passport_version
 then return app_private.client_error('COLOR_PLAN_SOURCE_CONFLICT',p_correlation);end if;
 if not exists(select 1 from jsonb_array_elements(s#>'{data,pages,0,regions}') x where x->>'id'=v#>>'{context,regionId}' and x->>'type'='ROOT' and x->>'status'='ACTIVE')
 then return app_private.client_error('CONTROLLED_RECIPE_CONTEXT_INVALID',p_correlation);end if;
 ratio:=(v#>>'{context,whiteRatio}')::numeric;
 if jsonb_typeof(v#>'{context,evidenceIds}') is distinct from 'array' or jsonb_array_length(v#>'{context,evidenceIds}')<1
 then return app_private.client_error('CONTROLLED_RECIPE_CONTEXT_INVALID',p_correlation);end if;
 for evidence_id in select jsonb_array_elements_text(v#>'{context,evidenceIds}') loop
  if not exists(select 1 from jsonb_array_elements(s#>'{data,pages}') page,
   lateral jsonb_array_elements(page#>'{observations,items}') o where o#>>'{evidence,id}'=evidence_id and
   o#>>'{evidence,source}'='PROFESSIONAL_VERIFIED' and o#>>'{grey_ratio,state}'='KNOWN' and
   (o#>>'{grey_ratio,value}')::numeric=ratio and (o->>'region_id' is null or o->>'region_id'=v#>>'{context,regionId}') and
   (o#>>'{evidence,relevant_until}' is null or (o#>>'{evidence,relevant_until}')::timestamptz>=statement_timestamp()))
  then return app_private.client_error('CONTROLLED_RECIPE_CONTEXT_INVALID',p_correlation);end if;
 end loop;
 select * into rule from public.catalog_compatibility_rules where catalog_id=(q->>'catalog_id')::uuid and id=(v#>>'{selected,compatibilityRuleId}')::uuid;
 select * into usage from public.catalog_rule_sources where catalog_id=rule.catalog_id and rule_id=rule.id;
 if rule.id is null or usage.rule_id is null or not usage.regrowth_only or rule.outcome<>'VERIFIED_RESTRICTED' or rule.mixing_ratio is distinct from '1:1'
 or rule.technique<>'ROOT_REFRESH' or rule.application_context<>'STANDARD'
 or rule.product_id is distinct from (q->>'product_id')::uuid or rule.developer_id is distinct from (q->>'developer_id')::uuid
 or (usage.white_min_exclusive is not null and ratio<=usage.white_min_exclusive::numeric/100)
 or (usage.white_max_inclusive is not null and ratio>usage.white_max_inclusive::numeric/100)
 or (v->>'colorGrams')::numeric is distinct from (q->>'color_grams')::numeric
 or jsonb_typeof(v->'sources') is distinct from 'array' or jsonb_array_length(v->'sources')<1
 or not exists(select 1 from jsonb_array_elements(v->'sources') x where x->>'id'=usage.source_id::text)
 or exists(select 1 from jsonb_array_elements_text(v#>'{selected,sourceIds}') x where not exists(select 1 from jsonb_array_elements(v->'sources') y where y->>'id'=x))
 or exists(select 1 from jsonb_array_elements(v->'sources') x where x not in (select value from jsonb_array_elements(packet->'sources')))
 then return app_private.client_error('CONTROLLED_RECIPE_CONTEXT_INVALID',p_correlation);end if;
 if not exists(select 1 from public.catalog_products p,public.catalog_products d where p.id=rule.product_id and d.id=rule.developer_id and
 p.brand_id=d.brand_id and p.active and d.active and p.verification_status='ELIFORA_VERIFIED' and d.verification_status='ELIFORA_VERIFIED' and
 p.version=(v#>>'{snapshots,productVersion}')::integer and d.version=(v#>>'{snapshots,developerVersion}')::integer and rule.version=(v#>>'{snapshots,ruleVersion}')::integer)
 then return app_private.client_error('CONTROLLED_RECIPE_CONTEXT_INVALID',p_correlation);end if;
 sid:=gen_random_uuid();ver:=1;
 if q->>'supersedes_id' is not null then
  select * into parent from public.controlled_brand_recipes where organization_id=pl.organization_id and client_id=pl.client_id and id=(q->>'supersedes_id')::uuid;
  if not found or exists(select 1 from public.controlled_brand_recipes where organization_id=pl.organization_id and client_id=pl.client_id and series_id=parent.series_id and version>parent.version)
  then return app_private.client_error('CONTROLLED_RECIPE_VERSION_CONFLICT',p_correlation);end if;
  sid:=parent.series_id;ver:=parent.version+1;
 end if;
 insert into public.controlled_brand_recipes(organization_id,client_id,plan_id,location_id,catalog_id,product_id,developer_id,rule_id,series_id,version,supersedes_id,
 color_grams,developer_grams,white_ratio,created_by,request_id,correlation_id,payload)
 values(pl.organization_id,pl.client_id,pl.id,p_location,rule.catalog_id,rule.product_id,rule.developer_id,rule.id,sid,ver,parent.id,
 (q->>'color_grams')::numeric,(v->>'developerGrams')::numeric,ratio,auth.uid(),(q->>'request_id')::uuid,p_correlation,v) returning * into r;
 return app_private.controlled_recipe_json(r);
exception when invalid_text_representation or not_null_violation or check_violation or numeric_value_out_of_range or datetime_field_overflow then
 return app_private.client_error('VALIDATION_FAILED',p_correlation);
end $$;
grant create on schema app_private to elifora_brand_writer;
alter function app_private.store_controlled_recipe(uuid,uuid,text,text,uuid) owner to elifora_brand_writer;
revoke create on schema app_private from elifora_brand_writer;
revoke all on function app_private.store_controlled_recipe(uuid,uuid,text,text,uuid) from public,anon,service_role;
grant execute on function app_private.store_controlled_recipe(uuid,uuid,text,text,uuid) to authenticated;
create function public.controlled_recipe_store(p_membership_id uuid,p_location_id uuid,p_envelope text,p_signature text,p_correlation_id uuid)
returns jsonb language sql volatile security invoker set search_path='' set row_security='on' as $$
 select app_private.store_controlled_recipe(p_membership_id,p_location_id,p_envelope,p_signature,p_correlation_id);
$$;
revoke all on function public.controlled_recipe_store(uuid,uuid,text,text,uuid) from public,anon,service_role;
grant execute on function public.controlled_recipe_store(uuid,uuid,text,text,uuid) to authenticated;
