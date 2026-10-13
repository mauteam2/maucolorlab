-- Reports consume the existing Stock decision function, including threshold
-- equality, untracked items, missing openings and pending source uncertainty.
do $migration$ declare body text;begin
 body:=pg_get_functiondef('app_private.report_project(uuid,uuid,text,uuid)'::regprocedure);
 body:=replace(body,'row_data.quantity:=case when n is not null or exists(select 1 from public.stock_openings where stock_item_id=eid) then coalesce(n,0) end;',
  'row_data.quantity:=case when i.track_quantity and exists(select 1 from public.stock_openings where stock_item_id=eid) then app_private.stock_balance(eid) end;');
 body:=replace(body,'row_data.status:=case when not i.active then ''ARCHIVED'' when row_data.quantity is null then ''UNKNOWN'' when row_data.quantity<=0 then ''OUT'' when i.low_threshold is not null and row_data.quantity<i.low_threshold then ''LOW'' else ''OK'' end;',
  'row_data.status:=case when not i.active then ''ARCHIVED'' else app_private.stock_item_status(i) end;');
 -- The shared balance implementation makes the separate local sum unnecessary.
 body:=replace(body,'  select sum(quantity_delta) into n from public.stock_movements where stock_item_id=eid;','');
 execute body;
 body:=pg_get_functiondef('app_private.report_source_changed()'::regprocedure);
 body:=replace(body,' if tg_table_name=''stock_movements'' then', $block$
 if tg_table_name='stock_source_events' then
  for link in select si.id from public.stock_items si join public.catalog_products p on p.series_id=si.catalog_series_id
   where si.organization_id=org and si.location_id=loc and p.id=(j->>'product_id')::uuid loop
   perform app_private.report_enqueue(org,loc,'STOCK_ITEM',link.id);
  end loop;
 end if;
 if tg_table_name='stock_movements' then
$block$);
 execute body;
 body:=pg_get_functiondef('public.reporting_operation(uuid,uuid,jsonb,uuid)'::regprocedure);
 body:=replace(body,'declare ctx jsonb;org uuid;','declare ctx jsonb;previous_settings jsonb;org uuid;');
 body:=replace(body,'  select version into v from public.report_settings',
  '  select jsonb_build_object(''version'',s.version,''coverage_warning_bps'',s.coverage_warning_bps,''cancellation_warning_bps'',s.cancellation_warning_bps) into previous_settings from public.report_settings s where s.organization_id=org and s.location_id=p_location_id;
  select version into v from public.report_settings');
 body:=replace(body,'org:=(ctx->>''organization_id'')::uuid;', $block$
 org:=(ctx->>'organization_id')::uuid;
 -- Same membership lifecycle protocol as other authorized domain writers.
 perform pg_advisory_xact_lock_shared(hashtextextended(org::text,0));
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,case when op='EXPORT' then 'reports.export' else 'reports.manage' end);
 if ctx ? 'code' then return ctx;end if;
$block$);
 body:=replace(body,'jsonb_build_object(''metric_version'',1),p_correlation_id)', $block$
 (jsonb_build_object('metric_version',1)||case when op='SETTINGS' then jsonb_build_object('previous_settings',previous_settings,
 'new_settings',(select jsonb_build_object('version',s.version,'coverage_warning_bps',s.coverage_warning_bps,'cancellation_warning_bps',s.cancellation_warning_bps) from public.report_settings s where s.organization_id=org and s.location_id=p_location_id))
 when op='EXPORT' then jsonb_build_object('kind',ctx->'data'->>'kind','period',ctx->'data'->'period','source_rows',jsonb_array_length(ctx->'data'->'items'))
 else '{}'::jsonb end),p_correlation_id)
$block$);
 execute body;
 body:=pg_get_functiondef('app_private.report_metrics(uuid,uuid,timestamptz,timestamptz,uuid,uuid,text,text[])'::regprocedure);
 body:=replace(body,'and domain=''STOCK_ITEM'';','and domain=''STOCK_ITEM'' and status<>''ARCHIVED'';');execute body;
end $migration$;
