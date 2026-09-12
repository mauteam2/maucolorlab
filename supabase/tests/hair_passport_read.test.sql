begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(77);
-- Synthetic identities share a phone across tenants intentionally.
insert into auth.users(id,email,raw_user_meta_data) values
 ('b3000000-0000-4000-8000-000000000021','hair-read-owner-a@elifora.test','{}'),('b3000000-0000-4000-8000-000000000022','hair-read-owner-b@elifora.test','{}'),
 ('b3000000-0000-4000-8000-000000000023','hair-read-assistant@elifora.test','{}'),('b3000000-0000-4000-8000-000000000024','hair-read-reception@elifora.test','{}');
insert into public.organizations(id,name,slug,base_currency) values
 ('b3000000-0000-4000-8000-000000000001','Hair A','hair-read-a','TRY'),('b3000000-0000-4000-8000-000000000002','Hair B','hair-read-b','TRY');
insert into public.locations(id,organization_id,name,timezone) values
 ('b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000001','A One','Europe/Istanbul'),('b3000000-0000-4000-8000-000000000013','b3000000-0000-4000-8000-000000000001','A Two','Europe/Istanbul'),
 ('b3000000-0000-4000-8000-000000000012','b3000000-0000-4000-8000-000000000002','B One','Europe/Istanbul');
insert into public.salon_memberships(id,organization_id,location_id,user_id,role_code,status,joined_at) values
 ('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000021','owner','active',now()),
 ('b3000000-0000-4000-8000-000000000112','b3000000-0000-4000-8000-000000000002',null,'b3000000-0000-4000-8000-000000000022','owner','active',now()),
 ('b3000000-0000-4000-8000-000000000113','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000013','b3000000-0000-4000-8000-000000000023','assistant','active',now()),
 ('b3000000-0000-4000-8000-000000000114','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000024','reception','active',now());
insert into public.clients(id,organization_id,full_name,phone,phone_normalized,created_by,updated_by,creation_location_id) values
 ('b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000001','Hair Client A','+905321234567','+905321234567','b3000000-0000-4000-8000-000000000021','b3000000-0000-4000-8000-000000000021','b3000000-0000-4000-8000-000000000011'),
 ('b3000000-0000-4000-8000-000000000032','b3000000-0000-4000-8000-000000000002','Hair Client B','+905321234567','+905321234567','b3000000-0000-4000-8000-000000000022','b3000000-0000-4000-8000-000000000022','b3000000-0000-4000-8000-000000000012'),
 ('b3000000-0000-4000-8000-000000000033','b3000000-0000-4000-8000-000000000001','Hair Client A Two','+905329999999','+905329999999','b3000000-0000-4000-8000-000000000021','b3000000-0000-4000-8000-000000000021','b3000000-0000-4000-8000-000000000011');


create temporary table read_results(name text primary key,value jsonb);
grant all on read_results to authenticated;
create temporary table audit_before as select count(*) as n from public.audit_events;
grant select on audit_before to authenticated;
insert into public.clients(id,organization_id,full_name,phone,phone_normalized,created_by,updated_by,creation_location_id)
 values('b3000000-0000-4000-8000-000000000034','b3000000-0000-4000-8000-000000000001','No Passport','+905321111111','+905321111111','b3000000-0000-4000-8000-000000000021','b3000000-0000-4000-8000-000000000021','b3000000-0000-4000-8000-000000000011');
insert into public.salon_memberships(id,organization_id,location_id,user_id,role_code,status,joined_at)
 values('b3000000-0000-4000-8000-000000000115','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000013','b3000000-0000-4000-8000-000000000021','reception','active',now());

reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role elifora_hair_writer;
insert into public.hair_passports(id,organization_id,client_id) values('b3000000-0000-4000-8000-000000000041','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031');
insert into public.hair_regions(id,organization_id,client_id,passport_id,region_type) values('b3000000-0000-4000-8000-000000000051','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','ROOT');
insert into public.hair_evidence(id,organization_id,client_id,passport_id,source_type,confidence_state,confidence,context)
 values('b3000000-0000-4000-8000-000000000061','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','AI_ESTIMATE','KNOWN',0.75,'Synthetic AI evidence');
