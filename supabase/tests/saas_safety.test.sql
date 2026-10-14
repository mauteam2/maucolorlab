begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/gate-1-live.inc
-- Minimal boundary fixture: give the already signed synthetic session a bowl.
update public.live_sessions set record_version=record_version+1,payload=jsonb_set(jsonb_set(payload,'{recordVersion}',to_jsonb(record_version+1)),'{bowls}',jsonb_build_array(jsonb_build_object('id','b4000000-0000-4000-8000-000000000901','recipeId',current_recipe_id,'regionIds',jsonb_build_array('b4000000-0000-4000-8000-000000000051'),'plannedGrams',60,'preparedGrams',null,'usedGrams',null,'wasteGrams',null,'closed',false))) where id='b4000000-0000-4000-8000-000000000803';
create function pg_temp.command(t text,extra jsonb default '{}') returns jsonb language sql volatile security definer set search_path='' as $$
select pg_temp.live_store(jsonb_build_object('organizationId',s.organization_id,'actorId',auth.uid(),'membershipId','b4000000-0000-4000-8000-000000000111','locationId',s.location_id,'sessionId',s.id,'previousHash',s.content_hash,'resultHash',repeat('f',64),'expiresAt',statement_timestamp()+interval '2 minutes','input',jsonb_build_object('type',t,'mutation_id',gen_random_uuid(),'device_id',s.controller_device_id,'expected_version',s.record_version,'control_epoch',s.control_epoch)||extra,'result',s.payload||jsonb_build_object('status','ABORTED','recordVersion',s.record_version+1,'updatedAt',statement_timestamp()))) from public.live_sessions s where id='b4000000-0000-4000-8000-000000000803';$$;
create function pg_temp.reconcile(p numeric,u numeric,w numeric,previous uuid default null,mid uuid default gen_random_uuid(),other jsonb default '{}') returns jsonb language sql volatile security definer set search_path='' as $$
select pg_temp.live_store(jsonb_build_object('organizationId',s.organization_id,'actorId',auth.uid(),'membershipId','b4000000-0000-4000-8000-000000000111','locationId',s.location_id,'sessionId',s.id,'previousHash',s.content_hash,'resultHash',repeat('f',64),'expiresAt',statement_timestamp()+interval '2 minutes','input',jsonb_build_object('type','MATERIAL_RECONCILE','mutation_id',mid,'device_id',gen_random_uuid(),'expected_version',s.record_version,'control_epoch',s.control_epoch,'bowl_id','b4000000-0000-4000-8000-000000000901','supersedes_id',previous,'prepared_grams',p,'used_grams',u,'waste_grams',w,'reason','Late factual measurement'),'result',s.payload||jsonb_build_object('recordVersion',s.record_version+1,'updatedAt',statement_timestamp(),'materialReconciliations',coalesce(s.payload->'materialReconciliations','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'mutationId',mid,'bowlId','b4000000-0000-4000-8000-000000000901','recipeId',s.current_recipe_id,'supersedesId',previous,'preparedGrams',p,'usedGrams',u,'wasteGrams',w,'reason','Late factual measurement','recordedBy',auth.uid(),'recordedAt',statement_timestamp())))||other)) from public.live_sessions s where id='b4000000-0000-4000-8000-000000000803';$$;

select app_private.saas_control('b4000000-0000-4000-8000-000000000001',jsonb_build_object('type','SUBSCRIPTION','expected_version',(select version from app_private.saas_accounts where organization_id='b4000000-0000-4000-8000-000000000001'),'plan_version_id','f7000000-0000-4000-8000-000000000002','status','SUSPENDED'),'TEST_OPERATOR','Suspend while technical session exists',gen_random_uuid());
set local role authenticated;
select is(pg_temp.command('ABORT','{"reason":"Safety stop during suspension"}')->>'status','ABORTED','subscription suspension cannot block actual signed safety stop');
select is(pg_temp.reconcile(null,0,null)->>'status','ABORTED','post-stop reconciliation remains permitted under suspension');
select is((select prepared_grams from public.live_material_reconciliations),null::numeric,'suspended reconciliation retains UNKNOWN');
select is((select used_grams from public.live_material_reconciliations),0::numeric,'suspended reconciliation retains measured zero');
select is((select count(*) from public.live_session_versions),3::bigint,'original and stopped technical versions remain immutable');
select is((select count(*) from public.live_usage),0::bigint,'reconciliation does not fabricate historical live usage');
reset role;
select is((select count(*) from public.audit_events where action='live_session.material_reconcile'),1::bigint,'suspended safety reconciliation is audited');
select throws_ok($$update public.live_material_reconciliations set used_grams=1$$,'23514','IMMUTABLE_LIVE_HISTORY','suspension does not weaken append-only facts');
select * from finish();rollback;
