-- Global public-reference metadata, never tenant/customer data or engine input.
-- Controlled intake is an explicitly reviewed forward migration. No application
-- role (including service_role) can mutate or promote discovery records.
create table public.color_registry_manufacturers (
 id text primary key check(id ~ '^[a-z0-9-]{1,80}$'), display_name text not null check(length(display_name) between 1 and 160)
);
create table public.color_registry_brands (
 id text primary key check(id ~ '^[a-z0-9-]{1,80}$'), manufacturer_id text not null references public.color_registry_manufacturers(id),
 display_name text not null check(length(display_name) between 1 and 160)
);
create index color_registry_brand_manufacturer on public.color_registry_brands(manufacturer_id);
create index color_registry_brand_search on public.color_registry_brands using gin(to_tsvector('simple',display_name));
create table public.color_registry_lines (
 id text primary key check(id ~ '^[a-z0-9-]{1,100}$'), brand_id text not null references public.color_registry_brands(id),
 display_name text not null check(length(display_name) between 1 and 160)
);
create index color_registry_line_brand on public.color_registry_lines(brand_id,id);
create index color_registry_line_search on public.color_registry_lines using gin(to_tsvector('simple',display_name));
create table public.color_registry_entries (
 id uuid primary key, line_id text not null references public.color_registry_lines(id),
 region text not null check(region='UNKNOWN' or region ~ '^[A-Z]{2}$' or region in ('EU','GLOBAL')),
 revision integer not null check(revision>0), previous_id uuid references public.color_registry_entries(id),
 state text not null check(state in ('DISCOVERED','SOURCE_COLLECTED','UNDER_REVIEW','VERIFIED','PUBLISHED','REJECTED','SUPERSEDED')),
 technical_line_id uuid references public.catalog_product_lines(id),
 last_reviewed_at timestamptz, review_reference text check(length(review_reference) between 1 and 1000),
 unique(line_id,region,revision), unique(id,region), check((revision=1)=(previous_id is null)),
 check(state not in ('VERIFIED','PUBLISHED') or (last_reviewed_at is not null and review_reference is not null)),
 check(state<>'PUBLISHED' or (technical_line_id is not null and region<>'UNKNOWN'))
);
create index color_registry_entry_filter on public.color_registry_entries(region,state,line_id,revision desc);
create index color_registry_entry_latest on public.color_registry_entries(line_id,region,revision desc);
create index color_registry_entry_previous on public.color_registry_entries(previous_id);
create index color_registry_entry_technical on public.color_registry_entries(technical_line_id);
create table public.color_registry_sources (
 id text primary key, brand_id text not null references public.color_registry_brands(id),
 region text not null, url text not null check(url like 'https://%'), resolved_url text not null check(resolved_url like 'https://%'),
 title text not null, document_type text not null check(document_type in ('TECHNICAL_GUIDE','SHADE_CHART','SHADE_CHART_INDEX','IFU','DEVELOPER_GUIDE','COMPATIBILITY_GUIDE','PRODUCT_PAGE','PRODUCT_PORTFOLIO')),
 document_version text, document_date date, retrieved_at timestamptz not null,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), byte_length integer not null check(byte_length>0), language text not null,
 review_status text not null check(review_status in ('SOURCE_COLLECTED','UNDER_REVIEW','VERIFIED','REJECTED','SUPERSEDED')),
 unique(id,brand_id,region)
);
create index color_registry_source_brand on public.color_registry_sources(brand_id,region);
create table public.color_registry_line_sources (
 entry_id uuid not null, source_id text not null, brand_id text not null, region text not null,
 primary key(entry_id,source_id), foreign key(entry_id,region) references public.color_registry_entries(id,region),
 foreign key(source_id,brand_id,region) references public.color_registry_sources(id,brand_id,region)
);
create index color_registry_line_source_reverse on public.color_registry_line_sources(source_id);
create table public.color_registry_metadata (
 id text primary key, entry_id uuid not null, source_id text not null,
 kind text not null check(kind in ('SHADE','DEVELOPER')), manufacturer_code text, display_name text,
 documented_level text, documented_tone text,
 foreign key(entry_id,source_id) references public.color_registry_line_sources(entry_id,source_id),
 check(manufacturer_code is not null or display_name is not null),
 check(kind='SHADE' or (documented_level is null and documented_tone is null))
 -- Deliberately no vector, ratio, processing time or compatibility field.
);
create index color_registry_metadata_entry on public.color_registry_metadata(entry_id,kind,id);
create index color_registry_metadata_search on public.color_registry_metadata using gin(to_tsvector('simple',coalesce(manufacturer_code,'')||' '||coalesce(display_name,'')));
create table app_private.color_registry_intake_audit (
 id bigint generated always as identity primary key, relation_name text not null, record_key text not null,
 content_sha256 text not null, recorded_at timestamptz not null default statement_timestamp(),
 migration_reference text not null default 'reviewed-forward-migration', correlation_id uuid not null default gen_random_uuid()
);
alter table app_private.color_registry_intake_audit enable row level security;
revoke all on app_private.color_registry_intake_audit from public,anon,authenticated,service_role;

create function app_private.can_read_color_registry() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.salon_memberships m
 where m.user_id=auth.uid() and m.status='active' and app_private.can_access_clients(m.organization_id,'color_plan.read'));
$$;
revoke all on function app_private.can_read_color_registry() from public,anon,authenticated,service_role;
grant execute on function app_private.can_read_color_registry() to authenticated;

create function app_private.color_registry_append_guard() returns trigger language plpgsql security invoker set search_path='' as $$
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

