-- A new location must see its existing organization's canonical CRM families.
-- Timezone changes invalidate current relationship/expiry snapshots as well.
create function app_private.report_location_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;begin
 if tg_op='INSERT' or new.timezone is distinct from old.timezone then
  for r in select id from public.clients where organization_id=new.organization_id loop
   perform app_private.report_enqueue(new.organization_id,new.id,'CLIENT',r.id);
  end loop;
  for r in select id from public.stock_items where organization_id=new.organization_id and location_id=new.id loop
   perform app_private.report_enqueue(new.organization_id,new.id,'STOCK_ITEM',r.id);
  end loop;
 end if;
 return new;
end$$;
revoke all on function app_private.report_location_changed() from public,anon,authenticated,service_role;
create trigger report_location_invalidate after insert or update on public.locations for each row execute function app_private.report_location_changed();
do $migration$ declare body text;begin
 body:=pg_get_functiondef('app_private.report_project(uuid,uuid,text,uuid)'::regprocedure);
 body:=replace(body,'coalesce(r.service_name,''Retail'')','coalesce(r.service_name,case when r.domain=''RETAIL'' then ''Perakende satış'' else ''Manuel hizmet kaydı'' end)');
 execute body;
end $migration$;
