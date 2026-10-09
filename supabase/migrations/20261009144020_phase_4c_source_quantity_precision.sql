-- Forward: reject unrepresentable raw-component minor units; never round technical truth.
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
 if amount is null then err:='STOCK_USAGE_RECONCILIATION_REQUIRED';
 elsif amount*100<>trunc(amount*100) then err:='UNIT_CONVERSION_REQUIRED';end if;
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

