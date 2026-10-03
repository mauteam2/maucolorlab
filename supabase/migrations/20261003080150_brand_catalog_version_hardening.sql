-- Forward hardening: published technical units, immutable audit and series-wide
-- locking are independent of the caller's application filtering.
alter table public.catalog_technical_facts add constraint catalog_fact_value_bounded check(value is null or pg_column_size(value)<=1024);
alter table public.catalog_technical_facts add constraint catalog_fact_units check(value is null or (
 case key when 'shade_level' then unit is not distinct from 'LEVEL' and jsonb_typeof(value)='number'
 when 'tone_family' then unit is not distinct from 'CATEGORY' and jsonb_typeof(value)='string'
 when 'mixing_ratio' then unit is not distinct from 'RATIO' and jsonb_typeof(value)='string'
 when 'processing_minutes' then unit is not distinct from 'MINUTES' and jsonb_typeof(value)='number'
 when 'developer_strength' then unit is not distinct from 'PERCENT' and jsonb_typeof(value)='number'
 when 'lift_levels' then unit is not distinct from 'LEVELS' and jsonb_typeof(value)='number'
 when 'grey_coverage' then unit is not distinct from 'BOOLEAN' and jsonb_typeof(value)='boolean'
 when 'deposit_capability' then unit is not distinct from 'BOOLEAN' and jsonb_typeof(value)='boolean'
 else unit is not distinct from 'SOURCE_SCALE' and jsonb_typeof(value)='number' end));

create function app_private.lock_brand_catalog(p_id uuid) returns void language plpgsql volatile security invoker set search_path='' as $$
declare s uuid;
begin
 if auth.uid() is null or not app_private.can_read_catalog(p_id) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select series_id into s from public.brand_catalog_releases where id=p_id;
 if s is null then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text,2));
end $$;
revoke all on function app_private.lock_brand_catalog(uuid) from public,anon,service_role;
grant execute on function app_private.lock_brand_catalog(uuid) to authenticated;
-- These exact substitutions preserve the previously audited signature/context checks.
-- Abort if an earlier migration's body differs rather than silently changing another routine.
do $$ declare d text;n text;
begin
 d:=pg_get_functiondef('app_private.transition_brand_catalog(uuid,text,text,uuid)'::regprocedure);
 n:='perform pg_advisory_xact_lock(hashtextextended(p_catalog_id::text,1));';
 if position(n in d)=0 then raise exception 'transition lock definition mismatch';end if;
 execute replace(d,n,'perform app_private.lock_brand_catalog(p_catalog_id);');
 d:=pg_get_functiondef('app_private.store_brand_recipe(uuid,uuid,text,text,uuid)'::regprocedure);
 n:='perform pg_advisory_xact_lock(hashtextextended(e->>''catalogId'',1));';
 if position(n in d)=0 then raise exception 'recipe lock definition mismatch';end if;
 execute replace(d,n,'perform app_private.lock_brand_catalog((e->>''catalogId'')::uuid);');
 d:=pg_get_functiondef('app_private.transition_brand_catalog(uuid,text,text,uuid)'::regprocedure);
 n:=$body$update public.brand_catalog_releases set state='RETIRED' where series_id=c.series_id and state='PUBLISHED';
  insert into public.brand_catalog_audit(catalog_id,organization_id,actor_id,action,entity_id,correlation_id) select id,organization_id,auth.uid(),'catalog.deprecated',id,p_correlation_id from public.brand_catalog_releases where series_id=c.series_id and state='RETIRED';$body$;
 if position(n in d)=0 then raise exception 'deprecation audit definition mismatch';end if;
 execute replace(d,n,$body$with retired as (update public.brand_catalog_releases set state='RETIRED' where series_id=c.series_id and state='PUBLISHED' returning id,organization_id)
  insert into public.brand_catalog_audit(catalog_id,organization_id,actor_id,action,entity_id,correlation_id) select id,organization_id,auth.uid(),'catalog.deprecated',id,p_correlation_id from retired;$body$);
end $$;

create function app_private.catalog_product_version_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.catalog_products%rowtype;c public.brand_catalog_releases%rowtype;previous_catalog public.brand_catalog_releases%rowtype;
begin
 select * into c from public.brand_catalog_releases where id=new.catalog_id;
 if new.version=1 then
  if exists(select 1 from public.catalog_products where series_id=new.series_id) then raise exception using errcode='23514',message='PRODUCT_VERSION_CONFLICT';end if;
 else
  select * into p from public.catalog_products where series_id=new.series_id and version=new.version-1;
  if not found then raise exception using errcode='23514',message='PRODUCT_VERSION_CONFLICT';end if;
  select * into previous_catalog from public.brand_catalog_releases where id=p.catalog_id;
  if previous_catalog.series_id<>c.series_id or previous_catalog.scope<>c.scope or previous_catalog.organization_id is distinct from c.organization_id or p.product_type<>new.product_type or p.manufacturer_code<>new.manufacturer_code or previous_catalog.version>=c.version then raise exception using errcode='23514',message='PRODUCT_VERSION_CONFLICT';end if;
 end if;
 return new;
end $$;
revoke all on function app_private.catalog_product_version_guard() from public,anon,authenticated,service_role;
create trigger catalog_product_version_guard before insert on public.catalog_products for each row execute function app_private.catalog_product_version_guard();
create function app_private.catalog_audit_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception using errcode='23514',message='IMMUTABLE_CATALOG_AUDIT';end $$;
revoke all on function app_private.catalog_audit_immutable() from public,anon,authenticated,service_role;
create trigger catalog_audit_immutable before update or delete on public.brand_catalog_audit for each row execute function app_private.catalog_audit_immutable();
create function app_private.catalog_release_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.brand_catalog_audit(catalog_id,organization_id,actor_id,action,entity_id,correlation_id) values(new.id,new.organization_id,auth.uid(),'catalog.created',new.id,gen_random_uuid());return new;
end $$;
revoke all on function app_private.catalog_release_audit() from public,anon,authenticated,service_role;
create trigger catalog_release_audit after insert on public.brand_catalog_releases for each row execute function app_private.catalog_release_audit();
