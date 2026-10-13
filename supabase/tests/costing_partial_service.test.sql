begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/costing-salon.inc
set local role authenticated;
select is(pg_temp.item('c4000000-0000-4000-8000-000000000111',(select product_id from public.controlled_brand_recipes limit 1))#>>'{data,status}','SAVED','verified color reference maps to stock');
select is(pg_temp.item('c4000000-0000-4000-8000-000000000112',(select developer_id from public.controlled_brand_recipes limit 1))#>>'{data,status}','SAVED','verified developer reference maps to stock');
select pg_temp.move('OPENING','c4000000-0000-4000-8000-000000000111',100);
select pg_temp.move('OPENING','c4000000-0000-4000-8000-000000000112',100);
select is(pg_temp.cost_basis('c4000000-0000-4000-8000-000000000111','10',1)#>>'{data,status}','SAVED','reviewed color cost');
-- Developer acquisition basis deliberately UNKNOWN.
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
select is((select sum(total_cost_minor) from public.direct_cost_facts where source_session_id is not null),300::numeric,'only known color component subtotal; unknown developer not zero');
select is((select count(*) from public.direct_cost_facts where source_session_id is not null),2::bigint,'same trusted source has one cost fact');
reset role;
reset role;
update public.live_sessions set record_version=record_version+1,status='COMPLETED',appointment_link='e5000000-0000-4000-8000-000000000811',payload=jsonb_set(jsonb_set(payload,'{recordVersion}',to_jsonb(record_version+1)),'{status}','"COMPLETED"') where id='b4000000-0000-4000-8000-000000000803';
set local role authenticated;
select pg_temp.stock(jsonb_build_object('type','PROCESS_BATCH','mutation_id',gen_random_uuid(),'limit',20));
select pg_temp.transition_finance('e5000000-0000-4000-8000-000000000811',1,'ARRIVED');
select pg_temp.transition_finance('e5000000-0000-4000-8000-000000000811',2,'IN_SERVICE');
select pg_temp.transition_finance('e5000000-0000-4000-8000-000000000811',3,'COMPLETED');
select is(pg_temp.charge_appointment('c5000000-0000-4000-8000-000000000301','e5000000-0000-4000-8000-000000000811')#>>'{data,status}','SAVED','legacy association service posts');
select is(pg_temp.costing_read('{"charge_id":"c5000000-0000-4000-8000-000000000301"}')#>>'{data,items,0,live_session_id}',null::text,'legacy UUID cannot import live costs');
select is(pg_temp.costing_read('{"charge_id":"c5000000-0000-4000-8000-000000000301"}')#>>'{data,items,0,cost_status}','UNKNOWN','legacy relation cannot become trusted known cost');
select pg_temp.transition_finance('e5000000-0000-4000-8000-000000000812',1,'ARRIVED');
select pg_temp.transition_finance('e5000000-0000-4000-8000-000000000812',2,'IN_SERVICE');
select ok(pg_temp.salon('{"type":"LINK_LIVE_SESSION","mutation_id":"c5000000-0000-4000-8000-000000000831","id":"e5000000-0000-4000-8000-000000000812","expected_version":3,"live_session_id":"b4000000-0000-4000-8000-000000000803"}') ? 'data','real validated relational association');
select pg_temp.transition_finance('e5000000-0000-4000-8000-000000000812',4,'COMPLETED');
select is(pg_temp.charge_appointment('c5000000-0000-4000-8000-000000000302','e5000000-0000-4000-8000-000000000812')#>>'{data,status}','SAVED','tracked service immutable finance source');
select is(pg_temp.costing_read('{"charge_id":"c5000000-0000-4000-8000-000000000302"}')#>>'{data,items,0,cost_status}','PARTIAL','known color plus unknown developer is PARTIAL');
select is(pg_temp.costing_read('{"charge_id":"c5000000-0000-4000-8000-000000000302"}')#>>'{data,items,0,known_product_cost_minor}','300','known component subtotal exact');
select is(pg_temp.costing_read('{"charge_id":"c5000000-0000-4000-8000-000000000302"}')#>>'{data,items,0,direct_product_cost_minor}',null::text,'partial total is NULL');
select is(pg_temp.costing_read('{"charge_id":"c5000000-0000-4000-8000-000000000302"}')#>>'{data,items,0,gross_contribution_minor}',null::text,'partial cost suppresses contribution');
select is(pg_temp.costing_read('{"charge_id":"c5000000-0000-4000-8000-000000000302"}')#>>'{data,items,0,margin_bps}',null::text,'partial cost suppresses margin');
select is(pg_temp.cost_intake('c4000000-0000-4000-8000-000000000111',100,'3000')#>>'{data,status}','SAVED','later receipt changes only future pool');
reset role;
create function pg_temp.material(n numeric,previous uuid default null) returns void language sql volatile as $$
 insert into public.live_material_reconciliations(id,organization_id,location_id,session_id,client_id,bowl_id,recipe_id,mutation_id,supersedes_id,prepared_grams,used_grams,waste_grams,reason,recorded_by,recorded_at,correlation_id)
 select gen_random_uuid(),s.organization_id,s.location_id,s.id,s.client_id,'b4000000-0000-4000-8000-000000000901',s.current_recipe_id,gen_random_uuid(),previous,n,case when n is not null then 0 end,n,'Synthetic factual correction',s.controller_user_id,statement_timestamp(),gen_random_uuid() from public.live_sessions s;
$$;
select pg_temp.material(80);
set local role authenticated;
select pg_temp.stock(jsonb_build_object('type','PROCESS_BATCH','mutation_id',gen_random_uuid(),'limit',20));
select is(pg_temp.costing_read('{"charge_id":"c5000000-0000-4000-8000-000000000302"}')#>>'{data,items,0,known_product_cost_minor}','400','reconciliation uses original rate despite new receipt');
select is((select value_numerator/value_denominator from public.stock_cost_basis_events where stock_item_id='c4000000-0000-4000-8000-000000000111' and stock_lot_id is null order by version desc limit 1),3600::numeric,'pool subtracts the same original rational correction value');
select is((select total_cost_minor from public.direct_cost_facts where stock_item_id='c4000000-0000-4000-8000-000000000111' and correction_of is null),300::bigint,'original usage remains unchanged');
select is(pg_temp.costing_read('{"charge_id":"c5000000-0000-4000-8000-000000000302"}')#>>'{data,items,0,cost_status}','PARTIAL','historical unknown developer cannot heal');
select * from finish();rollback;
