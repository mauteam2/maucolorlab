-- Direct PostgREST callers receive the same strict shape/type boundary as Web.
create function app_private.stock_shape(v jsonb,types jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and
 not exists(select 1 from jsonb_object_keys(v) k where not types ? k) and
 not exists(select 1 from jsonb_each_text(types) t where not coalesce(jsonb_typeof(v->t.key)=any(string_to_array(t.value,'|')),false)),false);
$$;
revoke all on function app_private.stock_shape(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function app_private.stock_shape(jsonb,jsonb) to elifora_stock_writer;
alter function app_private.stock_operation(uuid,uuid,jsonb,uuid) rename to stock_operation_core;
revoke all on function app_private.stock_operation_core(uuid,uuid,jsonb,uuid) from authenticated;
create function app_private.stock_operation(member uuid,loc uuid,q jsonb,correlation uuid) returns jsonb language plpgsql volatile security definer set search_path='' set row_security='on' as $$
declare t text:=q->>'type';types jsonb:='{"type":"string","mutation_id":"string"}';x jsonb;
begin
 types:=types||case t
 when 'ENABLE' then '{"reason":"string"}'::jsonb
 when 'POLICY' then '{"negative_policy":"string","expected_version":"number","reason":"string"}'::jsonb
 when 'ITEM_SAVE' then '{"id":"string","expected_version":"number","definition":"object","reason":"string"}'::jsonb
 when 'LOT_SAVE' then '{"id":"string","expected_version":"number","stock_item_id":"string","lot_number":"string","batch_number":"string|null","expiry_date":"string|null","opened_at":"string|null","received_at":"string","reason":"string"}'::jsonb
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
 return app_private.stock_operation_core(member,loc,q,correlation);
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then return jsonb_build_object('code','VALIDATION_FAILED');end $$;
grant create on schema app_private to elifora_stock_writer;
alter function app_private.stock_operation(uuid,uuid,jsonb,uuid) owner to elifora_stock_writer;
revoke create on schema app_private from elifora_stock_writer;
revoke all on function app_private.stock_operation(uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function app_private.stock_operation(uuid,uuid,jsonb,uuid) to authenticated;
