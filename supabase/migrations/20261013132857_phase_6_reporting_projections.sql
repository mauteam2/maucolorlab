-- Derived private rows. Source writers only append invalidations; no domain lock inversion.
insert into public.permissions(code,description) values
 ('reports.read','Read permission-scoped derived reports'),
 ('reports.manage','Rebuild derived reports and configure explicit thresholds'),
 ('reports.export','Export bounded authorized report projections');
insert into public.role_permissions(role_code,permission_code)
 select r,'reports.read' from unnest(array['owner','manager','colorist','assistant','reception']) r;
insert into public.role_permissions(role_code,permission_code)
 select r,p from unnest(array['owner','manager']) r cross join unnest(array['reports.manage','reports.export']) p;

create table app_private.report_facts(
 organization_id uuid not null,location_id uuid not null,domain text not null,
 source_id uuid not null,at timestamptz not null,client_id uuid,staff_user_id uuid,service_id uuid,
 label text,status text,category text,currency text,
 quantity numeric,unit text,duration_seconds bigint,
 revenue_minor numeric,cost_minor numeric,commission_minor numeric,contribution_minor numeric,
 cost_status text check(cost_status in ('KNOWN','PARTIAL','UNKNOWN')),
 details jsonb not null default '{}',refreshed_at timestamptz not null default statement_timestamp(),
 primary key(organization_id,location_id,domain,source_id),
 foreign key(organization_id,location_id) references public.locations(organization_id,id),
 check(domain in ('APPOINTMENT','REVENUE','COMMISSION','STOCK_ITEM','STOCK_MOVEMENT','EXPENSE','CASH','LIVE','CLIENT')),
 check(revenue_minor=trunc(revenue_minor) and cost_minor=trunc(cost_minor) and commission_minor=trunc(commission_minor) and contribution_minor=trunc(contribution_minor))
);
create index report_period on app_private.report_facts(organization_id,location_id,domain,at desc,source_id desc);
create index report_staff_period on app_private.report_facts(organization_id,location_id,staff_user_id,domain,at desc,source_id desc);
create index report_service_period on app_private.report_facts(organization_id,location_id,service_id,domain,at desc,source_id desc);
create table app_private.report_invalidations(
 id bigint generated always as identity primary key,organization_id uuid not null,location_id uuid not null,
 domain text not null,source_id uuid not null,created_at timestamptz not null default statement_timestamp(),
 foreign key(organization_id,location_id) references public.locations(organization_id,id)
);
create index report_pending on app_private.report_invalidations(organization_id,location_id,id);
create table app_private.report_state(
 organization_id uuid not null,location_id uuid not null,watermark bigint not null default 0,
 refreshed_at timestamptz,last_rebuilt_at timestamptz,metric_version integer not null default 1,
 primary key(organization_id,location_id),foreign key(organization_id,location_id) references public.locations(organization_id,id)
);
create table public.report_settings(
 organization_id uuid not null,location_id uuid not null,version bigint not null default 1,
 coverage_warning_bps integer check(coverage_warning_bps between 0 and 10000),
 cancellation_warning_bps integer check(cancellation_warning_bps between 0 and 10000),
 updated_at timestamptz not null default statement_timestamp(),updated_by uuid references public.profiles(user_id),
 primary key(organization_id,location_id),foreign key(organization_id,location_id) references public.locations(organization_id,id)
);
do $$declare t text;begin
 foreach t in array array['report_facts','report_invalidations','report_state'] loop
  execute format('alter table app_private.%I enable row level security',t);
  execute format('revoke all on app_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end$$;
alter table public.report_settings enable row level security;
revoke all on public.report_settings from public,anon,authenticated,service_role;
grant select on public.report_settings to authenticated;
create policy reports_settings_read on public.report_settings for select to authenticated
 using(app_private.user_has_permission(organization_id,location_id,'reports.manage'));

create function app_private.report_enqueue(org uuid,loc uuid,kind text,eid uuid) returns void
language sql security definer set search_path='' as $$
 insert into app_private.report_invalidations(organization_id,location_id,domain,source_id)
 select org,loc,kind,eid where org is not null and loc is not null and eid is not null;
$$;
revoke all on function app_private.report_enqueue(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

create function app_private.report_source_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new);org uuid:=(j->>'organization_id')::uuid;loc uuid:=(j->>'location_id')::uuid;
 eid uuid;kind text;sid uuid;cid uuid;link record;begin
 kind:=case tg_table_name when 'salon_appointments' then 'APPOINTMENT' when 'profitability_revenue_facts' then 'REVENUE'
  when 'profitability_adjustments' then 'REVENUE' when 'profitability_zero_cost_declarations' then 'REVENUE'
  when 'profitability_retail_performers' then 'REVENUE' when 'stock_items' then 'STOCK_ITEM'
  when 'stock_lots' then 'STOCK_ITEM' when 'stock_openings' then 'STOCK_ITEM'
  when 'stock_movements' then 'STOCK_MOVEMENT' when 'finance_documents' then 'EXPENSE'
  when 'finance_expenses' then 'EXPENSE' when 'finance_cash_sessions' then 'CASH'
  when 'commission_accruals' then 'COMMISSION' when 'commission_adjustments' then 'COMMISSION'
  when 'live_sessions' then 'LIVE' when 'session_outcomes' then 'LIVE' end;
 eid:=case when kind='REVENUE' then (j->>'charge_id')::uuid
  when tg_table_name='finance_expenses' then (j->>'document_id')::uuid
  when tg_table_name='commission_adjustments' then (j->>'accrual_id')::uuid
  when tg_table_name in ('stock_lots','stock_openings') then (j->>'stock_item_id')::uuid
  when tg_table_name='session_outcomes' then (j->>'session_id')::uuid else (j->>'id')::uuid end;
 if tg_table_name='session_outcomes' then select s.location_id into loc from public.live_sessions s where s.id=eid;end if;
 if kind is not null then perform app_private.report_enqueue(org,loc,kind,eid);end if;
 if tg_table_name='stock_movements' then perform app_private.report_enqueue(org,loc,'STOCK_ITEM',(j->>'stock_item_id')::uuid);end if;
 if tg_table_name='finance_documents' and j->>'type'='REVERSAL' then perform app_private.report_enqueue(org,loc,'EXPENSE',(j->>'reversal_of')::uuid);end if;
 if tg_table_name='profitability_adjustments' then
  select a.id into eid from public.commission_accruals a where a.charge_id=(j->>'charge_id')::uuid;
  perform app_private.report_enqueue(org,loc,'COMMISSION',eid);
 end if;
 if tg_table_name='commission_accruals' then perform app_private.report_enqueue(org,loc,'REVENUE',(j->>'charge_id')::uuid);end if;
 if tg_table_name='commission_adjustments' then
  select a.charge_id into eid from public.commission_accruals a where a.id=(j->>'accrual_id')::uuid;
  perform app_private.report_enqueue(org,loc,'REVENUE',eid);
 end if;
 if tg_table_name in ('direct_cost_facts','stock_source_events','live_sessions') then
  sid:=case when tg_table_name='live_sessions' then (j->>'id')::uuid else coalesce((j->>'source_session_id')::uuid,(j->>'session_id')::uuid) end;
  perform app_private.report_enqueue(org,loc,'REVENUE',(j->>'finance_document_id')::uuid);
  for link in select r.charge_id from public.profitability_revenue_facts r where r.organization_id=org and r.location_id=loc and r.live_session_id=sid loop
   perform app_private.report_enqueue(org,loc,'REVENUE',link.charge_id);
  end loop;
 end if;
 cid:=(j->>'client_id')::uuid;
 if cid is not null and loc is not null then perform app_private.report_enqueue(org,loc,'CLIENT',cid);end if;
 if tg_table_name='clients' then
  for link in select id location_id from public.locations where organization_id=org loop
   perform app_private.report_enqueue(org,link.location_id,'CLIENT',(j->>'id')::uuid);
  end loop;
 end if;
 if tg_table_name in ('client_merge_links','client_merge_reversals','service_return_windows','client_relationship_policies') then
  -- CRM merge/policy changes affect canonical families and configured return semantics.
  for link in select l.id location_id,c.id client_id from public.locations l join public.clients c on c.organization_id=l.organization_id
   where l.organization_id=org and (loc is null or loc=l.id) loop
   perform app_private.report_enqueue(org,link.location_id,'CLIENT',link.client_id);
  end loop;
 end if;
 return new;
end$$;
revoke all on function app_private.report_source_changed() from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['salon_appointments','profitability_revenue_facts','profitability_adjustments','profitability_zero_cost_declarations','profitability_retail_performers',
 'direct_cost_facts','stock_source_events','stock_items','stock_lots','stock_openings','stock_movements','finance_documents','finance_expenses','finance_cash_sessions',
 'commission_accruals','commission_adjustments','live_sessions','session_outcomes','clients','client_merge_links','client_merge_reversals','service_return_windows','client_relationship_policies'] loop
  execute format('create trigger report_invalidate after insert or update on public.%I for each row execute function app_private.report_source_changed()',t);
 end loop;
end$$;

-- Refresh reads authoritative domain output; it never reproduces costing/risk rules.
create function app_private.report_project(org uuid,loc uuid,kind text,eid uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.salon_appointments%rowtype;r public.profitability_revenue_facts%rowtype;j jsonb;row_data app_private.report_facts%rowtype;
 c public.clients%rowtype;m public.stock_movements%rowtype;i public.stock_items%rowtype;d public.finance_documents%rowtype;
 ac public.commission_accruals%rowtype;cash public.finance_cash_sessions%rowtype;s public.live_sessions%rowtype;
 n numeric;canonical uuid;begin
 row_data.organization_id:=org;row_data.location_id:=loc;row_data.domain:=kind;row_data.source_id:=eid;row_data.details:='{}';row_data.refreshed_at:=statement_timestamp();
 if kind='APPOINTMENT' then
  select * into a from public.salon_appointments where id=eid and organization_id=org and location_id=loc;if not found then return;end if;
  row_data.at:=a.start_at;row_data.client_id:=a.client_id;row_data.staff_user_id:=a.staff_user_id;row_data.service_id:=a.service_id;
  row_data.label:=a.service_name;row_data.status:=a.status;row_data.duration_seconds:=a.actual_duration_seconds;
  row_data.details:=jsonb_build_object('completed_at',a.completed_at,'scheduled_minutes',a.scheduled_duration_minutes,'occupied_minutes',a.scheduled_duration_minutes+a.buffer_before_minutes+a.buffer_after_minutes,'service_version',a.service_version);
 elsif kind='REVENUE' then
  select * into r from public.profitability_revenue_facts where charge_id=eid and organization_id=org and location_id=loc;if not found then return;end if;
  j:=app_private.profitability_breakdown(eid,true,true);
  row_data.at:=r.eligible_at;row_data.client_id:=r.client_id;row_data.staff_user_id:=coalesce(r.performed_by,(select staff_user_id from public.profitability_retail_performers where charge_id=eid));
  row_data.service_id:=r.service_id;row_data.label:=coalesce(r.service_name,'Retail');row_data.status:=r.domain;row_data.category:=r.category;row_data.currency:=r.currency;
  row_data.revenue_minor:=(j->>'net_revenue_minor')::numeric;row_data.cost_minor:=(j->>'known_product_cost_minor')::numeric;
  row_data.commission_minor:=(j->>'commission_minor')::numeric;row_data.contribution_minor:=(j->>'contribution_after_commission_minor')::numeric;
  row_data.cost_status:=j->>'cost_status';
  row_data.details:=jsonb_build_object('original_net_minor',r.net_minor::text,'refund_net_minor',(r.net_minor-row_data.revenue_minor)::text,'service_version',r.service_version,'appointment_id',r.appointment_id,
   'live_session_id',r.live_session_id,'retail_quantity',(select quantity::text from public.finance_retail_lines where document_id=eid));
 elsif kind='COMMISSION' then
  select * into ac from public.commission_accruals where id=eid and organization_id=org and location_id=loc;if not found then return;end if;
  row_data.at:=ac.eligible_at;row_data.staff_user_id:=ac.staff_user_id;row_data.currency:=ac.currency;
  select ac.amount_minor+coalesce(sum(amount_minor),0) into n from public.commission_adjustments where accrual_id=eid;
  row_data.commission_minor:=n;row_data.label:='Commission accrual';row_data.details:=jsonb_build_object('charge_id',ac.charge_id,'policy_id',ac.policy_id,'policy_version',ac.policy_version,'accrual_minor',ac.amount_minor::text,'adjustment_minor',(n-ac.amount_minor)::text);
 elsif kind='STOCK_MOVEMENT' then
  select * into m from public.stock_movements where id=eid and organization_id=org and location_id=loc;if not found then return;end if;
  row_data.at:=m.occurred_at;row_data.quantity:=m.quantity_delta;row_data.unit:=m.unit;row_data.status:=m.movement_type;
  row_data.label:=(select display_name from public.stock_items where id=m.stock_item_id);
  row_data.details:=jsonb_build_object('stock_item_id',m.stock_item_id,'reversal_of',m.reversal_of,'source_event_id',m.source_event_id,'source_session_id',m.source_session_id);
 elsif kind='STOCK_ITEM' then
  select * into i from public.stock_items where id=eid and organization_id=org and location_id=loc;if not found then return;end if;
  row_data.at:=i.created_at;row_data.label:=i.display_name;row_data.unit:=i.inventory_unit;
  select sum(quantity_delta) into n from public.stock_movements where stock_item_id=eid;
  row_data.quantity:=case when n is not null or exists(select 1 from public.stock_openings where stock_item_id=eid) then coalesce(n,0) end;
  row_data.status:=case when not i.active then 'ARCHIVED' when row_data.quantity is null then 'UNKNOWN' when row_data.quantity<=0 then 'OUT' when i.low_threshold is not null and row_data.quantity<i.low_threshold then 'LOW' else 'OK' end;
  row_data.details:=jsonb_build_object('threshold',i.low_threshold::text,'catalog_product_id',i.catalog_product_id,'expiring_lots',(select count(*) from public.stock_lots where stock_item_id=eid and expiry_date between (statement_timestamp() at time zone (select timezone from public.locations where id=loc))::date and (statement_timestamp() at time zone (select timezone from public.locations where id=loc))::date+30));
 elsif kind='EXPENSE' then
  select * into d from public.finance_documents where id=eid and organization_id=org and location_id=loc and type='EXPENSE';if not found then return;end if;
  row_data.at:=d.occurred_at;row_data.currency:=d.currency;row_data.label:='Recorded operating expense';
  row_data.category:=(select category from public.finance_expenses where document_id=eid);
  row_data.revenue_minor:=case when exists(select 1 from public.finance_documents where reversal_of=eid) then 0 else d.amount_minor end;
 elsif kind='CASH' then
  select * into cash from public.finance_cash_sessions where id=eid and organization_id=org and location_id=loc;if not found then return;end if;
  row_data.at:=cash.opened_at;row_data.status:=cash.status;row_data.currency:=cash.currency;row_data.label:='Cash session';
  row_data.details:=jsonb_build_object('closed_at',cash.closed_at,'expected_minor',cash.expected_cash_minor::text,'counted_minor',cash.counted_cash_minor::text,'difference_minor',cash.difference_minor::text);
 elsif kind='LIVE' then
  select * into s from public.live_sessions where id=eid and organization_id=org and location_id=loc;if not found then return;end if;
  row_data.at:=coalesce(s.completed_at,s.started_at,s.created_at);row_data.client_id:=s.client_id;row_data.label:='Technical session';row_data.status:=s.status;
  -- Performer attribution is exclusively the validated relational appointment link.
  select a.staff_user_id into row_data.staff_user_id from public.salon_appointment_live_links l join public.salon_appointments a on a.id=l.appointment_id where l.live_session_id=eid;
  row_data.details:=jsonb_build_object('outcome_recorded',exists(select 1 from public.session_outcomes where session_id=eid),
   'recipe_revised',s.current_recipe_id<>s.original_recipe_id,'risk_events',(select count(*) from public.live_risk_events where session_id=eid));
 elsif kind='CLIENT' then
  select * into c from public.clients where id=eid and organization_id=org;if not found then return;end if;
  canonical:=coalesce((select target_client_id from public.client_merge_links where source_client_id=eid and organization_id=org),eid);
  if canonical<>eid then delete from app_private.report_facts where organization_id=org and location_id=loc and domain='CLIENT' and source_id=eid;return;end if;
  j:=app_private.crm_summary(org,loc,eid,statement_timestamp());
  row_data.at:=c.created_at;row_data.client_id:=eid;row_data.label:=c.full_name;row_data.status:=j->>'relationship_status';
  row_data.details:=jsonb_build_object('return_signal',j->'return_signal'->>'status','last_visit_at',j->'last_visit_at','first_visit_at',
   (select min(completed_at) from public.salon_appointments where organization_id=org and location_id=loc and client_id=any(app_private.crm_family(org,eid)) and status='COMPLETED'),
   'future_appointment',j->'upcoming_appointment' is not null and j->'upcoming_appointment'<>'null'::jsonb,'followups',jsonb_array_length(j->'technical_followups'),'computed_at',j->'computed_at','record_status',c.status);
 end if;
 if row_data.at is null then return;end if;
 insert into app_private.report_facts select row_data.* on conflict(organization_id,location_id,domain,source_id) do update set
  at=excluded.at,client_id=excluded.client_id,staff_user_id=excluded.staff_user_id,service_id=excluded.service_id,label=excluded.label,status=excluded.status,category=excluded.category,currency=excluded.currency,
  quantity=excluded.quantity,unit=excluded.unit,duration_seconds=excluded.duration_seconds,revenue_minor=excluded.revenue_minor,cost_minor=excluded.cost_minor,
  commission_minor=excluded.commission_minor,contribution_minor=excluded.contribution_minor,cost_status=excluded.cost_status,details=excluded.details,refreshed_at=excluded.refreshed_at;
end$$;
revoke all on function app_private.report_project(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

create function app_private.report_refresh(org uuid,loc uuid,rebuild boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare item record;mark bigint;begin
 perform pg_advisory_xact_lock(hashtextextended(org::text||':'||loc::text||':reports',61));
 select coalesce(max(id),0) into mark from app_private.report_invalidations where organization_id=org and location_id=loc;
 if rebuild then
  delete from app_private.report_facts where organization_id=org and location_id=loc;
  for item in
   select 'APPOINTMENT' domain,id source_id from public.salon_appointments where organization_id=org and location_id=loc union all
   select 'REVENUE',charge_id from public.profitability_revenue_facts where organization_id=org and location_id=loc union all
   select 'COMMISSION',id from public.commission_accruals where organization_id=org and location_id=loc union all
   select 'STOCK_ITEM',id from public.stock_items where organization_id=org and location_id=loc union all
   select 'STOCK_MOVEMENT',id from public.stock_movements where organization_id=org and location_id=loc union all
   select 'EXPENSE',id from public.finance_documents where organization_id=org and location_id=loc and type='EXPENSE' union all
   select 'CASH',id from public.finance_cash_sessions where organization_id=org and location_id=loc union all
   select 'LIVE',id from public.live_sessions where organization_id=org and location_id=loc union all
   select 'CLIENT',id from public.clients where organization_id=org
  loop perform app_private.report_project(org,loc,item.domain,item.source_id);end loop;
  delete from app_private.report_invalidations where organization_id=org and location_id=loc and id<=mark;
 else
  for item in select id,domain,source_id from app_private.report_invalidations where organization_id=org and location_id=loc order by id limit 500 loop
   perform app_private.report_project(org,loc,item.domain,item.source_id);
   delete from app_private.report_invalidations where id=item.id;
  end loop;
 end if;
 insert into app_private.report_state(organization_id,location_id,watermark,refreshed_at,last_rebuilt_at) values(org,loc,mark,statement_timestamp(),case when rebuild then statement_timestamp() end)
 on conflict(organization_id,location_id) do update set watermark=greatest(report_state.watermark,excluded.watermark),refreshed_at=excluded.refreshed_at,last_rebuilt_at=coalesce(excluded.last_rebuilt_at,report_state.last_rebuilt_at);
end$$;
revoke all on function app_private.report_refresh(uuid,uuid,boolean) from public,anon,authenticated,service_role;

-- Existing source rows are backfilled without changing source history.
do $$declare l record;begin
 for l in select organization_id,id from public.locations loop perform app_private.report_refresh(l.organization_id,l.id,true);end loop;
end$$;
