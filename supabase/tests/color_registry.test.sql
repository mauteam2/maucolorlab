begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values ('cc000000-0000-4000-8000-000000000001','registry-a@elifora.invalid'),('cc000000-0000-4000-8000-000000000002','registry-b@elifora.invalid');
insert into public.organizations(id,name,slug,base_currency) values ('cc000000-0000-4000-8000-000000000011','Synthetic registry A','registry-test-a','TRY'),('cc000000-0000-4000-8000-000000000012','Synthetic registry B','registry-test-b','TRY');
insert into public.locations(id,organization_id,name,timezone) values ('cc000000-0000-4000-8000-000000000021','cc000000-0000-4000-8000-000000000011','Synthetic','Europe/Istanbul'),('cc000000-0000-4000-8000-000000000022','cc000000-0000-4000-8000-000000000012','Synthetic','Europe/Istanbul');
insert into public.salon_memberships(id,organization_id,location_id,user_id,role_code,status,joined_at) values
 ('cc000000-0000-4000-8000-000000000031','cc000000-0000-4000-8000-000000000011','cc000000-0000-4000-8000-000000000021','cc000000-0000-4000-8000-000000000001','owner','active',now()),
 ('cc000000-0000-4000-8000-000000000032','cc000000-0000-4000-8000-000000000012','cc000000-0000-4000-8000-000000000022','cc000000-0000-4000-8000-000000000002','owner','active',now());
