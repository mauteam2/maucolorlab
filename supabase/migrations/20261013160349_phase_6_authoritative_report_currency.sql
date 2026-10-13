-- Monetary display follows the registered Finance currency, never an editable
-- organization display preference. Pre-cutover empty views use setup currency.
do $migration$ declare body text;begin
 body:=pg_get_functiondef('public.reporting_snapshot(uuid,uuid,jsonb)'::regprocedure);
 body:=replace(body,'''currency'',(select base_currency from public.organizations where id=org)',
  '''currency'',coalesce((select currency from public.finance_settings where organization_id=org),(select base_currency from public.organizations where id=org))');
 execute body;
end $migration$;
