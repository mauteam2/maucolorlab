-- PostgreSQL NUMERIC can retain a .00 display scale despite integral constraints.
-- Serialize exact integer rationals canonically, without JS floating conversion.
do $migration$ declare body text;field text;begin
 body:=pg_get_functiondef('app_private.profitability_breakdown(uuid,boolean,boolean)'::regprocedure);
 foreach field in array array['unit_cost_numerator','unit_cost_denominator'] loop
  body:=replace(body,'f.'||field||'::text','trunc(f.'||field||')::text');
 end loop;execute body;
 body:=pg_get_functiondef('public.costing_snapshot(uuid,uuid,jsonb)'::regprocedure);
 foreach field in array array['quantity_hundredths','value_numerator','value_denominator','incoming_numerator','incoming_denominator'] loop
  body:=replace(body,'x.'||field||'::text','trunc(x.'||field||')::text');
 end loop;execute body;
end $migration$;
