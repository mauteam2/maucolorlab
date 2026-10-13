-- Sequence allocation order is not transaction commit order. Capture concrete
-- visible invalidation IDs; never delete every ID below an observed watermark.
create or replace function app_private.report_refresh(org uuid,loc uuid,rebuild boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare item record;mark bigint;captured bigint[];begin
 perform pg_advisory_xact_lock(hashtextextended(org::text||':'||loc::text||':reports',61));
 insert into app_private.report_invalidations(organization_id,location_id,domain,source_id)
  select org,loc,f.domain,f.source_id from app_private.report_facts f
  where f.organization_id=org and f.location_id=loc and f.domain in ('CLIENT','STOCK_ITEM')
   and (f.refreshed_at at time zone (select timezone from public.locations where id=loc))::date<>(statement_timestamp() at time zone (select timezone from public.locations where id=loc))::date
   and not exists(select 1 from app_private.report_invalidations x where x.organization_id=org and x.location_id=loc and x.domain=f.domain and x.source_id=f.source_id)
  order by f.source_id limit 500;
 select coalesce(array_agg(id),'{}'::bigint[]) into captured from
  (select id from app_private.report_invalidations where organization_id=org and location_id=loc order by id limit case when rebuild then null else 500 end) x;
 select coalesce(max(x),0) into mark from unnest(captured) x;
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
 else
  -- Repeated source invalidations within one batch are projected exactly once.
  for item in select distinct domain,source_id from app_private.report_invalidations where id=any(captured)
  loop perform app_private.report_project(org,loc,item.domain,item.source_id);end loop;
 end if;
 delete from app_private.report_invalidations where id=any(captured) and organization_id=org and location_id=loc;
 insert into app_private.report_state(organization_id,location_id,watermark,refreshed_at,last_rebuilt_at)
  values(org,loc,mark,statement_timestamp(),case when rebuild then statement_timestamp() end)
 on conflict(organization_id,location_id) do update set watermark=greatest(report_state.watermark,excluded.watermark),
  refreshed_at=excluded.refreshed_at,last_rebuilt_at=coalesce(excluded.last_rebuilt_at,report_state.last_rebuilt_at);
end$$;
