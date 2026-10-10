-- Phase 5B: operational direct contribution, never accounting or payroll.
insert into public.permissions(code,description) select p,'ELIFORA operational costing: '||p from unnest(array['cost.view','cost.manage_acquisition','cost.correct','commission.view_self','commission.view_all','commission.manage_policies','commission.adjust']) p;
insert into public.role_permissions(role_code,permission_code) select r,p from unnest(array['owner','manager']) r cross join unnest(array['cost.view','cost.manage_acquisition','cost.correct','commission.view_self','commission.view_all','commission.manage_policies','commission.adjust']) p;
insert into public.role_permissions(role_code,permission_code) select r,'commission.view_self' from unnest(array['colorist','assistant']) r;

create table public.stock_cost_basis_events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,location_id uuid not null,stock_item_id uuid not null,stock_lot_id uuid,
 version bigint not null,stock_movement_id uuid references public.stock_movements(id),previous_event_id uuid references public.stock_cost_basis_events(id),
 quantity_hundredths numeric not null check(quantity_hundredths=trunc(quantity_hundredths)),value_numerator numeric not null check(value_numerator=trunc(value_numerator)),value_denominator numeric not null check(value_denominator>0 and value_denominator=trunc(value_denominator)),
 status text not null check(status in ('KNOWN','UNKNOWN')),currency text not null,event_type text not null check(event_type in ('MOVEMENT','FUTURE_CORRECTION')),
 incoming_numerator numeric,incoming_denominator numeric,cost_basis_at timestamptz not null,external_reference text,reason text not null,
 actor_id uuid not null references public.profiles(user_id),created_at timestamptz not null default statement_timestamp(),correlation_id uuid not null,mutation_id uuid not null,
 foreign key(organization_id,location_id,stock_item_id) references public.stock_items(organization_id,location_id,id),foreign key(organization_id,location_id,stock_item_id,stock_lot_id) references public.stock_lots(organization_id,location_id,stock_item_id,id)
);
create unique index stock_cost_version on public.stock_cost_basis_events(stock_item_id,coalesce(stock_lot_id,'00000000-0000-0000-0000-000000000000'::uuid),version);
create unique index stock_cost_movement on public.stock_cost_basis_events(stock_movement_id,coalesce(stock_lot_id,'00000000-0000-0000-0000-000000000000'::uuid)) where stock_movement_id is not null;
create index stock_cost_latest on public.stock_cost_basis_events(stock_item_id,stock_lot_id,version desc);
create table public.direct_cost_facts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,location_id uuid not null,stock_movement_id uuid not null unique references public.stock_movements(id),stock_item_id uuid not null,stock_lot_id uuid,
 source_session_id uuid,source_bowl_id uuid,source_product_id uuid,finance_document_id uuid,source_client_id uuid,
 quantity text not null,unit text not null,currency text not null,cost_method text not null default 'MOVING_WEIGHTED_AVERAGE' check(cost_method='MOVING_WEIGHTED_AVERAGE'),
 cost_basis_event_id uuid references public.stock_cost_basis_events(id),cost_basis_version bigint,unit_cost_numerator numeric,unit_cost_denominator numeric,total_cost_minor bigint,
 status text not null check(status in ('KNOWN','UNKNOWN')),source_domain text not null,correction_of uuid references public.direct_cost_facts(id),
 actor_id uuid not null references public.profiles(user_id),created_at timestamptz not null default statement_timestamp(),correlation_id uuid not null,
 foreign key(organization_id,location_id,stock_item_id) references public.stock_items(organization_id,location_id,id),
 check((status='KNOWN')=(total_cost_minor is not null)),check((unit_cost_numerator is null)=(unit_cost_denominator is null)),check(unit_cost_denominator>0)
);
create index direct_cost_session on public.direct_cost_facts(organization_id,location_id,source_session_id,source_bowl_id,source_product_id);
create index direct_cost_finance on public.direct_cost_facts(finance_document_id);
create table public.commission_policies(
 id uuid primary key,organization_id uuid not null,location_id uuid not null,name text not null check(char_length(trim(name)) between 1 and 160),domain text not null check(domain in ('SERVICE','RETAIL')),
 created_by uuid not null references public.profiles(user_id),created_at timestamptz not null default statement_timestamp(),unique(organization_id,location_id,id),foreign key(organization_id,location_id) references public.locations(organization_id,id)
);
create table public.commission_policy_versions(
 policy_id uuid not null references public.commission_policies(id),organization_id uuid not null,location_id uuid not null,version bigint not null check(version>0),
 method text not null check(method in ('PERCENT_GROSS','PERCENT_NET_OF_TAX','FIXED_AMOUNT')),rate_bps integer check(rate_bps between 0 and 10000),fixed_minor bigint check(fixed_minor between 0 and 9000000000000000),currency text not null,
 effective_from timestamptz not null,reason text not null,actor_id uuid not null references public.profiles(user_id),created_at timestamptz not null default statement_timestamp(),correlation_id uuid not null,
 primary key(policy_id,version),unique(policy_id,effective_from),foreign key(organization_id,location_id,policy_id) references public.commission_policies(organization_id,location_id,id),
 check((method='FIXED_AMOUNT' and fixed_minor is not null and rate_bps is null) or (method<>'FIXED_AMOUNT' and rate_bps is not null and fixed_minor is null))
);
create table public.commission_assignments(
 id uuid primary key,organization_id uuid not null,location_id uuid not null,staff_user_id uuid not null references public.profiles(user_id),policy_id uuid not null,
 scope text not null check(scope in ('SERVICE','SERVICE_CATEGORY','DEFAULT_SERVICE','DEFAULT_RETAIL')),service_id uuid,category text,
 effective_from timestamptz not null,effective_until timestamptz,reason text not null,actor_id uuid not null references public.profiles(user_id),created_at timestamptz not null default statement_timestamp(),correlation_id uuid not null,
 foreign key(organization_id,location_id,policy_id) references public.commission_policies(organization_id,location_id,id),foreign key(organization_id,service_id) references public.salon_services(organization_id,id),
 check(effective_until is null or effective_until>effective_from),check((scope='SERVICE')=(service_id is not null)),check((scope='SERVICE_CATEGORY')=(category is not null))
);
-- Assignment endings are appended, never an UPDATE of the historical assignment.
create table public.commission_assignment_endings(assignment_id uuid primary key references public.commission_assignments(id),organization_id uuid not null,location_id uuid not null,effective_until timestamptz not null,reason text not null,actor_id uuid not null references public.profiles(user_id),created_at timestamptz not null default statement_timestamp(),correlation_id uuid not null);
create table public.profitability_revenue_facts(
 charge_id uuid primary key references public.finance_documents(id),organization_id uuid not null,location_id uuid not null,client_id uuid,appointment_id uuid,live_session_id uuid,service_id uuid,service_name text,service_version bigint,category text,performed_by uuid,
 domain text not null check(domain in ('SERVICE','RETAIL')),currency text not null,gross_minor bigint not null,net_minor bigint not null,tax_minor bigint not null,tax_rate_bps integer not null,tax_inclusive boolean not null,
 eligible_at timestamptz not null,created_at timestamptz not null default statement_timestamp(),check(gross_minor=net_minor+tax_minor)
);
create index profitability_period on public.profitability_revenue_facts(organization_id,location_id,eligible_at desc,charge_id);
create table public.profitability_retail_performers(
 charge_id uuid primary key references public.profitability_revenue_facts(charge_id),organization_id uuid not null,location_id uuid not null,staff_user_id uuid not null references public.profiles(user_id),actor_id uuid not null references public.profiles(user_id),reason text not null,created_at timestamptz not null default statement_timestamp(),correlation_id uuid not null
);
create table public.profitability_zero_cost_declarations(
 charge_id uuid primary key references public.profitability_revenue_facts(charge_id),organization_id uuid not null,location_id uuid not null,actor_id uuid not null references public.profiles(user_id),reason text not null,created_at timestamptz not null default statement_timestamp(),correlation_id uuid not null
);
create table public.commission_accruals(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,location_id uuid not null,charge_id uuid not null unique references public.profitability_revenue_facts(charge_id),staff_user_id uuid not null references public.profiles(user_id),
 policy_id uuid not null,policy_version bigint not null,assignment_id uuid not null references public.commission_assignments(id),method text not null,rate_bps integer,fixed_minor bigint,basis_minor bigint not null,amount_minor bigint not null check(amount_minor>=0 and amount_minor<=basis_minor),currency text not null,
 eligible_at timestamptz not null,created_at timestamptz not null default statement_timestamp(),foreign key(policy_id,policy_version) references public.commission_policy_versions(policy_id,version)
);
create index commission_staff_period on public.commission_accruals(organization_id,location_id,staff_user_id,eligible_at desc,id);
create table public.profitability_adjustments(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,location_id uuid not null,charge_id uuid not null references public.profitability_revenue_facts(charge_id),source_document_id uuid not null references public.finance_documents(id),source_allocation_id uuid unique references public.finance_payment_allocations(id),
 gross_delta_minor bigint not null,net_delta_minor bigint not null,tax_delta_minor bigint not null,created_at timestamptz not null default statement_timestamp(),unique(charge_id,source_document_id),check(gross_delta_minor<=0),check(gross_delta_minor=net_delta_minor+tax_delta_minor)
);
create table public.commission_adjustments(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,location_id uuid not null,accrual_id uuid not null references public.commission_accruals(id),staff_user_id uuid not null references public.profiles(user_id),source_document_id uuid not null references public.finance_documents(id),
 amount_minor bigint not null check(amount_minor<=0),reason text not null,created_at timestamptz not null default statement_timestamp(),unique(accrual_id,source_document_id)
);
create table app_private.costing_receipts(organization_id uuid not null,location_id uuid not null,actor_id uuid not null,mutation_id uuid not null,input jsonb not null,response jsonb not null,created_at timestamptz not null default statement_timestamp(),primary key(organization_id,actor_id,mutation_id));
create table app_private.cost_intake_requests(organization_id uuid not null,location_id uuid not null,actor_id uuid not null,mutation_id uuid not null,stock_item_id uuid not null,quantity_hundredths numeric not null,incoming_numerator numeric not null,incoming_denominator numeric not null,currency text not null,cost_basis_at timestamptz not null,external_reference text,primary key(organization_id,actor_id,mutation_id));

