-- New events only. Historical versions/usage/outcomes and legacy references
-- remain unchanged. Null quantities are UNKNOWN; zero is a measured value.
alter table public.live_session_steps drop constraint live_session_steps_status_check;
alter table public.live_session_steps add constraint live_session_steps_status_check check(status in ('PENDING','IN_PROGRESS','COMPLETED','SUPERSEDED'));
create table public.live_material_reconciliations(
 id uuid primary key,organization_id uuid not null,location_id uuid not null,session_id uuid not null,client_id uuid not null,bowl_id uuid not null,recipe_id uuid not null,mutation_id uuid not null,
 supersedes_id uuid unique,prepared_grams numeric(8,2),used_grams numeric(8,2),waste_grams numeric(8,2),reason text not null check(char_length(trim(reason)) between 1 and 2000),
 recorded_by uuid not null references public.profiles(user_id),recorded_at timestamptz not null,correlation_id uuid not null,
 unique(organization_id,recorded_by,mutation_id),unique(organization_id,session_id,bowl_id,id),
 foreign key(organization_id,location_id) references public.locations(organization_id,id),
 foreign key(organization_id,session_id) references public.live_sessions(organization_id,id),
 foreign key(organization_id,session_id,bowl_id,supersedes_id) references public.live_material_reconciliations(organization_id,session_id,bowl_id,id),
 foreign key(organization_id,client_id,recipe_id) references public.controlled_brand_recipes(organization_id,client_id,id),
 check(prepared_grams is null or prepared_grams between 0 and 2000 and mod(prepared_grams*100,2)=0),
 check(used_grams is null or used_grams between 0 and 2000 and mod(used_grams*100,2)=0),
 check(waste_grams is null or waste_grams between 0 and 2000 and mod(waste_grams*100,2)=0),
 check(prepared_grams is null or used_grams is null or used_grams<=prepared_grams),
 check(prepared_grams is null or waste_grams is null or waste_grams<=prepared_grams),
 check(prepared_grams is null or used_grams is null or waste_grams is null or prepared_grams=used_grams+waste_grams)
);
create index live_material_parent on public.live_material_reconciliations(organization_id,location_id,session_id,bowl_id);
alter table public.live_material_reconciliations enable row level security;
revoke all on public.live_material_reconciliations from public,anon,authenticated,service_role;
grant select on public.live_material_reconciliations to authenticated;
grant select,insert on public.live_material_reconciliations to elifora_live_writer;
create policy material_read on public.live_material_reconciliations for select to authenticated using(app_private.user_has_permission(organization_id,location_id,'live_session.view'));
create policy material_insert on public.live_material_reconciliations for insert to elifora_live_writer with check(recorded_by=auth.uid() and app_private.user_has_permission(organization_id,location_id,'live_session.usage'));
create trigger material_immutable before update or delete on public.live_material_reconciliations for each row execute function app_private.live_immutable();

do $$declare d text;n text;begin
 d:=pg_get_functiondef('app_private.live_permission(text)'::regprocedure);
 n:='when t=''USAGE'' then';
 if position(n in d)=0 then raise exception 'live permission definition mismatch';end if;
 execute replace(d,n,'when t in (''USAGE'',''MATERIAL_RECONCILE'') then');
