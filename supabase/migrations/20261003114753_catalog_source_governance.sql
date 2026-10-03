
-- Additive Phase 2B. No catalog is automatically published or assigned an operator.
create table app_private.brand_pilot_manifests(key text primary key,body jsonb not null);
revoke all on app_private.brand_pilot_manifests from public,anon,authenticated,service_role;
insert into app_private.brand_pilot_manifests values ('schwarzkopf-igora-royal-absolutes', $manifest${"schemaVersion":1,"manufacturer":"Schwarzkopf Professional","series":"IGORA ROYAL ABSOLUTES","countryRegion":"US-linked document edition; regional availability UNKNOWN","sources":[{"id":"1f6a6290-0737-5938-82f7-726fff26c0bb","manufacturer":"Schwarzkopf Professional","documentTitle":"IGORA ROYAL ABSOLUTES Assortment","documentVersion":null,"documentDate":null,"sourceUrl":"https://dm.henkel-dam.com/is/content/henkel/SKP_ICT_IG_Igora_Assortments_Absolutes_920x660","retrievedAt":"2026-10-03T11:50:00Z","sourceType":"MANUFACTURER_TECHNICAL_DOCUMENT","contentSha256":"7fd50ca3e97bd40dc4861f65e2b56f59eeb654b42b74df5f145d504c7164fd6d"},{"id":"3a5e72af-428f-5674-8ebb-890e26e5f42a","manufacturer":"Schwarzkopf Professional","documentTitle":"IGORA ROYAL ABSOLUTES Instructions For Use","documentVersion":null,"documentDate":null,"sourceUrl":"https://dm.henkel-dam.com/is/content/henkel/IGORA_ROYAL_ABSOLUTES_Instruction_For_Use","retrievedAt":"2026-10-03T11:50:00Z","sourceType":"MANUFACTURER_TECHNICAL_DOCUMENT","contentSha256":"4be6f4e16016649ac5a18edc000cb09b8f4e61f84669e3d87526cd56656d6ac1"},{"id":"67637023-0726-5835-a6a0-766138093afd","manufacturer":"Schwarzkopf Professional","documentTitle":"IGORA ROYAL ABSOLUTES Technical Manual","documentVersion":null,"documentDate":null,"sourceUrl":"https://dm.henkel-dam.com/is/content/henkel/IGORA_ROYAL_ABSOLUTES_Technical_Manual","retrievedAt":"2026-10-03T11:50:00Z","sourceType":"MANUFACTURER_TECHNICAL_DOCUMENT","contentSha256":"9905d3d3d11357a85fbbb462959bca1a5694d44021cbb0beead8aaf94d5013a8"}],"shades":[{"manufacturerCode":"9-140","displayName":"IGORA ROYAL ABSOLUTES 9-140","level":9,"manufacturerTone":"140","toneLabel":"cendré","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"9-40","displayName":"IGORA ROYAL ABSOLUTES 9-40","level":9,"manufacturerTone":"40","toneLabel":"beige","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"9-460","displayName":"IGORA ROYAL ABSOLUTES 9-460","level":9,"manufacturerTone":"460","toneLabel":"beige","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"9-470","displayName":"IGORA ROYAL ABSOLUTES 9-470","level":9,"manufacturerTone":"470","toneLabel":"beige","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"9-50","displayName":"IGORA ROYAL ABSOLUTES 9-50","level":9,"manufacturerTone":"50","toneLabel":"gold","normalizedTone":"GOLD_WARM","pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"9-60","displayName":"IGORA ROYAL ABSOLUTES 9-60","level":9,"manufacturerTone":"60","toneLabel":"chocolate","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"8-01","displayName":"IGORA ROYAL ABSOLUTES 8-01","level":8,"manufacturerTone":"01","toneLabel":"natural","normalizedTone":"NEUTRAL","pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"8-140","displayName":"IGORA ROYAL ABSOLUTES 8-140","level":8,"manufacturerTone":"140","toneLabel":"cendré","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"8-50","displayName":"IGORA ROYAL ABSOLUTES 8-50","level":8,"manufacturerTone":"50","toneLabel":"gold","normalizedTone":"GOLD_WARM","pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"8-60","displayName":"IGORA ROYAL ABSOLUTES 8-60","level":8,"manufacturerTone":"60","toneLabel":"chocolate","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"7-10","displayName":"IGORA ROYAL ABSOLUTES 7-10","level":7,"manufacturerTone":"10","toneLabel":"cendré","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"7-140","displayName":"IGORA ROYAL ABSOLUTES 7-140","level":7,"manufacturerTone":"140","toneLabel":"cendré","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"7-450","displayName":"IGORA ROYAL ABSOLUTES 7-450","level":7,"manufacturerTone":"450","toneLabel":"beige","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"7-460","displayName":"IGORA ROYAL ABSOLUTES 7-460","level":7,"manufacturerTone":"460","toneLabel":"beige","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"7-470","displayName":"IGORA ROYAL ABSOLUTES 7-470","level":7,"manufacturerTone":"470","toneLabel":"beige","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"7-50","displayName":"IGORA ROYAL ABSOLUTES 7-50","level":7,"manufacturerTone":"50","toneLabel":"gold","normalizedTone":"GOLD_WARM","pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"7-560","displayName":"IGORA ROYAL ABSOLUTES 7-560","level":7,"manufacturerTone":"560","toneLabel":"gold","normalizedTone":"GOLD_WARM","pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"7-60","displayName":"IGORA ROYAL ABSOLUTES 7-60","level":7,"manufacturerTone":"60","toneLabel":"chocolate","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"7-70","displayName":"IGORA ROYAL ABSOLUTES 7-70","level":7,"manufacturerTone":"70","toneLabel":"copper","normalizedTone":"COPPER","pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"7-710","displayName":"IGORA ROYAL ABSOLUTES 7-710","level":7,"manufacturerTone":"710","toneLabel":"copper","normalizedTone":"COPPER","pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"6-460","displayName":"IGORA ROYAL ABSOLUTES 6-460","level":6,"manufacturerTone":"460","toneLabel":"beige","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"6-50","displayName":"IGORA ROYAL ABSOLUTES 6-50","level":6,"manufacturerTone":"50","toneLabel":"gold","normalizedTone":"GOLD_WARM","pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"6-60","displayName":"IGORA ROYAL ABSOLUTES 6-60","level":6,"manufacturerTone":"60","toneLabel":"chocolate","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"6-70","displayName":"IGORA ROYAL ABSOLUTES 6-70","level":6,"manufacturerTone":"70","toneLabel":"copper","normalizedTone":"COPPER","pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"6-80","displayName":"IGORA ROYAL ABSOLUTES 6-80","level":6,"manufacturerTone":"80","toneLabel":"red","normalizedTone":"RED","pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"5-50","displayName":"IGORA ROYAL ABSOLUTES 5-50","level":5,"manufacturerTone":"50","toneLabel":"gold","normalizedTone":"GOLD_WARM","pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"5-60","displayName":"IGORA ROYAL ABSOLUTES 5-60","level":5,"manufacturerTone":"60","toneLabel":"chocolate","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"5-80","displayName":"IGORA ROYAL ABSOLUTES 5-80","level":5,"manufacturerTone":"80","toneLabel":"red","normalizedTone":"RED","pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"},{"manufacturerCode":"4-60","displayName":"IGORA ROYAL ABSOLUTES 4-60","level":4,"manufacturerTone":"60","toneLabel":"chocolate","normalizedTone":null,"pigmentVector":"UNKNOWN","sourceId":"1f6a6290-0737-5938-82f7-726fff26c0bb","section":"page 1, occupied shade-chart cell","notationSourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","notationSection":"page 1, colour numbering system"}],"developers":[{"manufacturerCode":"IGORA ROYAL OIL DEVELOPER 6%","displayName":"IGORA ROYAL Oil Developer 6% / 20 Vol.","strengthPercent":6},{"manufacturerCode":"IGORA ROYAL OIL DEVELOPER 9%","displayName":"IGORA ROYAL Oil Developer 9% / 30 Vol.","strengthPercent":9}],"usage":{"sourceId":"3a5e72af-428f-5674-8ebb-890e26e5f42a","section":"page 2, developer usage / mixing / processing / application","mixingRatio":"1:1","processingMinutesMin":30,"processingMinutesMax":45,"application":"REGROWTH_ONLY","developer6Context":"PURE_DEPOSIT_WHITE_GT_90","developer9Context":"WHITE_COVERAGE_UP_TO_90","maxLiftWith9":3,"heat":"NOT_RECOMMENDED_FOR_WHITE_COVERAGE","heatSource":"https://www.schwarzkopf-professional.com/us/en/color/igora/absolutes.html#frequently-asked-questions","safetyReview":"Manufacturer full IFU and professional safety review required"},"unknowns":["All 16 quantitative pigment channels","Single exact processing duration","Regional commercial SKU/EAN and local availability","Manufacturer document date/version","Missing thirtieth shade claimed by product page","Numeric coverage / ash / neutralisation strengths","Other developers and cross-brand compatibility"]}$manifest$::jsonb);

alter table public.brand_catalog_releases drop constraint brand_catalog_releases_state_check;
alter table public.brand_catalog_releases add constraint brand_catalog_releases_state_check check(state in ('DRAFT','TECHNICAL_REVIEW','GOLDEN_TEST','APPROVED','PUBLISHED','REJECTED','RETIRED'));
alter table public.brand_catalog_releases add column pilot_key text references app_private.brand_pilot_manifests(key),
 add column reviewed_by uuid references public.profiles(user_id),add column reviewed_at timestamptz,
 add column approved_by uuid references public.profiles(user_id),add column approved_at timestamptz,
 add column published_by uuid references public.profiles(user_id),add column published_at timestamptz;
create index catalog_release_pilot_idx on public.brand_catalog_releases(pilot_key);
create index catalog_release_reviewer_idx on public.brand_catalog_releases(reviewed_by);
create index catalog_release_approver_idx on public.brand_catalog_releases(approved_by);
create index catalog_release_publisher_idx on public.brand_catalog_releases(published_by);
alter table public.brand_catalog_audit add column decision_note text check(char_length(decision_note) between 1 and 1000);

create table public.catalog_sources(
 id uuid primary key default gen_random_uuid(),catalog_id uuid not null references public.brand_catalog_releases(id),document_key uuid not null,
 manufacturer text not null check(char_length(manufacturer) between 1 and 160),document_title text not null check(char_length(document_title) between 1 and 200),
 document_version text,document_date date,source_url text not null check(char_length(source_url) between 1 and 1000),
 retrieved_at timestamptz not null,source_type text not null check(source_type='MANUFACTURER_TECHNICAL_DOCUMENT'),
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 review_status text not null default 'PENDING' check(review_status in ('PENDING','APPROVED','REJECTED')),
 verification_status text not null default 'UNVERIFIED' check(verification_status in ('UNVERIFIED','ELIFORA_VERIFIED')),
 created_by uuid not null references public.profiles(user_id),verified_by uuid references public.profiles(user_id),verified_at timestamptz,
 unique(catalog_id,id),unique(catalog_id,document_key),
 check(source_url ~ '^https://dm[.]henkel-dam[.]com/is/content/henkel/[A-Za-z0-9_-]+$'),
 check((verification_status='ELIFORA_VERIFIED')=(review_status='APPROVED')),
 check(verification_status<>'ELIFORA_VERIFIED' or verified_by is not null and verified_at is not null)
);
create index catalog_source_creator_idx on public.catalog_sources(created_by);
create index catalog_source_verifier_idx on public.catalog_sources(verified_by);
create table public.catalog_product_evidence(
 catalog_id uuid not null,product_id uuid primary key,source_id uuid not null,notation_source_id uuid not null,
 page_or_section text not null check(char_length(page_or_section) between 1 and 200),notation_section text not null,
 manufacturer_level integer,manufacturer_tone text,manufacturer_tone_label text,normalized_tone text,
 processing_minutes_min integer check(processing_minutes_min>0),processing_minutes_max integer check(processing_minutes_max>=processing_minutes_min),
 foreign key(catalog_id,product_id) references public.catalog_products(catalog_id,id),
 foreign key(catalog_id,source_id) references public.catalog_sources(catalog_id,id),foreign key(catalog_id,notation_source_id) references public.catalog_sources(catalog_id,id)
);
create index catalog_product_evidence_catalog_idx on public.catalog_product_evidence(catalog_id);
create index catalog_product_evidence_source_idx on public.catalog_product_evidence(catalog_id,source_id);
create index catalog_product_evidence_notation_idx on public.catalog_product_evidence(catalog_id,notation_source_id);
create table public.catalog_fact_sources(
 catalog_id uuid not null,product_id uuid not null,key text not null,source_id uuid not null,page_or_section text not null,
 primary key(product_id,key),foreign key(product_id,key) references public.catalog_technical_facts(product_id,key),
 foreign key(catalog_id,product_id) references public.catalog_products(catalog_id,id),foreign key(catalog_id,source_id) references public.catalog_sources(catalog_id,id)
);
create index catalog_fact_sources_catalog_idx on public.catalog_fact_sources(catalog_id);
create index catalog_fact_sources_source_idx on public.catalog_fact_sources(catalog_id,source_id);
create table public.catalog_rule_sources(
 catalog_id uuid not null,rule_id uuid primary key references public.catalog_compatibility_rules(id),source_id uuid not null,page_or_section text not null,
 white_min_exclusive integer,white_max_inclusive integer,max_lift integer,regrowth_only boolean not null default true,
 foreign key(catalog_id,source_id) references public.catalog_sources(catalog_id,id),
 check(white_min_exclusive is null or white_min_exclusive between 0 and 100),check(white_max_inclusive is null or white_max_inclusive between 0 and 100)
);
create index catalog_rule_sources_catalog_idx on public.catalog_rule_sources(catalog_id);
create index catalog_rule_sources_source_idx on public.catalog_rule_sources(catalog_id,source_id);
create table public.catalog_golden_runs(
 id uuid primary key default gen_random_uuid(),catalog_id uuid not null references public.brand_catalog_releases(id),catalog_fingerprint text not null,
 manifest_sha256 text not null,passed_count integer not null check(passed_count=10),validated_by uuid not null references public.profiles(user_id),validated_at timestamptz not null default statement_timestamp()
);
create index catalog_golden_catalog_idx on public.catalog_golden_runs(catalog_id);
create index catalog_golden_validator_idx on public.catalog_golden_runs(validated_by);

do $$ declare t text;begin
 foreach t in array array['catalog_sources','catalog_product_evidence','catalog_fact_sources','catalog_rule_sources','catalog_golden_runs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy catalog_read on public.%I for select to authenticated using(app_private.can_read_catalog(catalog_id))',t);
 end loop;
end $$;
create function app_private.pilot_content_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare v jsonb; c public.brand_catalog_releases%rowtype;begin
 v:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 select * into c from public.brand_catalog_releases where id=(v->>'catalog_id')::uuid for update;
 if TG_OP='DELETE' or c.state not in ('DRAFT','TECHNICAL_REVIEW') then raise exception using errcode='23514',message='IMMUTABLE_CATALOG_CONTENT';end if;
 if not app_private.is_catalog_operator() or c.scope<>'GLOBAL' then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if TG_OP='UPDATE' and (to_jsonb(old)->>'catalog_id' is distinct from v->>'catalog_id' or TG_TABLE_NAME<>'catalog_sources') then raise exception using errcode='23514',message='IMMUTABLE_SOURCE_EVIDENCE';end if;
 if TG_TABLE_NAME='catalog_sources' and TG_OP='UPDATE' and (to_jsonb(old)-array['review_status','verification_status','verified_by','verified_at']) is distinct from (v-array['review_status','verification_status','verified_by','verified_at']) then raise exception using errcode='23514',message='SOURCE_REPLACEMENT_REQUIRES_NEW_VERSION';end if;
 if TG_TABLE_NAME='catalog_sources' and v->>'verification_status'='ELIFORA_VERIFIED' and ((v->>'verified_by')::uuid is distinct from auth.uid() or (v->>'verified_at')::timestamptz>statement_timestamp()) then raise exception using errcode='23514',message='VERIFICATION_ACTOR_INVALID';end if;
 return new;
end $$;
revoke all on function app_private.pilot_content_guard() from public,anon,authenticated,service_role;
do $$ declare t text;begin
 foreach t in array array['catalog_sources','catalog_product_evidence','catalog_fact_sources','catalog_rule_sources'] loop
  execute format('create trigger pilot_content_guard before insert or update or delete on public.%I for each row execute function app_private.pilot_content_guard()',t);
 end loop;
end $$;
create trigger golden_immutable before update or delete on public.catalog_golden_runs for each row execute function app_private.catalog_audit_immutable();
create function app_private.pilot_source_audit() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.brand_catalog_audit(catalog_id,actor_id,action,entity_id,correlation_id) values(new.catalog_id,auth.uid(),case when TG_OP='INSERT' then 'source.created' else 'source.verification_changed' end,new.id,gen_random_uuid());return new;end $$;
revoke all on function app_private.pilot_source_audit() from public,anon,authenticated,service_role;
create trigger pilot_source_audit after insert or update on public.catalog_sources for each row execute function app_private.pilot_source_audit();

-- Extend legal rejection transitions without changing the existing non-pilot lifecycle.
do $$ declare d text;begin
 d:=pg_get_functiondef('app_private.catalog_release_guard()'::regprocedure);
 d:=replace(d,'elsif new.state is distinct from (case old.state','elsif not (new.state=''REJECTED'' and old.state in (''DRAFT'',''TECHNICAL_REVIEW'',''GOLDEN_TEST'',''APPROVED'')) and new.state is distinct from (case old.state');execute d;
 d:=pg_get_functiondef('app_private.transition_brand_catalog(uuid,text,text,uuid)'::regprocedure);
 d:=replace(d,'if p_state is distinct from expected then','if p_state=''REJECTED'' and c.state in (''DRAFT'',''TECHNICAL_REVIEW'',''GOLDEN_TEST'',''APPROVED'') then expected:=''REJECTED'';end if; if p_state is distinct from expected then');execute d;
end $$;
create function app_private.pilot_release_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if TG_OP='UPDATE' and new.pilot_key is distinct from old.pilot_key then raise exception using errcode='23514',message='IMMUTABLE_CATALOG_IDENTITY';end if;
 if new.pilot_key is null then return new;end if;
 if new.scope<>'GLOBAL' then raise exception using errcode='23514',message='PILOT_SCOPE_INVALID';end if;
 if TG_OP='UPDATE' and new.state is distinct from old.state then
  if new.state='GOLDEN_TEST' and (new.reviewed_by is null or exists(select 1 from public.catalog_sources where catalog_id=new.id and review_status<>'APPROVED')) then raise exception using errcode='23514',message='SOURCE_REVIEW_REQUIRED';end if;
  if new.state='APPROVED' then
   if not exists(select 1 from public.catalog_golden_runs g where g.catalog_id=new.id and g.id::text=new.golden_receipt and g.catalog_fingerprint=public.brand_catalog_packet(new.id)#>>'{release,versionFingerprint}') then raise exception using errcode='23514',message='GOLDEN_VALIDATION_REQUIRED';end if;
   new.approved_by:=auth.uid();new.approved_at:=statement_timestamp();
  end if;
  if new.state='PUBLISHED' then
   if new.approved_by is null or new.reviewed_by is null or (select count(*) from public.catalog_sources where catalog_id=new.id and review_status='APPROVED')<>3 or not exists(select 1 from public.catalog_product_evidence where catalog_id=new.id) then raise exception using errcode='23514',message='OFFICIAL_SOURCE_REQUIRED';end if;
   new.published_by:=auth.uid();new.published_at:=statement_timestamp();
  end if;
 end if;
 return new;
end $$;
revoke all on function app_private.pilot_release_guard() from public,anon,authenticated,service_role;
create trigger pilot_release_guard before insert or update on public.brand_catalog_releases for each row execute function app_private.pilot_release_guard();

create function app_private.pilot_catalog_import(p_previous_id uuid,p_correlation_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare m jsonb;s jsonb;p jsonb;d jsonb;cid uuid:=gen_random_uuid();bid uuid:=gen_random_uuid();lid uuid:=gen_random_uuid();pid uuid;did uuid;sid uuid;nid uuid;rid uuid;v integer:=1;series uuid;prev public.brand_catalog_releases%rowtype;k text;value jsonb;unit text;
begin
 if not app_private.is_catalog_operator() then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select body into m from app_private.brand_pilot_manifests where key='schwarzkopf-igora-royal-absolutes';
 series:='b2000000-0000-4000-8000-000000000001';perform pg_advisory_xact_lock(hashtextextended(series::text,2));
 if p_previous_id is not null then select * into prev from public.brand_catalog_releases where id=p_previous_id; if not found or prev.pilot_key is distinct from 'schwarzkopf-igora-royal-absolutes' or prev.state not in ('PUBLISHED','RETIRED','REJECTED') then raise exception using errcode='23514',message='CATALOG_VERSION_CONFLICT';end if;v:=prev.version+1;end if;
 insert into public.brand_catalog_releases(id,series_id,version,previous_id,scope,created_by,pilot_key) values(cid,series,v,p_previous_id,'GLOBAL',auth.uid(),'schwarzkopf-igora-royal-absolutes');
 for s in select * from jsonb_array_elements(m->'sources') loop
  insert into public.catalog_sources(catalog_id,document_key,manufacturer,document_title,document_version,document_date,source_url,retrieved_at,source_type,content_sha256,created_by) values(cid,(s->>'id')::uuid,s->>'manufacturer',s->>'documentTitle',s->>'documentVersion',(s->>'documentDate')::date,s->>'sourceUrl',(s->>'retrievedAt')::timestamptz,s->>'sourceType',s->>'contentSha256',auth.uid());
 end loop;
 if p_previous_id is not null then insert into public.brand_catalog_audit(catalog_id,actor_id,action,entity_id,correlation_id) values(cid,auth.uid(),'source.replaced',cid,p_correlation_id);end if;
 insert into public.catalog_brands values(bid,cid,m->>'manufacturer');insert into public.catalog_product_lines values(lid,cid,bid,m->>'series');
 select id into nid from public.catalog_sources where catalog_id=cid and document_key=(m#>>'{usage,sourceId}')::uuid;
 for p in select * from jsonb_array_elements((m->'shades')||(m->'developers')) loop
  pid:=gen_random_uuid();select series_id into series from public.catalog_products where catalog_id=p_previous_id and manufacturer_code=p->>'manufacturerCode';
  insert into public.catalog_products(id,series_id,version,catalog_id,brand_id,line_id,manufacturer_code,display_name,product_type,professional_category,country_region,manufacturer_source_reference) values(pid,coalesce(series,gen_random_uuid()),v,cid,bid,lid,p->>'manufacturerCode',p->>'displayName',case when p?'level' then 'SHADE' else 'DEVELOPER' end,'PERMANENT_PROFESSIONAL',m->>'countryRegion',case when p?'level' then m#>>'{sources,0,sourceUrl}' else m#>>'{sources,1,sourceUrl}' end);
  select id into sid from public.catalog_sources where catalog_id=cid and document_key=case when p?'level' then (p->>'sourceId')::uuid else (m#>>'{usage,sourceId}')::uuid end;
  insert into public.catalog_product_evidence values(cid,pid,sid,nid,coalesce(p->>'section',m#>>'{usage,section}'),coalesce(p->>'notationSection',m#>>'{usage,section}'),(p->>'level')::integer,p->>'manufacturerTone',p->>'toneLabel',p->>'normalizedTone',case when p?'level' then 30 end,case when p?'level' then 45 end);
  foreach k in array case when p?'level' then array['shade_level','tone_family','mixing_ratio'] else array['developer_strength'] end loop
   value:=case k when 'shade_level' then p->'level' when 'tone_family' then p->'normalizedTone' when 'mixing_ratio' then '"1:1"'::jsonb else p->'strengthPercent' end;
   if value is null or value='null'::jsonb then continue;end if;
   unit:=case k when 'shade_level' then 'LEVEL' when 'tone_family' then 'CATEGORY' when 'mixing_ratio' then 'RATIO' else 'PERCENT' end;
   insert into public.catalog_technical_facts(catalog_id,product_id,key,value,unit,source,verification_status,source_reference,version) values(cid,pid,k,value,unit,'MANUFACTURER_DOCUMENTATION','UNVERIFIED',m#>>'{sources,1,sourceUrl}',1);
   insert into public.catalog_fact_sources values(cid,pid,k,nid,case when k in ('shade_level','tone_family') then 'page 1, colour numbering system' else 'page 2, developer usage / mixing' end);
  end loop;
  if p?'level' then foreach k in array array['level_effect','neutral','ash','blue','violet','green','red','copper','gold','pearl','beige','natural_base','opacity','coverage_strength','deposit_strength','lift_behavior','processing_minutes'] loop
   insert into public.catalog_technical_facts(catalog_id,product_id,key,source,verification_status,version) values(cid,pid,k,'UNKNOWN','UNVERIFIED',1);
  end loop;end if;
 end loop;
 for p in select to_jsonb(t) from public.catalog_products t where catalog_id=cid and product_type='SHADE' loop
  for d in select to_jsonb(t) from public.catalog_products t where catalog_id=cid and product_type='DEVELOPER' loop
   rid:=gen_random_uuid();
   insert into public.catalog_compatibility_rules(id,catalog_id,version,product_id,developer_id,technique,application_context,mixing_ratio,outcome,reason,source,source_reference,restrictions) values(rid,cid,1,(p->>'id')::uuid,(d->>'id')::uuid,'ROOT_REFRESH','STANDARD','1:1','UNKNOWN','Official regrowth guidance; technical review pending','MANUFACTURER_DOCUMENTATION',m#>>'{sources,1,sourceUrl}',array['REGROWTH_ONLY','PROFESSIONAL_SAFETY_REVIEW_REQUIRED']);
   insert into public.catalog_rule_sources values(cid,rid,nid,'page 2, developer usage / mixing / processing / application',case when d->>'manufacturer_code' like '%6%' then 90 end,case when d->>'manufacturer_code' like '%9%' then 90 end,case when d->>'manufacturer_code' like '%9%' then 3 else 0 end,true);
  end loop;
 end loop;
 return cid;
end $$;
revoke all on function app_private.pilot_catalog_import(uuid,uuid) from public,anon,service_role;
grant execute on function app_private.pilot_catalog_import(uuid,uuid) to authenticated;

create function app_private.pilot_golden_validate(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.brand_catalog_releases%rowtype;m jsonb;gid uuid:=gen_random_uuid();begin
 if not app_private.is_catalog_operator() then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select * into c from public.brand_catalog_releases where id=p_id for update;select body into m from app_private.brand_pilot_manifests where key=c.pilot_key;
 if c.state<>'GOLDEN_TEST' or m is null then raise exception using errcode='23514',message='CATALOG_STATE_CONFLICT';end if;
 -- Ten source-traceable validation groups, executed against actual persisted rows.
 if (select count(*) from public.catalog_products where catalog_id=p_id and product_type='SHADE')<>jsonb_array_length(m->'shades')
 or (select count(*) from public.catalog_products where catalog_id=p_id and product_type='DEVELOPER')<>2
 or (select count(*) from public.catalog_sources where catalog_id=p_id and review_status='APPROVED')<>3
 or exists(select 1 from public.catalog_sources s where s.catalog_id=p_id and not exists(select 1 from jsonb_array_elements(m->'sources') x where x->>'id'=s.document_key::text and x->>'contentSha256'=s.content_sha256 and x->>'sourceUrl'=s.source_url))
 or exists(select 1 from public.catalog_products p where p.catalog_id=p_id and p.verification_status<>'ELIFORA_VERIFIED')
 or (select count(*) from public.catalog_compatibility_rules where catalog_id=p_id and outcome='VERIFIED_RESTRICTED' and mixing_ratio='1:1')<>58
 or exists(select 1 from public.catalog_technical_facts where catalog_id=p_id and key in ('level_effect','neutral','ash','blue','violet','green','red','copper','gold','pearl','beige','natural_base','opacity','coverage_strength','deposit_strength','lift_behavior','processing_minutes') and (value is not null or source<>'UNKNOWN'))
 or exists(select 1 from public.catalog_products p join public.catalog_product_evidence e on e.product_id=p.id where p.catalog_id=p_id and p.product_type='SHADE' and (e.processing_minutes_min<>30 or e.processing_minutes_max<>45 or not exists(select 1 from jsonb_array_elements(m->'shades') s where s->>'manufacturerCode'=p.manufacturer_code and (s->>'level')::integer=e.manufacturer_level and s->>'manufacturerTone'=e.manufacturer_tone and s->>'normalizedTone' is not distinct from e.normalized_tone)))
 or exists(select 1 from public.catalog_technical_facts f join public.catalog_product_evidence e on e.product_id=f.product_id where f.catalog_id=p_id and ((f.key='shade_level' and f.value is distinct from to_jsonb(e.manufacturer_level)) or (f.key='tone_family' and f.value is distinct from to_jsonb(e.normalized_tone)) or (f.key='mixing_ratio' and f.value is distinct from '"1:1"'::jsonb)))
 or exists(select 1 from public.catalog_products p join public.catalog_technical_facts f on f.product_id=p.id where p.catalog_id=p_id and p.product_type='DEVELOPER' and f.key='developer_strength' and not exists(select 1 from jsonb_array_elements(m->'developers') d where d->>'manufacturerCode'=p.manufacturer_code and d->'strengthPercent'=f.value))
 or exists(select 1 from public.catalog_rule_sources r join public.catalog_compatibility_rules x on x.id=r.rule_id join public.catalog_products d on d.id=x.developer_id where r.catalog_id=p_id and (r.regrowth_only is not true or (d.manufacturer_code like '%6%' and (r.white_min_exclusive is distinct from 90 or r.max_lift is distinct from 0)) or (d.manufacturer_code like '%9%' and (r.white_max_inclusive is distinct from 90 or r.max_lift is distinct from 3))))
 then raise exception using errcode='23514',message='PILOT_GOLDEN_FAILED';end if;
 insert into public.catalog_golden_runs(id,catalog_id,catalog_fingerprint,manifest_sha256,passed_count,validated_by) values(gid,p_id,public.brand_catalog_packet(p_id)#>>'{release,versionFingerprint}',encode(extensions.digest(convert_to(m::text,'UTF8'),'sha256'),'hex'),10,auth.uid());return gid;
end $$;
revoke all on function app_private.pilot_golden_validate(uuid) from public,anon,service_role;
grant execute on function app_private.pilot_golden_validate(uuid) to authenticated;

create function public.catalog_governance(p_operation text,p_catalog_id uuid,p_note text,p_correlation_id uuid,p_previous_id uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.brand_catalog_releases%rowtype;gid uuid;begin
 return app_private.catalog_governance_command(p_operation,p_catalog_id,p_note,p_correlation_id,p_previous_id);
end $$;
-- Writes are behind this narrow operator-only boundary, never generic table CRUD.
create function app_private.catalog_governance_command(p_operation text,p_catalog_id uuid,p_note text,p_correlation_id uuid,p_previous_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.brand_catalog_releases%rowtype;gid uuid;begin
 if not app_private.is_catalog_operator() or p_correlation_id is null then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if p_note is null or char_length(p_note) not between 1 and 1000 then raise exception using errcode='23514',message='REVIEW_NOTE_REQUIRED';end if;
 if p_operation='IMPORT' then
  gid:=app_private.pilot_catalog_import(p_previous_id,p_correlation_id);
  insert into public.brand_catalog_audit(catalog_id,actor_id,action,entity_id,correlation_id,decision_note) values(gid,auth.uid(),'governance.import',gid,p_correlation_id,p_note);
  return jsonb_build_object('catalogId',gid);
 end if;
 if p_previous_id is not null then raise exception using errcode='23514',message='VALIDATION_FAILED';end if;
 perform app_private.lock_brand_catalog(p_catalog_id);select * into c from public.brand_catalog_releases where id=p_catalog_id for update;
 if c.pilot_key is distinct from 'schwarzkopf-igora-royal-absolutes' then raise exception using errcode='42501',message='FORBIDDEN';end if;
 case p_operation
 when 'START_REVIEW' then perform app_private.transition_brand_catalog(c.id,'TECHNICAL_REVIEW',null,p_correlation_id);
 when 'COMPLETE_REVIEW' then
  if c.state<>'TECHNICAL_REVIEW' then raise exception using errcode='23514',message='CATALOG_STATE_CONFLICT';end if;
  update public.catalog_sources set review_status='APPROVED',verification_status='ELIFORA_VERIFIED',verified_by=auth.uid(),verified_at=statement_timestamp() where catalog_id=c.id;
  update public.catalog_products set verification_status='ELIFORA_VERIFIED',verified_by=auth.uid(),verified_at=statement_timestamp() where catalog_id=c.id;
  update public.catalog_technical_facts set verification_status='ELIFORA_VERIFIED',verified_by=auth.uid(),verified_at=statement_timestamp(),confidence=1 where catalog_id=c.id and value is not null;
  update public.catalog_compatibility_rules set outcome='VERIFIED_RESTRICTED',verified_by=auth.uid(),verified_at=statement_timestamp() where catalog_id=c.id;
  update public.brand_catalog_releases set reviewed_by=auth.uid(),reviewed_at=statement_timestamp(),state='GOLDEN_TEST' where id=c.id;
 when 'VALIDATE_GOLDEN' then gid:=app_private.pilot_golden_validate(c.id);
 when 'APPROVE' then select id into gid from public.catalog_golden_runs where catalog_id=c.id order by validated_at desc,id desc limit 1;perform app_private.transition_brand_catalog(c.id,'APPROVED',gid::text,p_correlation_id);
 when 'PUBLISH' then perform app_private.transition_brand_catalog(c.id,'PUBLISHED',null,p_correlation_id);
 when 'RETIRE' then perform app_private.transition_brand_catalog(c.id,'RETIRED',null,p_correlation_id);
 when 'REJECT' then
  if c.state in ('DRAFT','TECHNICAL_REVIEW') then update public.catalog_sources set review_status='REJECTED',verification_status='UNVERIFIED',verified_by=null,verified_at=null where catalog_id=c.id;end if;
  perform app_private.transition_brand_catalog(c.id,'REJECTED',null,p_correlation_id);
 else raise exception using errcode='23514',message='VALIDATION_FAILED';end case;
 insert into public.brand_catalog_audit(catalog_id,actor_id,action,entity_id,correlation_id,decision_note) values(c.id,auth.uid(),'governance.'||lower(p_operation),coalesce(gid,c.id),p_correlation_id,p_note);
 return jsonb_build_object('catalogId',c.id,'goldenRunId',gid);
end $$;
revoke all on function app_private.catalog_governance_command(text,uuid,text,uuid,uuid) from public,anon,service_role;
grant execute on function app_private.catalog_governance_command(text,uuid,text,uuid,uuid) to authenticated;
revoke all on function public.catalog_governance(text,uuid,text,uuid,uuid) from public,anon,service_role;
grant execute on function public.catalog_governance(text,uuid,text,uuid,uuid) to authenticated;

-- The packet used by immutable Phase 2A recipes stays unchanged. Pilot evidence
-- has its own read boundary and includes the complete legacy packet fingerprint.
create function public.catalog_pilot_packet(p_catalog_id uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare c public.brand_catalog_releases%rowtype;begin
 select * into c from public.brand_catalog_releases where id=p_catalog_id;if not found or c.pilot_key is null then return null;end if;
 return jsonb_build_object('catalog',public.brand_catalog_packet(c.id),'pilotKey',c.pilot_key,
 'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.catalog_sources s where s.catalog_id=c.id),'[]'::jsonb),
 'evidence',coalesce((select jsonb_agg(to_jsonb(e) order by e.product_id) from public.catalog_product_evidence e where e.catalog_id=c.id),'[]'::jsonb),
 'ruleSources',coalesce((select jsonb_agg(to_jsonb(r) order by r.rule_id) from public.catalog_rule_sources r where r.catalog_id=c.id),'[]'::jsonb),
 'factSources',coalesce((select jsonb_agg(to_jsonb(f) order by f.product_id,f.key) from public.catalog_fact_sources f where f.catalog_id=c.id),'[]'::jsonb),
 'governance',jsonb_build_object('createdBy',c.created_by,'reviewedBy',c.reviewed_by,'approvedBy',c.approved_by,'publishedBy',c.published_by));
end $$;
revoke all on function public.catalog_pilot_packet(uuid) from public,anon,service_role;
grant execute on function public.catalog_pilot_packet(uuid) to authenticated;
create function public.catalog_operator_access() returns boolean language sql stable security invoker set search_path='' as $$select app_private.is_catalog_operator();$$;
revoke all on function public.catalog_operator_access() from public,anon,service_role;
grant execute on function public.catalog_operator_access() to authenticated;
