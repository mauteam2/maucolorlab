-- Append-only regional intent. Controlled writer inherits caller RLS and never bypasses it.
create role elifora_color_writer nologin nobypassrls;
grant authenticated to elifora_color_writer;
grant elifora_color_writer to postgres;
grant usage on schema public,app_private,extensions to elifora_color_writer;
grant execute on function app_private.hair_write_context(uuid,uuid,text),app_private.client_error(text,uuid) to elifora_color_writer;
insert into public.permissions(code,description) values
 ('color_plan.read','Read organization color targets and planning drafts.'),
 ('color_plan.create','Create versioned targets and brand-independent planning drafts.');
insert into public.role_permissions(role_code,permission_code)
 select r.code,p.code from public.roles r cross join public.permissions p where p.code like 'color_plan.%'
 and (r.code in ('owner','manager','colorist') or (r.code='assistant' and p.code='color_plan.read'));

create table public.color_target_versions (
 id uuid primary key default gen_random_uuid(), series_id uuid not null, version bigint not null check(version between 1 and 9007199254740991),
 previous_version_id uuid, organization_id uuid not null, client_id uuid not null, passport_id uuid not null,
 mode text not null check(mode in ('UNIFORM_COLOR','ROOT_REFRESH','ROOT_SHADOW','GREY_COVERAGE','LIGHTENING','TONING','COLOR_CORRECTION','FILL_PREPIGMENTATION','DIMENSIONAL_COLOR','MULTI_REGION_CUSTOM')),
 global_intent text not null check(global_intent in ('PRESERVE','REFRESH','TRANSFORM','CORRECT')),
 schema_version integer not null default 1 check(schema_version=1), definition jsonb not null check(jsonb_typeof(definition)='object' and pg_column_size(definition)<=131072),
 created_at timestamptz not null default statement_timestamp(), created_by uuid not null references public.profiles(user_id),
 location_id uuid not null, request_id uuid not null, request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'), correlation_id uuid not null,
 unique(organization_id,series_id,version), unique(organization_id,client_id,id), unique(organization_id,client_id,series_id,id),
 unique(organization_id,created_by,request_id),
 foreign key(organization_id,client_id,passport_id) references public.hair_passports(organization_id,client_id,id),
 foreign key(organization_id,client_id,series_id,previous_version_id) references public.color_target_versions(organization_id,client_id,series_id,id),
 foreign key(organization_id,location_id) references public.locations(organization_id,id),
 check((version=1 and previous_version_id is null) or (version>1 and previous_version_id is not null))
);
create index color_target_versions_client on public.color_target_versions(organization_id,client_id,created_at desc,id);
create index color_target_versions_passport on public.color_target_versions(organization_id,client_id,passport_id);
create index color_target_versions_previous on public.color_target_versions(previous_version_id);
create index color_target_versions_actor on public.color_target_versions(created_by);
create index color_target_versions_location on public.color_target_versions(organization_id,location_id);
create table public.color_target_regions (
 organization_id uuid not null, client_id uuid not null, target_version_id uuid not null, passport_id uuid not null, region_id uuid not null,
 desired_level numeric check(desired_level between 1 and 10), tone_family text check(tone_family in ('NEUTRAL','ASH_COOL','VIOLET','BLUE','GREEN','GOLD_WARM','COPPER','RED','MIXED')),
 preserve boolean not null, handling text not null check(handling in ('STANDARD','ISOLATE')),
 primary key(organization_id,target_version_id,region_id),
 foreign key(organization_id,client_id,target_version_id) references public.color_target_versions(organization_id,client_id,id),
 foreign key(organization_id,passport_id,region_id) references public.hair_regions(organization_id,passport_id,id)
);
create index color_target_regions_client on public.color_target_regions(organization_id,client_id,target_version_id);
create index color_target_regions_region on public.color_target_regions(organization_id,passport_id,region_id);