end $$;
-- Respect the existing column grants: signature material is not a live-session read dependency.
-- Correct qualified projection and enforce critical transitions in depth.
create or replace function app_private.store_live_session(p_membership uuid,p_location uuid,p_envelope text,p_signature text,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
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
 if old.status in ('COMPLETED','CANCELLED','ABORTED') and t<>'MATERIAL_RECONCILE' then return app_private.client_error('LIVE_SESSION_IMMUTABLE',p_correlation);end if;
 if v->>'clientId'<>old.client_id::text or v->>'locationId'<>old.location_id::text or v->>'passportId'<>old.passport_id::text or t='READY' and (old.status<>'PREPARING' or v->>'status'<>'READY') or t='START' and (old.status<>'READY' or v->>'status'<>'IN_PROGRESS') or t in ('USAGE','CHECKPOINT_RECORD') and old.status not in ('IN_PROGRESS','PAUSED','CHECKPOINT_REQUIRED') then return app_private.client_error('LIVE_SESSION_TRANSITION_INVALID',p_correlation);end if;
 if t not in ('NOTE','PHOTO','CHECKPOINT_RECORD','RISK_EVENT','USAGE','MATERIAL_RECONCILE') and (old.controller_user_id<>auth.uid() or old.controller_device_id<>(q->>'device_id')::uuid) then return app_private.client_error('LIVE_CONTROLLER_CONFLICT',p_correlation);end if;
 if t='TRANSFER_CONTROL' and not public.live_session_transfer_allowed((q->>'user_id')::uuid,org,p_location) then return app_private.client_error('FORBIDDEN',p_correlation);end if;
 elsif rv<>1 or v->>'controllerUserId'<>auth.uid()::text or v->>'controllerDeviceId'<>q->>'device_id' or v->>'startedBy'<>auth.uid()::text or v->>'clientId'<>q->>'client_id' or v->>'currentRecipeId'<>q->>'recipe_id' or q->>'professional_review'<>'true' then return app_private.client_error('VALIDATION_FAILED',p_correlation);
 end if;
 if t in ('CREATE','START','STEP_START','RESUME','REASSESS','RECIPE_REVISION') then
 select * into rec from public.controlled_brand_recipes where id=(v->>'currentRecipeId')::uuid and organization_id=org and client_id=(v->>'clientId')::uuid;
 if not found or rec.location_id<>p_location or rec.created_at<statement_timestamp()-interval '24 hours' then return app_private.client_error('SESSION_START_BLOCKED_STALE_INPUT',p_correlation);end if;
 select id,organization_id,client_id,status,passport_version,target_version_id,payload into pl.id,pl.organization_id,pl.client_id,pl.status,pl.passport_version,pl.target_version_id,pl.payload from public.color_plans where id=rec.plan_id and organization_id=org and client_id=rec.client_id;
 if not found or pl.status<>'DRAFT' or pl.payload#>>'{safetyGate,canProgress}' is distinct from 'true' or exists(select 1 from public.color_target_versions newer join public.color_target_versions original on original.id=pl.target_version_id where newer.series_id=original.series_id and newer.version>original.version) then return app_private.client_error('SESSION_START_BLOCKED_STALE_INPUT',p_correlation);end if;
 perform app_private.lock_brand_catalog(rec.catalog_id);packet:=public.catalog_pilot_packet(rec.catalog_id);
 if packet#>>'{catalog,release,state}' is distinct from 'PUBLISHED' or packet#>>'{catalog,release,versionFingerprint}' is distinct from rec.payload#>>'{snapshots,catalogFingerprint}' or not exists(select 1 from public.catalog_products p,public.catalog_products d,public.catalog_compatibility_rules cr where p.id=rec.product_id and d.id=rec.developer_id and cr.id=rec.rule_id and p.active and d.active and p.verification_status='ELIFORA_VERIFIED' and d.verification_status='ELIFORA_VERIFIED' and p.version=(rec.payload#>>'{snapshots,productVersion}')::integer and d.version=(rec.payload#>>'{snapshots,developerVersion}')::integer and cr.version=(rec.payload#>>'{snapshots,ruleVersion}')::integer) then return app_private.client_error('SESSION_START_BLOCKED_STALE_INPUT',p_correlation);end if;
 snapshot:=public.hair_confidence_snapshot(p_membership,p_location,rec.client_id,false,p_correlation);
 if snapshot ? 'code' then return snapshot;end if;
 if encode(extensions.digest(convert_to((snapshot#>'{data,pages}')::text,'UTF8'),'sha256'),'hex') is distinct from v->>'sourceToken' or (snapshot#>>'{data,pages,0,passport,version}')::bigint<>pl.passport_version then return app_private.client_error('SESSION_START_BLOCKED_STALE_INPUT',p_correlation);end if;
 if not exists(select 1 from jsonb_array_elements(v->'recipes') item where item->>'id'=rec.id::text and item->'result'=rec.payload) then return app_private.client_error('LIVE_RESULT_INVALID',p_correlation);end if;
 end if;
 if t='CREATE' and (q->>'appointment_link' is not null or v->>'appointmentLink' is not null) then return app_private.client_error('VALIDATION_FAILED',p_correlation);end if;
 if t='STEP_START' and not exists(select 1 from jsonb_array_elements(old.payload->'steps') st join lateral jsonb_array_elements(old.payload->'bowls') b on b->>'id'=st->>'bowlId' where st->>'id'=q->>'step_id' and st->>'status'='PENDING' and b->>'recipeId'=v->>'currentRecipeId' and b->>'closed'='false') then return app_private.client_error('SESSION_START_BLOCKED_STALE_INPUT',p_correlation);end if;
 if t='MATERIAL_RECONCILE' then
 if old.status not in ('COMPLETED','CANCELLED','ABORTED') or
 (v-'materialReconciliations'-'recordVersion'-'updatedAt') is distinct from (old.payload-'materialReconciliations'-'recordVersion'-'updatedAt') or
 jsonb_typeof(v->'materialReconciliations') is distinct from 'array' or jsonb_array_length(v->'materialReconciliations')<>jsonb_array_length(coalesce(old.payload->'materialReconciliations','[]'))+1 or
 (v->'materialReconciliations'-(jsonb_array_length(v->'materialReconciliations')-1)) is distinct from coalesce(old.payload->'materialReconciliations','[]')
 then return app_private.client_error('LIVE_RESULT_INVALID',p_correlation);end if;
 x:=v->'materialReconciliations'->-1;
 if x->>'recordedBy' is distinct from auth.uid()::text or x->>'mutationId' is distinct from q->>'mutation_id' or x->>'bowlId' is distinct from q->>'bowl_id' or x->>'supersedesId' is distinct from q->>'supersedes_id' or x->>'reason' is distinct from q->>'reason' or x->'preparedGrams' is distinct from q->'prepared_grams' or x->'usedGrams' is distinct from q->'used_grams' or x->'wasteGrams' is distinct from q->'waste_grams' or not exists(select 1 from jsonb_array_elements(old.payload->'bowls') b where b->>'id'=x->>'bowlId' and b->>'recipeId'=x->>'recipeId') then return app_private.client_error('LIVE_RESULT_INVALID',p_correlation);end if;
 if x->>'supersedesId' is distinct from (select z->>'id' from jsonb_array_elements(coalesce(old.payload->'materialReconciliations','[]')) with ordinality a(z,n) where z->>'bowlId'=x->>'bowlId' order by n desc limit 1) then return app_private.client_error('LIVE_SESSION_CONFLICT',p_correlation);end if;
 end if;
 if t='COMPLETE' then
 if old.status<>'COMPLETION_REVIEW' or v->>'status'<>'COMPLETED' or jsonb_typeof(v->'outcome')<>'object' or not app_private.user_has_permission(org,p_location,'hair_passport.add_history') then return app_private.client_error('LIVE_COMPLETION_INCOMPLETE',p_correlation);end if;
 if exists(select 1 from jsonb_array_elements(v->'photos') p where not exists(select 1 from storage.objects o where o.bucket_id='live-technical' and o.name=p->>'path')) then return app_private.client_error('LIVE_PHOTO_MISSING',p_correlation);end if;
 select jsonb_agg(distinct region.value) into regions from jsonb_array_elements(v->'bowls') b,lateral jsonb_array_elements(b->'regionIds') region;
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
 if t='MATERIAL_RECONCILE' then
 x:=v->'materialReconciliations'->-1;
 insert into public.live_material_reconciliations(id,organization_id,location_id,session_id,client_id,bowl_id,recipe_id,mutation_id,supersedes_id,prepared_grams,used_grams,waste_grams,reason,recorded_by,recorded_at,correlation_id)
 values((x->>'id')::uuid,org,p_location,sid,(v->>'clientId')::uuid,(x->>'bowlId')::uuid,(x->>'recipeId')::uuid,(q->>'mutation_id')::uuid,(x->>'supersedesId')::uuid,(x->>'preparedGrams')::numeric,(x->>'usedGrams')::numeric,(x->>'wasteGrams')::numeric,x->>'reason',auth.uid(),(x->>'recordedAt')::timestamptz,p_correlation);
 end if;
 insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,metadata,correlation_id) values(auth.uid(),org,'live_session.'||lower(t),'live_sessions',sid,jsonb_build_object('record_version',rv,'mutation_id',q->>'mutation_id','device_id',q->>'device_id'),p_correlation);
 return v;
 exception when unique_violation then return app_private.client_error('LIVE_SESSION_CONFLICT',p_correlation);
 when invalid_text_representation or not_null_violation or check_violation or numeric_value_out_of_range or datetime_field_overflow then return app_private.client_error('VALIDATION_FAILED',p_correlation);
 end $$;
