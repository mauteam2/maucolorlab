-- Direct authenticated RPC callers receive the same primitive shape restrictions
-- as the shared Web contract; server authorization never relies on Web validation.
do $$declare body text;anchor text;checks text;begin
 body:=pg_get_functiondef('app_private.finance_core(uuid,uuid,jsonb,uuid)'::regprocedure);
 anchor:=' -- Shared Gate 1 organization protocol';
 checks:=$validation$
 if exists(select 1 from jsonb_each(q) e where e.key in ('id','client_id','payment_id','document_id','original_payment_id','stock_item_id') and (jsonb_typeof(e.value)<>'string' or e.value#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if exists(select 1 from jsonb_each(q) e where e.key in ('appointment_id','lot_id','stock_receipt_id') and e.value<>'null'::jsonb and (jsonb_typeof(e.value)<>'string' or e.value#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if op='SERVICE_CHARGE' and q->'appointment_id'='null'::jsonb then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if exists(select 1 from jsonb_each(q) e where e.key in ('currency','occurred_at','description','method','category','direction') and jsonb_typeof(e.value)<>'string') or (q ? 'external_reference' and q->'external_reference'<>'null'::jsonb and jsonb_typeof(q->'external_reference')<>'string') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if q ? 'description' and char_length(trim(q->>'description')) not between 1 and 500 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if q ? 'external_reference' and char_length(q->>'external_reference')>160 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if q ? 'allocations' then
  if jsonb_typeof(q->'allocations')<>'array' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  if exists(select 1 from jsonb_array_elements(q->'allocations') a where jsonb_typeof(a)<>'object' or jsonb_typeof(a->'charge_id') is distinct from 'string') or (select count(*)<>count(distinct a->>'charge_id') from jsonb_array_elements(q->'allocations') a) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 end if;
$validation$;
 if position(anchor in body)=0 then raise exception 'Finance validation anchor changed';end if;
 execute replace(body,anchor,checks||anchor);
end $$;
