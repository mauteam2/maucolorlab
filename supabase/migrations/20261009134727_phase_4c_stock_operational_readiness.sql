-- Forward: actor labels, selected-product availability and permanent failure receipts.
create function app_private.stock_actor_label(org uuid,loc uuid,actor uuid) returns text language sql stable security definer set search_path='' as $$
 select p.display_name from public.profiles p where p.user_id=actor and app_private.user_has_permission(org,loc,'stock.view') and exists(select 1 from public.salon_memberships m where m.organization_id=org and m.user_id=actor);
$$;
revoke all on function app_private.stock_actor_label(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.stock_actor_label(uuid,uuid,uuid) to elifora_stock_writer;
create function app_private.stock_item_status(item public.stock_items) returns text language sql volatile security invoker set search_path='' as $$
 select case when not item.track_quantity or not exists(select 1 from public.stock_openings where stock_item_id=item.id)
 or exists(select 1 from public.stock_source_events e join public.catalog_products p on p.id=e.product_id where e.organization_id=item.organization_id and e.location_id=item.location_id and p.series_id=item.catalog_series_id and e.status<>'PROCESSED') then 'UNKNOWN'
 when app_private.stock_balance(item.id)<=0 then 'OUT' when item.low_threshold is not null and app_private.stock_balance(item.id)<=item.low_threshold then 'LOW' else 'OK' end;
$$;
revoke all on function app_private.stock_item_status(public.stock_items) from public,anon,authenticated,service_role;
grant execute on function app_private.stock_item_status(public.stock_items) to elifora_stock_writer;

create or replace function app_private.stock_snapshot(member uuid,loc uuid,q jsonb) returns jsonb language plpgsql volatile security definer set search_path='' set row_security='on' as $$
declare ctx jsonb;org uuid;item uuid;search text;off integer;product uuid;result jsonb;items jsonb;lot uuid;
begin
 ctx:=app_private.hair_write_context(member,loc,'stock.view');if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 if jsonb_typeof(q) is distinct from 'object' or exists(select 1 from jsonb_object_keys(q) k where k not in ('query','offset','item_id','lot_id','catalog_product_id')) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if q ? 'query' and jsonb_typeof(q->'query') is distinct from 'string' or q ? 'offset' and (jsonb_typeof(q->'offset') is distinct from 'number' or (q->>'offset')::numeric<>trunc((q->>'offset')::numeric)) or q ? 'item_id' and jsonb_typeof(q->'item_id') is distinct from 'string' or q ? 'catalog_product_id' and jsonb_typeof(q->'catalog_product_id') is distinct from 'string' or q ? 'lot_id' and jsonb_typeof(q->'lot_id') is distinct from 'string' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 product:=(q->>'catalog_product_id')::uuid;
 search:=coalesce(q->>'query','');off:=coalesce((q->>'offset')::integer,0);item:=(q->>'item_id')::uuid;lot:=(q->>'lot_id')::uuid;
 if char_length(search)>80 or off not between 0 and 10000 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if item is not null and not exists(select 1 from public.stock_items where id=item and organization_id=org and location_id=loc) then return jsonb_build_object('code','STOCK_NOT_FOUND');end if;
 select coalesce(jsonb_agg(value),'[]') into items from (
 select to_jsonb(i)||jsonb_build_object('on_hand',case when i.track_quantity and exists(select 1 from public.stock_openings where stock_item_id=i.id) then app_private.stock_balance(i.id) end,'stock_sync_status',case when exists(select 1 from public.stock_source_events e join public.catalog_products p on p.id=e.product_id where e.organization_id=org and e.location_id=loc and p.series_id=i.catalog_series_id and e.status<>'PROCESSED') then 'RETRY_REQUIRED' else 'CURRENT' end,
 'stock_status',app_private.stock_item_status(i)) value
 from public.stock_items i left join public.catalog_products p on p.id=i.catalog_product_id where i.organization_id=org and i.location_id=loc and (item is null or i.id=item) and (product is null or i.catalog_series_id=(select series_id from public.catalog_products where id=product)) and (search='' or i.display_name ilike '%'||search||'%' or i.sku ilike '%'||search||'%' or i.barcode ilike '%'||search||'%' or p.manufacturer_code ilike '%'||search||'%') order by i.display_name,i.id limit 50 offset off) bounded;
 result:=jsonb_build_object('settings',(select to_jsonb(s) from public.stock_settings s where s.organization_id=org and s.location_id=loc),'items',items,'offset',off,
 'total_items',(select count(*) from public.stock_items si left join public.catalog_products cp on cp.id=si.catalog_product_id where si.organization_id=org and si.location_id=loc and (search='' or si.display_name ilike '%'||search||'%' or si.sku ilike '%'||search||'%' or si.barcode ilike '%'||search||'%' or cp.manufacturer_code ilike '%'||search||'%')),
 'lots',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('on_hand',case when exists(select 1 from public.stock_openings where stock_item_id=l.stock_item_id and stock_lot_id=l.id) then app_private.stock_balance(l.stock_item_id,l.id,true) end,'expiry_status',case when l.expiry_date<current_date then 'EXPIRED' when l.expiry_date<=current_date+30 then 'EXPIRING_SOON' else 'UNKNOWN_OR_CURRENT' end)) from (select * from public.stock_lots where organization_id=org and location_id=loc and (item is null or stock_item_id=item) order by expiry_date nulls last,id limit 100) l),'[]'),
 'movements',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('recorded_by_name',app_private.stock_actor_label(org,loc,m.recorded_by),'source_client_id',case when app_private.user_has_permission(org,loc,'clients.read') and app_private.user_has_permission(org,loc,'live_session.view') then (select e.client_id from public.stock_source_events e where e.id=m.source_event_id) end)) from (select * from public.stock_movements where organization_id=org and location_id=loc and (item is null or stock_item_id=item) order by occurred_at desc,id limit 100) m),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select * from public.stock_source_events where organization_id=org and location_id=loc and status<>'PROCESSED' order by created_at,id limit 100) e),'[]'),
 'counts',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('lines',(select jsonb_agg(to_jsonb(l)) from public.stock_count_lines l where l.count_id=c.id))) from (select * from public.stock_counts where organization_id=org and location_id=loc order by created_at desc limit 20) c),'[]'),
 'monitoring',jsonb_build_object('low_items',(select count(*) from public.stock_items si where si.organization_id=org and si.location_id=loc and si.active and app_private.stock_item_status(si)='LOW'),'out_items',(select count(*) from public.stock_items si where si.organization_id=org and si.location_id=loc and si.active and app_private.stock_item_status(si)='OUT'),'active_items',(select count(*) from public.stock_items where organization_id=org and location_id=loc and active),'expiring_lots',(select count(*) from public.stock_lots where organization_id=org and location_id=loc and expiry_date between current_date and current_date+30),'pending',(select count(*) from public.stock_source_events where organization_id=org and location_id=loc and status='PENDING'),'failed',(select count(*) from public.stock_source_events where organization_id=org and location_id=loc and status='FAILED'),'unreconciled',(select count(*) from public.stock_source_events where organization_id=org and location_id=loc and error_code='STOCK_USAGE_RECONCILIATION_REQUIRED')),
 'catalog_options',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'manufacturer_code',p.manufacturer_code,'product_type',case p.product_type when 'SHADE' then 'COLOR' when 'ACTIVATOR' then 'DEVELOPER' when 'BOND' then 'TREATMENT' else p.product_type end,'source',case when c.scope='GLOBAL' then 'GLOBAL_VERIFIED_CATALOG' else 'SALON_VERIFIED_PRODUCT' end)) from (select cp.* from public.catalog_products cp join public.brand_catalog_releases cr on cr.id=cp.catalog_id and cr.state='PUBLISHED' where cp.active and (cr.scope='GLOBAL' and cp.verification_status='ELIFORA_VERIFIED' or cr.organization_id=org and cp.verification_status='SALON_VERIFIED') order by cp.display_name,cp.id limit 500) p join public.brand_catalog_releases c on c.id=p.catalog_id and c.state='PUBLISHED'),'[]'));

 result:=result||jsonb_build_object('actions',coalesce((select jsonb_agg(jsonb_build_object('key',kind||':'||source_id,'kind',kind,'source_domain',domain,'source_id',source_id,'organization_id',org,'location_id',loc,'state','OPEN','error_code',error_code)) from (
 select case when app_private.stock_balance(si.id)<=0 then 'OUT_OF_STOCK' else 'LOW_STOCK' end kind,'stock_item' domain,si.id source_id,null::text error_code
 from public.stock_items si where si.organization_id=org and si.location_id=loc and si.active and si.track_quantity and exists(select 1 from public.stock_openings where stock_item_id=si.id)
 and not exists(select 1 from public.stock_source_events se join public.catalog_products cp on cp.id=se.product_id where se.location_id=loc and cp.series_id=si.catalog_series_id and se.status<>'PROCESSED')
 and (app_private.stock_balance(si.id)<=0 or si.low_threshold is not null and app_private.stock_balance(si.id)<=si.low_threshold)
 union all select 'STOCK_SYNC_FAILED','stock_source_event',se.id,se.error_code from public.stock_source_events se where se.organization_id=org and se.location_id=loc and se.status='FAILED'
 union all select case se.error_code when 'STOCK_USAGE_RECONCILIATION_REQUIRED' then 'USAGE_RECONCILIATION_REQUIRED' when 'UNIT_CONVERSION_REQUIRED' then 'UNIT_MAPPING_REQUIRED' else 'PRODUCT_MAPPING_REQUIRED' end,'stock_source_event',se.id,se.error_code from public.stock_source_events se where se.organization_id=org and se.location_id=loc and se.error_code in ('STOCK_USAGE_RECONCILIATION_REQUIRED','UNIT_CONVERSION_REQUIRED','STOCK_PRODUCT_MAPPING_REQUIRED') and se.status='FAILED'
 union all select 'EXPIRING_SOON','stock_lot',sl.id,null from public.stock_lots sl where sl.organization_id=org and sl.location_id=loc and sl.expiry_date between current_date and current_date+30
 union all select 'EXPIRED','stock_lot',sl.id,null from public.stock_lots sl where sl.organization_id=org and sl.location_id=loc and sl.expiry_date<current_date
 order by kind,source_id limit 200) signals),'[]'::jsonb));
 if lot is not null then
  if not app_private.user_has_permission(org,loc,'live_session.view') or not app_private.user_has_permission(org,loc,'clients.read') then return jsonb_build_object('code','FORBIDDEN');end if;
  result:=result||jsonb_build_object('trace',coalesce((select jsonb_agg(t) from (select distinct m.source_session_id session_id,s.client_id,link.appointment_id from public.stock_movements m join public.live_sessions s on s.id=m.source_session_id left join public.salon_appointment_live_links link on link.live_session_id=s.id where m.organization_id=org and m.location_id=loc and m.stock_lot_id=lot limit 100) t),'[]'));
 end if;
 return jsonb_build_object('data',result);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('code','VALIDATION_FAILED');end $$;

