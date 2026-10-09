-- Forward, bounded selectors use real lot identities instead of manual UUID entry.
do $$declare body text;begin
 body:=pg_get_functiondef('public.finance_snapshot(uuid,uuid,jsonb)'::regprocedure);
 if position('stock jsonb;' in body)=0 then raise exception 'Finance snapshot declaration changed';end if;
 body:=replace(body,'stock jsonb;','stock jsonb;lots jsonb;');
 body:=replace(body,'select i.id,i.display_name,i.inventory_unit from public.stock_items','select i.id,i.display_name,i.inventory_unit,i.lot_required from public.stock_items');
 body:=replace(body,' return jsonb_build_object(''data'',app_private.finance_json(',
 ' select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) into lots from(select l.id,l.stock_item_id,l.lot_number,l.batch_number,l.expiry_date from public.stock_lots l where l.organization_id=org and l.location_id=p_location_id order by l.lot_number,l.id limit 200) x;'||E'\n'||' return jsonb_build_object(''data'',app_private.finance_json(');
 body:=replace(body,'''stock_items'',stock,''offset'',offset_rows','''stock_items'',stock,''stock_lots'',lots,''offset'',offset_rows');
 execute body;
 body:=pg_get_functiondef('app_private.finance_retail_stock(uuid,uuid,uuid,numeric,uuid)'::regprocedure);
 body:=replace(body,'balance numeric;begin','balance numeric;negative_override boolean:=false;begin');
 body:=replace(body,'if setting.negative_policy=''BLOCK_NEGATIVE'' and balance<qty then','if balance<qty then negative_override:=true;end if;if setting.negative_policy=''BLOCK_NEGATIVE'' and balance<qty then');
 body:=replace(body,'jsonb_build_object(''finance_document_id'',doc)','jsonb_build_object(''finance_document_id'',doc,''negative_override'',negative_override)');
 execute body;
end $$;
