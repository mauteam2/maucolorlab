begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(39);

insert into auth.users(id,email,raw_user_meta_data) values
 ('c8000000-0000-4000-8000-000000000021','hair-history-owner-a@elifora.test','{}'),
 ('c8000000-0000-4000-8000-000000000022','hair-history-owner-b@elifora.test','{}'),
 ('c8000000-0000-4000-8000-000000000023','hair-history-assistant@elifora.test','{}'),
 ('c8000000-0000-4000-8000-000000000024','hair-history-reception@elifora.test','{}');
insert into public.organizations(id,name,slug,base_currency) values
 ('c8000000-0000-4000-8000-000000000001','History A','hair-history-a','TRY'),
 ('c8000000-0000-4000-8000-000000000002','History B','hair-history-b','TRY');
insert into public.locations(id,organization_id,name,timezone) values
 ('c8000000-0000-4000-8000-000000000011','c8000000-0000-4000-8000-000000000001','A One','Europe/Istanbul'),
 ('c8000000-0000-4000-8000-000000000013','c8000000-0000-4000-8000-000000000001','A Two','Europe/Istanbul'),
 ('c8000000-0000-4000-8000-000000000012','c8000000-0000-4000-8000-000000000002','B One','Europe/Istanbul');
insert into public.salon_memberships(id,organization_id,location_id,user_id,role_code,status,joined_at) values
 ('c8000000-0000-4000-8000-000000000111','c8000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000011','c8000000-0000-4000-8000-000000000021','owner','active',now()),
 ('c8000000-0000-4000-8000-000000000112','c8000000-0000-4000-8000-000000000002',null,'c8000000-0000-4000-8000-000000000022','owner','active',now()),
 ('c8000000-0000-4000-8000-000000000113','c8000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000013','c8000000-0000-4000-8000-000000000023','assistant','active',now()),
 ('c8000000-0000-4000-8000-000000000114','c8000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000011','c8000000-0000-4000-8000-000000000024','reception','active',now());
insert into public.clients(id,organization_id,full_name,phone,phone_normalized,created_by,updated_by,creation_location_id) values
 ('c8000000-0000-4000-8000-000000000031','c8000000-0000-4000-8000-000000000001','History Client A','+905321234567','+905321234567','c8000000-0000-4000-8000-000000000021','c8000000-0000-4000-8000-000000000021','c8000000-0000-4000-8000-000000000011'),
 ('c8000000-0000-4000-8000-000000000032','c8000000-0000-4000-8000-000000000002','History Client B','+905321234567','+905321234567','c8000000-0000-4000-8000-000000000022','c8000000-0000-4000-8000-000000000022','c8000000-0000-4000-8000-000000000012'),
 ('c8000000-0000-4000-8000-000000000033','c8000000-0000-4000-8000-000000000001','History Client A Two','+905329999999','+905329999999','c8000000-0000-4000-8000-000000000021','c8000000-0000-4000-8000-000000000021','c8000000-0000-4000-8000-000000000011');

create temporary table results(name text primary key,value jsonb);
grant all on results to authenticated;
create function pg_temp.record_history(payload jsonb,client uuid default 'c8000000-0000-4000-8000-000000000031',membership uuid default 'c8000000-0000-4000-8000-000000000111',location uuid default 'c8000000-0000-4000-8000-000000000011')
returns jsonb language sql volatile security invoker as $$
 select public.hair_history_operation(membership,location,client,jsonb_build_object('request_id',gen_random_uuid())||payload,'c8000000-0000-4000-8000-000000000900');
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c8000000-0000-4000-8000-000000000021',true);
select public.hair_core_operation('c8000000-0000-4000-8000-000000000111','c8000000-0000-4000-8000-000000000011','c8000000-0000-4000-8000-000000000031','create_passport',jsonb_build_object('request_id',gen_random_uuid()));
select public.hair_core_operation('c8000000-0000-4000-8000-000000000111','c8000000-0000-4000-8000-000000000011','c8000000-0000-4000-8000-000000000033','create_passport',jsonb_build_object('request_id',gen_random_uuid()));
select set_config('request.jwt.claim.sub','c8000000-0000-4000-8000-000000000022',true);
select public.hair_core_operation('c8000000-0000-4000-8000-000000000112','c8000000-0000-4000-8000-000000000012','c8000000-0000-4000-8000-000000000032','create_passport',jsonb_build_object('request_id',gen_random_uuid()));
insert into results select 'foreign_region',jsonb_build_object('id',id) from public.hair_regions
 where client_id='c8000000-0000-4000-8000-000000000032' and region_type='ROOT';
