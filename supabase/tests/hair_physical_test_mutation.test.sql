begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(31);
-- Synthetic identities share a phone across tenants intentionally.
insert into auth.users(id,email,raw_user_meta_data) values
 ('b7000000-0000-4000-8000-000000000021','hair-physical-test-owner-a@elifora.test','{}'),('b7000000-0000-4000-8000-000000000022','hair-physical-test-owner-b@elifora.test','{}'),
 ('b7000000-0000-4000-8000-000000000023','hair-physical-test-assistant@elifora.test','{}'),('b7000000-0000-4000-8000-000000000024','hair-physical-test-reception@elifora.test','{}');
insert into public.organizations(id,name,slug,base_currency) values
 ('b7000000-0000-4000-8000-000000000001','Hair A','hair-physical-test-a','TRY'),('b7000000-0000-4000-8000-000000000002','Hair B','hair-physical-test-b','TRY');
insert into public.locations(id,organization_id,name,timezone) values
 ('b7000000-0000-4000-8000-000000000011','b7000000-0000-4000-8000-000000000001','A One','Europe/Istanbul'),('b7000000-0000-4000-8000-000000000013','b7000000-0000-4000-8000-000000000001','A Two','Europe/Istanbul'),
 ('b7000000-0000-4000-8000-000000000012','b7000000-0000-4000-8000-000000000002','B One','Europe/Istanbul');
insert into public.salon_memberships(id,organization_id,location_id,user_id,role_code,status,joined_at) values
 ('b7000000-0000-4000-8000-000000000111','b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000011','b7000000-0000-4000-8000-000000000021','owner','active',now()),
 ('b7000000-0000-4000-8000-000000000112','b7000000-0000-4000-8000-000000000002',null,'b7000000-0000-4000-8000-000000000022','owner','active',now()),
 ('b7000000-0000-4000-8000-000000000113','b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000013','b7000000-0000-4000-8000-000000000023','assistant','active',now()),
 ('b7000000-0000-4000-8000-000000000114','b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000011','b7000000-0000-4000-8000-000000000024','reception','active',now());
insert into public.clients(id,organization_id,full_name,phone,phone_normalized,created_by,updated_by,creation_location_id) values
 ('b7000000-0000-4000-8000-000000000031','b7000000-0000-4000-8000-000000000001','Hair Client A','+905321234567','+905321234567','b7000000-0000-4000-8000-000000000021','b7000000-0000-4000-8000-000000000021','b7000000-0000-4000-8000-000000000011'),
 ('b7000000-0000-4000-8000-000000000032','b7000000-0000-4000-8000-000000000002','Hair Client B','+905321234567','+905321234567','b7000000-0000-4000-8000-000000000022','b7000000-0000-4000-8000-000000000022','b7000000-0000-4000-8000-000000000012'),
 ('b7000000-0000-4000-8000-000000000033','b7000000-0000-4000-8000-000000000001','Hair Client A Two','+905329999999','+905329999999','b7000000-0000-4000-8000-000000000021','b7000000-0000-4000-8000-000000000021','b7000000-0000-4000-8000-000000000011');




create temporary table results(name text primary key,value jsonb);
grant all on results to authenticated;
create function pg_temp.record_test(payload jsonb,client uuid default 'b7000000-0000-4000-8000-000000000031',membership uuid default 'b7000000-0000-4000-8000-000000000111',location uuid default 'b7000000-0000-4000-8000-000000000011')
returns jsonb language sql volatile security invoker as $$
 select public.hair_physical_test_operation(membership,location,client,jsonb_build_object('request_id',gen_random_uuid())||payload,'b7000000-0000-4000-8000-000000000900');
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','b7000000-0000-4000-8000-000000000021',true);

select public.hair_core_operation('b7000000-0000-4000-8000-000000000111','b7000000-0000-4000-8000-000000000011','b7000000-0000-4000-8000-000000000031','create_passport',jsonb_build_object('request_id',gen_random_uuid()));
select public.hair_core_operation('b7000000-0000-4000-8000-000000000111','b7000000-0000-4000-8000-000000000011','b7000000-0000-4000-8000-000000000033','create_passport',jsonb_build_object('request_id',gen_random_uuid()));
select set_config('request.jwt.claim.sub','b7000000-0000-4000-8000-000000000022',true);
select public.hair_core_operation('b7000000-0000-4000-8000-000000000112','b7000000-0000-4000-8000-000000000012','b7000000-0000-4000-8000-000000000032','create_passport',jsonb_build_object('request_id',gen_random_uuid()));
insert into results select 'foreign_region',jsonb_build_object('id',id) from public.hair_regions
 where client_id='b7000000-0000-4000-8000-000000000032' and region_type='ROOT';
