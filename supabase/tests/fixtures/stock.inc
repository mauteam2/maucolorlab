-- Synthetic stock fixture; no production/customer records.
\ir gate-1-live.inc
reset role;
select set_config('request.jwt.claim.sub','b4000000-0000-4000-8000-000000000021',true);
create function pg_temp.stock(q jsonb) returns jsonb language sql volatile as $$select public.stock_operation('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011',q,gen_random_uuid());$$;
create function pg_temp.item(i uuid,product uuid default null,unit text default 'GRAM',required_lot boolean default false) returns jsonb language sql volatile as $$
 select pg_temp.stock(jsonb_build_object('type','ITEM_SAVE','mutation_id',gen_random_uuid(),'id',i,'expected_version',0,'reason','Synthetic mapping','definition',jsonb_build_object('source',case when product is null then 'SALON_CUSTOM_OPERATIONAL_PRODUCT' else 'GLOBAL_VERIFIED_CATALOG' end,'catalog_product_id',product,'product_type','COLOR','display_name','Synthetic stock item '||i,'sku','SYN-01','barcode',null,'inventory_unit',unit,'active',true,'track_quantity',true,'lot_required',required_lot,'low_threshold',10)));
$$;
create function pg_temp.move(t text,i uuid,n numeric,lot uuid default null,unit text default 'GRAM',mid uuid default gen_random_uuid()) returns jsonb language sql volatile as $$
 select pg_temp.stock(jsonb_build_object('type',t,'mutation_id',mid,'stock_item_id',i,'lot_id',lot,'quantity',n,'unit',unit,'occurred_at','2026-10-09T12:00:00Z','reference','Synthetic reference','reason','Synthetic factual stock movement'));
$$;
set local role authenticated;
select pg_temp.stock(jsonb_build_object('type','ENABLE','mutation_id',gen_random_uuid(),'reason','Synthetic cutover'));
reset role;
-- Make this one synthetic session post-cutover without changing the cutover API.
update public.stock_settings set enabled_at=statement_timestamp()-interval '1 day';
set local role authenticated;
select pg_temp.item('c4000000-0000-4000-8000-000000000101');
select pg_temp.move('OPENING','c4000000-0000-4000-8000-000000000101',100);
reset role;
