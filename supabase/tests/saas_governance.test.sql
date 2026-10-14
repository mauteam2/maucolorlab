begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/costing-salon.inc
create function pg_temp.saas() returns jsonb language sql volatile as $$
 select public.saas_snapshot('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011');
$$;
create function pg_temp.change_saas(state text,plan uuid default 'f7000000-0000-4000-8000-000000000002') returns jsonb language sql volatile as $$
 select app_private.saas_control('b4000000-0000-4000-8000-000000000001',jsonb_build_object('type','SUBSCRIPTION','expected_version',
  (select version from app_private.saas_accounts where organization_id='b4000000-0000-4000-8000-000000000001'),'plan_version_id',plan,'status',state),
  'TEST_OPERATOR','Explicit synthetic subscription state',gen_random_uuid());
$$;
reset role;
select is((select count(*) from app_private.saas_accounts where organization_id='b4000000-0000-4000-8000-000000000001'),1::bigint,'one account per original organization');
set local role authenticated;
select is(pg_temp.saas()#>>'{data,status}','ACTIVE','configured neutral fixture active');
select is(pg_temp.saas()#>>'{data,management_allowed}','false','location owner does not acquire organization billing governance');
select is(pg_temp.saas()#>>'{data,plan}',null::text,'plan governance hidden from location-only owner');
select throws_ok($$select app_private.saas_control('b4000000-0000-4000-8000-000000000001','{}','client','forged',gen_random_uuid())$$,'42501',null,'normal member cannot invoke platform control');
select throws_ok($$select * from app_private.saas_usage_events$$,'42501',null,'durable usage private to normal roles');
select throws_ok($$update app_private.saas_accounts set status='ACTIVE'$$,'42501',null,'Data API role cannot forge subscription status');
select is(public.saas_snapshot('b4000000-0000-4000-8000-000000000112','b4000000-0000-4000-8000-000000000012')->>'code','TENANT_CONTEXT_INVALID','cross-organization subscription denied with the existing context contract');
reset role;
update public.salon_memberships set location_id=null where id='b4000000-0000-4000-8000-000000000111';
set local role authenticated;
select is(pg_temp.saas()#>>'{data,management_allowed}','true','current organization-wide owner can inspect governance');
select is(pg_temp.saas()#>>'{data,plan,code}','PLAN_A','configured label is not an invented commercial tier');
select is((select count(*) from jsonb_array_elements(pg_temp.saas()#>'{data,entitlements}') e where e->>'creation_allowed'='true'),10::bigint,'active subscription enables configured capabilities');
select is(public.saas_operation('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011','{"type":"SUBSCRIPTION","status":"ACTIVE"}',gen_random_uuid())->>'code','VALIDATION_FAILED','tenant cannot submit authoritative subscription fields');
select ok(public.saas_operation('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011','{"type":"REQUEST_CHANGE","request_id":"f7000000-0000-4000-8000-000000000501","reason":"Request review of configured capabilities"}',gen_random_uuid()) ? 'data','neutral change request stores intent, not payment');
select ok(public.saas_operation('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011','{"type":"REQUEST_CHANGE","request_id":"f7000000-0000-4000-8000-000000000501","reason":"Request review of configured capabilities"}',gen_random_uuid()) ? 'data','same change request idempotent');
reset role;
select is((select count(*) from app_private.saas_change_requests),1::bigint,'request replay creates one immutable intent');
select ok(pg_temp.change_saas('SUSPENDED') ? 'data','actual platform suspension');
set local role authenticated;
select is(pg_temp.saas()#>>'{data,status}','SUSPENDED','fresh authoritative state replaces prior active view');
select is((select count(*) from jsonb_array_elements(pg_temp.saas()#>'{data,entitlements}') e where e->>'creation_allowed'='true'),0::bigint,'suspension disables new capabilities');
select ok(public.reporting_snapshot('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011','{}') ? 'data','historical reporting remains permitted after suspension');
select ok((select count(*) from public.color_plans)>0,'historical plans remain readable');
reset role;
select throws_ok($$select app_private.saas_require('b4000000-0000-4000-8000-000000000001','STOCK')$$,'P0001','SUBSCRIPTION_RESTRICTED','new premium work is blocked');
select ok(pg_temp.change_saas('ACTIVE') ? 'data','reactivation appends new state');
select is((select count(*) from app_private.saas_subscriptions where organization_id='b4000000-0000-4000-8000-000000000001'),3::bigint,'immutable subscription history includes bootstrap, suspension and reactivation');
select throws_ok($$update app_private.saas_subscriptions set status='ACTIVE'$$,'23514','IMMUTABLE_LIVE_HISTORY','commercial history cannot be overwritten');
select ok(app_private.saas_control('b4000000-0000-4000-8000-000000000001','{"type":"REBUILD_USAGE"}','TEST_OPERATOR','Rebuild golden source usage',gen_random_uuid()) ? 'data','usage counter rebuild uses durable events');
select is((select coalesce(sum(quantity),0) from app_private.saas_usage_counters where organization_id='b4000000-0000-4000-8000-000000000001' and category='ENGINE_EXECUTIONS'),
 (select coalesce(sum(quantity),0) from app_private.saas_usage_events where organization_id='b4000000-0000-4000-8000-000000000001' and category='ENGINE_EXECUTIONS'),'counter equals permanent successful source events');
select ok(not has_function_privilege('authenticated','app_private.saas_provider_event(text,text,text,text,jsonb,uuid)','execute'),'unsigned browser provider event cannot change subscription');
select * from finish();
rollback;