select set_config('request.jwt.claim.sub','b7000000-0000-4000-8000-000000000021',true);
insert into results values('first',pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": "HIGH"}, "request_id": "b7000000-0000-4000-8000-000000000901"}'));
select is((select value#>>'{data,test,type}' from results where name='first'),'POROSITY','authorized live porosity test');
select ok((select value#>>'{data,test,performed_by}'=auth.uid()::text and value#>>'{data,test,performed_at}'=value#>>'{data,test,recorded_at}' and value#>>'{data,test,evidence,source}'='PHYSICAL_TEST' and value#>>'{data,test,evidence,observed_at,value}'=value#>>'{data,test,performed_at}' and value#>>'{data,test,evidence,verified_by}' is null from results where name='first'),'server performer time and physical evidence');
reset role; create temporary table retry_counts as select (select count(*) from public.hair_physical_tests) t,(select count(*) from public.hair_evidence) e,(select count(*) from public.audit_events) a; set local role authenticated;
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": "HIGH"}, "request_id": "b7000000-0000-4000-8000-000000000901"}'),(select value from results where name='first'),'identical retry replays original fact');
reset role;
select ok((select t=(select count(*) from public.hair_physical_tests) and e=(select count(*) from public.hair_evidence) and a=(select count(*) from public.audit_events) from retry_counts),'retry adds no test evidence or audit');
set local role authenticated;
select is(public.hair_passport_snapshot('b7000000-0000-4000-8000-000000000111','b7000000-0000-4000-8000-000000000011','b7000000-0000-4000-8000-000000000031')#>'{data,physical_tests,items,0}',(select value#>'{data,test}' from results where name='first'),'existing snapshot returns the same physical-test DTO');
insert into results values('regional',pg_temp.record_test('{"type": "ELASTICITY", "result": {"state": "KNOWN", "value": "NORMAL"}}'::jsonb||jsonb_build_object('region_id',(select id from public.hair_regions where client_id='b7000000-0000-4000-8000-000000000031' and region_type='ROOT'))));
select ok((select value#>>'{data,test,type}'='ELASTICITY' and value#>>'{data,test,region_id}'=(select id::text from public.hair_regions where client_id='b7000000-0000-4000-8000-000000000031' and region_type='ROOT') from results where name='regional'),'regional elasticity remains in its passport');
select is(pg_temp.record_test('{"type": "STRAND", "result": {"state": "KNOWN", "value": "Synthetic strand remained intact"}, "location_id": "b7000000-0000-4000-8000-000000000011"}')#>>'{data,test,type}','STRAND','strand facts and explicit same-organization location accepted');
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "UNKNOWN", "value": null}}')#>>'{data,test,result,state}','UNKNOWN','explicit UNKNOWN remains unchanged');
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "NOT_APPLICABLE", "value": null}}')#>>'{data,test,result,state}','NOT_APPLICABLE','explicit NOT_APPLICABLE remains unchanged');
select is(pg_temp.record_test('{"type": "INVENTED", "result": {"state": "KNOWN", "value": "HIGH"}}')->>'code','INVALID_PHYSICAL_TEST','unsupported type rejected');
select is(pg_temp.record_test('{"type": "POROSITY", "result": "HIGH"}')->>'code','INVALID_TEST_RESULT','bare unstructured result rejected');
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN"}}')->>'code','INVALID_TEST_RESULT','missing known value rejected');
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": 7}}')->>'code','INVALID_TEST_RESULT','unsupported numeric result rejected');
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "UNKNOWN", "value": "HIGH"}}')->>'code','INVALID_TEST_RESULT','contradictory state rejected');
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": "HIGH"}, "performed_by": "b7000000-0000-4000-8000-000000000022"}')->>'code','INVALID_PHYSICAL_TEST','forged performer rejected');
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": "HIGH"}, "organization_id": "b7000000-0000-4000-8000-000000000002"}')->>'code','INVALID_PHYSICAL_TEST','forged ownership rejected');
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": "HIGH"}, "performed_at": "2020-01-01T00:00:00Z"}')->>'code','INVALID_PHYSICAL_TEST','forged time rejected');
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": "HIGH"}, "location_id": "b7000000-0000-4000-8000-000000000012"}')->>'code','LOCATION_NOT_FOUND','foreign location rejected');
select is(pg_temp.record_test('{"type": "ELASTICITY", "result": {"state": "KNOWN", "value": "HIGH"}, "request_id": "b7000000-0000-4000-8000-000000000901"}')->>'code','CONFLICT','changed retry payload rejected');
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": "HIGH"}}','b7000000-0000-4000-8000-000000000032')->>'code','CLIENT_NOT_FOUND','foreign passport denied without existence disclosure');
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": "HIGH"}}'::jsonb||jsonb_build_object('region_id',(select value->>'id' from results where name='foreign_region')))->>'code','HAIR_REGION_NOT_FOUND','existing foreign region denied');
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": "HIGH"}}'::jsonb||jsonb_build_object('region_id',(select id from public.hair_regions where client_id='b7000000-0000-4000-8000-000000000033' and region_type='ROOT')))->>'code','HAIR_REGION_NOT_FOUND','another passport region denied');
reset role; create temporary table counts_before as select (select count(*) from public.hair_physical_tests) t,(select count(*) from public.hair_evidence) e,(select count(*) from public.audit_events) a,(select count(*) from app_private.hair_core_mutation_receipts) r;
create function pg_temp.reject_test() returns trigger language plpgsql as $$begin raise exception using errcode='23514',message='Synthetic rollback';end$$; create trigger zz_test_reject before insert on public.hair_physical_tests for each row when (new.notes='Synthetic rollback') execute function pg_temp.reject_test(); set local role authenticated;
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": "HIGH"}, "notes": "Synthetic rollback"}')->>'code','INVALID_PHYSICAL_TEST','failure after evidence insertion is normalized');
reset role; drop trigger zz_test_reject on public.hair_physical_tests;
select ok((select t=(select count(*) from public.hair_physical_tests) and e=(select count(*) from public.hair_evidence) and a=(select count(*) from public.audit_events) and r=(select count(*) from app_private.hair_core_mutation_receipts) from counts_before),'failed mutation rolls back test evidence audit and receipt');
select ok(exists(select 1 from public.audit_events where action='hair_physical_test.created' and entity_id=(select (value#>>'{data,test,id}')::uuid from results where name='first') and actor_user_id='b7000000-0000-4000-8000-000000000021' and metadata->>'test_type'='POROSITY') and not exists(select 1 from public.audit_events where metadata ? 'result' or metadata ? 'notes'),'created audit identifies record and actor without raw facts');
delete from public.role_permissions where role_code='owner' and permission_code in ('hair_passport.add_observation','hair_passport.update'); set local role authenticated;
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": "HIGH"}}')#>>'{data,test,type}','POROSITY','add_test alone can append its required evidence');
select ok((select count(*)=0 from public.hair_observations) and (select count(*)=0 from public.hair_history_events) and (select bool_and(version=1 and current_observation_id is null) from public.hair_passports),'independent append preserves current assessments and other fact types');
set local role elifora_hair_writer;
select throws_ok($$insert into public.hair_evidence(organization_id,client_id,passport_id,source_type) select organization_id,client_id,id,'AI_ESTIMATE' from public.hair_passports where client_id='b7000000-0000-4000-8000-000000000031'$$,'42501','technical write unavailable','add_test cannot create nonphysical evidence');
set local role authenticated; select set_config('request.jwt.claim.sub','b7000000-0000-4000-8000-000000000023',true);
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": "HIGH"}}','b7000000-0000-4000-8000-000000000031','b7000000-0000-4000-8000-000000000113','b7000000-0000-4000-8000-000000000013')->>'code','FORBIDDEN','assistant cannot record a test');
reset role; set local role anon;
select throws_ok($$select public.hair_physical_test_operation('b7000000-0000-4000-8000-000000000111','b7000000-0000-4000-8000-000000000011','b7000000-0000-4000-8000-000000000031','{}')$$,'42501','permission denied for function hair_physical_test_operation','anonymous cannot invoke the write');
reset role; update public.salon_memberships set status='revoked',revoked_at=now() where id='b7000000-0000-4000-8000-000000000111'; set local role authenticated; select set_config('request.jwt.claim.sub','b7000000-0000-4000-8000-000000000021',true);
select is(pg_temp.record_test('{"type": "POROSITY", "result": {"state": "KNOWN", "value": "HIGH"}, "request_id": "b7000000-0000-4000-8000-000000000901"}')->>'code','MEMBERSHIP_REVOKED','revoked membership cannot replay success');
reset role; select * from finish(); rollback;