insert into public.hair_evidence(id,organization_id,client_id,passport_id,source_type,observed_at_state,observed_at,verified_by)
 values('b3000000-0000-4000-8000-000000000071','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','PROFESSIONAL_VERIFIED','KNOWN',now(),'b3000000-0000-4000-8000-000000000021');
insert into public.hair_evidence(id,organization_id,client_id,passport_id,source_type)
 values('b3000000-0000-4000-8000-000000000161','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','PHYSICAL_TEST');
insert into public.hair_observations(id,organization_id,client_id,passport_id,evidence_id,natural_level_state,natural_level,porosity_state,tone_state)
 values('b3000000-0000-4000-8000-000000000171','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','b3000000-0000-4000-8000-000000000061','KNOWN',5,'UNKNOWN','NOT_APPLICABLE');
insert into public.hair_observations(id,organization_id,client_id,passport_id,region_id,evidence_id,perceived_level_state,perceived_level)
 values('b3000000-0000-4000-8000-000000000271','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','b3000000-0000-4000-8000-000000000051','b3000000-0000-4000-8000-000000000071','KNOWN',8);
update public.hair_passports set current_observation_id='b3000000-0000-4000-8000-000000000171' where id='b3000000-0000-4000-8000-000000000041';
update public.hair_regions set current_observation_id='b3000000-0000-4000-8000-000000000271' where id='b3000000-0000-4000-8000-000000000051';
insert into public.hair_physical_tests(id,organization_id,client_id,passport_id,region_id,evidence_id,test_type,result_state,result,performed_by,performed_at,notes)
 values('b3000000-0000-4000-8000-000000000081','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','b3000000-0000-4000-8000-000000000051','b3000000-0000-4000-8000-000000000161','STRAND','KNOWN','Synthetic test','b3000000-0000-4000-8000-000000000021',now(),'Synthetic test note');
insert into public.hair_history_events(id,organization_id,client_id,passport_id,evidence_id,category,description,date_precision,performed_on)
 values('b3000000-0000-4000-8000-000000000091','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','b3000000-0000-4000-8000-000000000061','COLOR','Synthetic color history','APPROXIMATE','2025-01-01');
insert into public.hair_history_regions(organization_id,client_id,passport_id,history_event_id,region_id)
 values('b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','b3000000-0000-4000-8000-000000000091','b3000000-0000-4000-8000-000000000051');

reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000022',true);
set local role elifora_hair_writer;
insert into public.hair_passports(id,organization_id,client_id) values('b3000000-0000-4000-8000-000000000042','b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000032');
insert into public.hair_regions(id,organization_id,client_id,passport_id,region_type) values('b3000000-0000-4000-8000-000000000052','b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000032','b3000000-0000-4000-8000-000000000042','ROOT');
insert into public.hair_evidence(id,organization_id,client_id,passport_id,source_type,confidence_state,confidence,context)
 values('b3000000-0000-4000-8000-000000000062','b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000032','b3000000-0000-4000-8000-000000000042','AI_ESTIMATE','KNOWN',0.75,'FOREIGN_EVIDENCE');
insert into public.hair_evidence(id,organization_id,client_id,passport_id,source_type,observed_at_state,observed_at,verified_by)
 values('b3000000-0000-4000-8000-000000000072','b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000032','b3000000-0000-4000-8000-000000000042','PROFESSIONAL_VERIFIED','KNOWN',now(),'b3000000-0000-4000-8000-000000000022');
insert into public.hair_evidence(id,organization_id,client_id,passport_id,source_type)
 values('b3000000-0000-4000-8000-000000000162','b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000032','b3000000-0000-4000-8000-000000000042','PHYSICAL_TEST');
insert into public.hair_observations(id,organization_id,client_id,passport_id,evidence_id,natural_level_state,natural_level,porosity_state,tone_state)
 values('b3000000-0000-4000-8000-000000000172','b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000032','b3000000-0000-4000-8000-000000000042','b3000000-0000-4000-8000-000000000062','KNOWN',5,'UNKNOWN','NOT_APPLICABLE');
