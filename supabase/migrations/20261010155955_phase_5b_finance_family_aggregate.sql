-- Authorize once and sum immutable scoped sources instead of invoking per-row
-- balance functions through correlated RLS subqueries for every account entry.
create function app_private.finance_client_remaining_amount(org uuid,loc uuid,family uuid[],credit boolean) returns numeric language plpgsql stable security definer set search_path='' as $$begin
 if not app_private.user_has_permission(org,loc,'finance.view') or family is null or exists(select 1 from unnest(family) cid where not exists(select 1 from public.clients c where c.organization_id=org and c.id=cid)) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return (select coalesce(sum(d.amount_minor-coalesce(a.n,0)-case when credit then coalesce(r.n,0) else 0 end),0)
  from public.finance_documents d
  left join lateral(select sum(amount_minor) n from public.finance_payment_allocations where case when credit then payment_id=d.id else charge_id=d.id end) a on true
  left join lateral(select sum(amount_minor) n from public.finance_documents where original_payment_id=d.id) r on credit
  where d.organization_id=org and d.location_id=loc and d.client_id=any(family) and (credit and d.type in ('PAYMENT','DEPOSIT','CLIENT_CREDIT') or not credit and d.type in ('SERVICE_CHARGE','RETAIL_SALE')) and not exists(select 1 from public.finance_documents rev where rev.reversal_of=d.id));
end$$;
revoke all on function app_private.finance_client_remaining_amount(uuid,uuid,uuid[],boolean) from public,anon,authenticated,service_role;
grant execute on function app_private.finance_client_remaining_amount(uuid,uuid,uuid[],boolean) to elifora_finance_writer;
do $$declare body text;anchor text;begin
 body:=pg_get_functiondef('public.finance_snapshot(uuid,uuid,jsonb)'::regprocedure);
 anchor:='coalesce((select sum(coalesce(app_private.finance_available(d.id),0)) from public.finance_documents d where d.organization_id=org and d.location_id=p_location_id and d.client_id=any(app_private.crm_family(org,c.id)) and d.type in (''PAYMENT'',''DEPOSIT'',''CLIENT_CREDIT'')),0)';
 if position(anchor in body)=0 then raise exception 'Finance credit anchor changed';end if;
 body:=replace(body,anchor,'app_private.finance_client_remaining_amount(org,p_location_id,app_private.crm_family(org,c.id),true)');
 anchor:='coalesce((select sum(coalesce(app_private.finance_outstanding(d.id),0)) from public.finance_documents d where d.organization_id=org and d.location_id=p_location_id and d.client_id=any(app_private.crm_family(org,c.id)) and d.type in (''SERVICE_CHARGE'',''RETAIL_SALE'')),0)';
 if position(anchor in body)=0 then raise exception 'Finance outstanding anchor changed';end if;
 body:=replace(body,anchor,'app_private.finance_client_remaining_amount(org,p_location_id,app_private.crm_family(org,c.id),false)');execute body;
end$$;
