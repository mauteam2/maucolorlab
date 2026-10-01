begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(28);
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
insert into public.hair_observations(id,organization_id,client_id,passport_id,evidence_id,natural_level_state,natural_level)
 values('b3000000-0000-4000-8000-000000000371','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','b3000000-0000-4000-8000-000000000061','KNOWN',4);
reset role;
truncate audit_before;
insert into audit_before select count(*) from public.audit_events;

create function pg_temp.confidence_read(
 client_id uuid default 'b3000000-0000-4000-8000-000000000031',
 membership_id uuid default 'b3000000-0000-4000-8000-000000000111',
 location_id uuid default 'b3000000-0000-4000-8000-000000000011',
 archived boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
 select public.hair_confidence_snapshot(membership_id,location_id,client_id,archived,'b3000000-0000-4000-8000-000000000201'); $$;

select ok((select not prosecdef and provolatile='s' from pg_proc where oid='public.hair_confidence_snapshot(uuid,uuid,uuid,boolean,uuid)'::regprocedure),'confidence input uses stable SECURITY INVOKER');
select ok(not has_function_privilege('anon','public.hair_confidence_snapshot(uuid,uuid,uuid,boolean,uuid)','EXECUTE'),'anonymous cannot call confidence input');
select ok(not has_function_privilege('service_role','public.hair_confidence_snapshot(uuid,uuid,uuid,boolean,uuid)','EXECUTE'),'service-role input access is not introduced');
select ok(has_function_privilege('authenticated','public.hair_confidence_snapshot(uuid,uuid,uuid,boolean,uuid)','EXECUTE'),'authenticated callers use existing RLS');
set local role authenticated;
insert into read_results values('confidence',pg_temp.confidence_read());
select is((select value#>>'{data,pages,0,passport,client_id}' from read_results where name='confidence'),'b3000000-0000-4000-8000-000000000031','same-organization client returned');
select is((select value->>'correlationId' from read_results where name='confidence'),'b3000000-0000-4000-8000-000000000201','confidence read preserves correlation');
select ok((select value#>>'{data,evaluatedAt}' from read_results where name='confidence')::timestamptz is not null,'evaluation clock is server-derived');
select is((select jsonb_array_length(value#>'{data,pages,0,observations,items}') from read_results where name='confidence'),3,'current and older observations retained');
select is((select value#>>'{data,pages,0,observations,page_size}' from read_results where name='confidence'),'100','complete read uses bounded pages');
select ok((select position('FOREIGN_TEST' in value::text)=0 and position('FOREIGN_HISTORY' in value::text)=0 from read_results where name='confidence'),'no cross-tenant test or history leakage');
select is(pg_temp.confidence_read('b3000000-0000-4000-8000-000000000032')->>'code','CLIENT_NOT_FOUND','foreign client existence is concealed');
select is(pg_temp.confidence_read('b3000000-0000-4000-8000-000000009999')->>'code','CLIENT_NOT_FOUND','unknown and foreign client have same response');
select is(pg_temp.confidence_read('b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000112')->>'code','TENANT_CONTEXT_INVALID','another user membership cannot authorize');
select is(pg_temp.confidence_read('b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000012')->>'code','TENANT_CONTEXT_INVALID','foreign location cannot authorize');
select is(pg_temp.confidence_read('b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011',null)->>'code','VALIDATION_FAILED','null archive flag fails closed');
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000023',true);
set local role authenticated;
select ok(pg_temp.confidence_read('b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000113','b3000000-0000-4000-8000-000000000013') ? 'data','read-only assistant can read organization evidence');
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000024',true);
set local role authenticated;
select is(pg_temp.confidence_read('b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000114')->>'code','FORBIDDEN','reception cannot read technical confidence');
reset role;
update public.salon_memberships set status='revoked',revoked_at=now() where id='b3000000-0000-4000-8000-000000000111';
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role authenticated;
select is(pg_temp.confidence_read()->>'code','MEMBERSHIP_REVOKED','revocation takes effect without replacing JWT');
select ok(not(pg_temp.confidence_read() ? 'data'),'revoked caller receives no input pages');
reset role;
update public.salon_memberships set status='active',revoked_at=null where id='b3000000-0000-4000-8000-000000000111';
select is((select count(*) from public.audit_events),(select n from audit_before),'confidence reads do not add noisy audit events');
update public.clients set status='ARCHIVED' where id='b3000000-0000-4000-8000-000000000031';
set local role authenticated;
select is(pg_temp.confidence_read()->>'code','CLIENT_NOT_FOUND','archived client excluded by default');
select is(pg_temp.confidence_read('b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000111','b3000000-0000-4000-8000-000000000011',true)#>>'{data,pages,0,passport,client_status}','ARCHIVED','explicit historical read preserves archive semantics');
reset role;
update public.clients set status='ACTIVE' where id='b3000000-0000-4000-8000-000000000031';
set local role elifora_hair_writer;
insert into public.hair_observations(organization_id,client_id,passport_id,evidence_id)
 select 'b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','b3000000-0000-4000-8000-000000000061' from generate_series(1,100);
reset role;
set local role authenticated;
select is(jsonb_array_length(pg_temp.confidence_read()#>'{data,pages}'),2,'complete read loads evidence beyond first page');
select is(jsonb_array_length(pg_temp.confidence_read()#>'{data,pages,1,observations,items}'),3,'second page retains remainder');
reset role;
set local role elifora_hair_writer;
insert into public.hair_observations(organization_id,client_id,passport_id,evidence_id)
 select 'b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000041','b3000000-0000-4000-8000-000000000061' from generate_series(1,900);
reset role;
set local role authenticated;
select is(pg_temp.confidence_read()->>'code','CONFIDENCE_INPUT_LIMIT','oversized timeline never produces a partial assessment');
select ok(not(pg_temp.confidence_read() ? 'data'),'input-limit response exposes no partial evidence');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select is(pg_temp.confidence_read()->>'code','UNAUTHENTICATED','missing authenticated identity denied');
reset role;
set local role anon;
select throws_ok($$select pg_temp.confidence_read()$$,'42501',null,'anonymous direct RPC call denied');
reset role;
select * from finish();
rollback;