create or replace function app_private.stock_process_event(eid uuid,selected_lot uuid,correlation uuid) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare e public.stock_source_events%rowtype;i public.stock_items%rowtype;series uuid;amount numeric;applied numeric;delta numeric;previous_lot uuid;err text;policy text;has_allocation boolean:=false;
begin
 select * into e from public.stock_source_events where id=eid for update;
 if not found then return jsonb_build_object('code','STOCK_NOT_FOUND');end if;
 if e.status='PROCESSED' then return jsonb_build_object('id',e.id,'status','PROCESSED');end if;
 select series_id into series from public.catalog_products where id=e.product_id;
 select * into i from public.stock_items where organization_id=e.organization_id and location_id=e.location_id and catalog_series_id=series for update;
 if not found or not i.active then err:='STOCK_PRODUCT_MAPPING_REQUIRED';
 elsif not i.track_quantity then update public.stock_source_events set status='PROCESSED',error_code='NOT_TRACKED',processed_at=statement_timestamp(),attempts=attempts+1 where id=e.id;return jsonb_build_object('id',e.id,'status','PROCESSED');
 elsif i.inventory_unit<>'GRAM' then err:='UNIT_CONVERSION_REQUIRED';
 elsif not exists(select 1 from public.stock_openings where stock_item_id=i.id) then err:='STOCK_OPENING_REQUIRED';
 else
 amount:=app_private.stock_source_fact(e.id);
 if amount is null then err:='STOCK_USAGE_RECONCILIATION_REQUIRED';end if;
 end if;
 if err is null then
  select stock_lot_id into previous_lot from public.stock_movements where source_session_id=e.session_id and source_bowl_id=e.bowl_id and source_product_id=e.product_id order by created_at,id limit 1;
  if found then has_allocation:=true;if selected_lot is not null and selected_lot is distinct from previous_lot then err:='STOCK_LOT_CONFLICT';end if;selected_lot:=previous_lot;end if;
  if i.lot_required and not has_allocation and selected_lot is null then err:='STOCK_LOT_REQUIRED';end if;
  if selected_lot is not null then
   perform 1 from public.stock_lots where id=selected_lot and stock_item_id=i.id for update;
   if not found then err:='STOCK_LOT_CONFLICT';elsif not exists(select 1 from public.stock_openings where stock_item_id=i.id and stock_lot_id=selected_lot) then err:='STOCK_OPENING_REQUIRED';end if;
  end if;
 end if;
 if err is null then
  select -coalesce(sum(quantity_delta),0) into applied from public.stock_movements where source_session_id=e.session_id and source_bowl_id=e.bowl_id and source_product_id=e.product_id;
  delta:=applied-amount;
  select negative_policy into policy from public.stock_settings where location_id=e.location_id;
  if policy='BLOCK_NEGATIVE' and (app_private.stock_balance(i.id)+delta<0 or selected_lot is not null and app_private.stock_balance(i.id,selected_lot,true)+delta<0) then err:='STOCK_INSUFFICIENT';end if;
 end if;
 if err is not null then
  update public.stock_source_events set status='FAILED',error_code=err,attempts=attempts+1 where id=e.id;
  return jsonb_build_object('id',e.id,'status','FAILED','error_code',err);
 end if;
 if delta<>0 then
  insert into public.stock_movements(organization_id,location_id,stock_item_id,stock_lot_id,movement_type,quantity_delta,unit,source_event_id,source_session_id,source_bowl_id,source_product_id,reason,recorded_by,occurred_at,correlation_id,mutation_id)
  values(e.organization_id,e.location_id,i.id,selected_lot,case when applied=0 then 'USAGE' else 'CORRECTION' end,delta,i.inventory_unit,e.id,e.session_id,e.bowl_id,e.product_id,'Measured prepared raw component; latest authoritative reconciliation',auth.uid(),statement_timestamp(),correlation,e.id);
 end if;
 update public.stock_source_events set status='PROCESSED',error_code=null,processed_at=statement_timestamp(),attempts=attempts+1 where id=e.id;
 perform app_private.stock_audit(e.organization_id,e.location_id,case when applied=0 then 'LIVE_USAGE_CONSUMED' else 'RECONCILIATION_CORRECTED' end,e.id,'Explicit trusted source delivery',correlation);
 if selected_lot is not null then perform app_private.stock_audit(e.organization_id,e.location_id,'LOT_SELECTED',e.id,'Explicit lot retained on movement',correlation);end if;
 if app_private.stock_balance(i.id)<0 then perform app_private.stock_audit(e.organization_id,e.location_id,'NEGATIVE_OVERRIDE',i.id,'Configured WARN_NEGATIVE discrepancy; technical truth retained',correlation);end if;
 return jsonb_build_object('id',e.id,'status','PROCESSED');
