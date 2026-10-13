-- Disposable projections must not introduce new lifecycle authority.
do $$declare t text;c record;begin
 foreach t in array array['app_private.report_facts','app_private.report_invalidations','app_private.report_state','public.report_settings'] loop
  for c in select conname from pg_constraint where conrelid=t::regclass and confrelid='public.locations'::regclass loop
   execute format('alter table %s drop constraint %I',t,c.conname);
   execute format('alter table %s add constraint %I foreign key(organization_id,location_id) references public.locations(organization_id,id) on delete cascade',t,c.conname);
  end loop;
 end loop;
end$$;
do $migration$ declare body text;begin
 body:=pg_get_functiondef('public.reporting_operation(uuid,uuid,jsonb,uuid)'::regprocedure);
 body:=replace(body,'if op not in','if coalesce(op,'''') not in');
 body:=replace(body,'jsonb_typeof(p_command->''expected_version'')<>''number''','jsonb_typeof(p_command->''expected_version'') is distinct from ''number'' or not (p_command ?& array[''coverage_warning_bps'',''cancellation_warning_bps''])');
 execute body;
 body:=pg_get_functiondef('public.reporting_snapshot(uuid,uuid,jsonb)'::regprocedure);
 body:=replace(body,'''period'',period,''freshness'',fresh,', $block$
 'coverage',case when 'COST'=any(domains) then jsonb_build_object(
 'known',(select m->>'value' from jsonb_array_elements(current_metrics) m where m->>'name'='known_transactions'),
 'partial',(select m->>'value' from jsonb_array_elements(current_metrics) m where m->>'name'='partial_transactions'),
 'unknown',(select m->>'value' from jsonb_array_elements(current_metrics) m where m->>'name'='unknown_transactions'),
 'eligible',(select m->>'value' from jsonb_array_elements(current_metrics) m where m->>'name'='eligible_transactions'),
 'count_bps',(select m->>'value' from jsonb_array_elements(current_metrics) m where m->>'name'='known_count_coverage_bps'),
 'revenue_bps',(select m->>'value' from jsonb_array_elements(current_metrics) m where m->>'name'='known_revenue_coverage_bps')) end,
 'period',period,'freshness',fresh,
$block$);
 -- Only a view with revenue/cost metrics has an eligible coverage denominator.
 body:=replace(body,'''coverage'',case when ''COST''=any(domains) then','''coverage'',case when ''COST''=any(domains) and ''REVENUE''=any(domains) then');
 execute body;
end $migration$;