select is((select count(*) from color_registry_brands),8::bigint,'eight discovered brands, separately counted');
select is((select count(*) from color_registry_lines),29::bigint,'29 discovered lines');
select is((select count(*) from color_registry_sources),15::bigint,'15 actual collected official source receipts');
select is((select count(*) from color_registry_metadata where kind='SHADE'),7::bigint,'seven shade metadata records, not manufacturer portfolio totals');
select is((select count(*) from color_registry_metadata where kind='DEVELOPER'),1::bigint,'one developer listing creates no compatibility');
select is((select count(*) from color_registry_entries where state='PUBLISHED'),0::bigint,'no automatic publication');
select ok(not exists(select 1 from color_registry_entries where technical_line_id is not null),'no discovery-to-execution binding seeded');
select ok(not exists(select 1 from color_registry_metadata where documented_level is not null or documented_tone is not null),'names and codes do not manufacture levels, tones or pigment values');
select ok((select count(*) from app_private.color_registry_intake_audit)>100,'every initial metadata row has append-oriented intake receipt');
select throws_ok($$update color_registry_brands set display_name='forged'$$,'23514','IMMUTABLE_DISCOVERY_HISTORY','cannot rewrite original attribution');
select throws_ok($$delete from app_private.color_registry_intake_audit$$,'23514','IMMUTABLE_DISCOVERY_HISTORY','cannot erase intake receipt');
select throws_ok($$insert into color_registry_line_sources(entry_id,source_id,brand_id,region) select e.id,'igora-us','schwarzkopf-professional','US' from color_registry_entries e where e.line_id='loreal-professionnel-inoa'$$,'23514','DISCOVERY_SOURCE_BRAND_MISMATCH','cross-brand source attribution blocked');
select throws_ok($$insert into color_registry_line_sources(entry_id,source_id,brand_id,region) select e.id,'igora-us','schwarzkopf-professional','TR' from color_registry_entries e where e.line_id='schwarzkopf-professional-igora-zero-amm'$$,'23503',null,'US evidence cannot silently cover Türkiye');
select throws_ok($$insert into color_registry_entries(id,line_id,region,revision,state) values(gen_random_uuid(),'keune-tinta-color','TR',1,'VERIFIED')$$,'23514','DISCOVERY_REVIEW_REQUIRED','cannot skip intake/review with a VERIFIED flag');
select throws_ok($$insert into color_registry_entries(id,line_id,region,revision,state) values(gen_random_uuid(),'keune-tinta-color','TR',2,'DISCOVERED')$$,'23514','DISCOVERY_VERSION_CONFLICT','conditional append rejects stale/missing predecessor');
select set_config('request.jwt.claim.sub','cc000000-0000-4000-8000-000000000001',true);
-- A real tenant-only draft may exist, but its line identity cannot enter the
-- shared registry, even through a trusted intake author before publication.
insert into brand_catalog_releases(id,series_id,version,scope,organization_id,created_by)
values('cc000000-0000-4000-8000-000000000041','cc000000-0000-4000-8000-000000000042',1,'ORGANIZATION','cc000000-0000-4000-8000-000000000011','cc000000-0000-4000-8000-000000000001');
insert into catalog_brands(id,catalog_id,display_name) values('cc000000-0000-4000-8000-000000000043','cc000000-0000-4000-8000-000000000041','Keune');
insert into catalog_product_lines(id,catalog_id,brand_id,display_name) values('cc000000-0000-4000-8000-000000000044','cc000000-0000-4000-8000-000000000041','cc000000-0000-4000-8000-000000000043','Tinta Color');
insert into catalog_products(id,series_id,version,catalog_id,brand_id,line_id,manufacturer_code,display_name,product_type,professional_category,country_region)
values('cc000000-0000-4000-8000-000000000045','cc000000-0000-4000-8000-000000000046',1,'cc000000-0000-4000-8000-000000000041','cc000000-0000-4000-8000-000000000043','cc000000-0000-4000-8000-000000000044','TEST_ONLY','Synthetic, not manufacturer chemistry','SHADE','TEST_ONLY','GB');
select throws_ok($$insert into color_registry_entries(id,line_id,region,revision,previous_id,state,technical_line_id)
select gen_random_uuid(),line_id,region,revision+1,id,'UNDER_REVIEW','cc000000-0000-4000-8000-000000000044' from color_registry_entries where line_id='keune-tinta-color' and region='GB'$$,'23514','GLOBAL_REFERENCE_REQUIRED','shared discovery cannot disclose a tenant-private technical line ID');
set local role authenticated;
select is((select count(*) from color_registry_lines),29::bigint,'authorized salon A can read global reference metadata');
select is((color_registry_browse()->>'total')::integer,30,'pagination counts regional records separately from 29 lines');
select is(jsonb_array_length(color_registry_browse(p_limit=>1)->'items'),1,'bounded page is enforced by database');
select is((color_registry_browse(p_region=>'TR')->>'total')::integer,0,'no fallback from missing TR scope to US/UNKNOWN');
select is((color_registry_browse(p_query=>'Color Touch')->>'total')::integer,2,'indexed name search retains US and UNKNOWN evidence separately');
select is((color_registry_browse(p_state=>'PUBLISHED')->>'total')::integer,0,'no controlled recipe claim from collected sources');
select ok(not exists(select 1 from jsonb_array_elements(color_registry_browse(p_limit=>50)->'items') item where (item->>'recipeSupport')::boolean or item->>'catalogId' is not null or (item->>'ruleCount')::integer<>0),'discovery browse never returns executable rules or catalog IDs');
select ok(not exists(select 1 from color_registry_entries e where brand_catalog_packet(e.id) is not null),'every discovery UUID fails to resolve as an executable catalog');
select throws_ok($$select color_registry_browse(p_limit=>51)$$,'22023','VALIDATION_FAILED','unbounded enumeration rejected');
select throws_ok($$insert into color_registry_brands(id,manufacturer_id,display_name) values('forged','keune','forged')$$,'42501',null,'normal owner cannot register or promote brands');
select throws_ok($$update color_registry_entries set state='PUBLISHED'$$,'42501',null,'normal owner cannot publish discovery');
select throws_ok($$delete from color_registry_sources$$,'42501',null,'source history protected from normal owner');
select throws_ok($$select * from app_private.color_registry_intake_audit$$,'42501',null,'operator provenance audit not exposed as application data');
select set_config('request.jwt.claim.sub','cc000000-0000-4000-8000-000000000002',true);
select is((select count(*) from color_registry_lines),29::bigint,'authorized unrelated tenant sees same intentional global reference set');
select is(brand_catalog_packet('cc000000-0000-4000-8000-000000000041'),null::jsonb,'tenant B cannot resolve tenant A technical draft through existing API');
reset role;
update salon_memberships set status='revoked',revoked_at=now() where id='cc000000-0000-4000-8000-000000000032';
set local role authenticated;
select is((select count(*) from color_registry_lines),0::bigint,'revoked membership loses discovery read under RLS');
select throws_ok($$select color_registry_browse()$$,'42501','FORBIDDEN','revoked membership cannot bypass RLS through browse RPC');
reset role;
set local role anon;
select throws_ok($$select color_registry_browse()$$,'42501',null,'anonymous RPC access denied');
select throws_ok($$select * from color_registry_lines$$,'42501',null,'anonymous table access denied');
reset role;
select * from finish();
rollback;
