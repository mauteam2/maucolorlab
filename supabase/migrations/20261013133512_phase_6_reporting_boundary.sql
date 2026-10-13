create function app_private.report_period(tz text,q jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare today date:=(statement_timestamp() at time zone tz)::date;first_day date;last_day date;previous_first date;previous_last date;kind text:=coalesce(q->>'period','THIS_MONTH');begin
 if kind in ('TODAY','YESTERDAY') then first_day:=today-case when kind='YESTERDAY' then 1 else 0 end;last_day:=first_day+1;
 elsif kind in ('THIS_WEEK','LAST_WEEK') then first_day:=today-(extract(isodow from today)::integer-1)-case when kind='LAST_WEEK' then 7 else 0 end;last_day:=first_day+7;
 elsif kind in ('THIS_MONTH','LAST_MONTH') then first_day:=date_trunc('month',today)::date;if kind='LAST_MONTH' then first_day:=(first_day-interval '1 month')::date;end if;last_day:=(first_day+interval '1 month')::date;
 elsif kind='CUSTOM' then
  if q->>'from' !~ '^\d{4}-\d{2}-\d{2}$' or q->>'until' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
  first_day:=(q->>'from')::date;last_day:=(q->>'until')::date+1;
 else raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
 if first_day is null or last_day is null or last_day<=first_day or last_day-first_day>90 or first_day<date '2000-01-01' or last_day>today+367
  or kind<>'CUSTOM' and (q ? 'from' or q ? 'until') then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
 previous_last:=first_day;previous_first:=case when kind in ('THIS_MONTH','LAST_MONTH') then (first_day-interval '1 month')::date else first_day-(last_day-first_day) end;
 return jsonb_build_object('kind',kind,'timezone',tz,'start',first_day::timestamp at time zone tz,'end',last_day::timestamp at time zone tz,
 'first_date',first_day,'end_date_exclusive',last_day,'previous_start',previous_first::timestamp at time zone tz,'previous_end',previous_last::timestamp at time zone tz,
 'previous_first_date',previous_first,'previous_end_date_exclusive',previous_last);
end$$;
revoke all on function app_private.report_period(text,jsonb) from public,anon,authenticated,service_role;

create function app_private.report_metric(name text,val numeric,unit text,denom numeric,domain text,known boolean default true) returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('name',name,'value',case when known then val::text end,'unit',unit,'denominator',denom::text,
 'status',case when known and val is not null then 'KNOWN' else 'UNAVAILABLE' end,'source_domain',domain);
$$;
revoke all on function app_private.report_metric(text,numeric,text,numeric,text,boolean) from public,anon,authenticated,service_role;

create function app_private.report_metrics(org uuid,loc uuid,lo timestamptz,hi timestamptz,staff uuid,service uuid,category_filter text,domains text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='[]';a numeric;b numeric;c numeric;d numeric;e numeric;k numeric;partial_count numeric;unknown_count numeric;total numeric;fully_known boolean;begin
 if 'APPOINTMENT'=any(domains) then
  select count(*),count(*) filter(where status='COMPLETED'),count(*) filter(where status='CANCELLED'),count(*) filter(where status='NO_SHOW'),
   coalesce(sum((details->>'occupied_minutes')::numeric) filter(where status in ('DRAFT','CONFIRMED','ARRIVED','IN_SERVICE','COMPLETED')),0)
  into total,a,b,c,d from app_private.report_facts where organization_id=org and location_id=loc and domain='APPOINTMENT' and at>=lo and at<hi
   and (staff is null or staff_user_id=staff) and (service is null or service_id=service);
  result:=result||jsonb_build_array(app_private.report_metric('appointments_scheduled',total,'COUNT',null,'APPOINTMENT'),app_private.report_metric('completed_visits',a,'COUNT',total,'APPOINTMENT'),
   app_private.report_metric('cancelled',b,'COUNT',total,'APPOINTMENT'),app_private.report_metric('no_show',c,'COUNT',total,'APPOINTMENT'),
   app_private.report_metric('cancellation_rate_bps',case when total>0 then trunc(b*10000/total) end,'BPS',total,'APPOINTMENT'),
   app_private.report_metric('booked_minutes',d,'MINUTES',null,'APPOINTMENT'),app_private.report_metric('available_staff_minutes',null,'MINUTES',null,'APPOINTMENT',false),
   app_private.report_metric('utilization_bps',null,'BPS',null,'APPOINTMENT',false));
 end if;
 if 'REVENUE'=any(domains) then
  select count(*),coalesce(sum(revenue_minor),0),coalesce(sum((details->>'refund_net_minor')::numeric),0),
   count(*) filter(where cost_status='KNOWN'),count(*) filter(where cost_status='PARTIAL'),count(*) filter(where cost_status='UNKNOWN'),
   coalesce(sum(revenue_minor) filter(where cost_status='KNOWN'),0)
  into total,a,b,k,partial_count,unknown_count,c from app_private.report_facts where organization_id=org and location_id=loc and domain='REVENUE' and at>=lo and at<hi
   and (staff is null or staff_user_id=staff) and (service is null or service_id=service) and (category_filter is null or category=category_filter);
  result:=result||jsonb_build_array(app_private.report_metric('recognized_net_revenue',a,'MONEY',null,'REVENUE'),app_private.report_metric('refunds_net',b,'MONEY',null,'REVENUE'),
   app_private.report_metric('eligible_transactions',total,'COUNT',null,'REVENUE'));
  if 'COST'=any(domains) then
   select coalesce(sum(cost_minor),0),coalesce(sum(contribution_minor),0),coalesce(sum(revenue_minor-cost_minor) filter(where cost_status='KNOWN'),0)
   into d,e,b from app_private.report_facts where organization_id=org and location_id=loc and domain='REVENUE' and at>=lo and at<hi
    and (staff is null or staff_user_id=staff) and (service is null or service_id=service) and (category_filter is null or category=category_filter);
   fully_known:=partial_count+unknown_count=0;
   result:=result||jsonb_build_array(app_private.report_metric('known_direct_product_cost',d,'MONEY',null,'REVENUE'),
    app_private.report_metric('known_transactions',k,'COUNT',total,'REVENUE'),app_private.report_metric('partial_transactions',partial_count,'COUNT',total,'REVENUE'),app_private.report_metric('unknown_transactions',unknown_count,'COUNT',total,'REVENUE'),
    app_private.report_metric('known_count_coverage_bps',case when total>0 then trunc(k*10000/total) end,'BPS',total,'REVENUE'),
    app_private.report_metric('known_revenue_coverage_bps',case when a>0 then trunc(c*10000/a) end,'BPS',a,'REVENUE'),
    app_private.report_metric('contribution_before_commission',b,'MONEY',null,'REVENUE',fully_known),app_private.report_metric('known_subset_contribution_before_commission',b,'MONEY',k,'REVENUE'));
   if 'COMMISSION'=any(domains) then result:=result||jsonb_build_array(app_private.report_metric('contribution_after_commission',e,'MONEY',null,'REVENUE',fully_known));end if;
  end if;
 end if;
 if 'COMMISSION'=any(domains) then
  select coalesce(sum(commission_minor),0),coalesce(sum((details->>'accrual_minor')::numeric),0),coalesce(sum((details->>'adjustment_minor')::numeric),0)
  into a,b,c from app_private.report_facts where organization_id=org and location_id=loc and domain='COMMISSION' and at>=lo and at<hi and (staff is null or staff_user_id=staff);
  result:=result||jsonb_build_array(app_private.report_metric('net_accrued_commission',a,'MONEY',null,'COMMISSION'),app_private.report_metric('commission_accrual',b,'MONEY',null,'COMMISSION'),app_private.report_metric('commission_adjustments',c,'MONEY',null,'COMMISSION'));
 end if;
 if 'EXPENSE'=any(domains) then
  select coalesce(sum(revenue_minor),0) into a from app_private.report_facts where organization_id=org and location_id=loc and domain='EXPENSE' and at>=lo and at<hi and (category_filter is null or category=category_filter);
  result:=result||jsonb_build_array(app_private.report_metric('operating_expenses_recorded',a,'MONEY',null,'EXPENSE'));
 end if;
 if 'STOCK_ITEM'=any(domains) then
  select count(*) filter(where status<>'ARCHIVED'),count(*) filter(where status='LOW'),count(*) filter(where status='OUT'),count(*) filter(where status='UNKNOWN'),coalesce(sum((details->>'expiring_lots')::numeric),0)
  into total,a,b,c,d from app_private.report_facts where organization_id=org and location_id=loc and domain='STOCK_ITEM';
  select count(*) filter(where status='PENDING'),count(*) filter(where status='FAILED') into e,k from public.stock_source_events where organization_id=org and location_id=loc;
  result:=result||jsonb_build_array(app_private.report_metric('stock_items',total,'COUNT',null,'STOCK_ITEM'),app_private.report_metric('low_stock',a,'COUNT',total,'STOCK_ITEM'),
   app_private.report_metric('out_of_stock',b,'COUNT',total,'STOCK_ITEM'),app_private.report_metric('unknown_stock',c,'COUNT',total,'STOCK_ITEM'),
   app_private.report_metric('expiring_lots_30_days',d,'COUNT',null,'STOCK_ITEM'),app_private.report_metric('pending_reconciliation',e,'COUNT',null,'STOCK_ITEM'),app_private.report_metric('failed_source_events',k,'COUNT',null,'STOCK_ITEM'));
 end if;
 if 'STOCK_MOVEMENT'=any(domains) then
  select count(*) into total from app_private.report_facts where organization_id=org and location_id=loc and domain='STOCK_MOVEMENT' and at>=lo and at<hi;
  result:=result||jsonb_build_array(app_private.report_metric('stock_movement_count',total,'COUNT',null,'STOCK_MOVEMENT'));
  -- Unit-specific quantities cannot be combined into a meaningless grams+units total.
  for category_filter in select unnest(array['GRAM','MILLILITER','UNIT']) loop
   select coalesce(-sum(quantity),0) into a from app_private.report_facts where organization_id=org and location_id=loc and domain='STOCK_MOVEMENT' and at>=lo and at<hi
    and unit=category_filter and details->>'source_session_id' is not null;
   result:=result||jsonb_build_array(app_private.report_metric('actual_consumption_'||lower(category_filter),a,category_filter,null,'STOCK_MOVEMENT'));
  end loop;
 end if;
 if 'CLIENT'=any(domains) then
  select count(*) filter(where at>=lo and at<hi),count(*) filter(where status='RETURNING'),count(*) filter(where status='INACTIVE'),count(*) filter(where details->>'return_signal'='RETURN_WINDOW_OPEN'),
   count(*) filter(where details->>'return_signal'='OVERDUE'),count(*) filter(where (details->>'future_appointment')::boolean)
  into total,a,b,c,d,e from app_private.report_facts where organization_id=org and location_id=loc and domain='CLIENT' and details->>'record_status'='ACTIVE';
  result:=result||jsonb_build_array(app_private.report_metric('new_clients',total,'COUNT',null,'CLIENT'),app_private.report_metric('returning_clients_snapshot',a,'COUNT',null,'CLIENT'),
   app_private.report_metric('inactive_clients_snapshot',b,'COUNT',null,'CLIENT'),app_private.report_metric('rebooking_due_snapshot',c,'COUNT',null,'CLIENT'),
   app_private.report_metric('overdue_clients_snapshot',d,'COUNT',null,'CLIENT'),app_private.report_metric('future_appointments_clients_snapshot',e,'COUNT',null,'CLIENT'));
 end if;
 if 'LIVE'=any(domains) then
  select count(*),count(*) filter(where status='COMPLETED'),count(*) filter(where (details->>'outcome_recorded')::boolean),count(*) filter(where (details->>'recipe_revised')::boolean),coalesce(sum((details->>'risk_events')::numeric),0)
  into total,a,b,c,d from app_private.report_facts where organization_id=org and location_id=loc and domain='LIVE' and at>=lo and at<hi and (staff is null or staff_user_id=staff);
  result:=result||jsonb_build_array(app_private.report_metric('technical_sessions',total,'COUNT',null,'LIVE'),app_private.report_metric('completed_color_sessions',a,'COUNT',total,'LIVE'),
   app_private.report_metric('recorded_outcomes',b,'COUNT',total,'LIVE'),app_private.report_metric('recipe_revised_sessions',c,'COUNT',total,'LIVE'),app_private.report_metric('recorded_risk_events',d,'COUNT',null,'LIVE'));
 end if;
 return result;
end$$;
revoke all on function app_private.report_metrics(uuid,uuid,timestamptz,timestamptz,uuid,uuid,text,text[]) from public,anon,authenticated,service_role;

create function public.reporting_snapshot(p_membership_id uuid,p_location_id uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='20s' as $$
declare q jsonb:=p_request;ctx jsonb;org uuid;tz text;period jsonb;kind text:=coalesce(q->>'kind','OVERVIEW');domains text[]:='{}';all_domains text[]:='{}';
 staff uuid;service uuid;role_name text;self_only boolean;current_metrics jsonb;previous_metrics jsonb;comparison jsonb;rows jsonb;grouped jsonb;insights jsonb:='[]';
 lo timestamptz;hi timestamptz;cursor_at timestamptz;cursor_id uuid;cursor_domain text;last_row record;pending bigint;fresh jsonb;settings public.report_settings%rowtype;current_value numeric;previous_value numeric;
begin
 if q is null or jsonb_typeof(q)<>'object' or not app_private.salon_keys(q,array['kind','period','from','until','staff_user_id','service_id','category','cursor','domain','segment','source_id'])
  or kind not in ('OVERVIEW','APPOINTMENTS','CLIENTS','SERVICES','TEAM','FINANCE','STOCK','TECHNICAL') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,'reports.read');if ctx ? 'code' then return ctx;end if;
 org:=(ctx->>'organization_id')::uuid;
 select m.role_code into role_name from public.salon_memberships m where m.id=p_membership_id;
 self_only:=role_name in ('colorist','assistant');
 begin
  select timezone into tz from public.locations where id=p_location_id and organization_id=org;
  period:=app_private.report_period(tz,q);lo:=(period->>'start')::timestamptz;hi:=(period->>'end')::timestamptz;
  staff:=(q->>'staff_user_id')::uuid;service:=(q->>'service_id')::uuid;
  if self_only then if staff is not null and staff<>auth.uid() then return jsonb_build_object('code','FORBIDDEN');end if;staff:=auth.uid();end if;
  if q ? 'cursor' then
   if jsonb_typeof(q->'cursor')<>'object' or not app_private.salon_keys(q->'cursor',array['at','id','domain']) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
   cursor_at:=(q->'cursor'->>'at')::timestamptz;cursor_id:=(q->'cursor'->>'id')::uuid;cursor_domain:=q->'cursor'->>'domain';
   if cursor_at is null or cursor_id is null or cursor_domain is null then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  end if;
  if q->>'category' is not null and (jsonb_typeof(q->'category')<>'string' or char_length(q->>'category') not between 1 and 80) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  if q->>'segment' is not null and q->>'segment' not in ('RETURNING','INACTIVE','OVERDUE','RETURN_WINDOW_OPEN','UNKNOWN','PARTIAL','KNOWN','LOW','OUT') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or invalid_parameter_value then return jsonb_build_object('code','VALIDATION_FAILED');end;
 if app_private.user_has_permission(org,p_location_id,'salon.read') then all_domains:=all_domains||'APPOINTMENT'::text;end if;
 if not self_only and app_private.user_has_permission(org,p_location_id,'crm.read') then all_domains:=all_domains||'CLIENT'::text;end if;
 if not self_only and app_private.user_has_permission(org,p_location_id,'finance.view') then all_domains:=all_domains||'REVENUE'::text;end if;
 if not self_only and app_private.user_has_permission(org,p_location_id,'cost.view') then all_domains:=all_domains||'COST'::text;end if;
 if app_private.user_has_permission(org,p_location_id,case when self_only then 'commission.view_self' else 'commission.view_all' end) then all_domains:=all_domains||'COMMISSION'::text;end if;
 if not self_only and app_private.user_has_permission(org,p_location_id,'finance.expense.view') then all_domains:=all_domains||'EXPENSE'::text;end if;
 if not self_only and app_private.user_has_permission(org,p_location_id,'finance.cash.close') then all_domains:=all_domains||'CASH'::text;end if;
 if not self_only and app_private.user_has_permission(org,p_location_id,'stock.view') then all_domains:=all_domains||array['STOCK_ITEM','STOCK_MOVEMENT'];end if;
 if app_private.user_has_permission(org,p_location_id,'live_session.view') and app_private.user_has_permission(org,p_location_id,'crm.notes.technical') then all_domains:=all_domains||'LIVE'::text;end if;
 domains:=case kind when 'OVERVIEW' then all_domains when 'APPOINTMENTS' then array['APPOINTMENT'] when 'CLIENTS' then array['CLIENT']
  when 'SERVICES' then array['APPOINTMENT','REVENUE','COST','COMMISSION'] when 'TEAM' then array['APPOINTMENT','REVENUE','COST','COMMISSION','LIVE']
  when 'FINANCE' then array['REVENUE','COST','COMMISSION','EXPENSE','CASH'] when 'STOCK' then array['STOCK_ITEM','STOCK_MOVEMENT'] when 'TECHNICAL' then array['LIVE'] end;
 select coalesce(array_agg(x),'{}') into domains from unnest(domains) x where x=any(all_domains);
 if cardinality(domains)=0 then return jsonb_build_object('code','FORBIDDEN');end if;
 if q ? 'domain' and q->>'domain'<>all(domains) then return jsonb_build_object('code','FORBIDDEN');end if;
 if q ? 'source_id' then begin perform (q->>'source_id')::uuid;exception when invalid_text_representation then return jsonb_build_object('code','VALIDATION_FAILED');end;end if;
 perform app_private.report_refresh(org,p_location_id,false);
 current_metrics:=app_private.report_metrics(org,p_location_id,lo,hi,staff,service,q->>'category',domains);
 previous_metrics:=app_private.report_metrics(org,p_location_id,(period->>'previous_start')::timestamptz,(period->>'previous_end')::timestamptz,staff,service,q->>'category',domains);
 select coalesce(jsonb_agg(jsonb_build_object('name',c->>'name','current',c->>'value','previous',p->>'value',
  'absolute_delta',case when c->>'value' is not null and p->>'value' is not null then ((c->>'value')::numeric-(p->>'value')::numeric)::text end,
  'percentage_delta_bps',case when (p->>'value')::numeric>0 and c->>'value' is not null then trunc(((c->>'value')::numeric-(p->>'value')::numeric)*10000/(p->>'value')::numeric)::text end)),'[]')
 into comparison from jsonb_array_elements(current_metrics) c join jsonb_array_elements(previous_metrics) p on c->>'name'=p->>'name'
 where c->>'name' not like '%snapshot' and c->>'source_domain' not in ('STOCK_ITEM');
 select coalesce(jsonb_agg(jsonb_build_object('domain',f.domain,'source_id',f.source_id,'at',f.at,'label',f.label,'status',f.status,'client_id',f.client_id,'staff_user_id',f.staff_user_id,'service_id',f.service_id,'category',f.category,
  'quantity',f.quantity::text,'unit',f.unit,'duration_seconds',f.duration_seconds::text,
  'revenue_minor',case when 'REVENUE'=any(domains) or f.domain='EXPENSE' then f.revenue_minor::text end,
  'cost_minor',case when 'COST'=any(domains) then f.cost_minor::text end,'cost_status',case when 'COST'=any(domains) then f.cost_status end,
  'commission_minor',case when 'COMMISSION'=any(domains) then f.commission_minor::text end,'contribution_minor',case when 'COST'=any(domains) and 'COMMISSION'=any(domains) then f.contribution_minor::text end,
  'details',case when f.domain='REVENUE' then f.details-'refund_net_minor' when f.domain='CLIENT' and not ('LIVE'=any(all_domains)) then f.details-'followups' else f.details end) order by f.at desc,f.source_id desc,f.domain desc),'[]')
 into rows from (select * from app_private.report_facts f where f.organization_id=org and f.location_id=p_location_id and f.domain=any(domains)
  and (f.domain in ('CLIENT','STOCK_ITEM') or f.at>=lo and f.at<hi) and (staff is null or f.staff_user_id=staff) and (service is null or f.service_id=service)
  and (q->>'category' is null or f.category=q->>'category') and (q->>'domain' is null or f.domain=q->>'domain')
  and (q->>'source_id' is null or f.source_id=(q->>'source_id')::uuid)
  and (q->>'segment' is null or f.status=q->>'segment' or f.cost_status=q->>'segment' or f.details->>'return_signal'=q->>'segment')
  and (cursor_at is null or (f.at,f.source_id,f.domain)<(cursor_at,cursor_id,cursor_domain)) order by f.at desc,f.source_id desc,f.domain desc limit 50) f;
 grouped:='[]';
 if kind in ('SERVICES','TEAM') then
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'label',g.label,'count',g.n,'recognized_net_revenue',case when 'REVENUE'=any(domains) then g.revenue::text end,
   'known_transactions',case when 'COST'=any(domains) then g.known end,'incomplete_transactions',case when 'COST'=any(domains) then g.incomplete end,
   'contribution',case when 'COST'=any(domains) and 'COMMISSION'=any(domains) and g.incomplete=0 then g.contribution::text end,
   'average_duration_seconds',g.average_duration::text)),'[]') into grouped from
   (select case when kind='SERVICES' then f.service_id else f.staff_user_id end id,case when kind='SERVICES' then max(f.label) filter(where f.domain in ('APPOINTMENT','REVENUE')) else 'Performed by' end label,
    count(*) filter(where f.domain='APPOINTMENT' and f.status='COMPLETED') n,coalesce(sum(f.revenue_minor) filter(where f.domain='REVENUE'),0) revenue,
    count(*) filter(where f.domain='REVENUE' and f.cost_status='KNOWN') known,count(*) filter(where f.domain='REVENUE' and f.cost_status<>'KNOWN') incomplete,
    sum(f.contribution_minor) filter(where f.domain='REVENUE') contribution,trunc(avg(f.duration_seconds) filter(where f.domain='APPOINTMENT' and f.status='COMPLETED')) average_duration
    from app_private.report_facts f where f.organization_id=org and f.location_id=p_location_id and f.domain=any(domains) and f.at>=lo and f.at<hi
     and (staff is null or f.staff_user_id=staff) and (service is null or f.service_id=service) and (q->>'category' is null or f.category=q->>'category')
    group by 1 order by n desc,id limit 50) g where g.id is not null;
 end if;
 select * into settings from public.report_settings where organization_id=org and location_id=p_location_id;
 for last_row in select c from jsonb_array_elements(current_metrics) c where c->>'name' in ('low_stock','rebooking_due_snapshot','unknown_transactions') and (c->>'value')::numeric>0 loop
  insights:=insights||jsonb_build_array(jsonb_build_object('code',last_row.c->>'name','value',last_row.c->>'value','metric',last_row.c->>'name','source_domain',last_row.c->>'source_domain','calculation','Recorded source count; no prediction','threshold',null));
 end loop;
 select (c->>'value')::numeric into current_value from jsonb_array_elements(current_metrics) c where c->>'name'='known_revenue_coverage_bps';
 if settings.coverage_warning_bps is not null and current_value<settings.coverage_warning_bps then insights:=insights||jsonb_build_array(jsonb_build_object('code','COST_COVERAGE_WARNING','value',current_value::text,'metric','known_revenue_coverage_bps','source_domain','REVENUE','calculation','Known-cost recognized revenue / eligible recognized revenue','threshold',settings.coverage_warning_bps));end if;
 select (c->>'value')::numeric into current_value from jsonb_array_elements(current_metrics) c where c->>'name'='cancellation_rate_bps';
 select (c->>'value')::numeric into previous_value from jsonb_array_elements(previous_metrics) c where c->>'name'='cancellation_rate_bps';
 if settings.cancellation_warning_bps is not null and current_value>settings.cancellation_warning_bps then insights:=insights||jsonb_build_array(jsonb_build_object('code','CANCELLATION_WARNING','value',current_value::text,'metric','cancellation_rate_bps','source_domain','APPOINTMENT','calculation','Cancelled / scheduled appointments','threshold',settings.cancellation_warning_bps));end if;
 select count(*) into pending from app_private.report_invalidations where organization_id=org and location_id=p_location_id;
 select jsonb_build_object('status',case when pending>0 then 'PENDING' when exists(select 1 from app_private.report_facts where organization_id=org and location_id=p_location_id and domain in ('CLIENT','STOCK_ITEM') and (refreshed_at at time zone tz)::date<>(statement_timestamp() at time zone tz)::date) then 'STALE_CALENDAR' else 'CURRENT' end,
  'updated_at',refreshed_at,'last_rebuilt_at',last_rebuilt_at,'watermark',watermark::text,'pending_events',pending::text,'metric_version',metric_version) into fresh from app_private.report_state where organization_id=org and location_id=p_location_id;
 return jsonb_build_object('data',jsonb_build_object('organization_id',org,'location_id',p_location_id,'kind',kind,'self_only',self_only,'staff_user_id',staff,'currency',(select base_currency from public.organizations where id=org),
  'period',period,'freshness',fresh,'allowed_domains',all_domains,'metrics',current_metrics,'previous_metrics',previous_metrics,'comparison',comparison,'items',rows,'groups',grouped,'insights',insights,
  'next_cursor',case when jsonb_array_length(rows)=50 then jsonb_build_object('at',rows->49->>'at','id',rows->49->>'source_id','domain',rows->49->>'domain') end));
