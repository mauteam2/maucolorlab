-- Phase 3: signed application service commands; caller JWT and membership RLS.
create role elifora_live_writer nologin nobypassrls;
grant authenticated to elifora_live_writer;
grant elifora_live_writer to postgres;
grant usage on schema public,app_private,extensions,storage to elifora_live_writer;
insert into public.permissions(code,description) select 'live_session.'||p,'Live color session: '||p
from unnest(array['view','start','control','contribute','usage','checkpoint','revise','complete','cancel']) p;
insert into public.role_permissions(role_code,permission_code)
select r.code,p.code from public.roles r cross join public.permissions p where p.code like 'live_session.%' and
 (r.code in ('owner','manager','colorist') or (r.code='assistant' and p.code in ('live_session.view','live_session.contribute','live_session.usage','live_session.checkpoint')) or (r.code='reception' and p.code='live_session.view'));

create table public.live_sessions(
 id uuid primary key,organization_id uuid not null,location_id uuid not null,client_id uuid not null,passport_id uuid not null,
 original_recipe_id uuid not null,current_recipe_id uuid not null,color_case_link uuid,appointment_link uuid,
 status text not null check(status in ('PREPARING','READY','IN_PROGRESS','PAUSED','CHECKPOINT_REQUIRED','COMPLETION_REVIEW','COMPLETED','CANCELLED','ABORTED')),
 record_version bigint not null check(record_version>0),controller_user_id uuid not null references public.profiles(user_id),controller_device_id uuid not null,control_epoch bigint not null check(control_epoch>0),
 started_by uuid not null references public.profiles(user_id),created_at timestamptz not null,updated_at timestamptz not null,started_at timestamptz,completed_at timestamptz,
 content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),payload jsonb not null check(jsonb_typeof(payload)='object' and pg_column_size(payload)<=1048576),
 unique(organization_id,id),unique(organization_id,client_id,id),
 foreign key(organization_id,location_id) references public.locations(organization_id,id),
 foreign key(organization_id,client_id,passport_id) references public.hair_passports(organization_id,client_id,id),
 foreign key(organization_id,client_id,original_recipe_id) references public.controlled_brand_recipes(organization_id,client_id,id),
 foreign key(organization_id,client_id,current_recipe_id) references public.controlled_brand_recipes(organization_id,client_id,id)
);
create index live_sessions_client on public.live_sessions(organization_id,location_id,client_id,updated_at desc);
create index live_sessions_passport on public.live_sessions(organization_id,client_id,passport_id);
create index live_sessions_original_recipe on public.live_sessions(organization_id,client_id,original_recipe_id);
create index live_sessions_current_recipe on public.live_sessions(organization_id,client_id,current_recipe_id);
create index live_sessions_controller on public.live_sessions(controller_user_id);
create index live_sessions_starter on public.live_sessions(started_by);
create unique index live_sessions_one_active_client on public.live_sessions(organization_id,client_id) where status not in ('COMPLETED','CANCELLED','ABORTED');

