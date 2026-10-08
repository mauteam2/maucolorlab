begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/gate-1-live.inc
-- Minimal boundary fixture: give the already signed synthetic session a bowl.
update public.live_sessions set record_version=record_version+1,payload=jsonb_set(jsonb_set(payload,'{recordVersion}',to_jsonb(record_version+1)),'{bowls}',jsonb_build_array(jsonb_build_object('id','b4000000-0000-4000-8000-000000000901','recipeId',current_recipe_id,'regionIds',jsonb_build_array('b4000000-0000-4000-8000-000000000051'),'plannedGrams',60,'preparedGrams',null,'usedGrams',null,'wasteGrams',null,'closed',false))) where id='b4000000-0000-4000-8000-000000000803';
create function pg_temp.command(t text,extra jsonb default '{}') returns jsonb language sql volatile security definer set search_path='' as $$
select pg_temp.live_store(jsonb_build_object('organizationId',s.organization_id,'actorId',auth.uid(),'membershipId','b4000000-0000-4000-8000-000000000111','locationId',s.location_id,'sessionId',s.id,'previousHash',s.content_hash,'resultHash',repeat('f',64),'expiresAt',statement_timestamp()+interval '2 minutes','input',jsonb_build_object('type',t,'mutation_id',gen_random_uuid(),'device_id',s.controller_device_id,'expected_version',s.record_version,'control_epoch',s.control_epoch)||extra,'result',s.payload||jsonb_build_object('status','ABORTED','recordVersion',s.record_version+1,'updatedAt',statement_timestamp()))) from public.live_sessions s where id='b4000000-0000-4000-8000-000000000803';$$;
set local role authenticated;
select is(pg_temp.command('ABORT','{"reason":"Stop immediately"}')->>'status','ABORTED','STOP remains terminal');
reset role;
create function pg_temp.reconcile(p numeric,u numeric,w numeric,previous uuid default null,mid uuid default gen_random_uuid(),other jsonb default '{}') returns jsonb language sql volatile security definer set search_path='' as $$
select pg_temp.live_store(jsonb_build_object('organizationId',s.organization_id,'actorId',auth.uid(),'membershipId','b4000000-0000-4000-8000-000000000111','locationId',s.location_id,'sessionId',s.id,'previousHash',s.content_hash,'resultHash',repeat('f',64),'expiresAt',statement_timestamp()+interval '2 minutes','input',jsonb_build_object('type','MATERIAL_RECONCILE','mutation_id',mid,'device_id',gen_random_uuid(),'expected_version',s.record_version,'control_epoch',s.control_epoch,'bowl_id','b4000000-0000-4000-8000-000000000901','supersedes_id',previous,'prepared_grams',p,'used_grams',u,'waste_grams',w,'reason','Late factual measurement'),'result',s.payload||jsonb_build_object('recordVersion',s.record_version+1,'updatedAt',statement_timestamp(),'materialReconciliations',coalesce(s.payload->'materialReconciliations','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'mutationId',mid,'bowlId','b4000000-0000-4000-8000-000000000901','recipeId',s.current_recipe_id,'supersedesId',previous,'preparedGrams',p,'usedGrams',u,'wasteGrams',w,'reason','Late factual measurement','recordedBy',auth.uid(),'recordedAt',statement_timestamp())))||other)) from public.live_sessions s where id='b4000000-0000-4000-8000-000000000803';$$;
set local role authenticated;
select is(pg_temp.reconcile(null,0,null)->>'status','ABORTED','late factual accounting cannot restart execution');
select is((select prepared_grams from public.live_material_reconciliations),null::numeric,'UNKNOWN remains null');
select is((select used_grams from public.live_material_reconciliations),0::numeric,'measured zero is different from UNKNOWN');
select is((select count(*) from public.audit_events where action='live_session.material_reconcile'),1::bigint,'successful reconciliation creates one audit event');
select is((select count(*) from public.live_usage),0::bigint,'original usage remains unchanged');
select is(pg_temp.reconcile(60,20,40)->>'code','LIVE_SESSION_CONFLICT','correction must name current event');
select is(pg_temp.reconcile(60,20,40,(select id from public.live_material_reconciliations))->>'status','ABORTED','correction appends under expected prior-event control');
select is((select count(*) from public.live_material_reconciliations),2::bigint,'correction retains both events');
select is((select count(*) from public.audit_events where action='live_session.material_reconcile'),2::bigint,'only successful accounting appends create audit events');
select is((select count(*) from public.live_material_reconciliations where prepared_grams is null),1::bigint,'older UNKNOWN event was not overwritten');
select is(pg_temp.reconcile(60,20,40,(select id from public.live_material_reconciliations where supersedes_id is not null),gen_random_uuid(),'{"status":"IN_PROGRESS"}')->>'code','LIVE_RESULT_INVALID','signed reconciliation cannot mutate technical execution');
select is(pg_temp.command('STEP_START','{"step_id":"b4000000-0000-4000-8000-000000000902"}')->>'code','LIVE_SESSION_IMMUTABLE','no application after STOP');
select throws_ok($$insert into public.live_material_reconciliations select * from public.live_material_reconciliations limit 1$$,'42501',null,'normal role cannot bypass signed accounting command');
select throws_ok($$update public.live_material_reconciliations set reason='rewrite'$$,'42501',null,'normal role cannot update accounting history');
select throws_ok($$delete from public.live_material_reconciliations$$,'42501',null,'normal role cannot delete accounting history');
select set_config('request.jwt.claim.sub','b4000000-0000-4000-8000-000000000022',true);
select is((select count(*) from public.live_material_reconciliations),0::bigint,'cross-organization reconciliation read denied');
reset role;
select throws_ok($$update public.live_material_reconciliations set reason='privileged rewrite'$$,'23514','IMMUTABLE_LIVE_HISTORY','append-only trigger protects even privileged accidental update');
insert into public.locations(id,organization_id,name,timezone) values('b4000000-0000-4000-8000-000000000019','b4000000-0000-4000-8000-000000000001','Synthetic other branch','Europe/Istanbul');
update public.salon_memberships set location_id='b4000000-0000-4000-8000-000000000019' where id='b4000000-0000-4000-8000-000000000114';
select set_config('request.jwt.claim.sub','b4000000-0000-4000-8000-000000000024',true);set local role authenticated;
select is((select count(*) from public.live_material_reconciliations),0::bigint,'same organization other-location member cannot read events');reset role;
update public.salon_memberships set status='revoked',revoked_at=now() where id='b4000000-0000-4000-8000-000000000111';
select set_config('request.jwt.claim.sub','b4000000-0000-4000-8000-000000000021',true);set local role authenticated;
select is((select count(*) from public.live_material_reconciliations),0::bigint,'revoked membership cannot read events');
select is(pg_temp.reconcile(null,null,null)->>'code','MEMBERSHIP_REVOKED','revoked membership cannot append events');
reset role;set local role anon;
select throws_ok($$select * from public.live_material_reconciliations$$,'42501',null,'anonymous reconciliation read denied');
reset role;
select * from finish();rollback;
