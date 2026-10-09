-- Entirely synthetic, transactional pgTAP fixture. Shared technical/stock history remains unchanged.
\ir stock.inc
reset role;
insert into auth.users(id,email) values('b4000000-0000-4000-8000-000000000023','finance-technical@elifora.test'),('b4000000-0000-4000-8000-000000000024','finance-reception@elifora.test');
insert into public.salon_memberships(id,organization_id,location_id,user_id,role_code,status,joined_at) values('b4000000-0000-4000-8000-000000000113','b4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000011','b4000000-0000-4000-8000-000000000023','colorist','active',now()),('b4000000-0000-4000-8000-000000000114','b4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000011','b4000000-0000-4000-8000-000000000024','reception','active',now());
create function pg_temp.finance(q jsonb) returns jsonb language sql volatile as $$select public.finance_operation('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011',q,gen_random_uuid());$$;
create function pg_temp.finance_read(q jsonb default '{}'::jsonb) returns jsonb language sql volatile as $$select public.finance_snapshot('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011',q);$$;
create function pg_temp.finance_post(t text,n text,eid uuid default gen_random_uuid(),more jsonb default '{}'::jsonb) returns jsonb language sql volatile as $$
 select pg_temp.finance(jsonb_build_object('type',t,'mutation_id',gen_random_uuid(),'id',eid,'client_id','b4000000-0000-4000-8000-000000000031','currency','TRY','amount_minor',n,'description','Synthetic finance fact','occurred_at',statement_timestamp(),'reason','Synthetic factual record')||more);
$$;
create function pg_temp.finance_payment(t text,n text,eid uuid,lines jsonb default '[]'::jsonb,method text default 'CARD',mid uuid default gen_random_uuid()) returns jsonb language sql volatile as $$
 select pg_temp.finance(jsonb_build_object('type',t,'mutation_id',mid,'id',eid,'client_id','b4000000-0000-4000-8000-000000000031','currency','TRY','amount_minor',n,'method',method,'appointment_id',null,'external_reference',null,'occurred_at',statement_timestamp(),'reason','Synthetic payment')||case when t='PAYMENT' then jsonb_build_object('allocations',lines,'confirm_credit',true) else '{}'::jsonb end);
$$;
set local role authenticated;
select pg_temp.finance('{"type":"CURRENCY_SET","mutation_id":"e5000000-0000-4000-8000-000000000201","currency":"TRY","expected_version":0,"reason":"Synthetic finance cutover"}');
select pg_temp.finance('{"type":"CASH_OPEN","mutation_id":"e5000000-0000-4000-8000-000000000202","id":"e5000000-0000-4000-8000-000000000101","currency":"TRY","opening_cash_minor":"10000","reason":"Measured opening cash"}');
reset role;