select set_config('request.jwt.claim.sub','c8000000-0000-4000-8000-000000000021',true);

insert into results values('color',pg_temp.record_history('{"request_id":"c8000000-0000-4000-8000-000000000901","category":"COLOR","performed_on":{"state":"EXACT","value":"2025-06-15"},"product":{"state":"KNOWN","value":"Synthetic permanent color"},"description":"Synthetic prior color service","evidence":{"source":"HISTORICAL","confidence":{"state":"KNOWN","value":0.8}}}'));
select is((select value#>>'{data,history,category}' from results where name='color'),'COLOR','authorized user records COLOR history');
select ok((select value#>>'{data,history,recorded_by}'=auth.uid()::text and value#>>'{data,history,evidence,recorded_by}'=auth.uid()::text and value#>>'{data,history,evidence,source}'='HISTORICAL' and value#>>'{data,history,evidence,verified_by}' is null from results where name='color'),'actor and historical provenance are server controlled');
select ok((select value#>>'{data,history,performed_on,state}'='EXACT' and value#>>'{data,history,performed_on,value}'='2025-06-15' and value#>>'{data,history,product,state}'='KNOWN' from results where name='color'),'exact date and known product remain structured');
reset role; create temporary table retry_counts as select (select count(*) from public.hair_history_events) h,(select count(*) from public.hair_history_regions) r,(select count(*) from public.hair_evidence) e,(select count(*) from public.audit_events) a; set local role authenticated;
select is(pg_temp.record_history('{"request_id":"c8000000-0000-4000-8000-000000000901","category":"COLOR","performed_on":{"state":"EXACT","value":"2025-06-15"},"product":{"state":"KNOWN","value":"Synthetic permanent color"},"description":"Synthetic prior color service","evidence":{"source":"HISTORICAL","confidence":{"state":"KNOWN","value":0.8}}}'),(select value from results where name='color'),'identical retry replays original history');
reset role;
select ok((select h=(select count(*) from public.hair_history_events) and r=(select count(*) from public.hair_history_regions) and e=(select count(*) from public.hair_evidence) and a=(select count(*) from public.audit_events) from retry_counts),'retry adds no event region evidence or audit');
set local role authenticated;
select is(public.hair_passport_snapshot('c8000000-0000-4000-8000-000000000111','c8000000-0000-4000-8000-000000000011','c8000000-0000-4000-8000-000000000031')#>'{data,history,items,0}',(select value#>'{data,history}' from results where name='color'),'existing paginated snapshot exposes new history DTO');
select is((select value#>'{data,history,region_ids}' from results where name='color'),'[]'::jsonb,'empty region list represents whole-hair history');

insert into results values('multi',pg_temp.record_history('{"category":"BLEACH_LIGHTENING","performed_on":{"state":"APPROXIMATE","value":"2024-09-01"},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic approximate bleach" ,"location_id":"c8000000-0000-4000-8000-000000000011","evidence":{"source":"IMPORTED_UNVERIFIED","context":"Synthetic recollection"}}'::jsonb||jsonb_build_object('region_ids',jsonb_build_array(
 (select id from public.hair_regions where client_id='c8000000-0000-4000-8000-000000000031' and region_type='ROOT'),
 (select id from public.hair_regions where client_id='c8000000-0000-4000-8000-000000000031' and region_type='ENDS'),
 (select id from public.hair_regions where client_id='c8000000-0000-4000-8000-000000000031' and region_type='ROOT')))));
select ok((select jsonb_array_length(value#>'{data,history,region_ids}')=2 from results where name='multi'),'multiple valid regions accepted and duplicate input deduplicated');
select is((select count(*) from public.hair_history_regions where history_event_id=(select (value#>>'{data,history,id}')::uuid from results where name='multi')),2::bigint,'exactly one relation per affected region');
select is((select value#>>'{data,history,category}' from results where name='multi'),'BLEACH_LIGHTENING','BLEACH_LIGHTENING accepted');
select is((select value#>>'{data,history,performed_on,state}' from results where name='multi'),'APPROXIMATE','approximate date precision retained');
select is((select value#>>'{data,history,product,state}' from results where name='multi'),'UNKNOWN','unknown product retained without invented details');
select is((select value#>>'{data,history,evidence,source}' from results where name='multi'),'IMPORTED_UNVERIFIED','imported unverified provenance retained');

select is(pg_temp.record_history('{"category":"TONER_GLOSS","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"NOT_APPLICABLE","value":null},"description":"Synthetic toner history","evidence":{"source":"HISTORICAL"}}')#>>'{data,history,category}','TONER_GLOSS','TONER_GLOSS accepted');
select is(pg_temp.record_history('{"category":"PERM","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic perm history","evidence":{"source":"HISTORICAL"}}')#>>'{data,history,category}','PERM','PERM accepted');
select is(pg_temp.record_history('{"category":"RELAXER_STRAIGHTENING","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic relaxer history","evidence":{"source":"HISTORICAL"}}')#>>'{data,history,category}','RELAXER_STRAIGHTENING','RELAXER_STRAIGHTENING accepted');
select is(pg_temp.record_history('{"category":"KERATIN_SMOOTHING","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic keratin history","evidence":{"source":"HISTORICAL"}}')#>>'{data,history,category}','KERATIN_SMOOTHING','KERATIN_SMOOTHING accepted');
select is(pg_temp.record_history('{"category":"OTHER_CHEMICAL","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic chemical history","evidence":{"source":"HISTORICAL"}}')#>>'{data,history,category}','OTHER_CHEMICAL','OTHER_CHEMICAL accepted');
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic unknown date","evidence":{"source":"HISTORICAL"}}')#>>'{data,history,performed_on,state}','UNKNOWN','unknown date retained without fabricated precision');

select is(pg_temp.record_history('{"category":"HAIRCUT","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic invalid","evidence":{"source":"HISTORICAL"}}')->>'code','INVALID_HISTORY_CATEGORY','invalid category rejected');
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"EXACT","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic invalid","evidence":{"source":"HISTORICAL"}}')->>'code','INVALID_HISTORY_DATE','exact date requires value');
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"UNKNOWN","value":"2020-01-01"},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic invalid","evidence":{"source":"HISTORICAL"}}')->>'code','INVALID_HISTORY_DATE','unknown date forbids value');
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"EXACT","value":"2999-01-01"},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic invalid","evidence":{"source":"HISTORICAL"}}')->>'code','INVALID_HISTORY_DATE','future date rejected');
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic invalid","organization_id":"c8000000-0000-4000-8000-000000000002","evidence":{"source":"HISTORICAL"}}')->>'code','INVALID_HISTORY_EVENT','forged organization rejected');
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic invalid","created_by":"c8000000-0000-4000-8000-000000000022","evidence":{"source":"HISTORICAL"}}')->>'code','INVALID_HISTORY_EVENT','forged actor rejected');
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic invalid","evidence":{"source":"PROFESSIONAL_VERIFIED"}}')->>'code','INVALID_EVIDENCE','professional evidence cannot be forged');
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic foreign client","evidence":{"source":"HISTORICAL"}}','c8000000-0000-4000-8000-000000000032')->>'code','CLIENT_NOT_FOUND','foreign passport denied without disclosure');
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic foreign region","evidence":{"source":"HISTORICAL"}}'::jsonb||jsonb_build_object('region_ids',jsonb_build_array((select value->>'id' from results where name='foreign_region'))))->>'code','HAIR_REGION_NOT_FOUND','foreign region denied');
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic other passport","evidence":{"source":"HISTORICAL"}}'::jsonb||jsonb_build_object('region_ids',jsonb_build_array((select id from public.hair_regions where client_id='c8000000-0000-4000-8000-000000000033' and region_type='ROOT'))))->>'code','HAIR_REGION_NOT_FOUND','same-tenant other-passport region denied');
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic foreign location","location_id":"c8000000-0000-4000-8000-000000000012","evidence":{"source":"HISTORICAL"}}')->>'code','LOCATION_NOT_FOUND','foreign location denied');
select is(pg_temp.record_history('{"request_id":"c8000000-0000-4000-8000-000000000901","category":"COLOR","performed_on":{"state":"EXACT","value":"2025-06-15"},"product":{"state":"KNOWN","value":"Changed"},"description":"Synthetic prior color service","evidence":{"source":"HISTORICAL","confidence":{"state":"KNOWN","value":0.8}}}')->>'code','CONFLICT','changed retry payload conflicts');

reset role; create temporary table counts_before as select (select count(*) from public.hair_history_events) h,(select count(*) from public.hair_history_regions) r,(select count(*) from public.hair_evidence) e,(select count(*) from public.audit_events) a,(select count(*) from app_private.hair_core_mutation_receipts) q;
create function pg_temp.reject_history_region() returns trigger language plpgsql as $$begin raise exception using errcode='23514',message='Synthetic rollback';end$$;
create trigger zz_history_region_reject before insert on public.hair_history_regions for each row execute function pg_temp.reject_history_region();
set local role authenticated;
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic rollback","evidence":{"source":"HISTORICAL"}}'::jsonb||jsonb_build_object('region_ids',jsonb_build_array((select id from public.hair_regions where client_id='c8000000-0000-4000-8000-000000000031' and region_type='ROOT'))))->>'code','INVALID_HISTORY_EVENT','region failure returns stable error');
reset role; drop trigger zz_history_region_reject on public.hair_history_regions;
select ok((select h=(select count(*) from public.hair_history_events) and r=(select count(*) from public.hair_history_regions) and e=(select count(*) from public.hair_evidence) and a=(select count(*) from public.audit_events) and q=(select count(*) from app_private.hair_core_mutation_receipts) from counts_before),'failure rolls back event regions evidence audit and receipt');
select ok(exists(select 1 from public.audit_events where action='hair_history_event.created' and entity_id=(select (value#>>'{data,history,id}')::uuid from results where name='color') and actor_user_id='c8000000-0000-4000-8000-000000000021' and metadata->>'category'='COLOR') and not exists(select 1 from public.audit_events where metadata ? 'description' or metadata ? 'product'),'audit records identity and category without free text');

delete from public.role_permissions where role_code='owner' and permission_code in ('hair_passport.add_observation','hair_passport.add_test','hair_passport.update');
set local role authenticated;
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"History permission only","evidence":{"source":"HISTORICAL"}}')#>>'{data,history,category}','COLOR','add_history alone can append its evidence');
set local role elifora_hair_writer;
select throws_ok($$insert into public.hair_evidence(organization_id,client_id,passport_id,source_type) select organization_id,client_id,id,'AI_ESTIMATE' from public.hair_passports where client_id='c8000000-0000-4000-8000-000000000031'$$,'42501','technical write unavailable','add_history cannot create unrelated evidence');
set local role authenticated; select set_config('request.jwt.claim.sub','c8000000-0000-4000-8000-000000000023',true);
select is(pg_temp.record_history('{"category":"COLOR","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Assistant denied","evidence":{"source":"HISTORICAL"}}','c8000000-0000-4000-8000-000000000031','c8000000-0000-4000-8000-000000000113','c8000000-0000-4000-8000-000000000013')->>'code','FORBIDDEN','assistant without add_history denied');
reset role; set local role anon;
select throws_ok($$select public.hair_history_operation('c8000000-0000-4000-8000-000000000111','c8000000-0000-4000-8000-000000000011','c8000000-0000-4000-8000-000000000031','{}')$$,'42501','permission denied for function hair_history_operation','anonymous cannot invoke history RPC');
reset role; update public.salon_memberships set status='revoked',revoked_at=now() where id='c8000000-0000-4000-8000-000000000111';
set local role authenticated; select set_config('request.jwt.claim.sub','c8000000-0000-4000-8000-000000000021',true);
select is(pg_temp.record_history('{"request_id":"c8000000-0000-4000-8000-000000000901","category":"COLOR","performed_on":{"state":"EXACT","value":"2025-06-15"},"product":{"state":"KNOWN","value":"Synthetic permanent color"},"description":"Synthetic prior color service","evidence":{"source":"HISTORICAL","confidence":{"state":"KNOWN","value":0.8}}}')->>'code','MEMBERSHIP_REVOKED','revoked membership cannot replay success');

reset role;
select * from finish();
rollback;
