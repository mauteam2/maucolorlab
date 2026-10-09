-- ELIFORA Phase 4C. Inventory is an immutable decimal ledger, never a mutable balance.
create role elifora_stock_writer nologin nobypassrls;
grant authenticated to elifora_stock_writer;
grant elifora_stock_writer to postgres;
grant usage on schema public,app_private,extensions to elifora_stock_writer;
grant execute on function app_private.hair_write_context(uuid,uuid,text) to elifora_stock_writer;
insert into public.permissions(code,description) values
 ('stock.view','Read location inventory.'),('stock.receive','Receive inventory.'),('stock.adjust','Adjust inventory and retry trusted Live outbox.'),
 ('stock.count','Record and confirm physical counts.'),('stock.manage_items','Manage stock items and cutover.'),('stock.manage_lots','Manage traceability lots.');
insert into public.role_permissions(role_code,permission_code)
 select r,p from unnest(array['owner','manager']) r cross join unnest(array['stock.view','stock.receive','stock.adjust','stock.count','stock.manage_items','stock.manage_lots']) p;
insert into public.role_permissions(role_code,permission_code) select r,'stock.view' from unnest(array['colorist','assistant','reception']) r;

create table public.stock_settings(
 organization_id uuid not null,location_id uuid primary key,enabled_at timestamptz not null,
 negative_policy text not null default 'BLOCK_NEGATIVE' check(negative_policy in ('BLOCK_NEGATIVE','WARN_NEGATIVE')),
 version bigint not null default 1,updated_by uuid not null references public.profiles(user_id),
 foreign key(organization_id,location_id) references public.locations(organization_id,id)
);
create table public.stock_items(
 id uuid primary key,organization_id uuid not null,location_id uuid not null,
 source text not null check(source in ('GLOBAL_VERIFIED_CATALOG','SALON_VERIFIED_PRODUCT','SALON_CUSTOM_OPERATIONAL_PRODUCT')),
 catalog_product_id uuid references public.catalog_products(id),catalog_series_id uuid,
 product_type text not null check(product_type in ('COLOR','DEVELOPER','LIGHTENER','TONER','CORRECTOR','TREATMENT','SHAMPOO','CONDITIONER','RETAIL','DISPOSABLE','OTHER')),
 display_name text not null check(char_length(trim(display_name)) between 1 and 160),sku text,barcode text,
 inventory_unit text not null check(inventory_unit in ('GRAM','MILLILITER','UNIT')),active boolean not null default true,track_quantity boolean not null default true,
 lot_required boolean not null default false,low_threshold numeric(14,2) check(low_threshold>=0),
 version bigint not null default 1,created_by uuid not null references public.profiles(user_id),updated_by uuid not null references public.profiles(user_id),created_at timestamptz not null,updated_at timestamptz not null,
 unique(organization_id,location_id,id),unique(organization_id,location_id,catalog_series_id),
 foreign key(organization_id,location_id) references public.locations(organization_id,id),
 check((source='SALON_CUSTOM_OPERATIONAL_PRODUCT')=(catalog_product_id is null)),check((catalog_product_id is null)=(catalog_series_id is null)),
 check(sku is null or char_length(sku)<=80),check(barcode is null or char_length(barcode)<=80)
);
create index stock_items_directory on public.stock_items(organization_id,location_id,active,display_name,id);
create table public.stock_lots(
 id uuid primary key,organization_id uuid not null,location_id uuid not null,stock_item_id uuid not null,
 lot_number text not null check(char_length(trim(lot_number)) between 1 and 80),batch_number text,expiry_date date,opened_at timestamptz,received_at timestamptz not null,
 version bigint not null default 1,created_by uuid not null references public.profiles(user_id),updated_by uuid not null references public.profiles(user_id),
 unique(organization_id,location_id,stock_item_id,id),foreign key(organization_id,location_id,stock_item_id) references public.stock_items(organization_id,location_id,id)
);
create index stock_lots_expiry on public.stock_lots(organization_id,location_id,expiry_date,stock_item_id);
-- A measured zero opening is a fact even when it needs no nonzero ledger entry.
create table public.stock_openings(
 id uuid primary key,organization_id uuid not null,location_id uuid not null,stock_item_id uuid not null,stock_lot_id uuid,
 quantity numeric(14,2) not null check(quantity>=0),recorded_by uuid not null references public.profiles(user_id),recorded_at timestamptz not null,
 foreign key(organization_id,location_id,stock_item_id) references public.stock_items(organization_id,location_id,id),
 foreign key(organization_id,location_id,stock_item_id,stock_lot_id) references public.stock_lots(organization_id,location_id,stock_item_id,id)
);
create unique index stock_opening_scope on public.stock_openings(stock_item_id,coalesce(stock_lot_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table public.stock_source_events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,location_id uuid not null,session_id uuid not null,client_id uuid not null,bowl_id uuid not null,product_id uuid not null references public.catalog_products(id),
 source_domain text not null check(source_domain in ('LIVE_USAGE','MATERIAL_RECONCILIATION','LIVE_TERMINAL')),
 source_event_id uuid not null,usage_id uuid references public.live_usage(id),reconciliation_id uuid references public.live_material_reconciliations(id),
 status text not null default 'PENDING' check(status in ('PENDING','PROCESSED','FAILED')),error_code text,attempts integer not null default 0,created_at timestamptz not null default statement_timestamp(),processed_at timestamptz,
 unique(source_domain,source_event_id,product_id),unique(organization_id,location_id,id),
 foreign key(organization_id,location_id) references public.locations(organization_id,id),foreign key(organization_id,client_id,session_id) references public.live_sessions(organization_id,client_id,id)
);
create index stock_event_queue on public.stock_source_events(organization_id,location_id,status,created_at,id);
create index stock_event_bowl on public.stock_source_events(session_id,bowl_id,product_id);
create table public.stock_movements(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,location_id uuid not null,stock_item_id uuid not null,stock_lot_id uuid,
 movement_type text not null check(movement_type in ('OPENING','RECEIPT','USAGE','CORRECTION','ADJUSTMENT_IN','ADJUSTMENT_OUT','REVERSAL','TRANSFER_IN','TRANSFER_OUT')),
 quantity_delta numeric(14,2) not null check(quantity_delta<>0),unit text not null check(unit in ('GRAM','MILLILITER','UNIT')),
 source_event_id uuid references public.stock_source_events(id),source_session_id uuid,source_bowl_id uuid,source_product_id uuid references public.catalog_products(id),
 reversal_of uuid unique references public.stock_movements(id),transfer_id uuid,
 reason text not null check(char_length(trim(reason)) between 1 and 2000),reference text,
 recorded_by uuid not null references public.profiles(user_id),occurred_at timestamptz not null,created_at timestamptz not null default statement_timestamp(),correlation_id uuid not null,mutation_id uuid not null,
 unique(source_event_id),foreign key(organization_id,location_id,stock_item_id) references public.stock_items(organization_id,location_id,id),
 foreign key(organization_id,location_id,stock_item_id,stock_lot_id) references public.stock_lots(organization_id,location_id,stock_item_id,id),
 foreign key(organization_id,source_session_id) references public.live_sessions(organization_id,id),
 check((source_event_id is null)=(source_session_id is null)),check((movement_type in ('TRANSFER_IN','TRANSFER_OUT'))=(transfer_id is not null))
);
create index stock_movement_history on public.stock_movements(organization_id,location_id,stock_item_id,occurred_at desc,id);
create index stock_movement_lot on public.stock_movements(stock_lot_id,occurred_at desc);
create index stock_movement_consumption on public.stock_movements(source_session_id,source_bowl_id,source_product_id);
create index stock_movement_balance on public.stock_movements(stock_item_id,stock_lot_id) include(quantity_delta);
create unique index stock_one_opening on public.stock_movements(stock_item_id,coalesce(stock_lot_id,'00000000-0000-0000-0000-000000000000'::uuid)) where movement_type='OPENING';
create table public.stock_counts(
 id uuid primary key,organization_id uuid not null,location_id uuid not null,status text not null default 'DRAFT' check(status in ('DRAFT','CONFIRMED')),
 reason text not null,created_by uuid not null references public.profiles(user_id),created_at timestamptz not null,confirmed_by uuid references public.profiles(user_id),confirmed_at timestamptz,
 unique(organization_id,location_id,id),foreign key(organization_id,location_id) references public.locations(organization_id,id)
);
create table public.stock_count_lines(
 count_id uuid not null,organization_id uuid not null,location_id uuid not null,stock_item_id uuid not null,stock_lot_id uuid,
 ledger_quantity numeric(14,2) not null,counted_quantity numeric(14,2) not null check(counted_quantity>=0),
 unique(count_id,stock_item_id,stock_lot_id),foreign key(organization_id,location_id,count_id) references public.stock_counts(organization_id,location_id,id),
 foreign key(organization_id,location_id,stock_item_id) references public.stock_items(organization_id,location_id,id),
 foreign key(organization_id,location_id,stock_item_id,stock_lot_id) references public.stock_lots(organization_id,location_id,stock_item_id,id)
);
create table app_private.stock_receipts(organization_id uuid not null,actor_id uuid not null,mutation_id uuid not null,input jsonb not null,response jsonb not null,primary key(organization_id,actor_id,mutation_id));
grant select,insert on app_private.stock_receipts to elifora_stock_writer;

do $$declare t text;begin
 foreach t in array array['stock_settings','stock_items','stock_lots','stock_openings','stock_source_events','stock_movements','stock_counts','stock_count_lines'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant select,insert,update on public.%I to elifora_stock_writer',t);
 execute format('create policy stock_read on public.%I for select to authenticated using(app_private.user_has_permission(organization_id,location_id,''stock.view''))',t);
 execute format('create policy stock_writer on public.%I for all to elifora_stock_writer using(app_private.user_has_permission(organization_id,location_id,''stock.view'')) with check(app_private.user_has_permission(organization_id,location_id,''stock.view''))',t);
 end loop;
end $$;
revoke update on public.stock_movements,public.stock_count_lines,public.stock_openings from elifora_stock_writer;
create trigger stock_opening_immutable before update or delete on public.stock_openings for each row execute function app_private.live_immutable();
create trigger stock_movement_immutable before update or delete on public.stock_movements for each row execute function app_private.live_immutable();
create trigger stock_count_line_immutable before update or delete on public.stock_count_lines for each row execute function app_private.live_immutable();
grant insert on public.audit_events to elifora_stock_writer;
create policy stock_audit on public.audit_events for insert to elifora_stock_writer with check(actor_user_id=auth.uid() and action like 'stock.%' and entity_type='stock' and app_private.user_has_permission(organization_id,location_id,'stock.view'));

-- Trusted domain event creation shares the technical transaction. It takes NO stock locks.
-- Cutover excludes all pre-enable sessions, including late corrections to those sessions.
create function app_private.stock_enqueue() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.live_sessions%rowtype;b jsonb;r public.controlled_brand_recipes%rowtype;pid uuid;bid uuid;domain text;event uuid;
begin
 if tg_table_name='live_sessions' then
  if new.status not in ('COMPLETED','CANCELLED','ABORTED') or old.status in ('COMPLETED','CANCELLED','ABORTED') then return new;end if;s:=new;domain:='LIVE_TERMINAL';event:=s.id;
 else select * into s from public.live_sessions where id=new.session_id;domain:=case tg_table_name when 'live_usage' then 'LIVE_USAGE' else 'MATERIAL_RECONCILIATION' end;event:=new.id;end if;
 if not exists(select 1 from public.stock_settings st where st.organization_id=s.organization_id and st.location_id=s.location_id and s.created_at>=st.enabled_at) then return new;end if;
 if domain='LIVE_USAGE' then
  insert into public.stock_source_events(organization_id,location_id,session_id,client_id,bowl_id,product_id,source_domain,source_event_id,usage_id) values(s.organization_id,s.location_id,s.id,s.client_id,new.bowl_id,new.product_id,domain,event,event) on conflict do nothing;
 else
  for b in select value from jsonb_array_elements(s.payload->'bowls') loop
   bid:=(b->>'id')::uuid;if domain='MATERIAL_RECONCILIATION' and bid<>(to_jsonb(new)->>'bowl_id')::uuid then continue;end if;
   select * into r from public.controlled_brand_recipes where id=(b->>'recipeId')::uuid and organization_id=s.organization_id and client_id=s.client_id;
   foreach pid in array array[r.product_id,r.developer_id] loop
    insert into public.stock_source_events(organization_id,location_id,session_id,client_id,bowl_id,product_id,source_domain,source_event_id,reconciliation_id)
    values(s.organization_id,s.location_id,s.id,s.client_id,bid,pid,domain,event,case when domain='MATERIAL_RECONCILIATION' then event end) on conflict do nothing;
   end loop;
  end loop;
 end if;return new;
end $$;
revoke all on function app_private.stock_enqueue() from public,anon,authenticated,service_role;
create trigger stock_usage_outbox after insert on public.live_usage for each row execute function app_private.stock_enqueue();
create trigger stock_reconciliation_outbox after insert on public.live_material_reconciliations for each row execute function app_private.stock_enqueue();
create trigger stock_terminal_outbox after update on public.live_sessions for each row execute function app_private.stock_enqueue();

-- Minimum necessary private projection. No clinical payload reaches inventory operators.
create function app_private.stock_source_fact(eid uuid) returns numeric language plpgsql volatile security definer set search_path='' as $$
declare e public.stock_source_events%rowtype;amount numeric;r public.live_material_reconciliations%rowtype;
begin
 select * into e from public.stock_source_events where id=eid;
 if not app_private.user_has_permission(e.organization_id,e.location_id,'stock.adjust') then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select * into r from public.live_material_reconciliations where session_id=e.session_id and bowl_id=e.bowl_id order by recorded_at desc,id desc limit 1;
 -- Ordering follows the correction relation, not UUID/timestamp coincidence.
 if found then select prepared_grams/2 into amount from public.live_material_reconciliations x where x.session_id=e.session_id and x.bowl_id=e.bowl_id and not exists(select 1 from public.live_material_reconciliations y where y.supersedes_id=x.id);return amount;end if;
 select prepared_grams into amount from public.live_usage where session_id=e.session_id and bowl_id=e.bowl_id and product_id=e.product_id;
 return amount;
end $$;
revoke all on function app_private.stock_source_fact(uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.stock_source_fact(uuid) to elifora_stock_writer;

create function app_private.stock_balance(item uuid,lot uuid default null,lot_only boolean default false) returns numeric language sql volatile security invoker set search_path='' as $$
 select coalesce(sum(quantity_delta),0) from public.stock_movements where stock_item_id=item and (not lot_only or stock_lot_id is not distinct from lot);
$$;
grant execute on function app_private.stock_balance(uuid,uuid,boolean) to elifora_stock_writer;
revoke all on function app_private.stock_balance(uuid,uuid,boolean) from public,anon,authenticated,service_role;

create function app_private.stock_audit(org uuid,loc uuid,op text,eid uuid,reason text,correlation uuid) returns void language sql volatile security invoker set search_path='' as $$
 insert into public.audit_events(actor_user_id,organization_id,location_id,action,entity_type,entity_id,reason,metadata,correlation_id)
 values(auth.uid(),org,loc,'stock.'||lower(op),'stock',eid,reason,'{}',correlation);
$$;
revoke all on function app_private.stock_audit(uuid,uuid,text,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.stock_audit(uuid,uuid,text,uuid,text,uuid) to elifora_stock_writer;

-- Queue consumer lock order: event row -> item row -> lot row. No tenant/session/catalog locks.
-- All stock balance decisions serialize on the item row; unrelated items proceed independently.
create function app_private.stock_process_event(eid uuid,selected_lot uuid,correlation uuid) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare e public.stock_source_events%rowtype;i public.stock_items%rowtype;l public.stock_lots%rowtype;series uuid;amount numeric;applied numeric;delta numeric;previous_lot uuid;err text;policy text;
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
  if found then if selected_lot is not null and selected_lot is distinct from previous_lot then err:='STOCK_LOT_CONFLICT';end if;selected_lot:=previous_lot;end if;
  if i.lot_required and selected_lot is null then err:='STOCK_LOT_REQUIRED';end if;
  if selected_lot is not null then
   select * into l from public.stock_lots where id=selected_lot and stock_item_id=i.id for update;
   if not found then err:='STOCK_LOT_CONFLICT';end if;
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
revoke all on function app_private.stock_process_event(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.stock_process_event(uuid,uuid,uuid) to elifora_stock_writer;

create function app_private.stock_operation(member uuid,loc uuid,q jsonb,correlation uuid) returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare ctx jsonb;org uuid;op text:=q->>'type';permission text;allowed text[];mid uuid;eid uuid;item uuid;lot uuid;qty numeric;balance numeric;delta numeric;expected bigint;stamp timestamptz:=statement_timestamp();reason text;result jsonb;receipt app_private.stock_receipts%rowtype;i public.stock_items%rowtype;l public.stock_lots%rowtype;c public.stock_counts%rowtype;p public.catalog_products%rowtype;release public.brand_catalog_releases%rowtype;x jsonb;policy text;mv public.stock_movements%rowtype;
begin
 permission:=case when op in ('ENABLE','POLICY','ITEM_SAVE') then 'stock.manage_items' when op='LOT_SAVE' then 'stock.manage_lots' when op in ('OPENING','RECEIPT') then 'stock.receive' when op in ('COUNT_CREATE','COUNT_CONFIRM') then 'stock.count' when op in ('ADJUSTMENT_IN','ADJUSTMENT_OUT','REVERSAL','PROCESS') then 'stock.adjust' end;
 if permission is null or correlation is null or jsonb_typeof(q)<>'object' or pg_column_size(q)>32768 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 ctx:=app_private.hair_write_context(member,loc,permission);if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 allowed:=case op when 'ENABLE' then array['type','mutation_id','reason'] when 'POLICY' then array['type','mutation_id','negative_policy','expected_version','reason'] when 'ITEM_SAVE' then array['type','mutation_id','id','expected_version','definition','reason'] when 'LOT_SAVE' then array['type','mutation_id','id','expected_version','stock_item_id','lot_number','batch_number','expiry_date','opened_at','received_at','reason'] when 'PROCESS' then array['type','mutation_id','event_id','lot_id'] when 'COUNT_CREATE' then array['type','mutation_id','id','lines','reason'] when 'COUNT_CONFIRM' then array['type','mutation_id','id','reason'] when 'REVERSAL' then array['type','mutation_id','movement_id','reason'] else array['type','mutation_id','stock_item_id','lot_id','quantity','unit','occurred_at','reference','reason'] end;
 if exists(select 1 from jsonb_object_keys(q) k where k<>all(allowed)) or jsonb_typeof(q->'mutation_id') is distinct from 'string' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 mid:=(q->>'mutation_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(org::text||auth.uid()::text||mid::text,4));
 ctx:=app_private.hair_write_context(member,loc,permission);if ctx ? 'code' then return ctx;end if;
 select * into receipt from app_private.stock_receipts where organization_id=org and actor_id=auth.uid() and mutation_id=mid;
 if found then if receipt.input is distinct from q||jsonb_build_object('_location',loc) then return jsonb_build_object('code','STOCK_CONFLICT');end if;return receipt.response;end if;
 reason:=trim(q->>'reason');if op<>'PROCESS' and (reason is null or char_length(reason) not between 1 and 2000) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
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
 elsif op='LOT_SAVE' then
  eid:=(q->>'id')::uuid;item:=(q->>'stock_item_id')::uuid;expected:=(q->>'expected_version')::bigint;
  select * into i from public.stock_items where id=item and organization_id=org and location_id=loc for update;
  if not found then return jsonb_build_object('code','STOCK_NOT_FOUND');end if;
  select * into l from public.stock_lots where id=eid and stock_item_id=item for update;
  if coalesce(l.version,0) is distinct from expected then return jsonb_build_object('code','STOCK_CONFLICT');end if;
  insert into public.stock_lots values(eid,org,loc,item,trim(q->>'lot_number'),q->>'batch_number',(q->>'expiry_date')::date,(q->>'opened_at')::timestamptz,(q->>'received_at')::timestamptz,expected+1,auth.uid(),auth.uid())
  on conflict(id) do update set lot_number=excluded.lot_number,batch_number=excluded.batch_number,expiry_date=excluded.expiry_date,opened_at=excluded.opened_at,received_at=excluded.received_at,version=excluded.version,updated_by=excluded.updated_by;
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
   if not found or not i.active or not i.track_quantity or i.lot_required and lot is null or qty is null or qty<0 or qty*100<>trunc(qty*100) or i.inventory_unit='UNIT' and qty<>trunc(qty) then raise exception using errcode='23514',message='STOCK_COUNT_INVALID';end if;
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
 if op<>'PROCESS' then perform app_private.stock_audit(org,loc,op,eid,reason,correlation);end if;
 insert into app_private.stock_receipts values(org,auth.uid(),mid,q||jsonb_build_object('_location',loc),result);return result;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or foreign_key_violation then return jsonb_build_object('code','VALIDATION_FAILED');when unique_violation then return jsonb_build_object('code','STOCK_CONFLICT');end $$;

grant create on schema app_private to elifora_stock_writer;
alter function app_private.stock_operation(uuid,uuid,jsonb,uuid) owner to elifora_stock_writer;
revoke create on schema app_private from elifora_stock_writer;
revoke all on function app_private.stock_operation(uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function app_private.stock_operation(uuid,uuid,jsonb,uuid) to authenticated;
create function public.stock_operation(p_membership_id uuid,p_location_id uuid,p_command jsonb,p_correlation_id uuid) returns jsonb language sql volatile security invoker set search_path='' as $$select app_private.stock_operation(p_membership_id,p_location_id,p_command,p_correlation_id);$$;
revoke all on function public.stock_operation(uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function public.stock_operation(uuid,uuid,jsonb,uuid) to authenticated;

create function app_private.stock_snapshot(member uuid,loc uuid,q jsonb) returns jsonb language plpgsql volatile security definer set search_path='' set row_security='on' as $$
declare ctx jsonb;org uuid;item uuid;search text;off integer;result jsonb;items jsonb;lot uuid;
begin
 ctx:=app_private.hair_write_context(member,loc,'stock.view');if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 if jsonb_typeof(q)<>'object' or exists(select 1 from jsonb_object_keys(q) k where k not in ('query','offset','item_id','lot_id')) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 search:=coalesce(q->>'query','');off:=coalesce((q->>'offset')::integer,0);item:=(q->>'item_id')::uuid;lot:=(q->>'lot_id')::uuid;
 if char_length(search)>80 or off not between 0 and 10000 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if item is not null and not exists(select 1 from public.stock_items where id=item and organization_id=org and location_id=loc) then return jsonb_build_object('code','STOCK_NOT_FOUND');end if;
 select coalesce(jsonb_agg(value),'[]') into items from (
 select to_jsonb(i)||jsonb_build_object('on_hand',case when i.track_quantity and exists(select 1 from public.stock_openings where stock_item_id=i.id) then app_private.stock_balance(i.id) end,'stock_sync_status',case when exists(select 1 from public.stock_source_events e join public.catalog_products p on p.id=e.product_id where e.organization_id=org and e.location_id=loc and p.series_id=i.catalog_series_id and e.status<>'PROCESSED') then 'RETRY_REQUIRED' else 'CURRENT' end,
 'stock_status',case when not i.track_quantity or not exists(select 1 from public.stock_openings where stock_item_id=i.id) or exists(select 1 from public.stock_source_events e join public.catalog_products p on p.id=e.product_id where e.organization_id=org and e.location_id=loc and p.series_id=i.catalog_series_id and e.status<>'PROCESSED') then 'UNKNOWN' when app_private.stock_balance(i.id)<=0 then 'OUT' when i.low_threshold is not null and app_private.stock_balance(i.id)<=i.low_threshold then 'LOW' else 'OK' end) value
 from public.stock_items i left join public.catalog_products p on p.id=i.catalog_product_id where i.organization_id=org and i.location_id=loc and (item is null or i.id=item) and (search='' or i.display_name ilike '%'||search||'%' or i.sku ilike '%'||search||'%' or i.barcode ilike '%'||search||'%' or p.manufacturer_code ilike '%'||search||'%') order by i.display_name,i.id limit 50 offset off) bounded;
 result:=jsonb_build_object('settings',(select to_jsonb(s) from public.stock_settings s where s.organization_id=org and s.location_id=loc),'items',items,'offset',off,
 'total_items',(select count(*) from public.stock_items where organization_id=org and location_id=loc),
 'lots',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('on_hand',app_private.stock_balance(l.stock_item_id,l.id,true),'expiry_status',case when l.expiry_date<current_date then 'EXPIRED' when l.expiry_date<=current_date+30 then 'EXPIRING_SOON' else 'UNKNOWN_OR_CURRENT' end)) from (select * from public.stock_lots where organization_id=org and location_id=loc and (item is null or stock_item_id=item) order by expiry_date nulls last,id limit 100) l),'[]'),
 'movements',coalesce((select jsonb_agg(to_jsonb(m)) from (select * from public.stock_movements where organization_id=org and location_id=loc and (item is null or stock_item_id=item) order by occurred_at desc,id limit 100) m),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select * from public.stock_source_events where organization_id=org and location_id=loc and status<>'PROCESSED' order by created_at,id limit 100) e),'[]'),
 'counts',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('lines',(select jsonb_agg(to_jsonb(l)) from public.stock_count_lines l where l.count_id=c.id))) from (select * from public.stock_counts where organization_id=org and location_id=loc order by created_at desc limit 20) c),'[]'),
 'monitoring',jsonb_build_object('pending',(select count(*) from public.stock_source_events where organization_id=org and location_id=loc and status='PENDING'),'failed',(select count(*) from public.stock_source_events where organization_id=org and location_id=loc and status='FAILED'),'unreconciled',(select count(*) from public.stock_source_events where organization_id=org and location_id=loc and error_code='STOCK_USAGE_RECONCILIATION_REQUIRED')),
 'catalog_options',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'manufacturer_code',p.manufacturer_code,'product_type',p.product_type,'source',case when c.scope='GLOBAL' then 'GLOBAL_VERIFIED_CATALOG' else 'SALON_VERIFIED_PRODUCT' end)) from (select * from public.catalog_products where active and verification_status in ('ELIFORA_VERIFIED','SALON_VERIFIED') order by display_name,id limit 500) p join public.brand_catalog_releases c on c.id=p.catalog_id and c.state='PUBLISHED'),'[]'));
 if lot is not null then
  if not app_private.user_has_permission(org,loc,'live_session.view') or not app_private.user_has_permission(org,loc,'clients.read') then return jsonb_build_object('code','FORBIDDEN');end if;
  result:=result||jsonb_build_object('trace',coalesce((select jsonb_agg(t) from (select distinct m.source_session_id session_id,s.client_id,link.appointment_id from public.stock_movements m join public.live_sessions s on s.id=m.source_session_id left join public.salon_appointment_live_links link on link.live_session_id=s.id where m.organization_id=org and m.location_id=loc and m.stock_lot_id=lot limit 100) t),'[]'));
 end if;
 return jsonb_build_object('data',result);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('code','VALIDATION_FAILED');end $$;
grant create on schema app_private to elifora_stock_writer;
alter function app_private.stock_snapshot(uuid,uuid,jsonb) owner to elifora_stock_writer;
revoke create on schema app_private from elifora_stock_writer;
revoke all on function app_private.stock_snapshot(uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function app_private.stock_snapshot(uuid,uuid,jsonb) to authenticated;
create function public.stock_snapshot(p_membership_id uuid,p_location_id uuid,p_request jsonb) returns jsonb language sql volatile security invoker set search_path='' as $$select app_private.stock_snapshot(p_membership_id,p_location_id,p_request);$$;
revoke all on function public.stock_snapshot(uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.stock_snapshot(uuid,uuid,jsonb) to authenticated;
