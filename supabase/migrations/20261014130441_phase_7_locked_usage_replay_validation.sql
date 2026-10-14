-- Check existing permanent source identity under the usage lock before
-- validating a new source. Changed replay is an integrity conflict, not a count.
do $migration$ declare body text;guard text;anchor text;begin
 body:=pg_get_functiondef('app_private.saas_record_usage(uuid,uuid,text,text,uuid,bigint,text)'::regprocedure);
 guard:=$guard$ if category='ENGINE_EXECUTIONS' then
  select * into plan from public.color_plans where organization_id=org and location_id=loc and id=source and status='DRAFT';
  if not found or domain<>'COLOR_PLAN' or amount<>1 or hash<>encode(extensions.digest(convert_to(plan.id::text||':'||plan.request_id::text||':'||plan.status,'UTF8'),'sha256'),'hex') then
   raise exception using errcode='P0001',message='USAGE_SOURCE_INVALID';end if;
 end if;$guard$;
 anchor:=' perform app_private.saas_quota(org,category,amount);';
 if position(guard in body)=0 or position(anchor in body)=0 then raise exception 'usage replay guard anchor missing';end if;
 body:=replace(body,guard,'');body:=replace(body,anchor,guard||chr(10)||anchor);execute body;
end $migration$;
