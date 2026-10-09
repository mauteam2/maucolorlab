-- ELIFORA operational finance. Money is integer minor units; immutable facts own all balances.
create role elifora_finance_writer nologin nobypassrls;
grant authenticated to elifora_finance_writer;
grant elifora_finance_writer to postgres;
grant usage on schema public,app_private,extensions to elifora_finance_writer;
grant execute on function app_private.hair_write_context(uuid,uuid,text),app_private.crm_family(uuid,uuid) to elifora_finance_writer;
insert into public.permissions(code,description) select p,'ELIFORA operational finance: '||p from unnest(array['finance.view','finance.charge','finance.payment','finance.refund','finance.expense.view','finance.expense.manage','finance.cash.open','finance.cash.close','finance.adjust']) p;
insert into public.role_permissions(role_code,permission_code) select r,p from unnest(array['owner','manager']) r cross join unnest(array['finance.view','finance.charge','finance.payment','finance.refund','finance.expense.view','finance.expense.manage','finance.cash.open','finance.cash.close','finance.adjust']) p;
-- Reception receives no expense/adjustment/closing permissions. Technical staff get no finance history.
insert into public.role_permissions(role_code,permission_code) select 'reception',p from unnest(array['finance.view','finance.charge','finance.payment','finance.refund','finance.cash.open']) p;
create table public.finance_currencies(code text primary key,exponent smallint not null check(exponent between 0 and 4),unique(code,exponent));
insert into public.finance_currencies values('TRY',2),('EUR',2),('USD',2),('GBP',2),('JPY',0),('KWD',3);
revoke all on public.finance_currencies from public,anon,authenticated,service_role;
grant select on public.finance_currencies to authenticated,elifora_finance_writer;
alter table public.finance_currencies enable row level security;
create policy currencies_read on public.finance_currencies for select to authenticated using(auth.uid() is not null);
create table public.finance_settings(
 organization_id uuid primary key references public.organizations(id),currency text not null,exponent smallint not null,version bigint not null check(version>0),updated_by uuid not null references public.profiles(user_id),updated_at timestamptz not null,
 foreign key(currency,exponent) references public.finance_currencies(code,exponent),unique(organization_id,currency)
);
create table public.finance_cash_sessions(
 id uuid primary key,organization_id uuid not null,location_id uuid not null,register_code text not null default 'MAIN' check(register_code='MAIN'),currency text not null,
 status text not null check(status in ('OPEN','CLOSING_REVIEW','CLOSED')),version bigint not null default 1,
 opening_cash_minor bigint not null check(opening_cash_minor between 0 and 9000000000000000),opened_by uuid not null references public.profiles(user_id),opened_at timestamptz not null,
 expected_cash_minor bigint,counted_cash_minor bigint check(counted_cash_minor>=0),difference_minor bigint,close_basis_count bigint,closed_by uuid references public.profiles(user_id),closed_at timestamptz,close_reason text,
 unique(organization_id,location_id,id),foreign key(organization_id,location_id) references public.locations(organization_id,id),foreign key(organization_id,currency) references public.finance_settings(organization_id,currency),
 check((status='OPEN' and expected_cash_minor is null and counted_cash_minor is null and difference_minor is null and closed_at is null) or (status in ('CLOSING_REVIEW','CLOSED') and expected_cash_minor is not null and counted_cash_minor is not null and difference_minor=counted_cash_minor-expected_cash_minor)),check((status='CLOSED')=(closed_at is not null))
);
create unique index finance_one_active_register on public.finance_cash_sessions(organization_id,location_id,register_code) where status<>'CLOSED';
create index finance_cash_history on public.finance_cash_sessions(organization_id,location_id,opened_at desc,id);
create table public.finance_documents(
 id uuid primary key,organization_id uuid not null,location_id uuid not null,client_id uuid,appointment_id uuid,live_session_id uuid,
 type text not null check(type in ('SERVICE_CHARGE','RETAIL_SALE','DEPOSIT','PAYMENT','REFUND','EXPENSE','CLIENT_CREDIT','CLIENT_DEBIT','ADJUSTMENT','REVERSAL')),
 currency text not null,amount_minor bigint not null check(amount_minor between 1 and 9000000000000000),net_amount_minor bigint not null check(net_amount_minor>=0),tax_amount_minor bigint not null check(tax_amount_minor>=0),tax_rate_bps integer not null check(tax_rate_bps between 0 and 10000),tax_inclusive boolean not null,
 description text not null check(char_length(trim(description)) between 1 and 500),reason text not null check(char_length(trim(reason)) between 1 and 2000),external_reference text check(char_length(external_reference)<=160),
 service_id uuid,service_name_snapshot text,service_version bigint,performed_by uuid references public.profiles(user_id),reversal_of uuid,original_payment_id uuid,
 recorded_by uuid not null references public.profiles(user_id),occurred_at timestamptz not null,created_at timestamptz not null,correlation_id uuid not null,mutation_id uuid not null,version bigint not null default 1 check(version=1),
 unique(organization_id,location_id,id),unique(organization_id,location_id,client_id,id),unique(reversal_of),
 foreign key(organization_id,currency) references public.finance_settings(organization_id,currency),foreign key(organization_id,location_id) references public.locations(organization_id,id),foreign key(organization_id,client_id) references public.clients(organization_id,id),
 foreign key(organization_id,location_id,client_id,appointment_id) references public.salon_appointments(organization_id,location_id,client_id,id),foreign key(organization_id,client_id,live_session_id) references public.live_sessions(organization_id,client_id,id),
 foreign key(organization_id,location_id,reversal_of) references public.finance_documents(organization_id,location_id,id),foreign key(organization_id,location_id,original_payment_id) references public.finance_documents(organization_id,location_id,id),
 check(net_amount_minor+tax_amount_minor=amount_minor),check((type='REVERSAL')=(reversal_of is not null)),check((type='REFUND')=(original_payment_id is not null)),check(live_session_id is null or appointment_id is not null)
);
create unique index finance_one_appointment_charge on public.finance_documents(appointment_id) where type='SERVICE_CHARGE';
create index finance_document_history on public.finance_documents(organization_id,location_id,occurred_at desc,id);
create index finance_document_client on public.finance_documents(organization_id,location_id,client_id,occurred_at desc,id);
create index finance_document_payment on public.finance_documents(original_payment_id);
create index finance_document_live on public.finance_documents(live_session_id) where live_session_id is not null;
create table public.finance_payments(
 document_id uuid primary key,organization_id uuid not null,location_id uuid not null,client_id uuid not null,currency text not null,method text not null check(method in ('CASH','CARD','BANK_TRANSFER','OTHER')),cash_session_id uuid,
 foreign key(organization_id,location_id,client_id,document_id) references public.finance_documents(organization_id,location_id,client_id,id),foreign key(organization_id,location_id,cash_session_id) references public.finance_cash_sessions(organization_id,location_id,id),unique(organization_id,location_id,document_id)
);
create table public.finance_payment_allocations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,location_id uuid not null,payment_id uuid not null,charge_id uuid not null,currency text not null,amount_minor bigint not null check(amount_minor<>0),release_of uuid,source_document_id uuid not null,recorded_by uuid not null references public.profiles(user_id),created_at timestamptz not null,correlation_id uuid not null,mutation_id uuid not null,
 foreign key(organization_id,location_id,payment_id) references public.finance_payments(organization_id,location_id,document_id),foreign key(organization_id,location_id,charge_id) references public.finance_documents(organization_id,location_id,id),foreign key(organization_id,location_id,source_document_id) references public.finance_documents(organization_id,location_id,id),foreign key(release_of) references public.finance_payment_allocations(id),check((amount_minor<0)=(release_of is not null))
);
create index finance_alloc_payment on public.finance_payment_allocations(payment_id) include(amount_minor);
create index finance_alloc_charge on public.finance_payment_allocations(charge_id) include(amount_minor);
create index finance_alloc_release on public.finance_payment_allocations(release_of);
create table public.finance_expenses(
 document_id uuid primary key,organization_id uuid not null,location_id uuid not null,category text not null check(category in ('RENT','UTILITIES','SUPPLIES','MAINTENANCE','MARKETING','OTHER')),method text not null check(method in ('CASH','CARD','BANK_TRANSFER','OTHER')),stock_receipt_id uuid references public.stock_movements(id),cash_session_id uuid,
 foreign key(organization_id,location_id,document_id) references public.finance_documents(organization_id,location_id,id),foreign key(organization_id,location_id,cash_session_id) references public.finance_cash_sessions(organization_id,location_id,id)
);
create table public.finance_retail_lines(
 document_id uuid primary key,organization_id uuid not null,location_id uuid not null,stock_item_id uuid not null,stock_lot_id uuid,quantity numeric(14,2) not null check(quantity>0),unit_price_minor bigint not null check(unit_price_minor>0),stock_movement_id uuid unique,
 foreign key(organization_id,location_id,document_id) references public.finance_documents(organization_id,location_id,id),foreign key(organization_id,location_id,stock_item_id) references public.stock_items(organization_id,location_id,id),foreign key(organization_id,location_id,stock_item_id,stock_lot_id) references public.stock_lots(organization_id,location_id,stock_item_id,id),foreign key(stock_movement_id) references public.stock_movements(id)
);
create table public.finance_ledger_entries(
 id uuid primary key default gen_random_uuid(),document_id uuid not null,organization_id uuid not null,location_id uuid not null,client_id uuid,currency text not null,account text not null check(account in ('CLIENT','CASH','CARD','BANK_TRANSFER','OTHER')),amount_minor bigint not null check(amount_minor<>0),cash_session_id uuid,recorded_by uuid not null references public.profiles(user_id),created_at timestamptz not null,
 foreign key(organization_id,location_id,document_id) references public.finance_documents(organization_id,location_id,id),foreign key(organization_id,client_id) references public.clients(organization_id,id),foreign key(organization_id,location_id,cash_session_id) references public.finance_cash_sessions(organization_id,location_id,id),check((account='CLIENT')=(client_id is not null)),check(account='CASH' or cash_session_id is null)
);
create index finance_ledger_client on public.finance_ledger_entries(organization_id,location_id,client_id) include(amount_minor);
create index finance_ledger_cash on public.finance_ledger_entries(cash_session_id) include(amount_minor);
create index finance_ledger_document on public.finance_ledger_entries(document_id);
create table app_private.finance_receipts(organization_id uuid not null,location_id uuid not null,actor_id uuid not null,mutation_id uuid not null,input jsonb not null,response jsonb not null,created_at timestamptz not null default statement_timestamp(),primary key(organization_id,actor_id,mutation_id));
grant select,insert on app_private.finance_receipts to elifora_finance_writer;
create trigger finance_receipt_immutable before update or delete on app_private.finance_receipts for each row execute function app_private.live_immutable();
do $$declare t text;perm text;begin
 foreach t in array array['finance_settings','finance_cash_sessions','finance_documents','finance_payments','finance_payment_allocations','finance_expenses','finance_retail_lines','finance_ledger_entries'] loop
  perm:=case when t='finance_expenses' then 'finance.expense.view' when t='finance_cash_sessions' then 'finance.cash.close' else 'finance.view' end;
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select on public.%I to authenticated',t);execute format('grant select,insert on public.%I to elifora_finance_writer',t);
  if t='finance_settings' then
   execute format('create policy finance_read on public.%I for select to authenticated using(exists(select 1 from public.locations l where l.organization_id=finance_settings.organization_id and app_private.user_has_permission(l.organization_id,l.id,''finance.view'')))',t);
   execute format('create policy finance_writer on public.%I for all to elifora_finance_writer using(exists(select 1 from public.locations l where l.organization_id=finance_settings.organization_id and app_private.user_has_permission(l.organization_id,l.id,''finance.view''))) with check(exists(select 1 from public.locations l where l.organization_id=finance_settings.organization_id and app_private.user_has_permission(l.organization_id,l.id,''finance.view'')))',t);
  else
   execute format('create policy finance_read on public.%I for select to authenticated using(app_private.user_has_permission(organization_id,location_id,%L)%s)',t,perm,case when t='finance_documents' then ' and (type<>''EXPENSE'' and not exists(select 1 from public.finance_expenses e where e.document_id=finance_documents.reversal_of) or app_private.user_has_permission(organization_id,location_id,''finance.expense.view''))' when t='finance_ledger_entries' then ' and (not exists(select 1 from public.finance_documents d where d.id=finance_ledger_entries.document_id and d.type=''EXPENSE'') or app_private.user_has_permission(organization_id,location_id,''finance.expense.view''))' else '' end);
   execute format('create policy finance_writer on public.%I for all to elifora_finance_writer using(app_private.user_has_permission(organization_id,location_id,''finance.view'')) with check(app_private.user_has_permission(organization_id,location_id,''finance.view''))',t);
  end if;
  if t not in ('finance_settings','finance_cash_sessions') then execute format('create trigger finance_immutable before update or delete on public.%I for each row execute function app_private.live_immutable()',t);end if;
 end loop;
