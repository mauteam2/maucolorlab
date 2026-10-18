-- Logical recovery drill on a freshly migrated disposable DB. Restored fixture
-- source facts are authoritative; derived report rows may be discarded/rebuilt.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/phase-9-salon.inc
set local role authenticated;
insert into salon_results values('rebuild-before',public.reporting_operation('a4000000-0000-4000-8000-000000000111','a4000000-0000-4000-8000-000000000011','{"type":"REBUILD"}',gen_random_uuid()));
select ok((select value ? 'data' from salon_results where name='rebuild-before'),'restored source fixture rebuild accepted');
reset role;
create temporary table expected_report as select domain,source_id,at,(to_jsonb(f)-'refreshed_at') #- '{details,computed_at}' as fact from app_private.report_facts f;
create temporary table expected_sources as select to_jsonb(a) as source_row from public.salon_appointments a;
select ok((select count(*) from expected_report)>0,'actual source-derived report facts exist');
delete from app_private.report_facts;
select is((select count(*) from app_private.report_facts),0::bigint,'derived projection loss simulated');
set local role authenticated;
insert into salon_results values('rebuild-after',public.reporting_operation('a4000000-0000-4000-8000-000000000111','a4000000-0000-4000-8000-000000000011','{"type":"REBUILD"}',gen_random_uuid()));
reset role;
select is((select count(*) from ((select domain,source_id,at,(to_jsonb(f)-'refreshed_at') #- '{details,computed_at}' as fact from app_private.report_facts f except select * from expected_report) union all (select * from expected_report except select domain,source_id,at,(to_jsonb(f)-'refreshed_at') #- '{details,computed_at}' as fact from app_private.report_facts f)) differences),0::bigint,'derived facts deterministically recovered from restored authoritative source');
select is((select jsonb_agg(to_jsonb(a) order by id) from public.salon_appointments a),(select jsonb_agg(source_row order by source_row->>'id') from expected_sources),'immutable operational source history unchanged during recovery');
select ok((select count(*) from public.audit_events where action like 'report%')>=2,'rebuild security actions audited');
-- Restore a real technical source fixture through its existing signed stores;
-- its source gates append genuine durable usage events, not fabricated counters.
\ir fixtures/gate-1-live.inc
create temporary table restored_usage_events as select to_jsonb(e) source_row from app_private.saas_usage_events e where organization_id='b4000000-0000-4000-8000-000000000001';
select ok((select count(*) from restored_usage_events)>0,'restored technical source fixture has actual metered events');
delete from app_private.saas_usage_counters where organization_id='b4000000-0000-4000-8000-000000000001';
insert into app_private.saas_usage_counters(organization_id,period_id,category,quantity)
select organization_id,period_id,category,sum(quantity) from app_private.saas_usage_events where organization_id='b4000000-0000-4000-8000-000000000001' group by organization_id,period_id,category;
select is((select sum(quantity) from app_private.saas_usage_counters where organization_id='b4000000-0000-4000-8000-000000000001'),(select sum(quantity) from app_private.saas_usage_events where organization_id='b4000000-0000-4000-8000-000000000001'),'lost derived usage counters rebuilt from permanent source events');
select is((select jsonb_agg(to_jsonb(e) order by id) from app_private.saas_usage_events e where organization_id='b4000000-0000-4000-8000-000000000001'),(select jsonb_agg(source_row order by source_row->>'id') from restored_usage_events),'usage source identities/hashes and quantities unchanged during recovery');
select * from finish();rollback;
