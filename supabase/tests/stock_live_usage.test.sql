begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/stock.inc
set local role authenticated;
select is(pg_temp.item('c4000000-0000-4000-8000-000000000111',(select product_id from public.controlled_brand_recipes limit 1))#>>'{data,status}','SAVED','verified color reference maps to stock');
select is(pg_temp.item('c4000000-0000-4000-8000-000000000112',(select developer_id from public.controlled_brand_recipes limit 1))#>>'{data,status}','SAVED','verified developer reference maps to stock');
select pg_temp.move('OPENING','c4000000-0000-4000-8000-000000000111',100);
select pg_temp.move('OPENING','c4000000-0000-4000-8000-000000000112',100);
reset role;
-- Authoritative technical rows are produced by the existing signed Live writer;
-- observer inserts isolate the new AFTER INSERT outbox boundary here.
update public.live_sessions set record_version=record_version+1,payload=jsonb_set(jsonb_set(payload,'{recordVersion}',to_jsonb(record_version+1)),'{bowls}',jsonb_build_array(jsonb_build_object('id','b4000000-0000-4000-8000-000000000901','recipeId',current_recipe_id,'regionIds',jsonb_build_array('b4000000-0000-4000-8000-000000000051'),'plannedGrams',60,'preparedGrams',60,'usedGrams',40,'wasteGrams',20,'closed',true))) where id='b4000000-0000-4000-8000-000000000803';
insert into public.live_usage(organization_id,session_id,id,bowl_id,recipe_id,product_id,product_version,prepared_grams,used_grams,waste_grams,recorded_by,recorded_at)
select s.organization_id,s.id,gen_random_uuid(),'b4000000-0000-4000-8000-000000000901',r.id,p.id,p.version,30,20,10,s.controller_user_id,statement_timestamp() from public.live_sessions s join public.controlled_brand_recipes r on r.id=s.current_recipe_id join public.catalog_products p on p.id in(r.product_id,r.developer_id);
select is((select count(*) from public.stock_source_events),2::bigint,'technical usage transaction creates component outbox events');
select is((select count(*) from public.stock_movements where movement_type='USAGE'),0::bigint,'outbox enqueue never blocks technical save on stock balance locks');
set local role authenticated;
select is(pg_temp.stock(jsonb_build_object('type','PROCESS_BATCH','mutation_id',gen_random_uuid(),'limit',20))#>>'{data,status}','SAVED','server batch consumes pending events');
select is((select sum(quantity_delta) from public.stock_movements where stock_item_id='c4000000-0000-4000-8000-000000000111'),70::numeric,'60g mixture consumes 30g raw color including waste');
select is((select sum(quantity_delta) from public.stock_movements where stock_item_id='c4000000-0000-4000-8000-000000000112'),70::numeric,'developer raw component separately consumes 30g');
select is(pg_temp.stock(jsonb_build_object('type','PROCESS','mutation_id',gen_random_uuid(),'event_id',(select id from public.stock_source_events limit 1),'lot_id',null))#>>'{data,status}','PROCESSED','different mutation same source stays deduplicated');
select is((select count(*) from public.stock_movements where movement_type='USAGE'),2::bigint,'no second consumption and no separate waste deduction');
reset role;
-- STOP produces discrepancies without requiring a browser callback.
update public.live_sessions set record_version=record_version+1,status='ABORTED',payload=jsonb_set(jsonb_set(payload,'{status}','"ABORTED"'),'{recordVersion}',to_jsonb(record_version+1)) where id='b4000000-0000-4000-8000-000000000803';
select is((select count(*) from public.stock_source_events where source_domain='LIVE_TERMINAL'),2::bigint,'terminal outbox lists all real bowl components');
create function pg_temp.material(n numeric,previous uuid default null) returns void language sql volatile as $$
 insert into public.live_material_reconciliations(id,organization_id,location_id,session_id,client_id,bowl_id,recipe_id,mutation_id,supersedes_id,prepared_grams,used_grams,waste_grams,reason,recorded_by,recorded_at,correlation_id)
 select gen_random_uuid(),s.organization_id,s.location_id,s.id,s.client_id,'b4000000-0000-4000-8000-000000000901',s.current_recipe_id,gen_random_uuid(),previous,n,case when n is not null then 0 end,n,'Synthetic factual correction',s.controller_user_id,statement_timestamp(),gen_random_uuid() from public.live_sessions s;
$$;
select pg_temp.material(80);
set local role authenticated;
select pg_temp.stock(jsonb_build_object('type','PROCESS_BATCH','mutation_id',gen_random_uuid(),'limit',20));
select is((select sum(quantity_delta) from public.stock_movements where stock_item_id='c4000000-0000-4000-8000-000000000111'),60::numeric,'latest reconciliation replaces original consumption with 40g component');
reset role;
select pg_temp.material(20,(select id from public.live_material_reconciliations));
set local role authenticated;
select pg_temp.stock(jsonb_build_object('type','PROCESS_BATCH','mutation_id',gen_random_uuid(),'limit',20));
select is((select sum(quantity_delta) from public.stock_movements where stock_item_id='c4000000-0000-4000-8000-000000000111'),90::numeric,'smaller measured preparation restores only the 30g difference');
select is((select sum(quantity_delta) from public.stock_movements where source_session_id is not null and stock_item_id='c4000000-0000-4000-8000-000000000111'),-10::numeric,'original plus correction chain equals latest component, not summed events');
reset role;
select pg_temp.material(null,(select id from public.live_material_reconciliations where not exists(select 1 from public.live_material_reconciliations y where y.supersedes_id=live_material_reconciliations.id)));
set local role authenticated;
select pg_temp.stock(jsonb_build_object('type','PROCESS_BATCH','mutation_id',gen_random_uuid(),'limit',20));
select is((select count(*) from public.stock_source_events where error_code='STOCK_USAGE_RECONCILIATION_REQUIRED'),2::bigint,'UNKNOWN creates retry-required factual discrepancy');
select is((select sum(quantity_delta) from public.stock_movements where stock_item_id='c4000000-0000-4000-8000-000000000111'),90::numeric,'UNKNOWN never invents zero or restores consumed stock');
select is(public.stock_snapshot('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011','{"item_id":"c4000000-0000-4000-8000-000000000111"}')#>>'{data,items,0,stock_status}','UNKNOWN','unresolved usage cannot look current');
reset role;
select pg_temp.material(0,(select id from public.live_material_reconciliations where not exists(select 1 from public.live_material_reconciliations y where y.supersedes_id=live_material_reconciliations.id)));
set local role authenticated;
select pg_temp.stock(jsonb_build_object('type','PROCESS_BATCH','mutation_id',gen_random_uuid(),'limit',20));
select is((select sum(quantity_delta) from public.stock_movements where stock_item_id='c4000000-0000-4000-8000-000000000111'),100::numeric,'measured zero restores latest measured usage');
-- Failed UNKNOWN events are individually retryable against current authoritative leaf.
select pg_temp.stock(jsonb_build_object('type','PROCESS','mutation_id',gen_random_uuid(),'event_id',id,'lot_id',null)) from public.stock_source_events where status='FAILED';
select is((select count(*) from public.stock_source_events where status<>'PROCESSED'),0::bigint,'resolved discrepancies become current after explicit retry');
select is((select count(*) from public.live_usage),2::bigint,'immutable original technical usage remains unchanged');
select is((select count(*) from public.live_material_reconciliations),4::bigint,'all correction versions remain intact');
select is((select status from public.live_sessions),'ABORTED','stock corrections never restart stopped technical session');
select is(pg_temp.stock(jsonb_build_object('type','REVERSAL','mutation_id',gen_random_uuid(),'movement_id',(select id from public.stock_movements where movement_type='USAGE' limit 1),'reason','Invalid manual rewrite'))->>'code','STOCK_SOURCE_IMMUTABLE','automatic usage only corrects through trusted material chain');
reset role;
select throws_ok($$select pg_temp.material(20.01,(select id from public.live_material_reconciliations where not exists(select 1 from public.live_material_reconciliations y where y.supersedes_id=live_material_reconciliations.id)))$$,'23514',null,'existing Gate 1 rejects unrepresentable mixture without weakening its precision rule');
set local role authenticated;
select pg_temp.stock(jsonb_build_object('type','PROCESS_BATCH','mutation_id',gen_random_uuid(),'limit',20));
select is((select count(*) from public.stock_source_events where error_code='UNIT_CONVERSION_REQUIRED'),0::bigint,'rejected technical fact cannot leave a partial stock event');
select is((select sum(quantity_delta) from public.stock_movements where stock_item_id='c4000000-0000-4000-8000-000000000111'),100::numeric,'unrepresentable component never posts a rounded movement');
select is((select prepared_grams from public.live_material_reconciliations x where not exists(select 1 from public.live_material_reconciliations y where y.supersedes_id=x.id)),0::numeric,'rejected technical update preserves the last accepted immutable measurement');
reset role;
select pg_temp.material(20.02,(select id from public.live_material_reconciliations where not exists(select 1 from public.live_material_reconciliations y where y.supersedes_id=live_material_reconciliations.id)));
set local role authenticated;
select pg_temp.stock(jsonb_build_object('type','PROCESS_BATCH','mutation_id',gen_random_uuid(),'limit',20));
select is((select sum(quantity_delta) from public.stock_movements where stock_item_id='c4000000-0000-4000-8000-000000000111'),89.99::numeric,'representable fractional gram consumption remains exact');
select pg_temp.stock(jsonb_build_object('type','PROCESS','mutation_id',gen_random_uuid(),'event_id',id,'lot_id',null)) from public.stock_source_events where status='FAILED';
select is((select count(*) from public.stock_source_events where status<>'PROCESSED'),0::bigint,'new factual reconciliation resolves precision discrepancy without duplicate consumption');
reset role;
update public.stock_settings set enabled_at=statement_timestamp()+interval '1 day';
insert into public.live_usage(organization_id,session_id,id,bowl_id,recipe_id,product_id,product_version,prepared_grams,used_grams,waste_grams,recorded_by,recorded_at)
select s.organization_id,s.id,gen_random_uuid(),'b4000000-0000-4000-8000-000000000999',r.id,p.id,p.version,30,20,10,s.controller_user_id,statement_timestamp() from public.live_sessions s join public.controlled_brand_recipes r on r.id=s.current_recipe_id join public.catalog_products p on p.id=r.product_id;
select is((select count(*) from public.stock_source_events where bowl_id='b4000000-0000-4000-8000-000000000999'),0::bigint,'pre-cutover sessions remain NOT_IMPORTED despite later technical recording');
select throws_ok($$update public.live_usage set prepared_grams=1$$,'23514','IMMUTABLE_LIVE_HISTORY','stock never weakens original usage immutability');
select * from finish();rollback;
