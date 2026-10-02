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

create function pg_temp.target_definition(p_region uuid default 'b3000000-0000-4000-8000-000000000051') returns jsonb
language sql immutable as $$ select jsonb_build_object('schemaVersion',1,'mode','UNIFORM_COLOR','globalIntent','REFRESH','regions',jsonb_build_array(
 jsonb_build_object('regionId',p_region,'level',7,'toneFamily','NEUTRAL','mixedFamilies','[]'::jsonb,'warmth','NEUTRAL','greyPriority','NONE',
 'liftPriority','NONE','depositPriority','NONE','toneIntent','CHANGE','contrast','NONE','preserve',false,'handling','STANDARD','correction','NONE','intermediateLevel',null))); $$;
create function pg_temp.target_operation(p_operation text,p_payload jsonb,p_client uuid default 'b3000000-0000-4000-8000-000000000031',p_membership uuid default 'b3000000-0000-4000-8000-000000000111',p_location uuid default 'b3000000-0000-4000-8000-000000000011')
returns jsonb language sql volatile as $$ select public.color_target_operation(p_membership,p_location,p_client,p_operation,p_payload,'b3000000-0000-4000-8000-000000000201'); $$;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role authenticated;
select ok(not has_function_privilege('anon','public.color_target_operation(uuid,uuid,uuid,text,jsonb,uuid)','EXECUTE'),'anonymous cannot call targets');
select ok(not has_function_privilege('service_role','public.color_target_operation(uuid,uuid,uuid,text,jsonb,uuid)','EXECUTE'),'service role target access is not granted');
select ok((select not prosecdef from pg_proc where oid='public.color_target_operation(uuid,uuid,uuid,text,jsonb,uuid)'::regprocedure),'public target RPC is invoker');
select throws_ok('insert into public.color_target_versions default values','42501',null,'caller cannot directly forge target ownership');
insert into read_results values('target',pg_temp.target_operation('create',jsonb_build_object('request_id','b3000000-0000-4000-8000-000000000501','definition',pg_temp.target_definition())));
select is((select value#>>'{data,version}' from read_results where name='target'),'1','authorized same-organization target revision one');
select is((select value#>>'{data,clientId}' from read_results where name='target'),'b3000000-0000-4000-8000-000000000031','target client is server derived');
select is((select count(*) from public.color_target_regions),1::bigint,'regional target relation retained');
select is((select count(*) from public.audit_events where action='color_target.created'),1::bigint,'creation audit occurs once');
insert into read_results values('replay',pg_temp.target_operation('create',jsonb_build_object('request_id','b3000000-0000-4000-8000-000000000501','definition',pg_temp.target_definition())));
select is((select value#>>'{data,id}' from read_results where name='replay'),(select value#>>'{data,id}' from read_results where name='target'),'idempotent create returns original revision');
select is((select count(*) from public.audit_events where action='color_target.created'),1::bigint,'replay adds no audit');
select is(pg_temp.target_operation('create',jsonb_build_object('request_id','b3000000-0000-4000-8000-000000000501','definition',jsonb_set(pg_temp.target_definition(),'{regions,0,level}','8')))->>'code','TARGET_VERSION_CONFLICT','request collision cannot rewrite intent');
insert into read_results values('revision',pg_temp.target_operation('revise',jsonb_build_object('request_id','b3000000-0000-4000-8000-000000000502','series_id',(select value#>>'{data,seriesId}' from read_results where name='target'),'expected_version',1,'definition',jsonb_set(pg_temp.target_definition(),'{regions,0,level}','8'))));
select is((select value#>>'{data,version}' from read_results where name='revision'),'2','revision is a new identifiable version');
select is((select value#>>'{data,previousVersionId}' from read_results where name='revision'),(select value#>>'{data,id}' from read_results where name='target'),'lineage binds original revision');
select is((pg_temp.target_operation('read',jsonb_build_object('target_id',(select value#>>'{data,id}' from read_results where name='target'))))#>>'{data,definition,regions,0,level}','7','old target remains immutable');
select is(pg_temp.target_operation('revise',jsonb_build_object('request_id','b3000000-0000-4000-8000-000000000503','series_id',(select value#>>'{data,seriesId}' from read_results where name='target'),'expected_version',1,'definition',pg_temp.target_definition()))->>'code','TARGET_VERSION_CONFLICT','stale revision precondition is enforced');
select is(pg_temp.target_operation('create',jsonb_build_object('request_id','b3000000-0000-4000-8000-000000000504','organization_id','b3000000-0000-4000-8000-000000000002','definition',pg_temp.target_definition()))->>'code','VALIDATION_FAILED','forged owner is rejected');
select is(pg_temp.target_operation('create',jsonb_build_object('request_id','b3000000-0000-4000-8000-000000000505','definition',pg_temp.target_definition('b3000000-0000-4000-8000-000000000052')))->>'code','COLOR_TARGET_INVALID','foreign region cannot enter target');
select is(pg_temp.target_operation('create',jsonb_build_object('request_id','b3000000-0000-4000-8000-000000000506','definition',jsonb_set(pg_temp.target_definition(),'{regions,0,level}','null')))->>'code','COLOR_TARGET_INCOMPLETE','missing target level is not guessed');
select is(pg_temp.target_operation('read',jsonb_build_object('target_id',(select value#>>'{data,id}' from read_results where name='target')),'b3000000-0000-4000-8000-000000000032')->>'code','CLIENT_NOT_FOUND','foreign client existence is concealed');
select throws_ok('update public.color_target_versions set client_id=''b3000000-0000-4000-8000-000000000032''','42501',null,'target ownership cannot be reassigned');
select throws_ok('delete from public.color_target_versions','42501',null,'target history cannot be deleted');
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000023',true);
set local role authenticated;
select is(pg_temp.target_operation('create',jsonb_build_object('request_id','b3000000-0000-4000-8000-000000000507','definition',pg_temp.target_definition()),'b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000113','b3000000-0000-4000-8000-000000000013')->>'code','FORBIDDEN','assistant read permission cannot create');
select ok(pg_temp.target_operation('read',jsonb_build_object('target_id',(select value#>>'{data,id}' from read_results where name='target')),'b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000113','b3000000-0000-4000-8000-000000000013') ? 'data','read-only assistant can read same organization target');
reset role;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
update public.salon_memberships set status='revoked',revoked_at=now() where id='b3000000-0000-4000-8000-000000000111';
set local role authenticated;
select ok(not(pg_temp.target_operation('read',jsonb_build_object('target_id',(select value#>>'{data,id}' from read_results where name='target'))) ? 'data'),'revoked selected membership receives no target');
reset role;
update public.salon_memberships set status='active',revoked_at=null where id='b3000000-0000-4000-8000-000000000111';
update public.clients set status='ARCHIVED' where id='b3000000-0000-4000-8000-000000000031';
set local role authenticated;
select is(pg_temp.target_operation('read',jsonb_build_object('target_id',(select value#>>'{data,id}' from read_results where name='target')))->>'code','CLIENT_NOT_FOUND','archive read remains explicit');
select ok(pg_temp.target_operation('read',jsonb_build_object('target_id',(select value#>>'{data,id}' from read_results where name='target'),'include_archived',true)) ? 'data','authorized historical target read is permitted');
select is(pg_temp.target_operation('create',jsonb_build_object('request_id','b3000000-0000-4000-8000-000000000508','definition',pg_temp.target_definition()))->>'code','CLIENT_NOT_FOUND','archived client cannot acquire a new target');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select is(pg_temp.target_operation('read','{}')->>'code','UNAUTHENTICATED','missing authenticated subject denied');
select * from finish();
rollback;