create function app_private.color_target_definition(p_value jsonb,p_org uuid,p_client uuid,p_passport uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r jsonb; k text; v_ids uuid[]:='{}'; v_id uuid; v_regions jsonb:='[]'; v_mixed jsonb;
 v_fields text[]:=array['regionId','level','toneFamily','mixedFamilies','warmth','greyPriority','liftPriority','depositPriority','toneIntent','contrast','preserve','handling','correction','intermediateLevel'];
begin
 if jsonb_typeof(p_value) is distinct from 'object' or not(p_value ?& array['schemaVersion','mode','globalIntent','regions'])
  or exists(select 1 from jsonb_object_keys(p_value) x where x not in ('schemaVersion','mode','globalIntent','regions'))
  or p_value->'schemaVersion'<>'1'::jsonb or p_value->>'mode' not in ('UNIFORM_COLOR','ROOT_REFRESH','ROOT_SHADOW','GREY_COVERAGE','LIGHTENING','TONING','COLOR_CORRECTION','FILL_PREPIGMENTATION','DIMENSIONAL_COLOR','MULTI_REGION_CUSTOM')
  or p_value->>'globalIntent' not in ('PRESERVE','REFRESH','TRANSFORM','CORRECT') or jsonb_typeof(p_value->'regions') is distinct from 'array' then
  raise exception using errcode='23514',message='COLOR_TARGET_INVALID';
 end if;
 if jsonb_typeof(p_value->'mode') is distinct from 'string' or jsonb_typeof(p_value->'globalIntent') is distinct from 'string' then
  raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
 if jsonb_array_length(p_value->'regions') not between 1 and 100 then raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
 for r in select value from jsonb_array_elements(p_value->'regions') loop
  if jsonb_typeof(r) is distinct from 'object' or not(r ?& v_fields) or exists(select 1 from jsonb_object_keys(r) x where not(x=any(v_fields))) then
   raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  if jsonb_typeof(r->'regionId') is distinct from 'string' then raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  v_id:=(r->>'regionId')::uuid;
  if v_id=any(v_ids) or not exists(select 1 from public.hair_regions where id=v_id and organization_id=p_org and client_id=p_client and passport_id=p_passport and status='ACTIVE') then
   raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  v_ids:=array_append(v_ids,v_id);
  foreach k in array array['warmth','greyPriority','liftPriority','depositPriority','toneIntent','contrast','handling','correction'] loop
   if jsonb_typeof(r->k) is distinct from 'string' then raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  end loop;
  foreach k in array array['level','intermediateLevel'] loop
   if jsonb_typeof(r->k) not in ('number','null') or (jsonb_typeof(r->k)='number' and (r->>k)::numeric not between 1 and 10) then
    raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  end loop;
  if jsonb_typeof(r->'preserve') is distinct from 'boolean' or jsonb_typeof(r->'mixedFamilies') is distinct from 'array'
   or jsonb_typeof(r->'toneFamily') not in ('string','null')
   or (r->>'toneFamily' is not null and r->>'toneFamily' not in ('NEUTRAL','ASH_COOL','VIOLET','BLUE','GREEN','GOLD_WARM','COPPER','RED','MIXED'))
   or r->>'warmth' not in ('NEUTRAL','COOL','WARM','PRESERVE') or r->>'greyPriority' not in ('NONE','BLEND','COVER')
   or r->>'liftPriority' not in ('NONE','NORMAL','HIGH') or r->>'depositPriority' not in ('NONE','NORMAL','HIGH')
   or r->>'toneIntent' not in ('PRESERVE','NEUTRALIZE','ENHANCE','CHANGE') or r->>'contrast' not in ('NONE','SOFT','PRONOUNCED')
   or r->>'handling' not in ('STANDARD','ISOLATE') or r->>'correction' not in ('NONE','BAND','UNEVEN','REFLECTION','DARK_ACCUMULATION') then
   raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(r->'mixedFamilies') x where jsonb_typeof(x) is distinct from 'string'
   or x#>>'{}' not in ('NEUTRAL','ASH_COOL','VIOLET','BLUE','GREEN','GOLD_WARM','COPPER','RED'))
   or jsonb_array_length(r->'mixedFamilies')>3 or (select count(distinct x) from jsonb_array_elements(r->'mixedFamilies') x)<>jsonb_array_length(r->'mixedFamilies')
   or ((r->>'toneFamily'='MIXED') and jsonb_array_length(r->'mixedFamilies')<2)
   or ((r->>'toneFamily' is distinct from 'MIXED') and jsonb_array_length(r->'mixedFamilies')<>0) then
   raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  if (r->>'preserve')::boolean then
   if r->>'level' is not null or r->>'toneFamily' is not null or r->>'toneIntent'<>'PRESERVE' or r->>'warmth'<>'PRESERVE'
    or r->>'greyPriority'<>'NONE' or r->>'liftPriority'<>'NONE' or r->>'depositPriority'<>'NONE' or r->>'correction'<>'NONE'
    or r->>'intermediateLevel' is not null or jsonb_array_length(r->'mixedFamilies')<>0 then raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  elsif r->>'level' is null or (r->>'toneIntent'<>'PRESERVE' and r->>'toneFamily' is null) then
   raise exception using errcode='23514',message='COLOR_TARGET_INCOMPLETE';
  end if;
  if (r->>'liftPriority'<>'NONE' and r->>'depositPriority'<>'NONE') then raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  if r->>'correction' in ('BAND','DARK_ACCUMULATION') and r->>'intermediateLevel' is null then raise exception using errcode='23514',message='COLOR_TARGET_INCOMPLETE'; end if;
  select coalesce(jsonb_agg(x order by x),'[]'::jsonb) into v_mixed from jsonb_array_elements(r->'mixedFamilies') x;
  v_regions:=v_regions||jsonb_build_array(r||jsonb_build_object('regionId',v_id,'mixedFamilies',v_mixed));
 end loop;
 if exists(select 1 from public.hair_regions where organization_id=p_org and passport_id=p_passport and status='ACTIVE' and not(id=any(v_ids))) then
  raise exception using errcode='23514',message='COLOR_TARGET_INCOMPLETE'; end if;
 if p_value->>'mode'='UNIFORM_COLOR' and (exists(select 1 from jsonb_array_elements(v_regions) x where (x->>'preserve')::boolean)
  or (select count(distinct jsonb_build_array(x->'level',x->'toneFamily',x->'mixedFamilies',x->'warmth')) from jsonb_array_elements(v_regions) x)>1) then
  raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
 select jsonb_agg(x order by x->>'regionId') into v_regions from jsonb_array_elements(v_regions) x;
 return p_value||jsonb_build_object('regions',v_regions);
end $$;
revoke all on function app_private.color_target_definition(jsonb,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function app_private.color_target_definition(jsonb,uuid,uuid,uuid) to elifora_color_writer;

create function app_private.guard_color_target()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_latest public.color_target_versions%rowtype;
begin
 if TG_OP<>'INSERT' then raise exception using errcode='23514',message='color targets are immutable revisions'; end if;
 if auth.uid() is null or new.created_by<>auth.uid() or not app_private.can_access_clients(new.organization_id,'color_plan.create') then
  raise exception using errcode='42501',message='color target unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,0));
 if not exists(select 1 from public.clients where id=new.client_id and organization_id=new.organization_id and status='ACTIVE')
  or not exists(select 1 from public.hair_passports where id=new.passport_id and organization_id=new.organization_id and client_id=new.client_id and status='ACTIVE') then
  raise exception using errcode='42501',message='color target unavailable'; end if;
 new.definition:=app_private.color_target_definition(new.definition,new.organization_id,new.client_id,new.passport_id);
 if new.mode<>new.definition->>'mode' or new.global_intent<>new.definition->>'globalIntent' then raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
 select * into v_latest from public.color_target_versions where organization_id=new.organization_id and series_id=new.series_id order by version desc limit 1;
 if (not found and new.version<>1) or (found and (new.version<>v_latest.version+1 or new.previous_version_id<>v_latest.id or new.client_id<>v_latest.client_id or new.passport_id<>v_latest.passport_id)) then
  raise exception using errcode='23514',message='TARGET_VERSION_CONFLICT'; end if;
 return new;
end $$;
revoke all on function app_private.guard_color_target() from public,anon,authenticated;
create function app_private.guard_color_target_region()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP<>'INSERT' or not exists(select 1 from public.color_target_versions t where t.id=new.target_version_id and t.organization_id=new.organization_id
  and t.client_id=new.client_id and t.passport_id=new.passport_id and t.created_by=auth.uid() and t.created_at=statement_timestamp()
  and exists(select 1 from jsonb_array_elements(t.definition->'regions') r where (r->>'regionId')::uuid=new.region_id
   and (r->>'level')::numeric is not distinct from new.desired_level and r->>'toneFamily' is not distinct from new.tone_family
   and (r->>'preserve')::boolean=new.preserve and r->>'handling'=new.handling)) then
  raise exception using errcode='23514',message='immutable regional target unavailable'; end if;
 return new;
end $$;
revoke all on function app_private.guard_color_target_region() from public,anon,authenticated;
create function app_private.audit_color_target()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,metadata,correlation_id)
 values(auth.uid(),new.organization_id,case when new.version=1 then 'color_target.created' else 'color_target.revised' end,
  'color_target_versions',new.id,jsonb_build_object('client_id',new.client_id,'series_id',new.series_id,'version',new.version,'previous_version_id',new.previous_version_id),new.correlation_id);
 return new;
end $$;
revoke all on function app_private.audit_color_target() from public,anon,authenticated;
grant insert on public.audit_events to elifora_color_writer;
create policy color_audit_append on public.audit_events for insert to elifora_color_writer with check(actor_user_id=(select auth.uid())
 and app_private.can_access_clients(organization_id,'color_plan.create') and action in ('color_target.created','color_target.revised','color_plan.generated')
 and entity_type in ('color_target_versions','color_plans'));
alter table public.color_target_versions enable row level security;
alter table public.color_target_versions force row level security;
alter table public.color_target_regions enable row level security;
alter table public.color_target_regions force row level security;
revoke all on public.color_target_versions,public.color_target_regions from public,anon,authenticated,service_role;
grant select on public.color_target_versions,public.color_target_regions to authenticated;
grant insert on public.color_target_versions,public.color_target_regions to elifora_color_writer;
create policy color_target_versions_read on public.color_target_versions for select to authenticated using(app_private.can_access_clients(organization_id,'color_plan.read') and app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy color_target_versions_insert on public.color_target_versions for insert to elifora_color_writer with check(created_by=(select auth.uid()) and app_private.can_access_clients(organization_id,'color_plan.create'));
create policy color_target_regions_read on public.color_target_regions for select to authenticated using(app_private.can_access_clients(organization_id,'color_plan.read') and app_private.can_access_hair(organization_id,'hair_passport.read'));
create policy color_target_regions_insert on public.color_target_regions for insert to elifora_color_writer with check(app_private.can_access_clients(organization_id,'color_plan.create'));
create trigger color_target_versions_guard before insert or update or delete on public.color_target_versions for each row execute function app_private.guard_color_target();
create trigger color_target_regions_guard before insert or update or delete on public.color_target_regions for each row execute function app_private.guard_color_target_region();
create trigger color_target_versions_audit after insert on public.color_target_versions for each row execute function app_private.audit_color_target();

create function app_private.color_target_model(t public.color_target_versions)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('id',t.id,'seriesId',t.series_id,'version',t.version,'previousVersionId',t.previous_version_id,'clientId',t.client_id,
  'passportId',t.passport_id,'definition',t.definition,'createdAt',t.created_at,'createdBy',t.created_by); $$;
revoke all on function app_private.color_target_model(public.color_target_versions) from public,anon;
grant execute on function app_private.color_target_model(public.color_target_versions) to authenticated,elifora_color_writer;

create function app_private.execute_color_target(p_membership uuid,p_location uuid,p_client uuid,p_operation text,p_payload jsonb,p_correlation uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare v_actor uuid:=auth.uid(); v_context jsonb; v_org uuid; v_passport uuid; v_request uuid; v_series uuid; v_version bigint;
 v_parent uuid; v_definition jsonb; v_hash text; v_row public.color_target_versions%rowtype; v_permission text; v_archived boolean;
begin
 if p_correlation is null then raise exception using errcode='22023',message='correlation required'; end if;
 if v_actor is null then return app_private.client_error('UNAUTHENTICATED',p_correlation); end if;
 if p_membership is null or p_location is null or p_client is null or p_operation is null or p_operation not in ('create','revise','read')
  or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>131072 then return app_private.client_error('VALIDATION_FAILED',p_correlation); end if;
 v_permission:=case when p_operation='read' then 'color_plan.read' else 'color_plan.create' end;
 v_context:=app_private.hair_write_context(p_membership,p_location,v_permission);
 if v_context ? 'code' then return app_private.client_error(v_context->>'code',p_correlation); end if;
 v_org:=(v_context->>'organization_id')::uuid;
 if not app_private.can_access_clients(v_org,'clients.read') or not app_private.can_access_hair(v_org,'hair_passport.read') then return app_private.client_error('FORBIDDEN',p_correlation); end if;
 if p_operation<>'read' then perform pg_advisory_xact_lock(hashtextextended(v_org::text,0)); end if;
 v_context:=app_private.hair_write_context(p_membership,p_location,v_permission);
 if v_context ? 'code' then return app_private.client_error(v_context->>'code',p_correlation); end if;
 if v_context->>'organization_id'<>v_org::text then return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation); end if;
 v_archived:=coalesce((p_payload->>'include_archived')::boolean,false);
 if not exists(select 1 from public.clients where organization_id=v_org and id=p_client and (status='ACTIVE' or p_operation='read' and v_archived)) then
  return app_private.client_error('CLIENT_NOT_FOUND',p_correlation); end if;
 select id into v_passport from public.hair_passports where organization_id=v_org and client_id=p_client and (status='ACTIVE' or p_operation='read' and v_archived);
 if v_passport is null then return app_private.client_error('HAIR_PASSPORT_NOT_FOUND',p_correlation); end if;
 if p_operation='read' then
  if exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('target_id','include_archived')) or not(p_payload ? 'target_id')
   or (p_payload ? 'include_archived' and jsonb_typeof(p_payload->'include_archived') is distinct from 'boolean') then return app_private.client_error('VALIDATION_FAILED',p_correlation); end if;
  select * into v_row from public.color_target_versions where organization_id=v_org and client_id=p_client and id=(p_payload->>'target_id')::uuid;
  if not found then return app_private.client_error('COLOR_TARGET_NOT_FOUND',p_correlation); end if;
 else
  if exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('request_id','definition','series_id','expected_version')) or not(p_payload ?& array['request_id','definition'])
   or (p_operation='create' and (p_payload ? 'series_id' or p_payload ? 'expected_version')) then return app_private.client_error('VALIDATION_FAILED',p_correlation); end if;
  v_request:=(p_payload->>'request_id')::uuid;
  if v_request is null then return app_private.client_error('VALIDATION_FAILED',p_correlation); end if;
  v_definition:=app_private.color_target_definition(p_payload->'definition',v_org,p_client,v_passport);
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('operation',p_operation,'client',p_client,'payload',p_payload||jsonb_build_object('definition',v_definition))::text,'UTF8'),'sha256'),'hex');
  select * into v_row from public.color_target_versions where organization_id=v_org and created_by=v_actor and request_id=v_request;
  if found then
   if v_row.request_hash<>v_hash then return app_private.client_error('TARGET_VERSION_CONFLICT',p_correlation); end if;
   return jsonb_build_object('data',app_private.color_target_model(v_row),'correlationId',p_correlation);
  end if;
  if p_operation='create' then v_series:=gen_random_uuid(); v_version:=1;
  else
   if not(p_payload ?& array['series_id','expected_version']) or jsonb_typeof(p_payload->'expected_version') is distinct from 'number'
    or (p_payload->>'expected_version')::numeric<>trunc((p_payload->>'expected_version')::numeric) then return app_private.client_error('VALIDATION_FAILED',p_correlation); end if;
   v_series:=(p_payload->>'series_id')::uuid;
   select * into v_row from public.color_target_versions where organization_id=v_org and client_id=p_client and series_id=v_series order by version desc limit 1;
   if not found then return app_private.client_error('COLOR_TARGET_NOT_FOUND',p_correlation); end if;
   if v_row.version<>(p_payload->>'expected_version')::numeric then return app_private.client_error('TARGET_VERSION_CONFLICT',p_correlation); end if;
   v_parent:=v_row.id; v_version:=v_row.version+1;
  end if;
  insert into public.color_target_versions(series_id,version,previous_version_id,organization_id,client_id,passport_id,mode,global_intent,definition,created_by,location_id,request_id,request_hash,correlation_id)
  values(v_series,v_version,v_parent,v_org,p_client,v_passport,v_definition->>'mode',v_definition->>'globalIntent',v_definition,v_actor,p_location,v_request,v_hash,p_correlation) returning * into v_row;
  insert into public.color_target_regions(organization_id,client_id,target_version_id,passport_id,region_id,desired_level,tone_family,preserve,handling)
  select v_org,p_client,v_row.id,v_passport,(r->>'regionId')::uuid,(r->>'level')::numeric,r->>'toneFamily',(r->>'preserve')::boolean,r->>'handling' from jsonb_array_elements(v_definition->'regions') r;
 end if;
 return jsonb_build_object('data',app_private.color_target_model(v_row),'correlationId',p_correlation);
