begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/finance.inc
insert into public.clients(id,organization_id,full_name,phone,phone_normalized,created_by,updated_by,creation_location_id) values
 ('b4000000-0000-4000-8000-000000000032','b4000000-0000-4000-8000-000000000001','Synthetic Finance Alias','+905322222222','+905322222222','b4000000-0000-4000-8000-000000000021','b4000000-0000-4000-8000-000000000021','b4000000-0000-4000-8000-000000000011'),
 ('b4000000-0000-4000-8000-000000000033','b4000000-0000-4000-8000-000000000001','Synthetic Finance Canonical','+905322222222','+905322222222','b4000000-0000-4000-8000-000000000021','b4000000-0000-4000-8000-000000000021','b4000000-0000-4000-8000-000000000011');
create temporary table identity_money(k text primary key,v jsonb);grant all on identity_money to authenticated;
set local role authenticated;
select is(pg_temp.finance_post('MANUAL_CHARGE','1','e5000000-0000-4000-8000-000000000701','{"tax_rate_bps":10000,"tax_inclusive":true}')#>>'{data,status}','SAVED','inclusive half-minor boundary accepted');
select is((select tax_amount_minor from public.finance_documents where id='e5000000-0000-4000-8000-000000000701'),1::bigint,'inclusive tax deterministic half up');
select is(pg_temp.finance_post('MANUAL_CHARGE','1','e5000000-0000-4000-8000-000000000702','{"tax_rate_bps":5000,"tax_inclusive":false}')#>>'{data,status}','SAVED','exclusive half-minor boundary accepted');
select is((select amount_minor from public.finance_documents where id='e5000000-0000-4000-8000-000000000702'),2::bigint,'exclusive half-minor rounds up');
select is(pg_temp.finance_post('MANUAL_CHARGE','1','e5000000-0000-4000-8000-000000000703','{"tax_rate_bps":4999,"tax_inclusive":false}')#>>'{data,status}','SAVED','below half-minor accepted');
select is((select tax_amount_minor from public.finance_documents where id='e5000000-0000-4000-8000-000000000703'),0::bigint,'below half rounds down exactly');
select is(pg_temp.finance_post('CLIENT_DEBIT','1000','e5000000-0000-4000-8000-000000000704','{"client_id":"b4000000-0000-4000-8000-000000000032"}')#>>'{data,status}','SAVED','historical alias account fact posts');
insert into identity_money values('review',public.crm_read('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011','{"operation":"merge_review","source_client_id":"b4000000-0000-4000-8000-000000000032","target_client_id":"b4000000-0000-4000-8000-000000000033"}'));
select ok((select v ? 'data' from identity_money where k='review'),'finance history does not block eligible CRM merge');
insert into identity_money values('merge',public.crm_operation('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011',jsonb_build_object('type','MERGE','mutation_id',gen_random_uuid(),'review_token',(select v#>>'{data,review_token}' from identity_money where k='review'),'decisions',jsonb_build_object('full_name','TARGET')),gen_random_uuid()));
select ok((select v ? 'data' from identity_money where k='merge'),'reviewed merge succeeds with explicit identity decision');
select is((select client_id::text from public.finance_documents where id='e5000000-0000-4000-8000-000000000704'),'b4000000-0000-4000-8000-000000000032','merge never rewrites posted financial identity');
select is(pg_temp.finance_read('{"client_id":"b4000000-0000-4000-8000-000000000033"}')#>>'{data,client_balances,0,balance_minor}','1000','canonical profile consolidates original financial family');
select is(pg_temp.finance_post('CLIENT_DEBIT','1',gen_random_uuid(),'{"client_id":"b4000000-0000-4000-8000-000000000032"}')->>'code','CLIENT_NOT_CURRENT','merged alias cannot start new financial activity');
insert into identity_money values('archive',public.client_operation('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011','archive',jsonb_build_object('client_id','b4000000-0000-4000-8000-000000000033','expected_version',(select version from public.clients where id='b4000000-0000-4000-8000-000000000033'),'request_id',gen_random_uuid()),gen_random_uuid()));
select ok((select v ? 'data' from identity_money where k='archive'),'canonical client can archive with terminal financial history');
select is(pg_temp.finance_read('{"client_id":"b4000000-0000-4000-8000-000000000033"}')#>>'{data,client_balances,0,balance_minor}','1000','archived historical finance remains readable');
select is(pg_temp.finance_post('CLIENT_DEBIT','1',gen_random_uuid(),'{"client_id":"b4000000-0000-4000-8000-000000000033"}')->>'code','CLIENT_NOT_CURRENT','archived canonical cannot start new charge');
select throws_ok($$select app_private.finance_currency_update('b4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000011','USD')$$,'42501',null,'normal role cannot invoke currency privileged update');
reset role;
select throws_ok($$update public.organizations set base_currency='USD' where id='b4000000-0000-4000-8000-000000000001'$$,'23514','CURRENCY_LOCKED','even direct administrative currency update preserves sealed history');
select * from finish();rollback;
