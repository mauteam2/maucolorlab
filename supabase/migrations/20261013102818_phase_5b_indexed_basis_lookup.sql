-- IS NOT DISTINCT FROM a PL/pgSQL variable becomes a generic-plan filter.
-- Use the EXISTING coalesced-lot unique version index for bounded last-basis reads.
do $migration$ declare body text;signature regprocedure;begin
 foreach signature in array array['app_private.cost_stock_posted()'::regprocedure,'public.costing_operation(uuid,uuid,jsonb,uuid)'::regprocedure] loop
  body:=pg_get_functiondef(signature);
  body:=replace(body,'stock_lot_id is not distinct from m.stock_lot_id',$lookup$coalesce(stock_lot_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(m.stock_lot_id,'00000000-0000-0000-0000-000000000000'::uuid)$lookup$);
  body:=replace(body,'stock_lot_id is not distinct from lot',$lookup$coalesce(stock_lot_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(lot,'00000000-0000-0000-0000-000000000000'::uuid)$lookup$);
  execute body;
 end loop;
end $migration$;