exception when invalid_text_representation or numeric_value_out_of_range or not_null_violation then return app_private.client_error('VALIDATION_FAILED',p_correlation);
 when check_violation then return app_private.client_error(case when SQLERRM in ('COLOR_TARGET_INVALID','COLOR_TARGET_INCOMPLETE','TARGET_VERSION_CONFLICT') then SQLERRM else 'COLOR_TARGET_INVALID' end,p_correlation);
end $$;
alter function app_private.execute_color_target(uuid,uuid,uuid,text,jsonb,uuid) owner to elifora_color_writer;
revoke all on function app_private.execute_color_target(uuid,uuid,uuid,text,jsonb,uuid) from public,anon,service_role;
grant execute on function app_private.execute_color_target(uuid,uuid,uuid,text,jsonb,uuid) to authenticated;
create function public.color_target_operation(p_membership_id uuid,p_location_id uuid,p_client_id uuid,p_operation text,p_payload jsonb,p_correlation_id uuid)
returns jsonb language sql volatile security invoker set search_path='' set row_security='on' as $$
 select app_private.execute_color_target(p_membership_id,p_location_id,p_client_id,p_operation,p_payload,p_correlation_id); $$;
revoke all on function public.color_target_operation(uuid,uuid,uuid,text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.color_target_operation(uuid,uuid,uuid,text,jsonb,uuid) to authenticated;