create function app_private.color_registry_intake_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into app_private.color_registry_intake_audit(relation_name,record_key,content_sha256)
 values(TG_TABLE_NAME,coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'entry_id'),encode(extensions.digest(convert_to(to_jsonb(new)::text,'UTF8'),'sha256'),'hex'));
 return new;
end $$;
revoke all on function app_private.color_registry_intake_audit() from public,anon,authenticated,service_role;
do $$ declare t text;begin
 foreach t in array array['color_registry_manufacturers','color_registry_brands','color_registry_lines','color_registry_entries','color_registry_sources','color_registry_line_sources','color_registry_metadata'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy registry_member_read on public.%I for select to authenticated using((select app_private.can_read_color_registry()))',t);
  execute format('create trigger discovery_append_guard before insert or update or delete on public.%I for each row execute function app_private.color_registry_append_guard()',t);
  execute format('create trigger discovery_intake_audit after insert on public.%I for each row execute function app_private.color_registry_intake_audit()',t);
 end loop;
end $$;
create trigger registry_audit_immutable before update or delete on app_private.color_registry_intake_audit for each row execute function app_private.color_registry_append_guard();

create function public.color_registry_browse(p_query text default '',p_brand text default null,p_region text default null,p_state text default null,p_offset integer default 0,p_limit integer default 25)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not app_private.can_read_color_registry() then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if p_query is null or length(p_query)>80 or (p_brand is not null and p_brand !~ '^[a-z0-9-]{1,100}$')
 or (p_region is not null and p_region !~ '^(UNKNOWN|GLOBAL|EU|[A-Z]{2})$')
 or p_offset is null or p_offset<0 or p_offset>10000 or p_limit is null or p_limit not between 1 and 50
 or (p_state is not null and p_state not in ('DISCOVERED','SOURCE_COLLECTED','UNDER_REVIEW','VERIFIED','PUBLISHED','REJECTED','SUPERSEDED')) then
 raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
 with latest as (
 select distinct on(e.line_id,e.region) e.* from public.color_registry_entries e
 where (p_region is null or e.region=p_region) order by e.line_id,e.region,e.revision desc
 ), matches as (
 select e.*,l.display_name line_name,b.display_name brand_name,b.id brand_key,m.display_name manufacturer_name,
 r.id catalog_id,r.state technical_state,
 e.state='PUBLISHED' and r.state='PUBLISHED' and r.scope='GLOBAL' and e.region<>'UNKNOWN'
 and exists(select 1 from public.catalog_products p join public.catalog_compatibility_rules cr on cr.product_id=p.id
 where p.line_id=tl.id and p.active and p.verification_status='ELIFORA_VERIFIED' and p.country_region=e.region and cr.outcome in ('VERIFIED_ALLOWED','VERIFIED_RESTRICTED'))
 as recipe_support
 from latest e join public.color_registry_lines l on l.id=e.line_id
 join public.color_registry_brands b on b.id=l.brand_id join public.color_registry_manufacturers m on m.id=b.manufacturer_id
 left join public.catalog_product_lines tl on tl.id=e.technical_line_id left join public.brand_catalog_releases r on r.id=tl.catalog_id
 where (p_brand is null or b.id=p_brand) and (p_state is null or (case when e.state='PUBLISHED' and coalesce(r.state,'')<>'PUBLISHED' then 'SUPERSEDED' else e.state end)=p_state)
 and (p_query='' or to_tsvector('simple',l.display_name) @@ plainto_tsquery('simple',p_query) or to_tsvector('simple',b.display_name) @@ plainto_tsquery('simple',p_query))
 ), page as (select * from matches order by brand_key,line_id,region offset p_offset limit p_limit)
 select jsonb_build_object('schemaVersion',1,'total',(select count(*) from matches),'offset',p_offset,'limit',p_limit,
 'brands',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',display_name) order by display_name) from public.color_registry_brands),'[]'::jsonb),
 'regions',coalesce((select jsonb_agg(region order by region) from (select distinct region from public.color_registry_entries) regions),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(jsonb_build_object(
 'id',e.id,'lineId',e.line_id,'line',e.line_name,'brandId',e.brand_key,'brand',e.brand_name,'manufacturer',e.manufacturer_name,'region',e.region,
 'state',case when e.state='PUBLISHED' and not coalesce(e.recipe_support,false) then 'SUPERSEDED' else e.state end,
 'lastReviewedAt',e.last_reviewed_at,'recipeSupport',coalesce(e.recipe_support,false),'catalogId',case when e.recipe_support then e.catalog_id else null end,
 'shadeCount',(select count(*) from public.color_registry_metadata md where md.entry_id=e.id and md.kind='SHADE'),
 'developerCount',(select count(*) from public.color_registry_metadata md where md.entry_id=e.id and md.kind='DEVELOPER'),
 'ruleCount',case when e.recipe_support then (select count(*) from public.catalog_compatibility_rules cr join public.catalog_products p on p.id=cr.product_id where p.line_id=e.technical_line_id and cr.outcome in ('VERIFIED_ALLOWED','VERIFIED_RESTRICTED')) else 0 end,
 'sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'url',s.url,'title',s.title,'documentType',s.document_type,'region',s.region,'language',s.language,'documentVersion',s.document_version,'documentDate',s.document_date,'retrievedAt',s.retrieved_at,'sha256',s.sha256,'reviewStatus',s.review_status) order by s.id) from public.color_registry_line_sources ls join public.color_registry_sources s on s.id=ls.source_id where ls.entry_id=e.id),'[]'::jsonb)
 ) order by e.brand_key,e.line_id,e.region) from page e),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.color_registry_browse(text,text,text,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.color_registry_browse(text,text,text,text,integer,integer) to authenticated;
