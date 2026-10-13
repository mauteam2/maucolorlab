-- Service version alone is not identity: two distinct services can both be v1.
-- Keep the old immutable private history; only complete new tuples are authority.
create table app_private.cost_service_category_snapshots(
 appointment_id uuid not null references public.salon_appointments(id),service_id uuid not null references public.salon_services(id),service_version bigint not null,category text not null,
 primary key(appointment_id,service_id,service_version));
revoke all on app_private.cost_service_category_snapshots from public,anon,authenticated,service_role;
create trigger cost_category_snapshot_immutable before update or delete on app_private.cost_service_category_snapshots for each row execute function app_private.live_immutable();
create or replace function app_private.cost_service_category() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' or (new.service_id,new.service_version) is distinct from (old.service_id,old.service_version) then
  insert into app_private.cost_service_category_snapshots(appointment_id,service_id,service_version,category)
   select new.id,new.service_id,new.service_version,category from public.salon_services where id=new.service_id and version=new.service_version on conflict do nothing;
 end if;return new;
end$$;
do $migration$ declare body text;begin
 body:=pg_get_functiondef('app_private.profitability_finance_posted()'::regprocedure);
 body:=replace(body,'from app_private.cost_service_categories c where c.appointment_id=ap.id and c.service_version=ap.service_version','from app_private.cost_service_category_snapshots c where c.appointment_id=ap.id and c.service_id=ap.service_id and c.service_version=ap.service_version');execute body;
end $migration$;