-- Private factual triggers are callable only by PostgreSQL triggers. Their input is
-- an already validated relational stock/finance row, never a browser cost payload.
do $$declare t text;perm text;begin
 foreach t in array array['stock_cost_basis_events','direct_cost_facts','commission_policies','commission_policy_versions','commission_assignments','commission_assignment_endings','profitability_revenue_facts','profitability_retail_performers','profitability_zero_cost_declarations','commission_accruals','profitability_adjustments','commission_adjustments'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select on public.%I to authenticated',t);
  if t in ('commission_accruals','commission_adjustments') then
   execute format('create policy costing_read on public.%I for select to authenticated using(app_private.user_has_permission(organization_id,location_id,''commission.view_all'') or (staff_user_id=auth.uid() and app_private.user_has_permission(organization_id,location_id,''commission.view_self'')))',t);
  else
   perm:=case when t in ('commission_policies','commission_policy_versions','commission_assignments','commission_assignment_endings') then 'commission.manage_policies' else 'cost.view' end;
   execute format('create policy costing_read on public.%I for select to authenticated using(app_private.user_has_permission(organization_id,location_id,%L))',t,perm);
  end if;
  execute format('create trigger costing_immutable before update or delete on public.%I for each row execute function app_private.live_immutable()',t);
 end loop;
end $$;
revoke all on app_private.costing_receipts,app_private.cost_intake_requests from public,anon,authenticated,service_role;
create trigger costing_receipt_immutable before update or delete on app_private.costing_receipts for each row execute function app_private.live_immutable();
create trigger costing_intake_immutable before update or delete on app_private.cost_intake_requests for each row execute function app_private.live_immutable();

create function app_private.cost_round(n numeric,d numeric) returns bigint language sql immutable set search_path='' as $$select (case when n<0 then -div(-n*2+d,d*2) else div(n*2+d,d*2) end)::bigint$$;
create function app_private.cost_gcd(n numeric,d numeric) returns numeric language plpgsql immutable set search_path='' as $$declare r numeric;begin n:=abs(n);d:=abs(d);while d<>0 loop r:=mod(n,d);n:=d;d:=r;end loop;return greatest(n,1);end$$;
create function app_private.costing_audit(org uuid,loc uuid,action text,eid uuid,why text,corr uuid) returns void language sql volatile security definer set search_path='' as $$
 insert into public.audit_events(organization_id,location_id,actor_user_id,action,entity_type,entity_id,reason,metadata,correlation_id) values(org,loc,auth.uid(),'costing.'||action,'costing',eid,why,'{}',corr);
$$;

-- Item row -> explicitly selected lot row; never acquire a finance/session lock here.
create function app_private.cost_stock_posted() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.stock_movements%rowtype:=new;p public.stock_cost_basis_events%rowtype;b public.stock_cost_basis_events%rowtype;a public.direct_cost_facts%rowtype;intake app_private.cost_intake_requests%rowtype;lot uuid;cc text;dq numeric;before_q numeric;after_q numeric;vn numeric;vd numeric;rn numeric;rd numeric;g numeric;known boolean;anchor_found boolean;cost bigint;prior_cost bigint;consumed numeric;basis_id uuid;basis_version bigint;domain text;source_client uuid;session_id uuid;bowl_id uuid;product_id uuid;fin_id uuid;
begin
 perform 1 from public.stock_items where id=m.stock_item_id for update;
 if m.stock_lot_id is not null then perform 1 from public.stock_lots where id=m.stock_lot_id for update;end if;
 cc:=(select base_currency from public.organizations where id=m.organization_id);dq:=m.quantity_delta*100;
 select * into intake from app_private.cost_intake_requests where organization_id=m.organization_id and location_id=m.location_id and actor_id=m.recorded_by and mutation_id=m.mutation_id and stock_item_id=m.stock_item_id;
 if found and (intake.quantity_hundredths<>dq or intake.currency<>cc or m.movement_type not in ('OPENING','RECEIPT')) then raise exception using errcode='22023',message='COST_CONFLICT';end if;
 session_id:=m.source_session_id;bowl_id:=m.source_bowl_id;product_id:=m.source_product_id;fin_id:=m.finance_document_id;
 select * into a from public.direct_cost_facts where stock_movement_id=m.reversal_of;
 if a.id is null and m.source_session_id is not null then
  select * into a from public.direct_cost_facts f where f.source_session_id=m.source_session_id and f.source_bowl_id=m.source_bowl_id and f.source_product_id=m.source_product_id and f.correction_of is null order by f.created_at,f.id limit 1;
 end if;
 anchor_found:=a.id is not null;
 if m.reversal_of is not null and anchor_found then session_id:=a.source_session_id;bowl_id:=a.source_bowl_id;product_id:=a.source_product_id;fin_id:=a.finance_document_id;end if;
 -- Lot basis is used only for a lot explicitly identified on the actual movement.
 select * into b from public.stock_cost_basis_events where stock_item_id=m.stock_item_id and stock_lot_id is not distinct from m.stock_lot_id order by version desc limit 1;
 if b.id is null or b.status<>'KNOWN' then select * into b from public.stock_cost_basis_events where stock_item_id=m.stock_item_id and stock_lot_id is null order by version desc limit 1;end if;
 if anchor_found then rn:=a.unit_cost_numerator;rd:=a.unit_cost_denominator;basis_id:=a.cost_basis_event_id;basis_version:=a.cost_basis_version;known:=a.status='KNOWN';
 else rn:=b.value_numerator;rd:=b.value_denominator*b.quantity_hundredths;basis_id:=b.id;basis_version:=b.version;known:=b.id is not null and b.status='KNOWN' and b.quantity_hundredths>0 and b.quantity_hundredths>=-dq;end if;
 if rd is null or rd<=0 then rn:=null;rd:=null;known:=false;end if;
 if m.quantity_delta<0 and (select coalesce(sum(quantity_delta),0)*100-dq from public.stock_movements where stock_item_id=m.stock_item_id)<-dq then known:=false;end if;
 domain:=case when fin_id is not null then 'RETAIL' when session_id is not null then 'LIVE_USAGE' else 'STOCK_ADJUSTMENT' end;
 if dq<0 or anchor_found or session_id is not null then
  if m.reversal_of is not null and anchor_found then cost:=-a.total_cost_minor;
  elsif known and session_id is not null and anchor_found then
   select coalesce(sum(total_cost_minor),0) into prior_cost from public.direct_cost_facts where source_session_id=session_id and source_bowl_id=bowl_id and source_product_id=product_id;
   select -sum(quantity_delta)*100 into consumed from public.stock_movements where source_session_id=session_id and source_bowl_id=bowl_id and source_product_id=product_id;
   cost:=app_private.cost_round(consumed*rn,rd)-prior_cost;
  elsif known then cost:=app_private.cost_round(-dq*rn,rd);else cost:=null;end if;
  select client_id into source_client from public.live_sessions where id=session_id;
  insert into public.direct_cost_facts(organization_id,location_id,stock_movement_id,stock_item_id,stock_lot_id,source_session_id,source_bowl_id,source_product_id,finance_document_id,source_client_id,quantity,unit,currency,cost_basis_event_id,cost_basis_version,unit_cost_numerator,unit_cost_denominator,total_cost_minor,status,source_domain,correction_of,actor_id,correlation_id)
  values(m.organization_id,m.location_id,m.id,m.stock_item_id,m.stock_lot_id,session_id,bowl_id,product_id,fin_id,source_client,(-m.quantity_delta)::text,m.unit,cc,basis_id,basis_version,rn,rd,case when known then cost end,case when known then 'KNOWN' else 'UNKNOWN' end,domain,a.id,m.recorded_by,m.correlation_id);
  perform app_private.costing_audit(m.organization_id,m.location_id,case when anchor_found then 'direct_cost_corrected' else 'direct_cost_created' end,m.id,m.reason,m.correlation_id);
 end if;
 foreach lot in array case when m.stock_lot_id is null then array[null::uuid] else array[null::uuid,m.stock_lot_id] end loop
  select * into p from public.stock_cost_basis_events where stock_item_id=m.stock_item_id and stock_lot_id is not distinct from lot order by version desc limit 1;
  select coalesce(sum(quantity_delta),0)*100 into after_q from public.stock_movements where stock_item_id=m.stock_item_id and (lot is null or stock_lot_id=lot);
  before_q:=after_q-dq;vn:=coalesce(p.value_numerator,0);vd:=coalesce(p.value_denominator,1);known:=(before_q=0 or p.status='KNOWN') and before_q>=0;
  if dq>0 and intake.mutation_id is not null then vn:=vn*intake.incoming_denominator+intake.incoming_numerator*vd;vd:=vd*intake.incoming_denominator;
  elsif dq>0 and anchor_found and a.status='KNOWN' then vn:=vn*a.unit_cost_denominator+dq*a.unit_cost_numerator*vd;vd:=vd*a.unit_cost_denominator;
  elsif dq<0 and known and before_q>=-dq then vn:=vn*(before_q+dq);vd:=vd*before_q;
  else known:=false;end if;
  if after_q=0 then vn:=0;vd:=1;known:=true;elsif after_q<0 then vn:=0;vd:=1;known:=false;end if;
  g:=app_private.cost_gcd(vn,vd);vn:=div(vn,g);vd:=div(vd,g);
  insert into public.stock_cost_basis_events(organization_id,location_id,stock_item_id,stock_lot_id,version,stock_movement_id,previous_event_id,quantity_hundredths,value_numerator,value_denominator,status,currency,event_type,incoming_numerator,incoming_denominator,cost_basis_at,external_reference,reason,actor_id,correlation_id,mutation_id)
  values(m.organization_id,m.location_id,m.stock_item_id,lot,coalesce(p.version,0)+1,m.id,p.id,after_q,vn,vd,case when known then 'KNOWN' else 'UNKNOWN' end,cc,'MOVEMENT',intake.incoming_numerator,intake.incoming_denominator,coalesce(intake.cost_basis_at,m.occurred_at),intake.external_reference,m.reason,m.recorded_by,m.correlation_id,m.mutation_id);
 end loop;
 return new;
end$$;
create trigger cost_stock_posted after insert on public.stock_movements for each row execute function app_private.cost_stock_posted();

create function app_private.commission_accrue(cid uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.profitability_revenue_facts%rowtype;a public.commission_assignments%rowtype;p public.commission_policy_versions%rowtype;staff uuid;basis bigint;n bigint;corr uuid;begin
 select * into r from public.profitability_revenue_facts where charge_id=cid;if not found then return;end if;
 -- The caller holds finance location lock; a source uniqueness constraint is the second barrier.
 staff:=coalesce(r.performed_by,(select staff_user_id from public.profitability_retail_performers where charge_id=cid));if staff is null then return;end if;
 select x.* into a from public.commission_assignments x join public.commission_policies po on po.id=x.policy_id where x.organization_id=r.organization_id and x.location_id=r.location_id and x.staff_user_id=staff and po.domain=r.domain and x.effective_from<=r.eligible_at and (x.effective_until is null or r.eligible_at<x.effective_until) and
 not exists(select 1 from public.commission_assignment_endings en where en.assignment_id=x.id and en.effective_until<=r.eligible_at) and (x.scope='SERVICE' and x.service_id=r.service_id or x.scope='SERVICE_CATEGORY' and x.category=r.category or x.scope='DEFAULT_'||r.domain)
 order by case x.scope when 'SERVICE' then 1 when 'SERVICE_CATEGORY' then 2 else 3 end limit 1;
 if not found then return;end if;
 select * into p from public.commission_policy_versions where policy_id=a.policy_id and effective_from<=r.eligible_at order by effective_from desc,version desc limit 1;
 if not found or p.currency<>r.currency then return;end if;
 basis:=case when p.method='PERCENT_GROSS' then r.gross_minor else r.net_minor end;
 n:=least(basis,case when p.method='FIXED_AMOUNT' then p.fixed_minor else app_private.cost_round(basis::numeric*p.rate_bps,10000) end);
 insert into public.commission_accruals(organization_id,location_id,charge_id,staff_user_id,policy_id,policy_version,assignment_id,method,rate_bps,fixed_minor,basis_minor,amount_minor,currency,eligible_at) values(r.organization_id,r.location_id,cid,staff,p.policy_id,p.version,a.id,p.method,p.rate_bps,p.fixed_minor,basis,n,r.currency,r.eligible_at) on conflict(charge_id) do nothing;
 if found then select correlation_id into corr from public.finance_documents where id=cid;perform app_private.costing_audit(r.organization_id,r.location_id,'commission_accrued',cid,'Authoritative performer; immutable policy and revenue basis',corr);end if;
end$$;
create function app_private.profitability_adjust(cid uuid,source_id uuid,allocation_id uuid,gross bigint) returns void language plpgsql security definer set search_path='' as $$
declare r public.profitability_revenue_facts%rowtype;a public.commission_accruals%rowtype;previous bigint;total bigint;old_net bigint;new_net bigint;old_comm bigint;new_comm bigint;corr uuid;begin
 select * into r from public.profitability_revenue_facts where charge_id=cid;if not found then return;end if;
 if exists(select 1 from public.profitability_adjustments where charge_id=cid and source_document_id=source_id) then return;end if;
 select -coalesce(sum(gross_delta_minor),0) into previous from public.profitability_adjustments where charge_id=cid;total:=least(r.gross_minor,previous+gross);
 old_net:=app_private.cost_round(r.net_minor::numeric*previous,r.gross_minor);new_net:=app_private.cost_round(r.net_minor::numeric*total,r.gross_minor);
 insert into public.profitability_adjustments(organization_id,location_id,charge_id,source_document_id,source_allocation_id,gross_delta_minor,net_delta_minor,tax_delta_minor) values(r.organization_id,r.location_id,cid,source_id,allocation_id,previous-total,old_net-new_net,(previous-total)-(old_net-new_net));
 select * into a from public.commission_accruals where charge_id=cid;
 if found then
  old_comm:=app_private.cost_round(a.amount_minor::numeric*previous,r.gross_minor);new_comm:=app_private.cost_round(a.amount_minor::numeric*total,r.gross_minor);
  insert into public.commission_adjustments(organization_id,location_id,accrual_id,staff_user_id,source_document_id,amount_minor,reason) values(r.organization_id,r.location_id,a.id,a.staff_user_id,source_id,old_comm-new_comm,'Commission follows cumulative recognized revenue; no payroll payment');
  select correlation_id into corr from public.finance_documents where id=source_id;perform app_private.costing_audit(r.organization_id,r.location_id,'commission_adjusted',source_id,'Revenue refund/reversal; cumulative exact residual allocation',corr);
 end if;
end$$;
create table app_private.cost_service_categories(appointment_id uuid not null references public.salon_appointments(id),service_version bigint not null,category text not null,primary key(appointment_id,service_version));
revoke all on app_private.cost_service_categories from public,anon,authenticated,service_role;
create trigger cost_category_immutable before update or delete on app_private.cost_service_categories for each row execute function app_private.live_immutable();
create function app_private.cost_service_category() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' or (new.service_id,new.service_version) is distinct from (old.service_id,old.service_version) then
  insert into app_private.cost_service_categories(appointment_id,service_version,category) select new.id,new.service_version,category from public.salon_services where id=new.service_id and version=new.service_version on conflict do nothing;
 end if;return new;
end$$;
create trigger cost_service_category after insert or update on public.salon_appointments for each row execute function app_private.cost_service_category();
create function app_private.profitability_finance_posted() returns trigger language plpgsql security definer set search_path='' as $$declare ap public.salon_appointments%rowtype;category text;begin
 if new.type in ('SERVICE_CHARGE','RETAIL_SALE') then
  select * into ap from public.salon_appointments where id=new.appointment_id;
  select c.category into category from app_private.cost_service_categories c where c.appointment_id=ap.id and c.service_version=ap.service_version;
  insert into public.profitability_revenue_facts(charge_id,organization_id,location_id,client_id,appointment_id,live_session_id,service_id,service_name,service_version,category,performed_by,domain,currency,gross_minor,net_minor,tax_minor,tax_rate_bps,tax_inclusive,eligible_at)
  values(new.id,new.organization_id,new.location_id,new.client_id,new.appointment_id,new.live_session_id,new.service_id,coalesce(new.service_name_snapshot,new.description),new.service_version,category,new.performed_by,case when new.type='RETAIL_SALE' then 'RETAIL' else 'SERVICE' end,new.currency,new.amount_minor,new.net_amount_minor,new.tax_amount_minor,new.tax_rate_bps,new.tax_inclusive,coalesce(ap.completed_at,new.occurred_at));
  perform app_private.commission_accrue(new.id);
 elsif new.type='REVERSAL' then perform app_private.profitability_adjust(new.reversal_of,new.id,null,new.amount_minor);end if;
 return new;
end$$;
create trigger profitability_finance_posted after insert on public.finance_documents for each row execute function app_private.profitability_finance_posted();
create function app_private.profitability_refund_posted() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.amount_minor<0 and exists(select 1 from public.finance_documents where id=new.source_document_id and type='REFUND') then
  -- Multiple release rows for the same charge/refund are collected after the final
  -- allocation insert by the deferred trigger, rather than dropping subsequent lines.
  perform app_private.profitability_adjust(new.charge_id,new.source_document_id,new.id,(select -sum(amount_minor) from public.finance_payment_allocations where charge_id=new.charge_id and source_document_id=new.source_document_id));
 end if;return new;
end$$;
create constraint trigger profitability_refund_posted after insert on public.finance_payment_allocations deferrable initially deferred for each row execute function app_private.profitability_refund_posted();

-- Existing history is deliberately NOT repriced or given today's policies.
insert into public.profitability_revenue_facts(charge_id,organization_id,location_id,client_id,appointment_id,live_session_id,service_id,service_name,service_version,performed_by,domain,currency,gross_minor,net_minor,tax_minor,tax_rate_bps,tax_inclusive,eligible_at)
 select d.id,d.organization_id,d.location_id,d.client_id,d.appointment_id,d.live_session_id,d.service_id,coalesce(d.service_name_snapshot,d.description),d.service_version,d.performed_by,case when d.type='RETAIL_SALE' then 'RETAIL' else 'SERVICE' end,d.currency,d.amount_minor,d.net_amount_minor,d.tax_amount_minor,d.tax_rate_bps,d.tax_inclusive,coalesce(a.completed_at,d.occurred_at) from public.finance_documents d left join public.salon_appointments a on a.id=d.appointment_id where d.type in ('SERVICE_CHARGE','RETAIL_SALE');
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in ('cost_round','cost_gcd','costing_audit','cost_stock_posted','commission_accrue','profitability_adjust','profitability_finance_posted','profitability_refund_posted','cost_service_category') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end$$;

-- Preserve past reversals/refunds; no current policy is applied to past charges.
do $$declare d record;begin
 for d in select id,reversal_of,amount_minor from public.finance_documents where type='REVERSAL' loop perform app_private.profitability_adjust(d.reversal_of,d.id,null,d.amount_minor);end loop;
 for d in select a.charge_id,a.source_document_id,min(a.id::text)::uuid aid,-sum(a.amount_minor)::bigint n from public.finance_payment_allocations a join public.finance_documents f on f.id=a.source_document_id where a.amount_minor<0 and f.type='REFUND' group by a.charge_id,a.source_document_id order by min(f.created_at),a.source_document_id loop perform app_private.profitability_adjust(d.charge_id,d.source_document_id,d.aid,d.n);end loop;
end$$;
