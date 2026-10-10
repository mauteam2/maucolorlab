-- Full totals remain authoritative; provenance pages are bounded and explicitly flagged.
do $migration$ declare body text;begin
 body:=pg_get_functiondef('app_private.profitability_breakdown(uuid,boolean,boolean)'::regprocedure);
 body:=replace(body,'from public.commission_adjustments x where accrual_id=(accrual->>''id'')::uuid;','from (select * from public.commission_adjustments where accrual_id=(accrual->>''id'')::uuid order by created_at,id limit 200) x;');
 body:=replace(body,'from public.profitability_adjustments x where charge_id=cid)','from (select * from public.profitability_adjustments where charge_id=cid order by created_at,id limit 200) x)');
 body:=replace(body,'jsonb_array_length(facts)>=200','jsonb_array_length(facts)>=200 or jsonb_array_length(adjustments)>=200 or (select count(*)>=200 from public.profitability_adjustments where charge_id=cid)');
 execute body;
end $migration$;
