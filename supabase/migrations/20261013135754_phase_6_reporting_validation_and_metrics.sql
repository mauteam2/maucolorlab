-- Forward corrections after executing the initial definitions in disposable CI.
create index report_pending_source on app_private.report_invalidations(organization_id,location_id,domain,source_id);
do $migration$ declare body text;begin
 body:=pg_get_functiondef('app_private.report_project(uuid,uuid,text,uuid)'::regprocedure);
 body:=replace(body,'select a.staff_user_id into row_data.staff_user_id from public.salon_appointment_live_links l join public.salon_appointments a on a.id=l.appointment_id','select ap.staff_user_id into row_data.staff_user_id from public.salon_appointment_live_links l join public.salon_appointments ap on ap.id=l.appointment_id');
 body:=replace(body,'''service_version'',a.service_version);','''service_version'',a.service_version,''staff_display_name'',a.staff_display_name);');
 -- A merged family is one customer, dated by its earliest original identity.
 body:=replace(body,'row_data.at:=c.created_at;','row_data.at:=(select min(created_at) from public.clients where organization_id=org and id=any(app_private.crm_family(org,eid)));');
 execute body;
 body:=pg_get_functiondef('app_private.report_metrics(uuid,uuid,timestamptz,timestamptz,uuid,uuid,text,text[])'::regprocedure);
 body:=replace(body,'result jsonb:=''[]'';','result jsonb:=''[]''::jsonb;');
 body:=replace(body,' return result;', $block$
 if 'REVENUE'=any(domains) then
  select coalesce(sum(revenue_minor),0),coalesce(sum((details->>'retail_quantity')::numeric),0),count(*) into a,b,total
   from app_private.report_facts where organization_id=org and location_id=loc and domain='REVENUE' and status='RETAIL' and at>=lo and at<hi
    and (staff is null or staff_user_id=staff);
  result:=result||jsonb_build_array(app_private.report_metric('retail_recognized_revenue',a,'MONEY',null,'REVENUE'),app_private.report_metric('retail_quantity_original',b,'UNIT',null,'REVENUE'));
 end if;
 if 'CASH'=any(domains) then
  select count(*),count(*) filter(where status='CLOSED'),sum((details->>'expected_minor')::numeric),sum((details->>'counted_minor')::numeric),sum((details->>'difference_minor')::numeric)
   into total,a,b,c,d from app_private.report_facts where organization_id=org and location_id=loc and domain='CASH' and at>=lo and at<hi;
  result:=result||jsonb_build_array(app_private.report_metric('cash_sessions_opened',total,'COUNT',null,'CASH'),app_private.report_metric('cash_sessions_closed',a,'COUNT',total,'CASH'),
   app_private.report_metric('cash_expected_closed_or_review',b,'MONEY',null,'CASH'),app_private.report_metric('cash_counted_closed_or_review',c,'MONEY',null,'CASH'),app_private.report_metric('cash_difference_closed_or_review',d,'MONEY',null,'CASH'));
 end if;
 if 'LIVE'=any(domains) and 'CLIENT'=any(domains) then
  select coalesce(sum((details->>'followups')::numeric),0) into a from app_private.report_facts where organization_id=org and location_id=loc and domain='CLIENT';
  result:=result||jsonb_build_array(app_private.report_metric('technical_followups_snapshot',a,'COUNT',null,'LIVE'));
 end if;
 return result;
$block$);
 execute body;
 body:=pg_get_functiondef('public.reporting_snapshot(uuid,uuid,jsonb)'::regprocedure);
 body:=replace(body,'domains text[]:=''{}'';','domains text[]:=''{}''::text[];');
 body:=replace(body,'all_domains text[]:=''{}'';','all_domains text[]:=''{}''::text[];');
 body:=replace(body,'insights jsonb:=''[]'';','insights jsonb:=''[]''::jsonb;');
 body:=replace(body,'previous_value numeric;','');
 body:=replace(body,' select (c->>''value'')::numeric into previous_value from jsonb_array_elements(previous_metrics) c where c->>''name''=''cancellation_rate_bps'';','');
 body:=replace(body,'else ''Performed by'' end label','else max(f.details->>''staff_display_name'') filter(where f.domain=''APPOINTMENT'') end label');
 execute body;
 body:=pg_get_functiondef('app_private.report_refresh(uuid,uuid,boolean)'::regprocedure);
 body:=replace(body,' select coalesce(max(id),0) into mark', $block$
 -- Time-derived CRM and expiry snapshots are invalidated on local calendar change.
 insert into app_private.report_invalidations(organization_id,location_id,domain,source_id)
  select org,loc,f.domain,f.source_id from app_private.report_facts f
  where f.organization_id=org and f.location_id=loc and f.domain in ('CLIENT','STOCK_ITEM')
   and (f.refreshed_at at time zone (select timezone from public.locations where id=loc))::date<>(statement_timestamp() at time zone (select timezone from public.locations where id=loc))::date
   and not exists(select 1 from app_private.report_invalidations x where x.organization_id=org and x.location_id=loc and x.domain=f.domain and x.source_id=f.source_id)
  order by f.source_id limit 500;
 select coalesce(max(id),0) into mark
$block$);
 body:=replace(body,'   delete from app_private.report_invalidations where id=item.id;','   delete from app_private.report_invalidations where id=item.id;mark:=item.id;');
 execute body;
end $migration$;