end $$;
grant update on public.finance_settings,public.finance_cash_sessions to elifora_finance_writer;
grant insert on public.audit_events to elifora_finance_writer;
create policy finance_audit on public.audit_events for insert to elifora_finance_writer with check(actor_user_id=auth.uid() and action like 'finance.%' and entity_type='finance' and app_private.user_has_permission(organization_id,location_id,'finance.view'));
create function app_private.finance_audit(org uuid,loc uuid,op text,eid uuid,why text,correlation uuid) returns void language sql volatile security invoker set search_path='' as $$
 insert into public.audit_events(organization_id,location_id,actor_user_id,action,entity_type,entity_id,correlation_id,metadata,reason) values(org,loc,auth.uid(),'finance.'||lower(op),'finance',eid,correlation,'{}',why);
$$;
create function app_private.finance_minor(v jsonb,allow_zero boolean default false) returns bigint language plpgsql immutable set search_path='' as $$declare n bigint;begin
 if jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^(0|[1-9][0-9]{0,15})$' then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;n:=(v#>>'{}')::bigint;if n>9000000000000000 or (n=0 and not allow_zero) then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;return n;
end $$;
create function app_private.finance_cash_expected(sid uuid) returns bigint language sql volatile security invoker set search_path='' as $$select s.opening_cash_minor+coalesce((select sum(e.amount_minor) from public.finance_ledger_entries e where e.cash_session_id=s.id),0)::bigint from public.finance_cash_sessions s where s.id=sid;$$;
create function app_private.finance_outstanding(cid uuid) returns bigint language sql volatile security invoker set search_path='' as $$select d.amount_minor-coalesce((select sum(a.amount_minor) from public.finance_payment_allocations a where a.charge_id=d.id),0)::bigint from public.finance_documents d where d.id=cid and d.type in ('SERVICE_CHARGE','RETAIL_SALE') and not exists(select 1 from public.finance_documents r where r.reversal_of=d.id);$$;
create function app_private.finance_available(pid uuid) returns bigint language sql volatile security invoker set search_path='' as $$select d.amount_minor-coalesce((select sum(r.amount_minor) from public.finance_documents r where r.original_payment_id=d.id),0)::bigint-coalesce((select sum(a.amount_minor) from public.finance_payment_allocations a where a.payment_id=d.id),0)::bigint from public.finance_documents d where d.id=pid and d.type in ('PAYMENT','DEPOSIT','CLIENT_CREDIT') and not exists(select 1 from public.finance_documents r where r.reversal_of=d.id);$$;
revoke all on function app_private.finance_audit(uuid,uuid,text,uuid,text,uuid),app_private.finance_minor(jsonb,boolean),app_private.finance_cash_expected(uuid),app_private.finance_outstanding(uuid),app_private.finance_available(uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.finance_audit(uuid,uuid,text,uuid,text,uuid),app_private.finance_minor(jsonb,boolean),app_private.finance_cash_expected(uuid),app_private.finance_outstanding(uuid),app_private.finance_available(uuid) to elifora_finance_writer;

-- This narrowly scoped predicate prevents RLS-hidden expense reversals leaking through NOT EXISTS.
create function app_private.finance_document_visible(org uuid,loc uuid,eid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.user_has_permission(org,loc,'finance.view') and exists(select 1 from public.finance_documents d left join public.finance_documents r on r.id=d.reversal_of where d.organization_id=org and d.location_id=loc and d.id=eid and (d.type<>'EXPENSE' and coalesce(r.type,'')<>'EXPENSE' or app_private.user_has_permission(org,loc,'finance.expense.view')));
$$;
revoke all on function app_private.finance_document_visible(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function app_private.finance_document_visible(uuid,uuid,uuid) to authenticated,elifora_finance_writer;
drop policy finance_read on public.finance_documents;
create policy finance_read on public.finance_documents for select to authenticated using(app_private.finance_document_visible(organization_id,location_id,id));
drop policy finance_read on public.finance_ledger_entries;
create policy finance_read on public.finance_ledger_entries for select to authenticated using(app_private.finance_document_visible(organization_id,location_id,document_id));

create function app_private.finance_allocate(org uuid,loc uuid,pid uuid,charge uuid,n bigint,source_id uuid,mid uuid,correlation uuid,family uuid[]) returns void language plpgsql volatile security invoker set search_path='' as $$
declare p public.finance_documents%rowtype;d public.finance_documents%rowtype;begin
 select * into p from public.finance_documents where id=pid and organization_id=org and location_id=loc;select * into d from public.finance_documents where id=charge and organization_id=org and location_id=loc;
 if p.id is null or d.id is null or p.client_id<>all(family) or d.client_id<>all(family) or p.currency<>d.currency or n<=0 or n>coalesce(app_private.finance_available(pid),-1) or n>coalesce(app_private.finance_outstanding(charge),-1) then raise exception using errcode='22023',message='FINANCE_ALLOCATION_CONFLICT';end if;
 insert into public.finance_payment_allocations(organization_id,location_id,payment_id,charge_id,currency,amount_minor,source_document_id,recorded_by,created_at,correlation_id,mutation_id) values(org,loc,pid,charge,p.currency,n,source_id,auth.uid(),statement_timestamp(),correlation,mid);
 perform app_private.finance_audit(org,loc,'PAYMENT_ALLOCATED',charge,'Explicit payment allocation',correlation);
end $$;
create function app_private.finance_release(org uuid,loc uuid,pid uuid,charge uuid,n bigint,source_id uuid,mid uuid,correlation uuid) returns void language plpgsql volatile security invoker set search_path='' as $$
declare a record;part bigint;remaining bigint:=n;begin
 for a in select x.*,x.amount_minor+coalesce((select sum(y.amount_minor) from public.finance_payment_allocations y where y.release_of=x.id),0)::bigint remaining from public.finance_payment_allocations x where x.payment_id=pid and (charge is null or x.charge_id=charge) and x.amount_minor>0 order by x.created_at desc,x.id desc loop
  part:=least(remaining,a.remaining);if part>0 then insert into public.finance_payment_allocations(organization_id,location_id,payment_id,charge_id,currency,amount_minor,release_of,source_document_id,recorded_by,created_at,correlation_id,mutation_id) values(org,loc,pid,a.charge_id,a.currency,-part,a.id,source_id,auth.uid(),statement_timestamp(),correlation,mid);remaining:=remaining-part;end if;exit when remaining=0;
 end loop;
 if remaining<>0 then raise exception using errcode='22023',message='FINANCE_ALLOCATION_CONFLICT';end if;
end $$;
revoke all on function app_private.finance_allocate(uuid,uuid,uuid,uuid,bigint,uuid,uuid,uuid,uuid[]),app_private.finance_release(uuid,uuid,uuid,uuid,bigint,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.finance_allocate(uuid,uuid,uuid,uuid,bigint,uuid,uuid,uuid,uuid[]),app_private.finance_release(uuid,uuid,uuid,uuid,bigint,uuid,uuid,uuid) to elifora_finance_writer;

-- Stock has one ledger. Finance contributes a separate permanently unique source, no balance field.
alter table public.stock_movements add column finance_document_id uuid references public.finance_documents(id);
create unique index stock_finance_source_unique on public.stock_movements(finance_document_id) where finance_document_id is not null;
create function app_private.finance_retail_stock(doc uuid,item uuid,lot uuid,qty numeric,reversed uuid default null) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare d public.finance_documents%rowtype;i public.stock_items%rowtype;setting public.stock_settings%rowtype;movement public.stock_movements%rowtype;mid uuid:=gen_random_uuid();balance numeric;begin
 select * into d from public.finance_documents where id=doc;
 if d.id is null or not app_private.user_has_permission(d.organization_id,d.location_id,case when reversed is null then 'finance.charge' else 'finance.adjust' end) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select * into setting from public.stock_settings where organization_id=d.organization_id and location_id=d.location_id;
 if setting.location_id is null then raise exception using errcode='22023',message='STOCK_NOT_ENABLED';end if;
 select * into i from public.stock_items where id=item and organization_id=d.organization_id and location_id=d.location_id for update;
 if i.id is null or (not i.active and reversed is null) or not i.track_quantity or qty<=0 or qty*100<>trunc(qty*100) or (i.inventory_unit='UNIT' and qty<>trunc(qty)) then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
 if lot is not null then perform 1 from public.stock_lots where id=lot and organization_id=d.organization_id and location_id=d.location_id and stock_item_id=i.id for update;if not found then raise exception using errcode='22023',message='STOCK_LOT_CONFLICT';end if;elsif i.lot_required and reversed is null then raise exception using errcode='22023',message='STOCK_LOT_REQUIRED';end if;
 if not exists(select 1 from public.stock_openings where stock_item_id=i.id and (lot is null or stock_lot_id=lot)) then raise exception using errcode='22023',message='STOCK_OPENING_REQUIRED';end if;
 if reversed is not null then
  select * into movement from public.stock_movements where finance_document_id=reversed and stock_item_id=i.id and stock_lot_id is not distinct from lot;
  if movement.id is null or d.reversal_of<>reversed or qty<>-movement.quantity_delta then raise exception using errcode='22023',message='FINANCE_CONFLICT';end if;
 else
  if d.type<>'RETAIL_SALE' then raise exception using errcode='22023',message='FINANCE_CONFLICT';end if;
  select coalesce(sum(quantity_delta),0) into balance from public.stock_movements where stock_item_id=i.id;
  if setting.negative_policy='BLOCK_NEGATIVE' and balance<qty then raise exception using errcode='22023',message='STOCK_INSUFFICIENT';end if;
  if lot is not null then select coalesce(sum(quantity_delta),0) into balance from public.stock_movements where stock_item_id=i.id and stock_lot_id=lot;if setting.negative_policy='BLOCK_NEGATIVE' and balance<qty then raise exception using errcode='22023',message='STOCK_INSUFFICIENT';end if;end if;
 end if;
 insert into public.stock_movements(id,organization_id,location_id,stock_item_id,stock_lot_id,movement_type,quantity_delta,unit,reversal_of,reason,recorded_by,occurred_at,correlation_id,mutation_id,finance_document_id) values(mid,d.organization_id,d.location_id,item,lot,case when reversed is null then 'USAGE' else 'REVERSAL' end,case when reversed is null then -qty else qty end,i.inventory_unit,movement.id,d.reason,d.recorded_by,d.occurred_at,d.correlation_id,d.mutation_id,doc);
 insert into public.audit_events(organization_id,location_id,actor_user_id,action,entity_type,entity_id,correlation_id,metadata,reason) values(d.organization_id,d.location_id,auth.uid(),'stock.retail_'||case when reversed is null then 'consumed' else 'reversed' end,'stock',mid,d.correlation_id,jsonb_build_object('finance_document_id',doc),d.reason);return mid;
end $$;
revoke all on function app_private.finance_retail_stock(uuid,uuid,uuid,numeric,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.finance_retail_stock(uuid,uuid,uuid,numeric,uuid) to elifora_finance_writer;
create function app_private.finance_stock_source_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.reversal_of is not null and exists(select 1 from public.stock_movements m where m.id=new.reversal_of and m.finance_document_id is not null) and new.finance_document_id is null then raise exception using errcode='23514',message='STOCK_SOURCE_IMMUTABLE';end if;return new;
end $$;
revoke all on function app_private.finance_stock_source_guard() from public,anon,authenticated,service_role;
create trigger stock_finance_reversal_guard before insert on public.stock_movements for each row execute function app_private.finance_stock_source_guard();

-- Keep the existing organization currency authoritative through a narrow operation.
create function app_private.finance_currency_update(org uuid,loc uuid,new_code text) returns void language plpgsql security definer set search_path='' as $$begin
 if not app_private.user_has_permission(org,loc,'finance.adjust') or not exists(select 1 from public.finance_currencies where code=new_code) then raise exception using errcode='22023',message='FORBIDDEN';end if;
 if (exists(select 1 from public.finance_documents where organization_id=org) or exists(select 1 from public.finance_cash_sessions where organization_id=org)) and exists(select 1 from public.organizations where id=org and base_currency<>new_code) then raise exception using errcode='22023',message='CURRENCY_LOCKED';end if;
 update public.organizations set base_currency=new_code where id=org;
end $$;
revoke all on function app_private.finance_currency_update(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function app_private.finance_currency_update(uuid,uuid,text) to elifora_finance_writer;
create function app_private.finance_currency_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.base_currency is distinct from old.base_currency and (exists(select 1 from public.finance_documents where organization_id=old.id) or exists(select 1 from public.finance_cash_sessions where organization_id=old.id)) then raise exception using errcode='23514',message='CURRENCY_LOCKED';end if;return new;
end $$;
create trigger finance_organization_currency_guard before update of base_currency on public.organizations for each row execute function app_private.finance_currency_guard();
create function app_private.finance_core(member uuid,loc uuid,q jsonb,correlation uuid) returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare ctx jsonb;org uuid;actor uuid:=auth.uid();stamp timestamptz:=statement_timestamp();op text:=q->>'type';permission text;allowed text[];
 eid uuid;cid uuid;family uuid[];mid uuid;setting public.finance_settings%rowtype;cash public.finance_cash_sessions%rowtype;original public.finance_documents%rowtype;ap public.salon_appointments%rowtype;retail public.finance_retail_lines%rowtype;
 n bigint;net bigint;tax bigint;rate integer:=0;inclusive boolean:=true;method text;sid uuid;at_time timestamptz;description text;why text;currency text;item uuid;lot uuid;quantity numeric;unit_price bigint;stock_mid uuid;part bigint;available bigint;expected bigint;basis bigint;allocation jsonb;row_entry record;doc_type text;sign integer;live_id uuid;service_id uuid;service_name text;service_version bigint;performed uuid;
begin
 permission:=case when op in ('CURRENCY_SET','CLIENT_CREDIT','CLIENT_DEBIT','ADJUSTMENT','REVERSAL') then 'finance.adjust' when op in ('SERVICE_CHARGE','MANUAL_CHARGE','RETAIL_SALE') then 'finance.charge' when op in ('PAYMENT','DEPOSIT','ALLOCATE') then 'finance.payment' when op='REFUND' then 'finance.refund' when op='EXPENSE' then 'finance.expense.manage' when op='CASH_OPEN' then 'finance.cash.open' when op in ('CASH_CLOSE_SUBMIT','CASH_CLOSE_CONFIRM') then 'finance.cash.close' end;
 if permission is null or actor is null or correlation is null or jsonb_typeof(q)<>'object' or pg_column_size(q)>32768 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 ctx:=app_private.hair_write_context(member,loc,permission);if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 if not app_private.user_has_permission(org,loc,'finance.view') then return jsonb_build_object('code','FORBIDDEN');end if;
 allowed:=case op
 when 'CURRENCY_SET' then array['type','mutation_id','currency','expected_version','reason']
 when 'CASH_OPEN' then array['type','mutation_id','id','currency','opening_cash_minor','reason']
 when 'CASH_CLOSE_SUBMIT' then array['type','mutation_id','id','expected_version','counted_cash_minor','reason']
 when 'CASH_CLOSE_CONFIRM' then array['type','mutation_id','id','expected_version','acknowledge_difference','reason']
 when 'SERVICE_CHARGE' then array['type','mutation_id','id','appointment_id','reason']
 when 'MANUAL_CHARGE' then array['type','mutation_id','id','client_id','currency','amount_minor','tax_rate_bps','tax_inclusive','description','occurred_at','reason']
 when 'RETAIL_SALE' then array['type','mutation_id','id','client_id','currency','stock_item_id','lot_id','quantity','unit_price_minor','tax_rate_bps','tax_inclusive','description','occurred_at','reason']
 when 'PAYMENT' then array['type','mutation_id','id','client_id','currency','amount_minor','method','allocations','confirm_credit','appointment_id','external_reference','occurred_at','reason']
 when 'DEPOSIT' then array['type','mutation_id','id','client_id','currency','amount_minor','method','appointment_id','external_reference','occurred_at','reason']
 when 'ALLOCATE' then array['type','mutation_id','client_id','payment_id','allocations','reason']
 when 'REFUND' then array['type','mutation_id','id','original_payment_id','amount_minor','occurred_at','reason']
 when 'EXPENSE' then array['type','mutation_id','id','currency','amount_minor','method','category','description','stock_receipt_id','external_reference','occurred_at','reason']
 when 'REVERSAL' then array['type','mutation_id','id','document_id','reason']
 when 'ADJUSTMENT' then array['type','mutation_id','id','currency','amount_minor','direction','description','occurred_at','reason']
 else array['type','mutation_id','id','client_id','currency','amount_minor','description','occurred_at','reason'] end;
 if not app_private.salon_keys(q,allowed) or not(q ?& allowed) or jsonb_typeof(q->'mutation_id')<>'string' or jsonb_typeof(q->'reason')<>'string' or char_length(trim(q->>'reason')) not between 1 and 2000 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 mid:=(q->>'mutation_id')::uuid;why:=trim(q->>'reason');eid:=coalesce((q->>'id')::uuid,mid);
 -- Shared Gate 1 organization protocol protects identity from merge without serializing unrelated organizations.
 if op='CURRENCY_SET' then perform pg_advisory_xact_lock(hashtextextended(org::text,0));else perform pg_advisory_xact_lock_shared(hashtextextended(org::text,0));end if;
 -- The shared Gate 1 advisory lock holds identity and currency stable until commit.
 ctx:=app_private.hair_write_context(member,loc,permission);if ctx ? 'code' then return ctx;end if;
 select * into setting from public.finance_settings where organization_id=org;
 if op='CURRENCY_SET' then
  if jsonb_typeof(q->'expected_version')<>'number' or (q->>'expected_version')::numeric<>coalesce(setting.version,0) then return jsonb_build_object('code','FINANCE_CONFLICT');end if;
  if not exists(select 1 from public.finance_currencies where code=q->>'currency') then return jsonb_build_object('code','CURRENCY_UNSUPPORTED');end if;
  if setting.currency is distinct from q->>'currency' and (exists(select 1 from public.finance_documents where organization_id=org) or exists(select 1 from public.finance_cash_sessions where organization_id=org)) then return jsonb_build_object('code','CURRENCY_LOCKED');end if;
  perform app_private.finance_currency_update(org,loc,q->>'currency');
  insert into public.finance_settings select org,code,exponent,coalesce(setting.version,0)+1,actor,stamp from public.finance_currencies where code=q->>'currency' on conflict(organization_id) do update set currency=excluded.currency,exponent=excluded.exponent,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  perform app_private.finance_audit(org,loc,op,org,why,correlation);return jsonb_build_object('id',org,'status','SAVED');
 end if;
 if setting.organization_id is null then return jsonb_build_object('code','FINANCE_NOT_ENABLED');end if;
 currency:=setting.currency;if q ? 'currency' and q->>'currency' is distinct from currency then return jsonb_build_object('code','CURRENCY_MISMATCH');end if;
 -- One configured MAIN register in V1. This narrow location lock also orders cash close against late money.
 perform pg_advisory_xact_lock(hashtextextended(org::text||':'||loc::text||':finance-main',8));
 select * into cash from public.finance_cash_sessions where organization_id=org and location_id=loc and status<>'CLOSED' for update;
 if op='CASH_OPEN' then
  if cash.id is not null then return jsonb_build_object('code','CASH_ALREADY_OPEN');end if;
  n:=app_private.finance_minor(q->'opening_cash_minor',true);insert into public.finance_cash_sessions(id,organization_id,location_id,currency,status,opening_cash_minor,opened_by,opened_at) values(eid,org,loc,currency,'OPEN',n,actor,stamp);
  perform app_private.finance_audit(org,loc,op,eid,why,correlation);return jsonb_build_object('id',eid,'status','SAVED');
 elsif op in ('CASH_CLOSE_SUBMIT','CASH_CLOSE_CONFIRM') then
  if cash.id is distinct from eid then return jsonb_build_object('code','CASH_NOT_OPEN');end if;
  if jsonb_typeof(q->'expected_version')<>'number' or (q->>'expected_version')::numeric<>cash.version then return jsonb_build_object('code','CASH_CLOSE_STALE');end if;
  expected:=app_private.finance_cash_expected(cash.id);select count(*) into basis from public.finance_ledger_entries where cash_session_id=cash.id;
  if op='CASH_CLOSE_SUBMIT' then
   n:=app_private.finance_minor(q->'counted_cash_minor',true);update public.finance_cash_sessions set status='CLOSING_REVIEW',expected_cash_minor=expected,counted_cash_minor=n,difference_minor=n-expected,close_basis_count=basis,close_reason=why,version=version+1 where id=eid;
  else
   if cash.status<>'CLOSING_REVIEW' or expected<>cash.expected_cash_minor or basis<>cash.close_basis_count then return jsonb_build_object('code','CASH_CLOSE_STALE');end if;
   if jsonb_typeof(q->'acknowledge_difference')<>'boolean' or (cash.difference_minor<>0 and not (q->>'acknowledge_difference')::boolean) then return jsonb_build_object('code','CASH_DIFFERENCE_ACK_REQUIRED');end if;
   update public.finance_cash_sessions set status='CLOSED',closed_by=actor,closed_at=stamp,close_reason=why,version=version+1 where id=eid;
   if cash.difference_minor<>0 then perform app_private.finance_audit(org,loc,'CASH_DISCREPANCY_ACKNOWLEDGED',eid,why,correlation);end if;
  end if;
  perform app_private.finance_audit(org,loc,op,eid,why,correlation);return jsonb_build_object('id',eid,'status','SAVED');
 end if;
 cid:=(q->>'client_id')::uuid;at_time:=coalesce((q->>'occurred_at')::timestamptz,stamp);description:=coalesce(nullif(trim(q->>'description'),''),why);
 if at_time>stamp+interval '5 minutes' or char_length(description)>500 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if op='SERVICE_CHARGE' then
  select * into ap from public.salon_appointments where id=(q->>'appointment_id')::uuid and organization_id=org and location_id=loc;
  if ap.id is null then return jsonb_build_object('code','FINANCE_NOT_FOUND');end if;if ap.status<>'COMPLETED' then return jsonb_build_object('code','SERVICE_NOT_COMPLETED');end if;
  if ap.currency<>currency then return jsonb_build_object('code','CURRENCY_MISMATCH');end if;cid:=ap.client_id;at_time:=stamp;description:=ap.service_name;service_id:=ap.service_id;service_name:=ap.service_name;service_version:=ap.service_version;performed:=ap.staff_user_id;
  select l.live_session_id into live_id from public.salon_appointment_live_links l where l.organization_id=org and l.location_id=loc and l.client_id=cid and l.appointment_id=ap.id;
 elsif op in ('REFUND','REVERSAL') then
  select * into original from public.finance_documents where id=coalesce((q->>'original_payment_id')::uuid,(q->>'document_id')::uuid) and organization_id=org and location_id=loc;
  if original.id is null then return jsonb_build_object('code','FINANCE_NOT_FOUND');end if;cid:=original.client_id;
 end if;
 if cid is not null then
  family:=app_private.crm_family(org,cid);
  if not exists(select 1 from public.clients where organization_id=org and id=cid) then return jsonb_build_object('code','FINANCE_NOT_FOUND');end if;
  if op='SERVICE_CHARGE' and not exists(select 1 from public.clients c where c.organization_id=org and c.id=any(family) and c.status='ACTIVE' and not exists(select 1 from public.client_merge_links m where m.organization_id=org and m.source_client_id=c.id)) then return jsonb_build_object('code','CLIENT_NOT_CURRENT');end if;
  if op not in ('REFUND','REVERSAL','SERVICE_CHARGE') and (exists(select 1 from public.client_merge_links where organization_id=org and source_client_id=cid) or not exists(select 1 from public.clients where organization_id=org and id=cid and status='ACTIVE')) then return jsonb_build_object('code','CLIENT_NOT_CURRENT');end if;
 end if;
 if op in ('MANUAL_CHARGE','RETAIL_SALE','PAYMENT','DEPOSIT','ALLOCATE','CLIENT_CREDIT','CLIENT_DEBIT') and cid is null then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if q->>'appointment_id' is not null and op<>'SERVICE_CHARGE' then
  select * into ap from public.salon_appointments where id=(q->>'appointment_id')::uuid and organization_id=org and location_id=loc and client_id=any(family);
  if ap.id is null then return jsonb_build_object('code','FINANCE_NOT_FOUND');end if;
 end if;
 if op='ALLOCATE' then
  if jsonb_typeof(q->'allocations')<>'array' or jsonb_array_length(q->'allocations') not between 1 and 20 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  for allocation in select value from jsonb_array_elements(q->'allocations') loop
   if not app_private.salon_keys(allocation,array['charge_id','amount_minor']) or not(allocation ?& array['charge_id','amount_minor']) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
   perform app_private.finance_allocate(org,loc,(q->>'payment_id')::uuid,(allocation->>'charge_id')::uuid,app_private.finance_minor(allocation->'amount_minor'),(q->>'payment_id')::uuid,mid,correlation,family);
  end loop;
  perform app_private.finance_audit(org,loc,'DEPOSIT_APPLIED',(q->>'payment_id')::uuid,why,correlation);return jsonb_build_object('id',q->>'payment_id','status','SAVED');
 end if;
 if op in ('PAYMENT','DEPOSIT','EXPENSE') then
  method:=q->>'method';if method not in ('CASH','CARD','BANK_TRANSFER','OTHER') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 elsif op='REFUND' then
  if original.type not in ('PAYMENT','DEPOSIT') or exists(select 1 from public.finance_documents where reversal_of=original.id) then return jsonb_build_object('code','FINANCE_REFUND_LIMIT');end if;
  select p.method into method from public.finance_payments p where p.document_id=original.id;
 elsif op='ADJUSTMENT' then
  if q->>'direction' not in ('IN','OUT') then return jsonb_build_object('code','VALIDATION_FAILED');end if;method:='CASH';
 end if;
 if method='CASH' then if cash.id is null then return jsonb_build_object('code','CASH_NOT_OPEN');end if;if at_time<cash.opened_at then return jsonb_build_object('code','CASH_DATE_OUTSIDE_SESSION');end if;sid:=cash.id;end if;
 if op='SERVICE_CHARGE' then
  if ap.quoted_total*power(10,setting.exponent)<>trunc(ap.quoted_total*power(10,setting.exponent)) or (not ap.tax_inclusive and ap.base_price*power(10,setting.exponent)<>trunc(ap.base_price*power(10,setting.exponent))) then return jsonb_build_object('code','CURRENCY_PRECISION_REQUIRED');end if;
  n:=(ap.quoted_total*power(10,setting.exponent))::bigint;rate:=(ap.tax_rate*100)::integer;inclusive:=ap.tax_inclusive;
  if inclusive then tax:=floor((n::numeric*rate+(10000+rate)::numeric/2)/(10000+rate))::bigint;net:=n-tax;else net:=(ap.base_price*power(10,setting.exponent))::bigint;tax:=n-net;end if;doc_type:='SERVICE_CHARGE';
 elsif op in ('MANUAL_CHARGE','RETAIL_SALE') then
  if jsonb_typeof(q->'tax_rate_bps')<>'number' or (q->>'tax_rate_bps')::numeric<>trunc((q->>'tax_rate_bps')::numeric) or jsonb_typeof(q->'tax_inclusive')<>'boolean' then return jsonb_build_object('code','VALIDATION_FAILED');end if;rate:=(q->>'tax_rate_bps')::integer;inclusive:=(q->>'tax_inclusive')::boolean;if rate not between 0 and 10000 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  if op='RETAIL_SALE' then
   if jsonb_typeof(q->'quantity')<>'string' or q->>'quantity' !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
   quantity:=(q->>'quantity')::numeric;unit_price:=app_private.finance_minor(q->'unit_price_minor');n:=floor(quantity*unit_price+0.5)::bigint;item:=(q->>'stock_item_id')::uuid;lot:=(q->>'lot_id')::uuid;doc_type:='RETAIL_SALE';
  else n:=app_private.finance_minor(q->'amount_minor');doc_type:='SERVICE_CHARGE';end if;
  if inclusive then tax:=floor((n::numeric*rate+(10000+rate)::numeric/2)/(10000+rate))::bigint;net:=n-tax;else net:=n;tax:=floor((n::numeric*rate+5000)/10000)::bigint;n:=net+tax;end if;
 elsif op='REVERSAL' then
  if original.type in ('REFUND','REVERSAL') or exists(select 1 from public.finance_documents where reversal_of=original.id or original_payment_id=original.id) then return jsonb_build_object('code','FINANCE_CONFLICT');end if;
  if original.type='EXPENSE' and not app_private.user_has_permission(org,loc,'finance.expense.manage') then return jsonb_build_object('code','FORBIDDEN');end if;
  if original.type in ('SERVICE_CHARGE','RETAIL_SALE') and coalesce((select sum(amount_minor) from public.finance_payment_allocations where charge_id=original.id),0)>0 then return jsonb_build_object('code','FINANCE_CHARGE_HAS_PAYMENTS');end if;
  if exists(select 1 from public.finance_ledger_entries e join public.finance_cash_sessions s on s.id=e.cash_session_id where e.document_id=original.id and s.status='CLOSED') then return jsonb_build_object('code','CASH_HISTORY_CLOSED');end if;
  n:=original.amount_minor;net:=original.net_amount_minor;tax:=original.tax_amount_minor;rate:=original.tax_rate_bps;inclusive:=original.tax_inclusive;description:='Reversal: '||left(original.description,480);doc_type:='REVERSAL';
 else
  n:=app_private.finance_minor(q->'amount_minor');net:=n;tax:=0;doc_type:=op;
  if op='REFUND' and n>original.amount_minor-coalesce((select sum(amount_minor) from public.finance_documents where original_payment_id=original.id),0) then return jsonb_build_object('code','FINANCE_REFUND_LIMIT');end if;
  if op='EXPENSE' then
   if q->>'category' not in ('RENT','UTILITIES','SUPPLIES','MAINTENANCE','MARKETING','OTHER') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
   if q->>'stock_receipt_id' is not null and not exists(select 1 from public.stock_movements where id=(q->>'stock_receipt_id')::uuid and organization_id=org and location_id=loc and movement_type='RECEIPT') then return jsonb_build_object('code','FINANCE_NOT_FOUND');end if;
  end if;
 end if;
 if n<=0 or n>9000000000000000 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 insert into public.finance_documents(id,organization_id,location_id,client_id,appointment_id,live_session_id,type,currency,amount_minor,net_amount_minor,tax_amount_minor,tax_rate_bps,tax_inclusive,description,reason,external_reference,service_id,service_name_snapshot,service_version,performed_by,reversal_of,original_payment_id,recorded_by,occurred_at,created_at,correlation_id,mutation_id)
 values(eid,org,loc,cid,case when op='SERVICE_CHARGE' then ap.id when op in ('PAYMENT','DEPOSIT') then (q->>'appointment_id')::uuid else null end,live_id,doc_type,currency,n,net,tax,rate,inclusive,description,why,q->>'external_reference',service_id,service_name,service_version,performed,case when op='REVERSAL' then original.id end,case when op='REFUND' then original.id end,actor,at_time,stamp,correlation,mid);
 if op='REVERSAL' then
  if original.type in ('PAYMENT','DEPOSIT','CLIENT_CREDIT') then select coalesce(sum(amount_minor),0) into part from public.finance_payment_allocations where payment_id=original.id;if part>0 then perform app_private.finance_release(org,loc,original.id,null,part,eid,mid,correlation);end if;end if;
  for row_entry in select * from public.finance_ledger_entries where document_id=original.id loop
   insert into public.finance_ledger_entries(document_id,organization_id,location_id,client_id,currency,account,amount_minor,cash_session_id,recorded_by,created_at) values(eid,org,loc,row_entry.client_id,currency,row_entry.account,-row_entry.amount_minor,row_entry.cash_session_id,actor,stamp);
  end loop;
  if original.type='RETAIL_SALE' then select * into retail from public.finance_retail_lines where document_id=original.id;stock_mid:=app_private.finance_retail_stock(eid,retail.stock_item_id,retail.stock_lot_id,retail.quantity,original.id);end if;
 else
  if cid is not null then
   sign:=case when op in ('PAYMENT','DEPOSIT','CLIENT_CREDIT') then -1 else 1 end;
   insert into public.finance_ledger_entries(document_id,organization_id,location_id,client_id,currency,account,amount_minor,recorded_by,created_at) values(eid,org,loc,cid,currency,'CLIENT',sign*n,actor,stamp);
  end if;
  if method is not null then
   sign:=case when op in ('REFUND','EXPENSE') or (op='ADJUSTMENT' and q->>'direction'='OUT') then -1 else 1 end;
   insert into public.finance_ledger_entries(document_id,organization_id,location_id,currency,account,amount_minor,cash_session_id,recorded_by,created_at) values(eid,org,loc,currency,method,sign*n,sid,actor,stamp);
  end if;
  if op in ('PAYMENT','DEPOSIT','CLIENT_CREDIT') then
   insert into public.finance_payments values(eid,org,loc,cid,currency,coalesce(method,'OTHER'),sid);
   if op='PAYMENT' then
    if jsonb_typeof(q->'allocations')<>'array' or jsonb_array_length(q->'allocations')>20 or jsonb_typeof(q->'confirm_credit')<>'boolean' then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
    for allocation in select value from jsonb_array_elements(q->'allocations') loop
     if not app_private.salon_keys(allocation,array['charge_id','amount_minor']) or not(allocation ?& array['charge_id','amount_minor']) then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
     perform app_private.finance_allocate(org,loc,eid,(allocation->>'charge_id')::uuid,app_private.finance_minor(allocation->'amount_minor'),eid,mid,correlation,family);
    end loop;
    if app_private.finance_available(eid)>0 and not (q->>'confirm_credit')::boolean then raise exception using errcode='22023',message='OVERPAYMENT_CONFIRM_REQUIRED';end if;
   end if;
  elsif op='REFUND' then
   -- Unallocated credit returns first. Allocated funds are explicitly released, latest allocation first.
   available:=coalesce(app_private.finance_available(original.id),0)+n;part:=greatest(0,n-available);if part>0 then perform app_private.finance_release(org,loc,original.id,null,part,eid,mid,correlation);end if;
  elsif op='EXPENSE' then insert into public.finance_expenses values(eid,org,loc,q->>'category',method,(q->>'stock_receipt_id')::uuid,sid);
  elsif op='RETAIL_SALE' then
   stock_mid:=app_private.finance_retail_stock(eid,item,lot,quantity);insert into public.finance_retail_lines values(eid,org,loc,item,lot,quantity,unit_price,stock_mid);
  end if;
 end if;
 if sid is not null and cash.status='CLOSING_REVIEW' then update public.finance_cash_sessions set version=version+1 where id=sid;end if;
 perform app_private.finance_audit(org,loc,op,eid,why,correlation);return jsonb_build_object('id',eid,'status','SAVED');
end $$;
alter function app_private.finance_core(uuid,uuid,jsonb,uuid) owner to elifora_finance_writer;
revoke all on function app_private.finance_core(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;

-- Permanent successful AND controlled-failure receipts. Failed core changes roll back as a subtransaction.
create function public.finance_operation(p_membership_id uuid,p_location_id uuid,p_command jsonb,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare ctx jsonb;org uuid;mid uuid;receipt app_private.finance_receipts%rowtype;reply jsonb;err text;permission text;begin
 permission:=case when p_command->>'type' in ('CURRENCY_SET','CLIENT_CREDIT','CLIENT_DEBIT','ADJUSTMENT','REVERSAL') then 'finance.adjust' when p_command->>'type' in ('SERVICE_CHARGE','MANUAL_CHARGE','RETAIL_SALE') then 'finance.charge' when p_command->>'type' in ('PAYMENT','DEPOSIT','ALLOCATE') then 'finance.payment' when p_command->>'type'='REFUND' then 'finance.refund' when p_command->>'type'='EXPENSE' then 'finance.expense.manage' when p_command->>'type'='CASH_OPEN' then 'finance.cash.open' when p_command->>'type' in ('CASH_CLOSE_SUBMIT','CASH_CLOSE_CONFIRM') then 'finance.cash.close' end;
 if permission is null or p_correlation_id is null or pg_column_size(p_command)>32768 or jsonb_typeof(p_command)<>'object' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,permission);if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 begin mid:=(p_command->>'mutation_id')::uuid;if mid is null then return jsonb_build_object('code','VALIDATION_FAILED');end if;exception when invalid_text_representation then return jsonb_build_object('code','VALIDATION_FAILED');end;
 perform pg_advisory_xact_lock(hashtextextended(org::text||':'||auth.uid()::text||':'||mid::text,9));
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,permission);if ctx ? 'code' then return ctx;end if;
 select * into receipt from app_private.finance_receipts where organization_id=org and actor_id=auth.uid() and mutation_id=mid;
 if found then if receipt.location_id<>p_location_id or receipt.input<>p_command then return jsonb_build_object('code','FINANCE_CONFLICT');end if;return receipt.response;end if;
 begin
  reply:=app_private.finance_core(p_membership_id,p_location_id,p_command,p_correlation_id);
  if reply ? 'code' then raise exception using errcode='22023',message=reply->>'code';end if;
  reply:=jsonb_build_object('data',reply);
 exception when invalid_parameter_value then get stacked diagnostics err=message_text;reply:=jsonb_build_object('code',err);
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or check_violation or not_null_violation then reply:=jsonb_build_object('code','VALIDATION_FAILED');
 when unique_violation then reply:=jsonb_build_object('code','FINANCE_CONFLICT');
 when foreign_key_violation then reply:=jsonb_build_object('code','FINANCE_NOT_FOUND');
 end;
 insert into app_private.finance_receipts(organization_id,location_id,actor_id,mutation_id,input,response) values(org,p_location_id,auth.uid(),mid,p_command,reply);return reply;
end $$;
alter function public.finance_operation(uuid,uuid,jsonb,uuid) owner to elifora_finance_writer;
revoke all on function public.finance_operation(uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function public.finance_operation(uuid,uuid,jsonb,uuid) to authenticated;

create function app_private.finance_cash_guard() returns trigger language plpgsql set search_path='' as $$begin
 if old.status='CLOSED' or (new.id,new.organization_id,new.location_id,new.register_code,new.currency,new.opening_cash_minor,new.opened_by,new.opened_at) is distinct from (old.id,old.organization_id,old.location_id,old.register_code,old.currency,old.opening_cash_minor,old.opened_by,old.opened_at) then raise exception using errcode='23514',message='FINANCE_IMMUTABLE';end if;return new;
end $$;
revoke all on function app_private.finance_cash_guard() from public,anon,authenticated,service_role;
create trigger finance_cash_history_guard before update or delete on public.finance_cash_sessions for each row execute function app_private.finance_cash_guard();

-- JSON transport carries every minor-unit integer as a string. No JavaScript/Android floating point.
create function app_private.finance_json(v jsonb) returns jsonb language plpgsql immutable set search_path='' as $$declare result jsonb;begin
 if jsonb_typeof(v)='array' then select coalesce(jsonb_agg(app_private.finance_json(x)),'[]'::jsonb) into result from jsonb_array_elements(v) x;return result;
 elsif jsonb_typeof(v)='object' then select coalesce(jsonb_object_agg(key,case when key like '%\_minor' escape '\' and value<>'null'::jsonb then to_jsonb(value#>>'{}') else app_private.finance_json(value) end),'{}'::jsonb) into result from jsonb_each(v);return result;end if;return v;
end $$;
revoke all on function app_private.finance_json(jsonb) from public,anon,authenticated,service_role;
grant execute on function app_private.finance_json(jsonb) to elifora_finance_writer;

create function public.finance_snapshot(p_membership_id uuid,p_location_id uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare ctx jsonb;org uuid;setting public.finance_settings%rowtype;day date;tz text;from_time timestamptz;to_time timestamptz;cid uuid;aid uuid;did uuid;family uuid[];offset_rows integer:=0;expenses_allowed boolean;cash_allowed boolean;docs jsonb;allocations jsonb;entries jsonb;accounts jsonb;cash jsonb;summary jsonb;clients jsonb;appointments jsonb;stock jsonb;
begin
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,'finance.view');if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 if jsonb_typeof(p_request)<>'object' or not app_private.salon_keys(p_request,array['day','client_id','appointment_id','document_id','offset']) or pg_column_size(p_request)>1024 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if p_request ? 'day' and (jsonb_typeof(p_request->'day')<>'string' or p_request->>'day' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if p_request ? 'offset' and (jsonb_typeof(p_request->'offset')<>'number' or (p_request->>'offset')::numeric<>trunc((p_request->>'offset')::numeric)) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 offset_rows:=coalesce((p_request->>'offset')::integer,0);if offset_rows not between 0 and 10000 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 select * into setting from public.finance_settings where organization_id=org;select timezone into tz from public.locations where id=p_location_id and organization_id=org;day:=coalesce((p_request->>'day')::date,(statement_timestamp() at time zone tz)::date);from_time:=day::timestamp at time zone tz;to_time:=(day+1)::timestamp at time zone tz;
 cid:=(p_request->>'client_id')::uuid;aid:=(p_request->>'appointment_id')::uuid;did:=(p_request->>'document_id')::uuid;
 if cid is not null then if not exists(select 1 from public.clients where id=cid and organization_id=org) then return jsonb_build_object('code','FINANCE_NOT_FOUND');end if;family:=app_private.crm_family(org,cid);end if;
 if aid is not null then if not exists(select 1 from public.salon_appointments where id=aid and organization_id=org and location_id=p_location_id and (cid is null or client_id=any(family))) then return jsonb_build_object('code','FINANCE_NOT_FOUND');end if;end if;
 expenses_allowed:=app_private.user_has_permission(org,p_location_id,'finance.expense.view');cash_allowed:=app_private.user_has_permission(org,p_location_id,'finance.cash.close');
 if did is not null and not app_private.finance_document_visible(org,p_location_id,did) then return jsonb_build_object('code','FINANCE_NOT_FOUND');end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into docs from(
  select d.*,p.method,e.category,e.stock_receipt_id,r.stock_item_id,r.stock_lot_id,r.quantity::text quantity,r.unit_price_minor,r.stock_movement_id,
   app_private.finance_outstanding(d.id) outstanding_minor,app_private.finance_available(d.id) available_credit_minor,
   case when d.type in ('SERVICE_CHARGE','RETAIL_SALE') then (select coalesce(sum(-a.amount_minor),0) from public.finance_payment_allocations a join public.finance_documents f on f.id=a.source_document_id where a.charge_id=d.id and a.amount_minor<0 and f.type='REFUND') else (select coalesce(sum(f.amount_minor),0) from public.finance_documents f where f.original_payment_id=d.id) end refunded_minor,
   exists(select 1 from public.finance_documents f where f.reversal_of=d.id) reversed
  from public.finance_documents d left join public.finance_payments p on p.document_id=d.id left join public.finance_expenses e on e.document_id=d.id left join public.finance_retail_lines r on r.document_id=d.id
  where d.organization_id=org and d.location_id=p_location_id and app_private.finance_document_visible(org,p_location_id,d.id)
   and (cid is null or d.client_id=any(family)) and (aid is null or d.appointment_id=aid) and (did is null or d.id=did)
   and (cid is not null or aid is not null or did is not null or d.occurred_at>=from_time and d.occurred_at<to_time)
  order by d.occurred_at desc,d.id desc limit 100 offset offset_rows
 ) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into allocations from(select a.* from public.finance_payment_allocations a where a.organization_id=org and a.location_id=p_location_id and (a.payment_id in(select (d->>'id')::uuid from jsonb_array_elements(docs) d) or a.charge_id in(select (d->>'id')::uuid from jsonb_array_elements(docs) d)) order by a.created_at desc,a.id desc limit 200) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into entries from(select e.* from public.finance_ledger_entries e where e.organization_id=org and e.location_id=p_location_id and e.document_id in(select (d->>'id')::uuid from jsonb_array_elements(docs) d) and app_private.finance_document_visible(org,p_location_id,e.document_id) order by e.created_at desc,e.id desc limit 200) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into accounts from(
  select c.id client_id,c.full_name display_name,coalesce((select sum(e.amount_minor) from public.finance_ledger_entries e where e.organization_id=org and e.location_id=p_location_id and e.client_id=any(app_private.crm_family(org,c.id)) and e.account='CLIENT'),0) balance_minor,
   coalesce((select sum(coalesce(app_private.finance_available(d.id),0)) from public.finance_documents d where d.organization_id=org and d.location_id=p_location_id and d.client_id=any(app_private.crm_family(org,c.id)) and d.type in ('PAYMENT','DEPOSIT','CLIENT_CREDIT')),0) available_credit_minor,
   coalesce((select sum(coalesce(app_private.finance_outstanding(d.id),0)) from public.finance_documents d where d.organization_id=org and d.location_id=p_location_id and d.client_id=any(app_private.crm_family(org,c.id)) and d.type in ('SERVICE_CHARGE','RETAIL_SALE')),0) outstanding_minor
  from public.clients c where c.organization_id=org and (cid is null and not exists(select 1 from public.client_merge_links m where m.source_client_id=c.id and m.organization_id=org) or c.id=coalesce((select m.target_client_id from public.client_merge_links m where m.source_client_id=cid and m.organization_id=org),cid)) order by c.full_name,c.id limit 50
 ) x;
 select coalesce(jsonb_agg(case when cash_allowed then to_jsonb(x) else jsonb_build_object('id',x.id,'organization_id',x.organization_id,'location_id',x.location_id,'currency',x.currency,'status',x.status,'version',x.version) end),'[]'::jsonb) into cash from(select s.*,app_private.finance_cash_expected(s.id) current_expected_minor,(select coalesce(sum(e.amount_minor),0) from public.finance_ledger_entries e where e.cash_session_id=s.id and e.amount_minor>0) cash_in_minor,(select coalesce(sum(-e.amount_minor),0) from public.finance_ledger_entries e where e.cash_session_id=s.id and e.amount_minor<0) cash_out_minor from public.finance_cash_sessions s where s.organization_id=org and s.location_id=p_location_id order by s.opened_at desc,s.id desc limit case when cash_allowed then 20 else 1 end) x;
 select jsonb_build_object(
  'service_charges_minor',coalesce(sum(case when d.type='SERVICE_CHARGE' then d.amount_minor when d.type='REVERSAL' and r.type='SERVICE_CHARGE' then -d.amount_minor else 0 end),0),
  'retail_sales_minor',coalesce(sum(case when d.type='RETAIL_SALE' then d.amount_minor when d.type='REVERSAL' and r.type='RETAIL_SALE' then -d.amount_minor else 0 end),0),
  'payments_minor',coalesce(sum(case when d.type='PAYMENT' then d.amount_minor when d.type='REVERSAL' and r.type='PAYMENT' then -d.amount_minor else 0 end),0),
  'deposits_minor',coalesce(sum(case when d.type='DEPOSIT' then d.amount_minor when d.type='REVERSAL' and r.type='DEPOSIT' then -d.amount_minor else 0 end),0),
  'refunds_minor',coalesce(sum(case when d.type='REFUND' then d.amount_minor else 0 end),0),
  'expenses_minor',case when expenses_allowed then coalesce(sum(case when d.type='EXPENSE' then d.amount_minor when d.type='REVERSAL' and r.type='EXPENSE' then -d.amount_minor else 0 end),0) else null end,
  'payments_by_method',(select coalesce(jsonb_agg(z),'[]'::jsonb) from(select p.method,sum(d2.amount_minor) amount_minor from public.finance_payments p join public.finance_documents d2 on d2.id=p.document_id where d2.organization_id=org and d2.location_id=p_location_id and d2.type in ('PAYMENT','DEPOSIT') and d2.occurred_at>=from_time and d2.occurred_at<to_time and not exists(select 1 from public.finance_documents v where v.reversal_of=d2.id) group by p.method) z),
  'open_client_balance_minor',(select coalesce(sum(amount_minor),0) from public.finance_ledger_entries where organization_id=org and location_id=p_location_id and account='CLIENT')
 ) into summary from public.finance_documents d left join public.finance_documents r on r.id=d.reversal_of where d.organization_id=org and d.location_id=p_location_id and d.occurred_at>=from_time and d.occurred_at<to_time;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into clients from(select c.id,c.full_name display_name from public.clients c where c.organization_id=org and c.status='ACTIVE' and not exists(select 1 from public.client_merge_links m where m.organization_id=org and m.source_client_id=c.id) order by c.full_name,c.id limit 200) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into appointments from(select a.id,a.client_id,a.service_name,a.status,a.currency,a.quoted_total::text quoted_total,a.version from public.salon_appointments a where a.organization_id=org and a.location_id=p_location_id and a.status='COMPLETED' and (cid is null or a.client_id=any(family)) and not exists(select 1 from public.finance_documents d where d.appointment_id=a.id and d.type='SERVICE_CHARGE') order by a.completed_at desc,a.id desc limit 100) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into stock from(select i.id,i.display_name,i.inventory_unit from public.stock_items i where i.organization_id=org and i.location_id=p_location_id and i.active and i.track_quantity order by i.display_name,i.id limit 200) x;
 return jsonb_build_object('data',app_private.finance_json(jsonb_build_object('organization_id',org,'location_id',p_location_id,'day',day,'timezone',tz,'settings',case when setting.organization_id is null then null else to_jsonb(setting) end,'documents',docs,'allocations',allocations,'ledger_entries',entries,'client_balances',accounts,'cash_sessions',cash,'summary',summary,'clients',clients,'appointments',appointments,'stock_items',stock,'offset',offset_rows)));
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return jsonb_build_object('code','VALIDATION_FAILED');
end $$;
alter function public.finance_snapshot(uuid,uuid,jsonb) owner to elifora_finance_writer;
revoke all on function public.finance_snapshot(uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.finance_snapshot(uuid,uuid,jsonb) to authenticated;
