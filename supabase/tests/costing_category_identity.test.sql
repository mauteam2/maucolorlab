begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/costing-salon.inc
set local role authenticated;
select is(pg_temp.cost_policy('c5000000-0000-4000-8000-000000000201','PERCENT_NET_OF_TAX',1500)#>>'{data,status}','SAVED','category percent policy');
select is(pg_temp.salon(jsonb_set((select v from appointment_money where k='service'),'{id}','"e5000000-0000-4000-8000-000000000802"')||jsonb_build_object('mutation_id',gen_random_uuid(),'definition',(select v->'definition' from appointment_money where k='service')||'{"category":"COLOR","name":"Replacement color service"}'::jsonb))#>>'{data,version}','1','different service also has v1');
select is(pg_temp.costing(jsonb_build_object('type','ASSIGN','mutation_id',gen_random_uuid(),'id','c5000000-0000-4000-8000-000000000501','staff_user_id','b4000000-0000-4000-8000-000000000021','policy_id','c5000000-0000-4000-8000-000000000201','scope','SERVICE_CATEGORY','service_id',null,'category','COLOR','effective_from',statement_timestamp(),'effective_until',null,'reason','Explicit category rule'))#>>'{data,status}','SAVED','category assignment created');
select is(pg_temp.salon(jsonb_build_object('type','APPOINTMENT_SAVE','mutation_id',gen_random_uuid(),'id','e5000000-0000-4000-8000-000000000811','expected_version',1,'definition',jsonb_build_object('client_id','b4000000-0000-4000-8000-000000000031','service_id','e5000000-0000-4000-8000-000000000802','staff_membership_id','b4000000-0000-4000-8000-000000000111','local_start','2026-10-20T10:00','utc_offset_minutes',null,'scheduled_duration_minutes',null,'adjustment_reason',null,'notes',null,'status','CONFIRMED')))#>>'{data,version}','2','real booked appointment changes service identity');
select pg_temp.transition_finance('e5000000-0000-4000-8000-000000000811',2,'ARRIVED');
select pg_temp.transition_finance('e5000000-0000-4000-8000-000000000811',3,'IN_SERVICE');
select pg_temp.transition_finance('e5000000-0000-4000-8000-000000000811',4,'COMPLETED');
select is(pg_temp.charge_appointment('c5000000-0000-4000-8000-000000000301','e5000000-0000-4000-8000-000000000811')#>>'{data,status}','SAVED','replacement service charge posted');
select is((select category from public.profitability_revenue_facts where charge_id='c5000000-0000-4000-8000-000000000301'),'COLOR','category uses service ID plus version, not old CARE v1');
select is((select amount_minor from public.commission_accruals where charge_id='c5000000-0000-4000-8000-000000000301'),15000::bigint,'correct category policy applies exact net percent');
select * from finish();rollback;
