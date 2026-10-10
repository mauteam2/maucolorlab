-- Basis history is the immutable running state under the stock-item row lock.
-- Do not rescan an ever-growing stock ledger on EVERY incoming movement.
do $$declare body text;anchor text;begin
 body:=pg_get_functiondef('app_private.cost_stock_posted()'::regprocedure);
 anchor:='select coalesce(sum(quantity_delta),0)*100 into after_q from public.stock_movements where stock_item_id=m.stock_item_id and (lot is null or stock_lot_id=lot);';
 if position(anchor in body)=0 then raise exception 'Cost stock quantity anchor changed';end if;
 body:=replace(body,anchor,'if p.id is not null then after_q:=p.quantity_hundredths+dq;else '||anchor||'end if;');
 execute body;
end$$;
-- Finance CLIENT account cannot contain supplier/expense facts. This exact,
-- narrowly scoped sum authorizes once, instead of invoking two RLS predicates
-- for each of 10,000 account entries. Direct-table RLS remains unchanged.
create function app_private.finance_client_balance_amount(org uuid,loc uuid,family uuid[] default null) returns numeric language plpgsql stable security definer set search_path='' as $$begin
 if not app_private.user_has_permission(org,loc,'finance.view') then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if family is not null and exists(select 1 from unnest(family) cid where not exists(select 1 from public.clients c where c.organization_id=org and c.id=cid)) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return (select coalesce(sum(e.amount_minor),0) from public.finance_ledger_entries e where e.organization_id=org and e.location_id=loc and e.account='CLIENT' and (family is null or e.client_id=any(family)));
end$$;
revoke all on function app_private.finance_client_balance_amount(uuid,uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function app_private.finance_client_balance_amount(uuid,uuid,uuid[]) to elifora_finance_writer;
do $$declare body text;anchor text;begin
 body:=pg_get_functiondef('public.finance_snapshot(uuid,uuid,jsonb)'::regprocedure);
 anchor:='coalesce((select sum(e.amount_minor) from public.finance_ledger_entries e where e.organization_id=org and e.location_id=p_location_id and e.client_id=any(app_private.crm_family(org,c.id)) and e.account=''CLIENT''),0)';
 if position(anchor in body)=0 then raise exception 'Finance client balance anchor changed';end if;
 body:=replace(body,anchor,'app_private.finance_client_balance_amount(org,p_location_id,app_private.crm_family(org,c.id))');
 anchor:='(select coalesce(sum(amount_minor),0) from public.finance_ledger_entries where organization_id=org and location_id=p_location_id and account=''CLIENT'')';
 if position(anchor in body)=0 then raise exception 'Finance day balance anchor changed';end if;
 body:=replace(body,anchor,'app_private.finance_client_balance_amount(org,p_location_id,null)');execute body;
end$$;
create function app_private.cost_currency_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.base_currency<>old.base_currency and exists(select 1 from public.stock_cost_basis_events where organization_id=old.id) then raise exception using errcode='22023',message='CURRENCY_LOCKED';end if;return new;
end$$;
revoke all on function app_private.cost_currency_guard() from public,anon,authenticated,service_role;
create trigger cost_currency_guard before update of base_currency on public.organizations for each row execute function app_private.cost_currency_guard();