end $$;

create or replace function app_private.stock_operation(member uuid,loc uuid,q jsonb,correlation uuid) returns jsonb language plpgsql volatile security definer set search_path='' set row_security='on' as $$
declare t text:=q->>'type';types jsonb:='{"type":"string","mutation_id":"string"}'::jsonb;x jsonb;ctx jsonb;org uuid;permission text;answer jsonb;mid uuid;stored app_private.stock_receipts%rowtype;
begin
 types:=types||case t
 when 'ENABLE' then '{"reason":"string"}'::jsonb
 when 'POLICY' then '{"negative_policy":"string","expected_version":"number","reason":"string"}'::jsonb
 when 'ITEM_SAVE' then '{"id":"string","expected_version":"number","definition":"object","reason":"string"}'::jsonb
 when 'LOT_SAVE' then '{"id":"string","expected_version":"number","stock_item_id":"string","lot_number":"string","batch_number":"string|null","expiry_date":"string|null","opened_at":"string|null","received_at":"string","reason":"string"}'::jsonb
 when 'PROCESS_BATCH' then '{"limit":"number"}'::jsonb
 when 'PROCESS' then '{"event_id":"string","lot_id":"string|null"}'::jsonb
 when 'COUNT_CREATE' then '{"id":"string","lines":"array","reason":"string"}'::jsonb
 when 'COUNT_CONFIRM' then '{"id":"string","reason":"string"}'::jsonb
 when 'REVERSAL' then '{"movement_id":"string","reason":"string"}'::jsonb
 when 'OPENING' then '{"stock_item_id":"string","lot_id":"string|null","quantity":"number","unit":"string","occurred_at":"string","reference":"string|null","reason":"string"}'::jsonb
 when 'RECEIPT' then '{"stock_item_id":"string","lot_id":"string|null","quantity":"number","unit":"string","occurred_at":"string","reference":"string|null","reason":"string"}'::jsonb
 when 'ADJUSTMENT_IN' then '{"stock_item_id":"string","lot_id":"string|null","quantity":"number","unit":"string","occurred_at":"string","reference":"string|null","reason":"string"}'::jsonb
 when 'ADJUSTMENT_OUT' then '{"stock_item_id":"string","lot_id":"string|null","quantity":"number","unit":"string","occurred_at":"string","reference":"string|null","reason":"string"}'::jsonb
 else '{"invalid":"boolean"}'::jsonb end;
 if not app_private.stock_shape(q,types) or correlation is null then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if t='PROCESS_BATCH' and ((q->>'limit')::numeric not between 1 and 20 or (q->>'limit')::numeric<>trunc((q->>'limit')::numeric)) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if q ? 'expected_version' and ((q->>'expected_version')::numeric<0 or (q->>'expected_version')::numeric<>trunc((q->>'expected_version')::numeric)) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if q ? 'reference' and char_length(q->>'reference')>160 or q ? 'batch_number' and char_length(q->>'batch_number')>80 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if q ? 'occurred_at' and (q->>'occurred_at')!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' or q ? 'received_at' and (q->>'received_at')!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if t='ITEM_SAVE' then
  x:=q->'definition';
  if not app_private.stock_shape(x,'{"source":"string","catalog_product_id":"string|null","product_type":"string","display_name":"string","sku":"string|null","barcode":"string|null","inventory_unit":"string","active":"boolean","track_quantity":"boolean","lot_required":"boolean","low_threshold":"number|null"}') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  if x->>'low_threshold' is not null and ((x->>'low_threshold')::numeric*100<>trunc((x->>'low_threshold')::numeric*100) or x->>'inventory_unit'='UNIT' and (x->>'low_threshold')::numeric<>trunc((x->>'low_threshold')::numeric)) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 elsif t='COUNT_CREATE' then
  for x in select value from jsonb_array_elements(q->'lines') loop
   if not app_private.stock_shape(x,'{"stock_item_id":"string","lot_id":"string|null","counted_quantity":"number"}') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  end loop;
 end if;
 permission:=case when t in ('ENABLE','POLICY','ITEM_SAVE') then 'stock.manage_items' when t='LOT_SAVE' then 'stock.manage_lots' when t in ('OPENING','RECEIPT') then 'stock.receive' when t in ('COUNT_CREATE','COUNT_CONFIRM') then 'stock.count' else 'stock.adjust' end;
 ctx:=app_private.hair_write_context(member,loc,permission);if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;mid:=(q->>'mutation_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(org::text||auth.uid()::text||mid::text,4));
 ctx:=app_private.hair_write_context(member,loc,permission);if ctx ? 'code' then return ctx;end if;
 select * into stored from app_private.stock_receipts where organization_id=org and actor_id=auth.uid() and mutation_id=mid;
 if found then if stored.input is distinct from q||jsonb_build_object('_location',loc) then return jsonb_build_object('code','STOCK_CONFLICT');end if;return stored.response;end if;
 answer:=app_private.stock_operation_core(member,loc,q,correlation);
 if answer ? 'code' and answer->>'code' not in ('UNAUTHENTICATED','FORBIDDEN','MEMBERSHIP_REQUIRED','MEMBERSHIP_REVOKED','TENANT_CONTEXT_INVALID') then
  insert into app_private.stock_receipts values(org,auth.uid(),mid,q||jsonb_build_object('_location',loc),answer);
 end if;
 return answer;
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then return jsonb_build_object('code','VALIDATION_FAILED');end $$;

create or replace function app_private.stock_operation_core(member uuid,loc uuid,q jsonb,correlation uuid) returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare ctx jsonb;org uuid;op text:=q->>'type';permission text;allowed text[];mid uuid;eid uuid;item uuid;lot uuid;qty numeric;delta numeric;expected bigint;stamp timestamptz:=statement_timestamp();reason text;result jsonb;receipt app_private.stock_receipts%rowtype;i public.stock_items%rowtype;l public.stock_lots%rowtype;c public.stock_counts%rowtype;p public.catalog_products%rowtype;release public.brand_catalog_releases%rowtype;x jsonb;policy text;mv public.stock_movements%rowtype;
begin
 permission:=case when op in ('ENABLE','POLICY','ITEM_SAVE') then 'stock.manage_items' when op='LOT_SAVE' then 'stock.manage_lots' when op in ('OPENING','RECEIPT') then 'stock.receive' when op in ('COUNT_CREATE','COUNT_CONFIRM') then 'stock.count' when op in ('ADJUSTMENT_IN','ADJUSTMENT_OUT','REVERSAL','PROCESS','PROCESS_BATCH') then 'stock.adjust' end;
 if permission is null or correlation is null or jsonb_typeof(q)<>'object' or pg_column_size(q)>32768 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 ctx:=app_private.hair_write_context(member,loc,permission);if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 allowed:=case op when 'ENABLE' then array['type','mutation_id','reason'] when 'POLICY' then array['type','mutation_id','negative_policy','expected_version','reason'] when 'ITEM_SAVE' then array['type','mutation_id','id','expected_version','definition','reason'] when 'LOT_SAVE' then array['type','mutation_id','id','expected_version','stock_item_id','lot_number','batch_number','expiry_date','opened_at','received_at','reason'] when 'PROCESS_BATCH' then array['type','mutation_id','limit'] when 'PROCESS' then array['type','mutation_id','event_id','lot_id'] when 'COUNT_CREATE' then array['type','mutation_id','id','lines','reason'] when 'COUNT_CONFIRM' then array['type','mutation_id','id','reason'] when 'REVERSAL' then array['type','mutation_id','movement_id','reason'] else array['type','mutation_id','stock_item_id','lot_id','quantity','unit','occurred_at','reference','reason'] end;
 if exists(select 1 from jsonb_object_keys(q) k where k<>all(allowed)) or jsonb_typeof(q->'mutation_id') is distinct from 'string' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 mid:=(q->>'mutation_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(org::text||auth.uid()::text||mid::text,4));
 ctx:=app_private.hair_write_context(member,loc,permission);if ctx ? 'code' then return ctx;end if;
 select * into receipt from app_private.stock_receipts where organization_id=org and actor_id=auth.uid() and mutation_id=mid;
 if found then if receipt.input is distinct from q||jsonb_build_object('_location',loc) then return jsonb_build_object('code','STOCK_CONFLICT');end if;return receipt.response;end if;
 reason:=trim(q->>'reason');if op not in ('PROCESS','PROCESS_BATCH') and (reason is null or char_length(reason) not between 1 and 2000) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if op='ENABLE' then
  insert into public.stock_settings(organization_id,location_id,enabled_at,updated_by) values(org,loc,stamp,auth.uid()) on conflict(location_id) do nothing;eid:=loc;
 elsif op='POLICY' then
  update public.stock_settings set negative_policy=q->>'negative_policy',version=version+1,updated_by=auth.uid() where organization_id=org and location_id=loc and version=(q->>'expected_version')::bigint;
  if not found then return jsonb_build_object('code','STOCK_CONFLICT');end if;eid:=loc;
 else
 if not exists(select 1 from public.stock_settings where organization_id=org and location_id=loc) then return jsonb_build_object('code','STOCK_NOT_ENABLED');end if;
 if op='ITEM_SAVE' then
  eid:=(q->>'id')::uuid;expected:=(q->>'expected_version')::bigint;x:=q->'definition';
  if jsonb_typeof(x)<>'object' or exists(select 1 from jsonb_object_keys(x) k where k not in ('source','catalog_product_id','product_type','display_name','sku','barcode','inventory_unit','active','track_quantity','lot_required','low_threshold')) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  select * into i from public.stock_items where id=eid and organization_id=org and location_id=loc for update;
  if coalesce(i.version,0) is distinct from expected then return jsonb_build_object('code','STOCK_CONFLICT');end if;
  if i.id is not null and (i.catalog_product_id is distinct from (x->>'catalog_product_id')::uuid or i.inventory_unit is distinct from x->>'inventory_unit' or i.source is distinct from x->>'source' or i.track_quantity is distinct from (x->>'track_quantity')::boolean) then return jsonb_build_object('code','STOCK_MAPPING_IMMUTABLE');end if;
  if x->>'catalog_product_id' is not null then
   select * into p from public.catalog_products where id=(x->>'catalog_product_id')::uuid;
   if i.id is null then
   perform app_private.lock_brand_catalog(p.catalog_id);select * into p from public.catalog_products where id=(x->>'catalog_product_id')::uuid;select * into release from public.brand_catalog_releases where id=p.catalog_id;
   if p.id is null or not p.active or release.state<>'PUBLISHED' or not (x->>'source'='GLOBAL_VERIFIED_CATALOG' and release.scope='GLOBAL' and p.verification_status='ELIFORA_VERIFIED' or x->>'source'='SALON_VERIFIED_PRODUCT' and release.organization_id=org and p.verification_status='SALON_VERIFIED') then return jsonb_build_object('code','STOCK_PRODUCT_MAPPING_REQUIRED');end if;
   end if;
  end if;
  insert into public.stock_items values(eid,org,loc,x->>'source',p.id,p.series_id,x->>'product_type',x->>'display_name',x->>'sku',x->>'barcode',x->>'inventory_unit',(x->>'active')::boolean,(x->>'track_quantity')::boolean,(x->>'lot_required')::boolean,(x->>'low_threshold')::numeric,expected+1,auth.uid(),auth.uid(),stamp,stamp)
  on conflict(id) do update set display_name=excluded.display_name,sku=excluded.sku,barcode=excluded.barcode,active=excluded.active,lot_required=excluded.lot_required,low_threshold=excluded.low_threshold,updated_by=excluded.updated_by,updated_at=excluded.updated_at,version=excluded.version;
  perform app_private.stock_audit(org,loc,case when i.id is null then 'ITEM_CREATED' when i.active and not (x->>'active')::boolean then 'ITEM_DEACTIVATED' else 'ITEM_CHANGED' end,eid,reason,correlation);
 elsif op='LOT_SAVE' then
  eid:=(q->>'id')::uuid;item:=(q->>'stock_item_id')::uuid;expected:=(q->>'expected_version')::bigint;
  select * into i from public.stock_items where id=item and organization_id=org and location_id=loc for update;
  if not found then return jsonb_build_object('code','STOCK_NOT_FOUND');end if;
  select * into l from public.stock_lots where id=eid and stock_item_id=item for update;
  if coalesce(l.version,0) is distinct from expected then return jsonb_build_object('code','STOCK_CONFLICT');end if;
  insert into public.stock_lots values(eid,org,loc,item,trim(q->>'lot_number'),q->>'batch_number',(q->>'expiry_date')::date,(q->>'opened_at')::timestamptz,(q->>'received_at')::timestamptz,expected+1,auth.uid(),auth.uid())
  on conflict(id) do update set lot_number=excluded.lot_number,batch_number=excluded.batch_number,expiry_date=excluded.expiry_date,opened_at=excluded.opened_at,received_at=excluded.received_at,version=excluded.version,updated_by=excluded.updated_by;
  perform app_private.stock_audit(org,loc,case when l.id is null then 'LOT_CREATED' else 'LOT_CHANGED' end,eid,reason,correlation);
 elsif op='PROCESS_BATCH' then
  eid:=loc;
  for x in select jsonb_build_object('id',ev.id) from public.stock_source_events ev where ev.organization_id=org and ev.location_id=loc and ev.status='PENDING' order by ev.created_at,ev.id limit (q->>'limit')::integer for update skip locked loop
   perform app_private.stock_process_event((x->>'id')::uuid,null,correlation);
  end loop;
 elsif op='PROCESS' then
  eid:=(q->>'event_id')::uuid;
  if not exists(select 1 from public.stock_source_events where id=eid and organization_id=org and location_id=loc) then return jsonb_build_object('code','STOCK_NOT_FOUND');end if;
  result:=jsonb_build_object('data',app_private.stock_process_event(eid,(q->>'lot_id')::uuid,correlation));
  -- Failed delivery is deliberately retryable with a new attempt/mutation, never lost.
 elsif op='COUNT_CREATE' then
  eid:=(q->>'id')::uuid;
  if jsonb_typeof(q->'lines') is distinct from 'array' or jsonb_array_length(q->'lines') not between 1 and 50 or exists(select 1 from jsonb_array_elements(q->'lines') a group by a->>'stock_item_id',a->>'lot_id' having count(*)>1) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  perform 1 from public.stock_items where organization_id=org and location_id=loc and id in (select (a->>'stock_item_id')::uuid from jsonb_array_elements(q->'lines') a) order by id for update;
  insert into public.stock_counts values(eid,org,loc,'DRAFT',reason,auth.uid(),stamp,null,null);
  for x in select value from jsonb_array_elements(q->'lines') loop
   item:=(x->>'stock_item_id')::uuid;lot:=(x->>'lot_id')::uuid;qty:=(x->>'counted_quantity')::numeric;
   select * into i from public.stock_items where id=item and organization_id=org and location_id=loc;
   if not found or not i.active or not i.track_quantity or not exists(select 1 from public.stock_openings where stock_item_id=item and (lot is null or stock_lot_id=lot)) or i.lot_required and lot is null or qty is null or qty<0 or qty*100<>trunc(qty*100) or i.inventory_unit='UNIT' and qty<>trunc(qty) then raise exception using errcode='23514',message='STOCK_COUNT_INVALID';end if;
   insert into public.stock_count_lines values(eid,org,loc,item,lot,app_private.stock_balance(item,lot,lot is not null),qty);
  end loop;
 elsif op='COUNT_CONFIRM' then
  eid:=(q->>'id')::uuid;select * into c from public.stock_counts where id=eid and organization_id=org and location_id=loc for update;
  if not found then return jsonb_build_object('code','STOCK_NOT_FOUND');end if;
  if c.status<>'DRAFT' then return jsonb_build_object('code','STOCK_CONFLICT');end if;
  perform 1 from public.stock_items where id in (select stock_item_id from public.stock_count_lines where count_id=eid) order by id for update;
  if exists(select 1 from public.stock_count_lines line where line.count_id=eid and (line.ledger_quantity<>app_private.stock_balance(line.stock_item_id,line.stock_lot_id,line.stock_lot_id is not null) or exists(select 1 from public.stock_source_events ev join public.catalog_products prod on prod.id=ev.product_id join public.stock_items si on si.catalog_series_id=prod.series_id and si.id=line.stock_item_id where ev.location_id=loc and ev.status<>'PROCESSED'))) then return jsonb_build_object('code','STOCK_COUNT_STALE');end if;
  for x in select to_jsonb(line) from public.stock_count_lines line where count_id=eid loop
   delta:=(x->>'counted_quantity')::numeric-(x->>'ledger_quantity')::numeric;
   if delta<>0 then
    select * into i from public.stock_items where id=(x->>'stock_item_id')::uuid;
    insert into public.stock_movements(organization_id,location_id,stock_item_id,stock_lot_id,movement_type,quantity_delta,unit,reason,recorded_by,occurred_at,correlation_id,mutation_id)
    values(org,loc,i.id,(x->>'stock_lot_id')::uuid,case when delta>0 then 'ADJUSTMENT_IN' else 'ADJUSTMENT_OUT' end,delta,i.inventory_unit,reason,auth.uid(),stamp,correlation,mid);
   end if;
  end loop;
  update public.stock_counts set status='CONFIRMED',confirmed_by=auth.uid(),confirmed_at=stamp where id=eid;
 else
  if op='REVERSAL' then
   select * into mv from public.stock_movements where id=(q->>'movement_id')::uuid and organization_id=org and location_id=loc;
   if not found then return jsonb_build_object('code','STOCK_NOT_FOUND');end if;
   if mv.source_event_id is not null or mv.movement_type in ('REVERSAL','TRANSFER_IN','TRANSFER_OUT') then return jsonb_build_object('code','STOCK_SOURCE_IMMUTABLE');end if;
   item:=mv.stock_item_id;lot:=mv.stock_lot_id;delta:=-mv.quantity_delta;
  else
   item:=(q->>'stock_item_id')::uuid;lot:=(q->>'lot_id')::uuid;qty:=(q->>'quantity')::numeric;
   if qty is null or qty<0 or qty=0 and op<>'OPENING' or qty>9999999999.99 or qty*100<>trunc(qty*100) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
   delta:=case when op='ADJUSTMENT_OUT' then -qty else qty end;
  end if;
  select * into i from public.stock_items where id=item and organization_id=org and location_id=loc for update;
  if not found or not i.active or not i.track_quantity then return jsonb_build_object('code','STOCK_NOT_FOUND');end if;
  if op<>'REVERSAL' and q->>'unit' is distinct from i.inventory_unit or i.inventory_unit='UNIT' and delta<>trunc(delta) then return jsonb_build_object('code','UNIT_CONVERSION_REQUIRED');end if;
  if i.lot_required and lot is null then return jsonb_build_object('code','STOCK_LOT_REQUIRED');end if;
  if lot is not null and not exists(select 1 from public.stock_lots where id=lot and stock_item_id=item) then return jsonb_build_object('code','STOCK_LOT_CONFLICT');end if;
  if op<>'OPENING' and not exists(select 1 from public.stock_openings where stock_item_id=item and (lot is null or stock_lot_id=lot)) then return jsonb_build_object('code','STOCK_OPENING_REQUIRED');end if;
  select negative_policy into policy from public.stock_settings where location_id=loc;
  if policy='BLOCK_NEGATIVE' and (app_private.stock_balance(item)+delta<0 or lot is not null and app_private.stock_balance(item,lot,true)+delta<0) then return jsonb_build_object('code','STOCK_INSUFFICIENT');end if;
  eid:=gen_random_uuid();
  if op='OPENING' then
   if exists(select 1 from public.stock_movements where stock_item_id=item and (lot is null or stock_lot_id=lot)) then return jsonb_build_object('code','STOCK_CONFLICT');end if;
   insert into public.stock_openings values(eid,org,loc,item,lot,qty,auth.uid(),stamp);
  end if;
  if delta<>0 then
  insert into public.stock_movements(id,organization_id,location_id,stock_item_id,stock_lot_id,movement_type,quantity_delta,unit,reversal_of,reason,reference,recorded_by,occurred_at,correlation_id,mutation_id)
  values(eid,org,loc,item,lot,op,delta,i.inventory_unit,case when op='REVERSAL' then mv.id end,reason,q->>'reference',auth.uid(),coalesce((q->>'occurred_at')::timestamptz,stamp),correlation,mid);
  end if;
  if app_private.stock_balance(item)<0 then perform app_private.stock_audit(org,loc,'NEGATIVE_OVERRIDE',item,reason,correlation);end if;
 end if;
 end if;
 if result is null then result:=jsonb_build_object('data',jsonb_build_object('id',eid,'status','SAVED'));end if;
 if op not in ('PROCESS','PROCESS_BATCH') then perform app_private.stock_audit(org,loc,op,eid,reason,correlation);end if;
 insert into app_private.stock_receipts values(org,auth.uid(),mid,q||jsonb_build_object('_location',loc),result);return result;
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or check_violation or not_null_violation or foreign_key_violation then return jsonb_build_object('code','VALIDATION_FAILED');when unique_violation then return jsonb_build_object('code','STOCK_CONFLICT');end $$;

