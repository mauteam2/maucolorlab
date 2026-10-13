-- Salon commands require an exact key set. Report filters are an optional,
-- controlled allowlist and must not reuse that command validator.
create function app_private.report_keys(v jsonb,allowed text[]) returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and not exists(select 1 from jsonb_object_keys(v) k where k<>all(allowed)),false);
$$;
revoke all on function app_private.report_keys(jsonb,text[]) from public,anon,authenticated,service_role;
do $migration$ declare body text;f text;begin
 foreach f in array array['public.reporting_snapshot(uuid,uuid,jsonb)','public.reporting_operation(uuid,uuid,jsonb,uuid)'] loop
  body:=pg_get_functiondef(f::regprocedure);body:=replace(body,'app_private.salon_keys(','app_private.report_keys(');execute body;
 end loop;
end $migration$;