insert into public.hair_observations(id,organization_id,client_id,passport_id,region_id,evidence_id,perceived_level_state,perceived_level)
 values('b3000000-0000-4000-8000-000000000272','b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000032','b3000000-0000-4000-8000-000000000042','b3000000-0000-4000-8000-000000000052','b3000000-0000-4000-8000-000000000072','KNOWN',8);
update public.hair_passports set current_observation_id='b3000000-0000-4000-8000-000000000172' where id='b3000000-0000-4000-8000-000000000042';
update public.hair_regions set current_observation_id='b3000000-0000-4000-8000-000000000272' where id='b3000000-0000-4000-8000-000000000052';
insert into public.hair_physical_tests(id,organization_id,client_id,passport_id,region_id,evidence_id,test_type,result_state,result,performed_by,performed_at,notes)
 values('b3000000-0000-4000-8000-000000000082','b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000032','b3000000-0000-4000-8000-000000000042','b3000000-0000-4000-8000-000000000052','b3000000-0000-4000-8000-000000000162','STRAND','KNOWN','Synthetic test','b3000000-0000-4000-8000-000000000022',now(),'FOREIGN_TEST');
insert into public.hair_history_events(id,organization_id,client_id,passport_id,evidence_id,category,description,date_precision,performed_on)
 values('b3000000-0000-4000-8000-000000000092','b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000032','b3000000-0000-4000-8000-000000000042','b3000000-0000-4000-8000-000000000062','COLOR','FOREIGN_HISTORY','APPROXIMATE','2025-01-01');
insert into public.hair_history_regions(organization_id,client_id,passport_id,history_event_id,region_id)
 values('b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000032','b3000000-0000-4000-8000-000000000042','b3000000-0000-4000-8000-000000000092','b3000000-0000-4000-8000-000000000052');

reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role elifora_hair_writer;
insert into public.hair_passports(id,organization_id,client_id) values('b3000000-0000-4000-8000-000000000043','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000033');
insert into public.hair_regions(id,organization_id,client_id,passport_id,region_type,label)
 values('b3000000-0000-4000-8000-000000000053','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','CUSTOM','Old band');
update public.hair_regions set status='ARCHIVED' where id='b3000000-0000-4000-8000-000000000053';
insert into public.hair_history_regions(organization_id,client_id,passport_id,history_event_id,region_id)
 values('b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','b3000000-0000-4000-8000-000000000091','b3000000-0000-4000-8000-000000000053');
insert into public.hair_physical_tests(id,organization_id,client_id,passport_id,evidence_id,test_type,result_state,performed_by,performed_at)
 values('b3000000-0000-4000-8000-000000000083','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','b3000000-0000-4000-8000-000000000161','POROSITY','UNKNOWN','b3000000-0000-4000-8000-000000000021',now()-interval '1 day');
insert into public.hair_history_events(id,organization_id,client_id,passport_id,evidence_id,category,description,date_precision,performed_on)
 values('b3000000-0000-4000-8000-000000000093','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','b3000000-0000-4000-8000-000000000061','BLEACH_LIGHTENING','Older bleach history','EXACT','2024-01-01');
reset role;
truncate audit_before;
insert into audit_before select count(*) from public.audit_events;