end$$;
revoke all on function public.reporting_snapshot(uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.reporting_snapshot(uuid,uuid,jsonb) to authenticated;

create function public.reporting_operation(p_membership_id uuid,p_location_id uuid,p_command jsonb,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='120s' as $$
declare ctx jsonb;org uuid;op text:=p_command->>'type';v bigint;begin
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,case when op='EXPORT' then 'reports.export' else 'reports.manage' end);if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 if op not in ('REBUILD','SETTINGS','EXPORT') or p_correlation_id is null or not app_private.salon_keys(p_command,case when op='SETTINGS' then array['type','expected_version','coverage_warning_bps','cancellation_warning_bps'] when op='EXPORT' then array['type','request'] else array['type'] end) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if op='REBUILD' then perform app_private.report_refresh(org,p_location_id,true);
 elsif op='SETTINGS' then
  perform pg_advisory_xact_lock(hashtextextended(org::text||':'||p_location_id::text||':reports',61));
  select version into v from public.report_settings where organization_id=org and location_id=p_location_id;
  if jsonb_typeof(p_command->'expected_version')<>'number' or (p_command->>'expected_version')::numeric<>coalesce(v,0) then return jsonb_build_object('code','REPORT_CONFLICT');end if;
  if exists(select 1 from jsonb_each(p_command) x where x.key in ('coverage_warning_bps','cancellation_warning_bps') and x.value<>'null'::jsonb and (jsonb_typeof(x.value)<>'number' or x.value::text !~ '^\d{1,5}$' or x.value::text::integer>10000)) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  insert into public.report_settings values(org,p_location_id,1,(p_command->>'coverage_warning_bps')::integer,(p_command->>'cancellation_warning_bps')::integer,statement_timestamp(),auth.uid())
   on conflict(organization_id,location_id) do update set version=report_settings.version+1,coverage_warning_bps=excluded.coverage_warning_bps,cancellation_warning_bps=excluded.cancellation_warning_bps,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 elsif op='EXPORT' then
  ctx:=public.reporting_snapshot(p_membership_id,p_location_id,p_command->'request');if ctx ? 'code' then return ctx;end if;
 end if;
 insert into public.audit_events(organization_id,location_id,actor_user_id,action,entity_type,entity_id,reason,metadata,correlation_id)
  values(org,p_location_id,auth.uid(),'reporting.'||lower(op),'reporting',p_location_id,'Explicit bounded reporting operation',jsonb_build_object('metric_version',1),p_correlation_id);
 return case when op='EXPORT' then ctx else jsonb_build_object('data',jsonb_build_object('type',op,'version',coalesce((select version from public.report_settings where organization_id=org and location_id=p_location_id),0))) end;
end$$;
revoke all on function public.reporting_operation(uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function public.reporting_operation(uuid,uuid,jsonb,uuid) to authenticated;