create table public.live_session_versions(
 organization_id uuid not null,session_id uuid not null,record_version bigint not null,mutation_id uuid not null,actor_id uuid not null references public.profiles(user_id),
 device_id uuid not null,input jsonb not null,payload jsonb not null,recorded_at timestamptz not null default statement_timestamp(),correlation_id uuid not null,
 primary key(session_id,record_version),unique(organization_id,actor_id,mutation_id),foreign key(organization_id,session_id) references public.live_sessions(organization_id,id)
);
create index live_versions_parent on public.live_session_versions(organization_id,session_id);
create index live_versions_actor on public.live_session_versions(actor_id);
create table public.live_session_steps(
 organization_id uuid not null,session_id uuid not null,id uuid not null,record_version bigint not null,sequence_index integer not null,region_id uuid not null references public.hair_regions(id),bowl_id uuid not null,
 status text not null check(status in ('PENDING','IN_PROGRESS','COMPLETED')),instruction_type text not null check(instruction_type in ('APPLICATION','CHECKPOINT','RINSE')),instruction_text text not null,actual_start timestamptz,actual_finish timestamptz,
 primary key(session_id,id,record_version),foreign key(organization_id,session_id) references public.live_sessions(organization_id,id)
);
create index live_steps_region on public.live_session_steps(region_id);
create index live_steps_parent on public.live_session_steps(organization_id,session_id);
create table public.live_bowls(
 organization_id uuid not null,session_id uuid not null,id uuid not null,record_version bigint not null,recipe_id uuid not null references public.controlled_brand_recipes(id),planned_grams numeric(8,2) not null,prepared_grams numeric(8,2),used_grams numeric(8,2),waste_grams numeric(8,2),closed boolean not null,
 check(not closed or (prepared_grams>=used_grams and waste_grams=prepared_grams-used_grams)),primary key(session_id,id,record_version),foreign key(organization_id,session_id) references public.live_sessions(organization_id,id)
);
create index live_bowls_recipe on public.live_bowls(recipe_id);
create index live_bowls_parent on public.live_bowls(organization_id,session_id);
create table public.live_timers(
 organization_id uuid not null,session_id uuid not null,id uuid not null,record_version bigint not null,step_id uuid,region_id uuid references public.hair_regions(id),label text not null,planned_duration integer not null check(planned_duration between 1 and 86400),anchor_at timestamptz,elapsed_seconds numeric not null check(elapsed_seconds>=0),status text not null check(status in ('RUNNING','PAUSED','COMPLETED','CANCELLED')),
 primary key(session_id,id,record_version),foreign key(organization_id,session_id) references public.live_sessions(organization_id,id)
);
create index live_timers_region on public.live_timers(region_id);
create index live_timers_parent on public.live_timers(organization_id,session_id);
create table public.live_checkpoints(
 organization_id uuid not null,session_id uuid not null,id uuid not null,record_version bigint not null,step_id uuid not null,required boolean not null,result text not null check(result in ('PENDING','PASS','CONCERN','FAIL')),completed_by uuid references public.profiles(user_id),completed_at timestamptz,payload jsonb not null,
 primary key(session_id,id,record_version),foreign key(organization_id,session_id) references public.live_sessions(organization_id,id)
);
create index live_checkpoint_actor on public.live_checkpoints(completed_by);
create index live_checkpoint_parent on public.live_checkpoints(organization_id,session_id);
create table public.live_usage(
 organization_id uuid not null,session_id uuid not null,id uuid primary key,bowl_id uuid not null,recipe_id uuid not null references public.controlled_brand_recipes(id),product_id uuid not null references public.catalog_products(id),product_version integer not null check(product_version>0),
 prepared_grams numeric(8,2) not null,used_grams numeric(8,2) not null,waste_grams numeric(8,2) not null,recorded_by uuid not null references public.profiles(user_id),recorded_at timestamptz not null,
 check(prepared_grams>0 and used_grams>=0 and prepared_grams>=used_grams and waste_grams=prepared_grams-used_grams),foreign key(organization_id,session_id) references public.live_sessions(organization_id,id)
);
create index live_usage_recipe on public.live_usage(recipe_id);
create index live_usage_product on public.live_usage(product_id);
create index live_usage_actor on public.live_usage(recorded_by);
create index live_usage_parent on public.live_usage(organization_id,session_id);
create table public.live_deviations(organization_id uuid not null,session_id uuid not null,id uuid primary key,type text not null,changed_by uuid not null references public.profiles(user_id),at timestamptz not null,payload jsonb not null,foreign key(organization_id,session_id) references public.live_sessions(organization_id,id));
create index live_deviations_actor on public.live_deviations(changed_by);
create index live_deviations_parent on public.live_deviations(organization_id,session_id);
create table public.live_risk_events(organization_id uuid not null,session_id uuid not null,id uuid not null,record_version bigint not null,type text not null,action text not null check(action in ('CHECKPOINT_REQUIRED','PAUSE','REASSESS','STOP')),recorded_by uuid not null references public.profiles(user_id),payload jsonb not null,primary key(session_id,id,record_version),foreign key(organization_id,session_id) references public.live_sessions(organization_id,id));
create index live_risk_actor on public.live_risk_events(recorded_by);
create index live_risk_parent on public.live_risk_events(organization_id,session_id);
create table public.live_photos(organization_id uuid not null,session_id uuid not null,id uuid primary key,kind text not null check(kind in ('BEFORE','CHECKPOINT','PROCESS','AFTER')),object_path text not null unique,content_type text not null,uploaded_by uuid not null references public.profiles(user_id),created_at timestamptz not null,foreign key(organization_id,session_id) references public.live_sessions(organization_id,id));
create index live_photo_actor on public.live_photos(uploaded_by);
create index live_photo_parent on public.live_photos(organization_id,session_id);
create table public.session_outcomes(organization_id uuid not null,session_id uuid primary key,client_id uuid not null,passport_id uuid not null,original_recipe_id uuid not null references public.controlled_brand_recipes(id),current_recipe_id uuid not null references public.controlled_brand_recipes(id),history_event_id uuid not null references public.hair_history_events(id),verified_by uuid not null references public.profiles(user_id),completed_at timestamptz not null,actual_process_seconds numeric not null,payload jsonb not null,
 foreign key(organization_id,client_id,session_id) references public.live_sessions(organization_id,client_id,id),foreign key(organization_id,client_id,passport_id) references public.hair_passports(organization_id,client_id,id));