select ok((select not prosecdef and provolatile='s' from pg_proc where oid='public.hair_passport_snapshot(uuid,uuid,uuid,jsonb,uuid)'::regprocedure),'read RPC is stable SECURITY INVOKER');
select ok(not has_function_privilege('anon','public.hair_passport_snapshot(uuid,uuid,uuid,jsonb,uuid)','EXECUTE'),'anonymous has no RPC grant');
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role authenticated;
insert into read_results values('own',public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201')),('empty',public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000033','{}','b3000000-0000-4000-8000-000000000201')),('first',public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"page_size":1}','b3000000-0000-4000-8000-000000000201')),('second',public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"page_size":1,"tests_offset":1,"history_offset":1}','b3000000-0000-4000-8000-000000000201'));
select is((select value#>>'{data,passport,client_id}' from read_results where name='own'),'b3000000-0000-4000-8000-000000000031'::text,'own client passport returned');
select is((select value#>>'{data,passport,id}' from read_results where name='own'),'b3000000-0000-4000-8000-000000000041'::text,'passport belongs to selected client');
select is((select value#>>'{correlationId}' from read_results where name='own'),'b3000000-0000-4000-8000-000000000201'::text,'correlation preserved');
select is((select value#>>'{data,core,state}' from read_results where name='own'),'ASSESSED','current core observation returned');
select is((select value#>'{data,core,observation,natural_level}' from read_results where name='own'),'{"state":"KNOWN","value":5}'::jsonb,'known technical value survives JSON');
select is((select value#>'{data,core,observation,porosity}' from read_results where name='own'),'{"state":"UNKNOWN","value":null}'::jsonb,'explicit unknown survives JSON');
select is((select value#>'{data,core,observation,density}' from read_results where name='own'),'{"state":"NOT_ASSESSED","value":null}'::jsonb,'not assessed survives JSON');
select is((select value#>'{data,core,observation,tone}' from read_results where name='own'),'{"state":"NOT_APPLICABLE","value":null}'::jsonb,'not applicable survives JSON');
select is((select value#>'{data,core,observation,evidence,confidence}' from read_results where name='own'),'{"state":"KNOWN","value":0.75}'::jsonb,'canonical numeric confidence survives');
select is((select value#>>'{data,core,observation,evidence,source}' from read_results where name='own'),'AI_ESTIMATE','AI evidence stays identifiable');
select is((select value#>>'{data,regions,0,assessment,observation,evidence,source}' from read_results where name='own'),'PROFESSIONAL_VERIFIED','professional evidence remains distinct');
select is((select value#>>'{data,regions,0,assessment,observation,evidence,verified_by}' from read_results where name='own'),'b3000000-0000-4000-8000-000000000021'::text,'professional verifier preserved');
select is((select jsonb_array_length(value#>'{data,regions}') from read_results where name='own'),2,'active and archived technical regions returned');
select is((select value#>>'{data,regions,1,status}' from read_results where name='own'),'ARCHIVED','archived region stays labelled historical');
select is((select value#>>'{data,regions,1,assessment,state}' from read_results where name='own'),'NOT_ASSESSED','empty region assessment remains explicit');
select is((select value#>>'{data,physical_tests,items,0,evidence,source}' from read_results where name='own'),'PHYSICAL_TEST','test evidence returned');
select is((select value#>>'{data,physical_tests,items,0,region_id}' from read_results where name='own'),'b3000000-0000-4000-8000-000000000051'::text,'physical test region belongs to passport');
select is((select value#>'{data,history,items,0,region_ids}' from read_results where name='own'),jsonb_build_array('b3000000-0000-4000-8000-000000000051'::text,'b3000000-0000-4000-8000-000000000053'::text),'history includes all affected region links');
select is((select value#>'{data,history,items,0,performed_on}' from read_results where name='own'),'{"state":"APPROXIMATE","value":"2025-01-01"}'::jsonb,'approximate history date preserved');
select is((select value#>'{data,history,items,0,product}' from read_results where name='own'),'{"state":"UNKNOWN","value":null}'::jsonb,'unknown product preserved');
select ok(not ((select value from read_results where name='own')::text like '%FOREIGN_%'),'foreign evidence tests and history are never returned');
select ok(not ((select value#>'{data,passport}' from read_results where name='own') ? 'organization_id') and not ((select value#>'{data,core,observation}' from read_results where name='own') ? 'correlation_id'),'internal tenant and audit fields are omitted');
select is((select value#>'{data,regions}' from read_results where name='empty'),'[]'::jsonb,'empty regions is an array');
select is((select value#>'{data,physical_tests,items}' from read_results where name='empty'),'[]'::jsonb,'empty physical_tests,items is an array');
select is((select value#>'{data,history,items}' from read_results where name='empty'),'[]'::jsonb,'empty history,items is an array');
select is((select value#>'{data,core}' from read_results where name='empty'),'{"state":"NOT_ASSESSED","observation":null}'::jsonb,'empty passport current state explicit');
select is((select value#>>'{data,physical_tests,has_more}' from read_results where name='first'),'true','physical_tests detects lookahead');
select is((select value#>>'{data,physical_tests,next_offset}' from read_results where name='first'),'1','physical_tests next offset explicit');
select is((select value#>>'{data,physical_tests,has_more}' from read_results where name='second'),'false','physical_tests final page closes');
select is((select value#>>'{data,history,has_more}' from read_results where name='first'),'true','history detects lookahead');
select is((select value#>>'{data,history,next_offset}' from read_results where name='first'),'1','history next offset explicit');
select is((select value#>>'{data,history,has_more}' from read_results where name='second'),'false','history final page closes');
select is((select value#>>'{data,physical_tests,items,0,id}' from read_results where name='second'),'b3000000-0000-4000-8000-000000000083'::text,'test paging has no duplicate first item');
select is((select value#>>'{data,history,items,0,id}' from read_results where name='second'),'b3000000-0000-4000-8000-000000000093'::text,'history paging follows stable date/id order');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000032','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'CLIENT_NOT_FOUND','foreign client cannot cross tenant');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000099','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'CLIENT_NOT_FOUND','missing and foreign client indistinguishable');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000042','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'CLIENT_NOT_FOUND','forged passport ID cannot be used as client');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000034','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'HAIR_PASSPORT_NOT_FOUND','authorized client without passport has domain error');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000112','b3000000-0000-4000-8000-000000000012','b3000000-0000-4000-8000-000000000032','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'TENANT_CONTEXT_INVALID','another users membership never authorizes');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000012','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'TENANT_CONTEXT_INVALID','foreign location does not authorize');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000013','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'TENANT_CONTEXT_INVALID','location scoped membership cannot switch its scope');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000115','b3000000-0000-4000-8000-000000000013','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'FORBIDDEN','selected reception membership cannot borrow other owner permission');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"passport_id":"forged"}','b3000000-0000-4000-8000-000000000201'))->>'code'),'VALIDATION_FAILED','passport override rejected');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"organization_id":"forged"}','b3000000-0000-4000-8000-000000000201'))->>'code'),'VALIDATION_FAILED','organization override rejected');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"page_size":101}','b3000000-0000-4000-8000-000000000201'))->>'code'),'VALIDATION_FAILED','oversized page rejected');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"page_size":0}','b3000000-0000-4000-8000-000000000201'))->>'code'),'VALIDATION_FAILED','empty page rejected');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"tests_offset":-1}','b3000000-0000-4000-8000-000000000201'))->>'code'),'VALIDATION_FAILED','negative offset rejected');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"history_offset":10001}','b3000000-0000-4000-8000-000000000201'))->>'code'),'VALIDATION_FAILED','excessive offset rejected');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"page_size":"1"}','b3000000-0000-4000-8000-000000000201'))->>'code'),'VALIDATION_FAILED','numeric coercion rejected');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"include_archived":null}','b3000000-0000-4000-8000-000000000201'))->>'code'),'VALIDATION_FAILED','ambiguous archive flag rejected');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031',null,'b3000000-0000-4000-8000-000000000201'))->>'code'),'VALIDATION_FAILED','null options rejected');
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000023',true);
set local role authenticated;
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000113','b3000000-0000-4000-8000-000000000013','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201'))->'data'->'passport'->>'id'),'b3000000-0000-4000-8000-000000000041'::text,'assistant reads same organization safety history across locations');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000113','b3000000-0000-4000-8000-000000000013','b3000000-0000-4000-8000-000000000032','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'CLIENT_NOT_FOUND','location member cannot escape organization');
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000024',true);
set local role authenticated;
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000114','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'FORBIDDEN','reception lacking read permission denied');
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role anon;
select throws_ok($$select public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201')$$,'42501',null,'anonymous cannot invoke read RPC');
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'UNAUTHENTICATED','missing authenticated actor denied');
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role authenticated;
reset role;
update public.salon_memberships set status='revoked',revoked_at=now() where id='b3000000-0000-4000-8000-000000000111';
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role authenticated;
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'MEMBERSHIP_REVOKED','revoked is checked on every RPC with same JWT');
select ok(not ((public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201')) ? 'data'),'revoked returns no protected payload');
reset role;
update public.salon_memberships set status='active',joined_at=now(),revoked_at=null where id='b3000000-0000-4000-8000-000000000111';
reset role;
update public.salon_memberships set status='invited',joined_at=null where id='b3000000-0000-4000-8000-000000000111';
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role authenticated;
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'TENANT_CONTEXT_INVALID','invited is checked on every RPC with same JWT');
select ok(not ((public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201')) ? 'data'),'invited returns no protected payload');
reset role;
update public.salon_memberships set status='active',joined_at=now(),revoked_at=null where id='b3000000-0000-4000-8000-000000000111';
reset role;
update public.locations set archived_at=now() where id='b3000000-0000-4000-8000-000000000011';
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role authenticated;
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'TENANT_CONTEXT_INVALID','location_archived is checked on every RPC with same JWT');
select ok(not ((public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201')) ? 'data'),'location_archived returns no protected payload');
reset role;
update public.locations set archived_at=null where id='b3000000-0000-4000-8000-000000000011';
reset role;
update public.organizations set archived_at=now() where id='b3000000-0000-4000-8000-000000000001';
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role authenticated;
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'TENANT_CONTEXT_INVALID','org_archived is checked on every RPC with same JWT');
select ok(not ((public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201')) ? 'data'),'org_archived returns no protected payload');
reset role;
update public.organizations set archived_at=null where id='b3000000-0000-4000-8000-000000000001';
reset role;
delete from public.role_permissions where role_code='owner' and permission_code='hair_passport.read';
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role authenticated;
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'FORBIDDEN','permission_removed is checked on every RPC with same JWT');
select ok(not ((public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201')) ? 'data'),'permission_removed returns no protected payload');
reset role;
insert into public.role_permissions(role_code,permission_code) values('owner','hair_passport.read');
update public.clients set status='ARCHIVED' where id='b3000000-0000-4000-8000-000000000031';
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role authenticated;
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'CLIENT_NOT_FOUND','archived client is excluded by default');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"include_archived":true}','b3000000-0000-4000-8000-000000000201'))->'data'->'passport'->>'client_status'),'ARCHIVED','explicit historical read preserves archived client status');
select is((select jsonb_array_length((public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"include_archived":true}','b3000000-0000-4000-8000-000000000201'))->'data'->'history'->'items')),2,'archived client history remains readable');
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000024',true);
set local role authenticated;
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000114','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"include_archived":true}','b3000000-0000-4000-8000-000000000201'))->>'code'),'FORBIDDEN','explicit historical flag never bypasses permission');
reset role;
update public.clients set status='ACTIVE' where id='b3000000-0000-4000-8000-000000000031';
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role elifora_hair_writer;
update public.hair_passports set status='ARCHIVED' where id='b3000000-0000-4000-8000-000000000041';
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role authenticated;
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{}','b3000000-0000-4000-8000-000000000201'))->>'code'),'HAIR_PASSPORT_NOT_FOUND','archived passport excluded by default');
select is((select (public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000031','{"include_archived":true}','b3000000-0000-4000-8000-000000000201'))->'data'->'passport'->>'status'),'ARCHIVED','explicit historical access includes archived passport');
reset role;
select is((select count(*) from public.audit_events),(select n+1 from audit_before),'reads do not mutate audit or create technical events');
set local role authenticated;
select is(public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000033','{"page_size":1.0}')#>>'{data,history,page_size}','1','integer-valued JSON numbers match the contract');
select is(public.hair_passport_snapshot('b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000033','{"page_size":1.5}')->>'code','VALIDATION_FAILED','fractional page sizes are rejected');
reset role;
select * from finish();
rollback;
