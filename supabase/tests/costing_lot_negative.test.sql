begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/costing.inc
create function pg_temp.lot_intake(lot uuid,n text,t text) returns jsonb language sql volatile as $$
 select pg_temp.costing(jsonb_build_object('type','INTAKE','mutation_id',m,'currency','TRY','total_cost_minor',n,'unit_cost_numerator',null,'unit_cost_denominator',null,'cost_basis_at',statement_timestamp(),'external_reference',null,'reason','Measured labelled acquisition','stock_command',jsonb_build_object('type',t,'mutation_id',m,'stock_item_id','c5000000-0000-4000-8000-000000000101','lot_id',lot,'quantity',10,'unit','GRAM','occurred_at',statement_timestamp(),'reference',null,'reason','Actual labelled intake'))) from(select gen_random_uuid() m)x;
$$;
set local role authenticated;
select is(pg_temp.stock(jsonb_build_object('type','LOT_SAVE','mutation_id',gen_random_uuid(),'id','c5000000-0000-4000-8000-000000000501','expected_version',0,'stock_item_id','c5000000-0000-4000-8000-000000000101','lot_number','LABEL-A','batch_number',null,'expiry_date',null,'opened_at',null,'received_at',statement_timestamp(),'reason','Actual label'))#>>'{data,status}','SAVED','first factual lot');
select is(pg_temp.stock(jsonb_build_object('type','LOT_SAVE','mutation_id',gen_random_uuid(),'id','c5000000-0000-4000-8000-000000000502','expected_version',0,'stock_item_id','c5000000-0000-4000-8000-000000000101','lot_number','LABEL-B','batch_number',null,'expiry_date',null,'opened_at',null,'received_at',statement_timestamp(),'reason','Actual label'))#>>'{data,status}','SAVED','second factual lot');
select is(pg_temp.lot_intake('c5000000-0000-4000-8000-000000000501','100','OPENING')#>>'{data,status}','SAVED','lot A cost10 per gram');
select is(pg_temp.lot_intake('c5000000-0000-4000-8000-000000000502','300','RECEIPT')#>>'{data,status}','SAVED','lot B cost30 per gram');
select is(pg_temp.move('ADJUSTMENT_OUT','c5000000-0000-4000-8000-000000000101',5,'c5000000-0000-4000-8000-000000000501')#>>'{data,status}','SAVED','explicit known lot movement');
select is((select total_cost_minor from public.direct_cost_facts where stock_item_id='c5000000-0000-4000-8000-000000000101'),50::bigint,'explicit lot basis instead of inferred pool20');
select is((select stock_lot_id::text from public.direct_cost_facts where stock_item_id='c5000000-0000-4000-8000-000000000101'),'c5000000-0000-4000-8000-000000000501','physical lot preserved from actual movement');
select is((select value_numerator/value_denominator from public.stock_cost_basis_events where stock_item_id='c5000000-0000-4000-8000-000000000101' and stock_lot_id is null order by version desc limit 1),350::numeric,'global remaining value removes exact selected lot value');
select is(pg_temp.move('ADJUSTMENT_OUT','c5000000-0000-4000-8000-000000000101',3)#>>'{data,status}','SAVED','unselected movement uses remaining weighted pool');
select is((select total_cost_minor from public.direct_cost_facts where stock_item_id='c5000000-0000-4000-8000-000000000101' and stock_lot_id is null),70::bigint,'350/15 times3 exact');
select is((select stock_lot_id from public.direct_cost_facts where stock_item_id='c5000000-0000-4000-8000-000000000101' and stock_lot_id is null),null::uuid,'weighted valuation cannot invent lot provenance');
select is(pg_temp.cost_intake('c5000000-0000-4000-8000-000000000102',1,'10','OPENING')#>>'{data,status}','SAVED','known tiny inventory');
select is(pg_temp.stock(jsonb_build_object('type','POLICY','mutation_id',gen_random_uuid(),'negative_policy','WARN_NEGATIVE','expected_version',1,'reason','Explicit operational exception'))#>>'{data,status}','SAVED','existing warning policy retained');
select is(pg_temp.move('ADJUSTMENT_OUT','c5000000-0000-4000-8000-000000000102',2)#>>'{data,status}','SAVED','explicit negative operational stock');
select is((select status from public.direct_cost_facts where stock_item_id='c5000000-0000-4000-8000-000000000102'),'UNKNOWN','negative inventory does not reuse last known price');
select is((select total_cost_minor from public.direct_cost_facts where stock_item_id='c5000000-0000-4000-8000-000000000102'),null::bigint,'negative inventory cannot fabricate zero cost');
select is(pg_temp.costing_read('{"kind":"COST_BASIS","stock_item_id":"c5000000-0000-4000-8000-000000000102"}')#>>'{data,cost_basis,0,quantity_hundredths}','-100','integral NUMERIC serialized canonically');
select * from finish();rollback;
