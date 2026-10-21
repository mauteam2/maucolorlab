-- A shared reference must never disclose a tenant-private technical line ID.
-- Applies even before publication; operational authorization remains unchanged.
do $$ begin
 if exists(select 1 from public.color_registry_entries e join public.catalog_product_lines l on l.id=e.technical_line_id join public.brand_catalog_releases r on r.id=l.catalog_id where r.scope<>'GLOBAL') then
  raise exception using errcode='23514',message='GLOBAL_REFERENCE_REQUIRED';
 end if;
end $$;
create or replace function app_private.color_registry_append_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare prior public.color_registry_entries%rowtype; technical public.catalog_product_lines%rowtype;
begin
 if TG_OP<>'INSERT' then raise exception using errcode='23514',message='IMMUTABLE_DISCOVERY_HISTORY';end if;
 if TG_TABLE_NAME='color_registry_entries' then
  perform pg_advisory_xact_lock(hashtextextended('color-registry:'||new.line_id||':'||new.region,0));
  select * into prior from public.color_registry_entries where line_id=new.line_id and region=new.region order by revision desc limit 1;
  if (prior.id is null and new.revision<>1) or (prior.id is not null and (new.previous_id is distinct from prior.id or new.revision<>prior.revision+1)) then
   raise exception using errcode='23514',message='DISCOVERY_VERSION_CONFLICT';end if;
  if (prior.id is null and new.state not in ('DISCOVERED','SOURCE_COLLECTED')) or (prior.id is not null and not (
   (prior.state='DISCOVERED' and new.state in ('SOURCE_COLLECTED','REJECTED','SUPERSEDED')) or
   (prior.state='SOURCE_COLLECTED' and new.state in ('SOURCE_COLLECTED','UNDER_REVIEW','REJECTED','SUPERSEDED')) or
   (prior.state='UNDER_REVIEW' and new.state in ('SOURCE_COLLECTED','VERIFIED','REJECTED','SUPERSEDED')) or
   (prior.state='VERIFIED' and new.state in ('PUBLISHED','REJECTED','SUPERSEDED')) or
   (prior.state='PUBLISHED' and new.state='SUPERSEDED') or
   (prior.state in ('REJECTED','SUPERSEDED') and new.state='SOURCE_COLLECTED')
  )) then raise exception using errcode='23514',message='DISCOVERY_REVIEW_REQUIRED';end if;
  if new.technical_line_id is not null then
   select * into technical from public.catalog_product_lines where id=new.technical_line_id;
   if not found or not exists(select 1 from public.brand_catalog_releases r where r.id=technical.catalog_id and r.scope='GLOBAL') then
    raise exception using errcode='23514',message='GLOBAL_REFERENCE_REQUIRED';end if;
   if new.region='UNKNOWN' or not exists(select 1 from public.catalog_products where line_id=technical.id)
    or exists(select 1 from public.catalog_products where line_id=technical.id and country_region is distinct from new.region)
    or not exists(select 1 from public.catalog_brands b join public.color_registry_lines l on l.id=new.line_id join public.color_registry_brands rb on rb.id=l.brand_id where b.id=technical.brand_id and b.display_name=rb.display_name and technical.display_name=l.display_name)
   then raise exception using errcode='23514',message='DISCOVERY_REGION_OR_IDENTITY_MISMATCH';end if;
  end if;
  if new.state='PUBLISHED' and (prior.state is distinct from 'VERIFIED' or not exists(select 1 from public.brand_catalog_releases r join public.catalog_product_lines l on l.catalog_id=r.id where l.id=new.technical_line_id and r.state='PUBLISHED' and r.scope='GLOBAL')) then
   raise exception using errcode='23514',message='GOVERNED_PUBLICATION_REQUIRED';end if;
 elsif TG_TABLE_NAME='color_registry_line_sources' then
  if not exists(select 1 from public.color_registry_entries e join public.color_registry_lines l on l.id=e.line_id where e.id=new.entry_id and l.brand_id=new.brand_id) then
   raise exception using errcode='23514',message='DISCOVERY_SOURCE_BRAND_MISMATCH';end if;
 end if;
 return new;
end $$;
revoke all on function app_private.color_registry_append_guard() from public,anon,authenticated,service_role;