create index live_outcome_passport on public.session_outcomes(organization_id,client_id,passport_id);
create index live_outcome_history on public.session_outcomes(history_event_id);
create index live_outcome_original on public.session_outcomes(original_recipe_id);
create index live_outcome_current on public.session_outcomes(current_recipe_id);
create index live_outcome_actor on public.session_outcomes(verified_by);

create function app_private.live_immutable() returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception using errcode='23514',message='IMMUTABLE_LIVE_HISTORY';end $$;
do $$ declare t text;begin foreach t in array array['live_sessions','live_session_versions','live_session_steps','live_bowls','live_timers','live_checkpoints','live_usage','live_deviations','live_risk_events','live_photos','session_outcomes'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select on public.%I to authenticated',t);execute format('grant select,insert on public.%I to elifora_live_writer',t);
 if t='live_sessions' then
 execute format('create policy live_read on public.%I for select to authenticated using(app_private.user_has_permission(organization_id,location_id,''live_session.view''))',t);
 else
 execute format('create policy live_read on public.%I for select to authenticated using(exists(select 1 from public.live_sessions s where s.id=session_id and s.organization_id=%I.organization_id))',t,t);
 execute format('create trigger immutable_history before update or delete on public.%I for each row execute function app_private.live_immutable()',t);
 end if;
 execute format('create policy live_insert on public.%I for insert to elifora_live_writer with check(app_private.can_access_clients(organization_id,''live_session.view''))',t);
 end loop;end $$;
grant update on public.live_sessions to elifora_live_writer;
create policy live_update on public.live_sessions for update to elifora_live_writer using(app_private.user_has_permission(organization_id,location_id,'live_session.view')) with check(app_private.user_has_permission(organization_id,location_id,'live_session.view'));
create function app_private.live_head_guard() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if TG_OP='DELETE' or TG_OP='UPDATE' and (old.status in ('COMPLETED','CANCELLED','ABORTED') or new.record_version<>old.record_version+1 or new.original_recipe_id<>old.original_recipe_id or new.organization_id<>old.organization_id or new.client_id<>old.client_id or new.location_id<>old.location_id or new.started_by<>old.started_by or new.created_at<>old.created_at) then raise exception using errcode='23514',message='LIVE_SESSION_IMMUTABLE';end if;
 if new.payload->>'id'<>new.id::text or new.payload->>'clientId'<>new.client_id::text or new.payload->>'status'<>new.status or (new.payload->>'recordVersion')::bigint<>new.record_version or new.payload->>'controllerUserId'<>new.controller_user_id::text or new.payload->>'controllerDeviceId'<>new.controller_device_id::text then raise exception using errcode='23514',message='LIVE_RESULT_INVALID';end if;
 return new;end $$;
create trigger live_head_guard before insert or update or delete on public.live_sessions for each row execute function app_private.live_head_guard();
grant insert on public.audit_events to elifora_live_writer;
create policy live_audit on public.audit_events for insert to elifora_live_writer with check(actor_user_id=auth.uid() and action like 'live_session.%' and entity_type='live_sessions' and app_private.can_access_clients(organization_id,'live_session.view'));

create function public.live_session_clock() returns timestamptz language sql volatile security invoker set search_path='' as $$ select statement_timestamp(); $$;
revoke all on function public.live_session_clock() from public,anon,service_role;grant execute on function public.live_session_clock() to authenticated;
create function app_private.live_permission(t text) returns text language sql immutable security invoker set search_path='' as $$ select case when t='CREATE' then 'live_session.start' when t='USAGE' then 'live_session.usage' when t in ('CHECKPOINT_RECORD','CHECKPOINT_ADD') then 'live_session.checkpoint' when t in ('NOTE','PHOTO','RISK_EVENT') then 'live_session.contribute' when t='RECIPE_REVISION' then 'live_session.revise' when t in ('COMPLETE','COMPLETION_REVIEW') then 'live_session.complete' when t in ('CANCEL','ABORT') then 'live_session.cancel' else 'live_session.control' end; $$;
revoke all on function app_private.live_permission(text) from public,anon,service_role;grant execute on function app_private.live_permission(text) to authenticated;
create function public.live_session_transfer_allowed(p_user_id uuid,p_organization_id uuid,p_location_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.user_has_permission(p_organization_id,p_location_id,'live_session.control') and exists(select 1 from public.salon_memberships m join public.role_permissions rp on rp.role_code=m.role_code where m.organization_id=p_organization_id and m.user_id=p_user_id and m.status='active' and (m.location_id is null or m.location_id=p_location_id) and rp.permission_code='live_session.control'); $$;
revoke all on function public.live_session_transfer_allowed(uuid,uuid,uuid) from public,anon,service_role;grant execute on function public.live_session_transfer_allowed(uuid,uuid,uuid) to authenticated;
create function public.live_session_receipt(p_membership_id uuid,p_location_id uuid,p_mutation_id uuid,p_input jsonb,p_session_id uuid,p_correlation_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
 declare ctx jsonb;r public.live_session_versions%rowtype;begin
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,app_private.live_permission(coalesce(p_input->>'type','CREATE')));if ctx ? 'code' then return ctx;end if;
 select * into r from public.live_session_versions where organization_id=(ctx->>'organization_id')::uuid and actor_id=auth.uid() and mutation_id=p_mutation_id;
 if not found then return null;end if;
 if r.input is distinct from p_input or p_session_id is not null and r.session_id<>p_session_id then return app_private.client_error('LIVE_SESSION_CONFLICT',p_correlation_id);end if;return r.payload;end $$;
revoke all on function public.live_session_receipt(uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,service_role;grant execute on function public.live_session_receipt(uuid,uuid,uuid,jsonb,uuid,uuid) to authenticated;

create function app_private.store_live_session(p_membership uuid,p_location uuid,p_envelope text,p_signature text,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
 declare e jsonb;q jsonb;v jsonb;ctx jsonb;t text;org uuid;sid uuid;rv bigint;old public.live_sessions%rowtype;r public.live_session_versions%rowtype;x jsonb;rec public.controlled_brand_recipes%rowtype;packet jsonb;snapshot jsonb;history jsonb;regions jsonb;pl public.color_plans%rowtype;
 begin
 if auth.uid() is null then return app_private.client_error('UNAUTHENTICATED',p_correlation);end if;
 if octet_length(p_envelope)>1048576 or not coalesce(app_private.verify_color_signature(p_envelope,p_signature),false) then return app_private.client_error('COLOR_PLAN_SIGNATURE_INVALID',p_correlation);end if;
 e:=p_envelope::jsonb;q:=e->'input';v:=e->'result';t:=coalesce(q->>'type','CREATE');
 ctx:=app_private.hair_write_context(p_membership,p_location,app_private.live_permission(t));if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 if e->>'actorId' is distinct from auth.uid()::text or e->>'organizationId' is distinct from org::text or e->>'membershipId' is distinct from p_membership::text or e->>'locationId' is distinct from p_location::text or (e->>'expiresAt')::timestamptz<statement_timestamp() or (e->>'expiresAt')::timestamptz>statement_timestamp()+interval '5 minutes' or abs(extract(epoch from (v->>'updatedAt')::timestamptz-statement_timestamp()))>120 then return app_private.client_error('TENANT_CONTEXT_INVALID',p_correlation);end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,0));
 select * into r from public.live_session_versions where organization_id=org and actor_id=auth.uid() and mutation_id=(q->>'mutation_id')::uuid;
 if found then if r.input is distinct from q or e->>'sessionId' is not null and r.session_id::text<>e->>'sessionId' then return app_private.client_error('LIVE_SESSION_CONFLICT',p_correlation);end if;return r.payload;end if;
 sid:=(v->>'id')::uuid;rv:=(v->>'recordVersion')::bigint;
 if t<>'CREATE' then
 select * into old from public.live_sessions where id=(e->>'sessionId')::uuid and organization_id=org and location_id=p_location for update;
 if not found then return app_private.client_error('LIVE_SESSION_NOT_FOUND',p_correlation);end if;
 if old.content_hash is distinct from e->>'previousHash' or old.record_version<>(q->>'expected_version')::bigint or old.control_epoch<>(q->>'control_epoch')::bigint or rv<>old.record_version+1 or old.id<>sid then return app_private.client_error('LIVE_SESSION_CONFLICT',p_correlation);end if;
 if old.status in ('COMPLETED','CANCELLED','ABORTED') then return app_private.client_error('LIVE_SESSION_IMMUTABLE',p_correlation);end if;
 if t not in ('NOTE','PHOTO','CHECKPOINT_RECORD','RISK_EVENT','USAGE') and (old.controller_user_id<>auth.uid() or old.controller_device_id<>(q->>'device_id')::uuid) then return app_private.client_error('LIVE_CONTROLLER_CONFLICT',p_correlation);end if;
 if t='TRANSFER_CONTROL' and not public.live_session_transfer_allowed((q->>'user_id')::uuid,org,p_location) then return app_private.client_error('FORBIDDEN',p_correlation);end if;
 elsif rv<>1 or v->>'controllerUserId'<>auth.uid()::text or v->>'controllerDeviceId'<>q->>'device_id' or v->>'startedBy'<>auth.uid()::text or v->>'clientId'<>q->>'client_id' or v->>'currentRecipeId'<>q->>'recipe_id' or q->>'professional_review'<>'true' then return app_private.client_error('VALIDATION_FAILED',p_correlation);
 end if;
 if t in ('CREATE','START','RESUME','REASSESS','RECIPE_REVISION') then
 select * into rec from public.controlled_brand_recipes where id=(v->>'currentRecipeId')::uuid and organization_id=org and client_id=(v->>'clientId')::uuid;
 if not found or rec.location_id<>p_location or rec.created_at<statement_timestamp()-interval '24 hours' then return app_private.client_error('SESSION_START_BLOCKED_STALE_INPUT',p_correlation);end if;
 select * into pl from public.color_plans where id=rec.plan_id and organization_id=org and client_id=rec.client_id;
 if not found or pl.status<>'DRAFT' or pl.payload#>>'{safetyGate,canProgress}' is distinct from 'true' or exists(select 1 from public.color_target_versions newer join public.color_target_versions original on original.id=pl.target_version_id where newer.series_id=original.series_id and newer.version>original.version) then return app_private.client_error('SESSION_START_BLOCKED_STALE_INPUT',p_correlation);end if;
 perform pg_advisory_xact_lock(hashtextextended(rec.catalog_id::text,1));packet:=public.catalog_pilot_packet(rec.catalog_id);
 if packet#>>'{catalog,release,state}' is distinct from 'PUBLISHED' or packet#>>'{catalog,release,versionFingerprint}' is distinct from rec.payload#>>'{snapshots,catalogFingerprint}' or not exists(select 1 from public.catalog_products p,public.catalog_products d,public.catalog_compatibility_rules cr where p.id=rec.product_id and d.id=rec.developer_id and cr.id=rec.rule_id and p.active and d.active and p.verification_status='ELIFORA_VERIFIED' and d.verification_status='ELIFORA_VERIFIED' and p.version=(rec.payload#>>'{snapshots,productVersion}')::integer and d.version=(rec.payload#>>'{snapshots,developerVersion}')::integer and cr.version=(rec.payload#>>'{snapshots,ruleVersion}')::integer) then return app_private.client_error('SESSION_START_BLOCKED_STALE_INPUT',p_correlation);end if;
 snapshot:=public.hair_confidence_snapshot(p_membership,p_location,rec.client_id,false,p_correlation);
 if snapshot ? 'code' then return snapshot;end if;
 if encode(extensions.digest(convert_to((snapshot#>'{data,pages}')::text,'UTF8'),'sha256'),'hex') is distinct from v->>'sourceToken' or (snapshot#>>'{data,pages,0,passport,version}')::bigint<>pl.passport_version then return app_private.client_error('SESSION_START_BLOCKED_STALE_INPUT',p_correlation);end if;
 if not exists(select 1 from jsonb_array_elements(v->'recipes') item where item->>'id'=rec.id::text and item->'result'=rec.payload) then return app_private.client_error('LIVE_RESULT_INVALID',p_correlation);end if;
 end if;
 if t='COMPLETE' then
 if old.status<>'COMPLETION_REVIEW' or v->>'status'<>'COMPLETED' or jsonb_typeof(v->'outcome')<>'object' or not app_private.user_has_permission(org,p_location,'hair_passport.add_history') then return app_private.client_error('LIVE_COMPLETION_INCOMPLETE',p_correlation);end if;
 if exists(select 1 from jsonb_array_elements(v->'photos') p where not exists(select 1 from storage.objects o where o.bucket_id='live-technical' and o.name=p->>'path')) then return app_private.client_error('LIVE_PHOTO_MISSING',p_correlation);end if;
 select jsonb_agg(distinct value) into regions from jsonb_array_elements(v->'bowls') b,lateral jsonb_array_elements(b->'regionIds');
 history:=app_private.execute_hair_history(p_membership,p_location,(v->>'clientId')::uuid,jsonb_build_object('request_id',q->>'mutation_id','category','COLOR','performed_on',jsonb_build_object('state','EXACT','value',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD')),'product',jsonb_build_object('state','KNOWN','value','ELIFORA live session '||sid::text||'; recipe '||(v->>'currentRecipeId')),'description','Profesyonel doğrulanmış canlı renk seansı '||sid::text||'. Bölgesel sonuç, gerçek gram, süre, fotoğraf ve sapmalar değişmez seans sonuç kaydındadır.','region_ids',regions,'location_id',p_location,'evidence',jsonb_build_object('source','HISTORICAL','context','ELIFORA completed live session')),p_correlation);
 if history ? 'code' then return history;end if;
 end if;
 insert into public.live_sessions(id,organization_id,location_id,client_id,passport_id,original_recipe_id,current_recipe_id,color_case_link,appointment_link,status,record_version,controller_user_id,controller_device_id,control_epoch,started_by,created_at,updated_at,started_at,completed_at,content_hash,payload)
 values(sid,org,p_location,(v->>'clientId')::uuid,(v->>'passportId')::uuid,(v->>'originalRecipeId')::uuid,(v->>'currentRecipeId')::uuid,(v->>'colorCaseLink')::uuid,(v->>'appointmentLink')::uuid,v->>'status',rv,(v->>'controllerUserId')::uuid,(v->>'controllerDeviceId')::uuid,(v->>'controlEpoch')::bigint,(v->>'startedBy')::uuid,(v->>'createdAt')::timestamptz,(v->>'updatedAt')::timestamptz,(v->>'startedAt')::timestamptz,(v->>'completedAt')::timestamptz,e->>'resultHash',v)
 on conflict(id) do update set current_recipe_id=excluded.current_recipe_id,status=excluded.status,record_version=excluded.record_version,controller_user_id=excluded.controller_user_id,controller_device_id=excluded.controller_device_id,control_epoch=excluded.control_epoch,updated_at=excluded.updated_at,started_at=excluded.started_at,completed_at=excluded.completed_at,content_hash=excluded.content_hash,payload=excluded.payload;
 insert into public.live_session_versions(organization_id,session_id,record_version,mutation_id,actor_id,device_id,input,payload,correlation_id) values(org,sid,rv,(q->>'mutation_id')::uuid,auth.uid(),(q->>'device_id')::uuid,q,v,p_correlation);
 for x in select value from jsonb_array_elements(v->'steps') loop insert into public.live_session_steps values(org,sid,(x->>'id')::uuid,rv,(x->>'sequenceIndex')::integer,(x->>'regionId')::uuid,(x->>'bowlId')::uuid,x->>'status',x->>'instructionType',x->>'instructionText',(x->>'actualStart')::timestamptz,(x->>'actualFinish')::timestamptz);end loop;
 for x in select value from jsonb_array_elements(v->'bowls') loop insert into public.live_bowls values(org,sid,(x->>'id')::uuid,rv,(x->>'recipeId')::uuid,(x->>'plannedGrams')::numeric,(x->>'preparedGrams')::numeric,(x->>'usedGrams')::numeric,(x->>'wasteGrams')::numeric,(x->>'closed')::boolean);end loop;
 for x in select value from jsonb_array_elements(v->'timers') loop insert into public.live_timers values(org,sid,(x->>'id')::uuid,rv,(x->>'stepId')::uuid,(x->>'regionId')::uuid,x->>'label',(x->>'plannedDuration')::integer,(x->>'anchorAt')::timestamptz,(x->>'elapsedSeconds')::numeric,x->>'status');end loop;
 for x in select value from jsonb_array_elements(v->'checkpoints') loop insert into public.live_checkpoints values(org,sid,(x->>'id')::uuid,rv,(x->>'stepId')::uuid,(x->>'required')::boolean,x->>'result',(x->>'completedBy')::uuid,(x->>'completedAt')::timestamptz,x);end loop;
 for x in select value from jsonb_array_elements(v->'usage') loop insert into public.live_usage values(org,sid,(x->>'id')::uuid,(x->>'bowlId')::uuid,(x->>'recipeId')::uuid,(x->>'productId')::uuid,(x->>'productVersion')::integer,(x->>'preparedGrams')::numeric,(x->>'usedGrams')::numeric,(x->>'wasteGrams')::numeric,(x->>'recordedBy')::uuid,(x->>'recordedAt')::timestamptz) on conflict(id) do nothing;end loop;
 for x in select value from jsonb_array_elements(v->'deviations') loop insert into public.live_deviations values(org,sid,(x->>'id')::uuid,x->>'type',(x->>'changedBy')::uuid,(x->>'at')::timestamptz,x) on conflict(id) do nothing;end loop;
 for x in select value from jsonb_array_elements(v->'riskEvents') loop insert into public.live_risk_events values(org,sid,(x->>'id')::uuid,rv,x->>'type',x->>'action',(x->>'recordedBy')::uuid,x);end loop;
 for x in select value from jsonb_array_elements(v->'photos') loop insert into public.live_photos values(org,sid,(x->>'id')::uuid,x->>'kind',x->>'path',x->>'contentType',(x->>'uploadedBy')::uuid,(x->>'createdAt')::timestamptz) on conflict(id) do nothing;end loop;
 if t='COMPLETE' then insert into public.session_outcomes values(org,sid,(v->>'clientId')::uuid,(v->>'passportId')::uuid,(v->>'originalRecipeId')::uuid,(v->>'currentRecipeId')::uuid,(history#>>'{data,history,id}')::uuid,auth.uid(),(v->>'completedAt')::timestamptz,(v->>'actualProcessSeconds')::numeric,jsonb_build_object('outcome',v->'outcome','recipes',v->'recipes','usage',v->'usage','timers',v->'timers','photos',v->'photos','deviations',v->'deviations','comparisonSource','PROFESSIONAL_VERIFIED'));end if;
 insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,metadata,correlation_id) values(auth.uid(),org,'live_session.'||lower(t),'live_sessions',sid,jsonb_build_object('record_version',rv,'mutation_id',q->>'mutation_id','device_id',q->>'device_id'),p_correlation);
 return v;
 exception when unique_violation then return app_private.client_error('LIVE_SESSION_CONFLICT',p_correlation);
 when invalid_text_representation or not_null_violation or check_violation or numeric_value_out_of_range or datetime_field_overflow then return app_private.client_error('VALIDATION_FAILED',p_correlation);
 end $$;
grant create on schema app_private to elifora_live_writer;
alter function app_private.store_live_session(uuid,uuid,text,text,uuid) owner to elifora_live_writer;
revoke create on schema app_private from elifora_live_writer;
revoke all on function app_private.store_live_session(uuid,uuid,text,text,uuid) from public,anon,service_role;grant execute on function app_private.store_live_session(uuid,uuid,text,text,uuid) to authenticated;
create function public.live_session_store(p_membership_id uuid,p_location_id uuid,p_envelope text,p_signature text,p_correlation_id uuid) returns jsonb language sql volatile security invoker set search_path='' set row_security='on' as $$ select app_private.store_live_session(p_membership_id,p_location_id,p_envelope,p_signature,p_correlation_id); $$;
revoke all on function public.live_session_store(uuid,uuid,text,text,uuid) from public,anon,service_role;grant execute on function public.live_session_store(uuid,uuid,text,text,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('live-technical','live-technical',false,10485760,array['image/png','image/jpeg','image/webp']);
create policy live_photo_read on storage.objects for select to authenticated using(bucket_id='live-technical' and exists(select 1 from public.live_photos p where p.object_path=name));
create policy live_photo_upload on storage.objects for insert to authenticated with check(bucket_id='live-technical' and exists(select 1 from public.live_photos p join public.live_sessions s on s.id=p.session_id where p.object_path=name and p.uploaded_by=auth.uid() and s.status not in ('COMPLETED','CANCELLED','ABORTED') and app_private.user_has_permission(s.organization_id,s.location_id,'live_session.contribute')));
grant select on storage.objects to elifora_live_writer;
create function app_private.audit_live_photo() returns trigger language plpgsql security definer set search_path='' as $$ declare p public.live_photos%rowtype;begin if new.bucket_id='live-technical' then select * into p from public.live_photos where object_path=new.name;insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,metadata,correlation_id) values(auth.uid(),p.organization_id,'live_session.photo_uploaded','live_sessions',p.session_id,jsonb_build_object('photo_id',p.id),gen_random_uuid());end if;return new;end $$;
revoke all on function app_private.audit_live_photo() from public,anon,authenticated,service_role;
create trigger audit_live_photo after insert on storage.objects for each row execute function app_private.audit_live_photo();
