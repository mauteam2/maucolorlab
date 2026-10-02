begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
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
create function pg_temp.plan_operation(p_operation text,p_payload jsonb,p_client uuid default 'b3000000-0000-4000-8000-000000000031',p_membership uuid default 'b3000000-0000-4000-8000-000000000111',p_location uuid default 'b3000000-0000-4000-8000-000000000011')
returns jsonb language sql volatile as $$ select public.color_plan_operation(p_membership,p_location,p_client,p_operation,p_payload,'b3000000-0000-4000-8000-000000000201'); $$;
-- Test-only signer, owned by postgres, never shipped as an application capability.
create function pg_temp.sign_packet(p_packet jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('envelope',p_packet::text,'signature',encode(extensions.hmac(convert_to(p_packet::text,'UTF8'),secret,'sha256'),'hex')) from app_private.color_engine_keys where id=1;
$$;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000021',true);
set local role authenticated;
select ok(not has_function_privilege('anon','public.color_plan_operation(uuid,uuid,uuid,text,jsonb,uuid)','EXECUTE'),'anonymous plan RPC denied');
select ok(not has_function_privilege('service_role','public.color_plan_operation(uuid,uuid,uuid,text,jsonb,uuid)','EXECUTE'),'service role cannot generate plans');
select ok((select not prosecdef from pg_proc where oid='public.color_plan_operation(uuid,uuid,uuid,text,jsonb,uuid)'::regprocedure),'public RPC retains caller RLS');
select ok(not has_table_privilege('authenticated','app_private.color_engine_keys','SELECT'),'signing material unavailable to authenticated');
select throws_ok('insert into public.color_plans default values','42501',null,'direct plan ownership forgery denied');
select throws_ok('select signed_envelope from public.color_plans','42501',null,'internal signature binding never directly exposed');
insert into read_results values('target',pg_temp.target_operation('create',jsonb_build_object('request_id','b3000000-0000-4000-8000-000000000601','definition',pg_temp.target_definition())));
insert into read_results values('prepare',pg_temp.plan_operation('prepare',jsonb_build_object('target_id',(select value#>>'{data,id}' from read_results where name='target'),'request_id','b3000000-0000-4000-8000-000000000602')));
select ok((select value#>'{data,snapshot,pages}' is not null from read_results where name='prepare'),'authorized preparation returns canonical complete snapshot');
select is((select value#>>'{data,target,id}' from read_results where name='prepare'),(select value#>>'{data,id}' from read_results where name='target'),'target revision loaded in same snapshot');
select ok((select value#>>'{data,sourceToken}' ~ '^[a-f0-9]{64}$' from read_results where name='prepare'),'source concurrency token is stable hash');
select is(pg_temp.plan_operation('store',jsonb_build_object('envelope','{}','signature',repeat('0',64)))->>'code','COLOR_PLAN_SIGNATURE_INVALID','unsigned client assessment cannot persist');
select is(pg_temp.plan_operation('prepare',jsonb_build_object('target_id',(select value#>>'{data,id}' from read_results where name='target'),'request_id',gen_random_uuid(),'risk','LOW'))->>'code','VALIDATION_FAILED','client risk forgery denied');
select is(pg_temp.plan_operation('prepare',jsonb_build_object('target_id',gen_random_uuid(),'request_id',gen_random_uuid()))->>'code','COLOR_TARGET_NOT_FOUND','foreign or absent target concealed');
-- A deliberately non-progressing signed fixture protects persistence independently of the TS engine.
insert into read_results values('packet',(select jsonb_build_object('organizationId','b3000000-0000-4000-8000-000000000001','actorId','b3000000-0000-4000-8000-000000000021',
 'membershipId','b3000000-0000-4000-8000-000000000111','locationId','b3000000-0000-4000-8000-000000000011','clientId','b3000000-0000-4000-8000-000000000031',
 'targetId',value#>>'{data,target,id}','requestId','b3000000-0000-4000-8000-000000000602','sourceToken',value#>>'{data,sourceToken}','expiresAt',statement_timestamp()+interval '2 minutes',
 'result',jsonb_build_object('engineVersion','color-engine/1.0.0','evaluatedAt',statement_timestamp(),'status','BLOCKED_BY_RISK','recipeDraft',null,'primaryStrategy',null,'alternatives','[]'::jsonb,
  'metadata',jsonb_build_object('passportId',value#>>'{data,target,passportId}','passportVersion',(value#>>'{data,snapshot,pages,0,passport,version}')::bigint,'targetId',value#>>'{data,target,id}','targetVersion',1,
   'inputFingerprint',repeat('a',64),'hairFingerprint',repeat('b',64),'targetFingerprint',repeat('c',64),'confidenceVersion','confidence-engine/1.0.0','riskVersion','risk-engine/1.0.0')))
 from read_results where name='prepare'));
select is(pg_temp.plan_operation('store',pg_temp.sign_packet(jsonb_set((select value from read_results where name='packet'),'{actorId}','"b3000000-0000-4000-8000-000000000022"')))->>'code','COLOR_INPUT_INVALID','signed actor mismatch denied');
select is(pg_temp.plan_operation('store',pg_temp.sign_packet(jsonb_set((select value from read_results where name='packet'),'{sourceToken}',to_jsonb(repeat('0',64)))))->>'code','COLOR_PLAN_SOURCE_CONFLICT','changed source token forces reassessment');
select is(pg_temp.plan_operation('store',pg_temp.sign_packet(jsonb_set((select value from read_results where name='packet'),'{expiresAt}',to_jsonb((statement_timestamp()-interval '1 minute')::text))))->>'code','COLOR_INPUT_INVALID','expired signature denied');
insert into read_results values('plan',pg_temp.plan_operation('store',pg_temp.sign_packet((select value from read_results where name='packet'))));
select ok((select value#>>'{data,id}' is not null from read_results where name='plan'),'signed authorized same-org plan saved');
select is((select value#>>'{data,result,status}' from read_results where name='plan'),'BLOCKED_BY_RISK','nonprogressing result retained without executable draft');
-- Verify organization-level audit as the test supervisor; mutations retain caller RLS.
reset role;
select is((select count(*) from public.audit_events where action='color_plan.generated'),1::bigint,'generation audit once');
set local role authenticated;
select is((pg_temp.plan_operation('store',pg_temp.sign_packet((select value from read_results where name='packet'))))#>>'{data,id}',(select value#>>'{data,id}' from read_results where name='plan'),'same request returns immutable original plan');
-- Verify organization-level audit as the test supervisor; mutations retain caller RLS.
reset role;
select is((select count(*) from public.audit_events where action='color_plan.generated'),1::bigint,'idempotent replay no audit');
set local role authenticated;
select is((pg_temp.plan_operation('read',jsonb_build_object('plan_id',(select value#>>'{data,id}' from read_results where name='plan'))))#>>'{data,id}',(select value#>>'{data,id}' from read_results where name='plan'),'authorized read returns historical plan');
select throws_ok('update public.color_plans set organization_id=gen_random_uuid()','42501',null,'ownership and draft payload immutable');
select throws_ok('delete from public.color_plans','42501',null,'generated history cannot be deleted');
insert into read_results values('revision',pg_temp.target_operation('revise',jsonb_build_object('request_id',gen_random_uuid(),'series_id',(select value#>>'{data,seriesId}' from read_results where name='target'),'expected_version',1,'definition',jsonb_set(pg_temp.target_definition(),'{regions,0,level}','8'))));
select is(pg_temp.plan_operation('prepare',jsonb_build_object('target_id',(select value#>>'{data,id}' from read_results where name='target'),'request_id',gen_random_uuid()))->>'code','TARGET_VERSION_CONFLICT','new plan cannot silently use superseded target');
select is((pg_temp.plan_operation('read',jsonb_build_object('plan_id',(select value#>>'{data,id}' from read_results where name='plan'))))#>>'{data,targetId}',(select value#>>'{data,id}' from read_results where name='target'),'existing plan remains on old target revision');
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000022',true);
select is((select count(*) from public.color_plans),0::bigint,'cross tenant RLS hides plans');
select is(pg_temp.plan_operation('read',jsonb_build_object('plan_id',(select value#>>'{data,id}' from read_results where name='plan')),'b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000112','b3000000-0000-4000-8000-000000000012')->>'code','CLIENT_NOT_FOUND','cross tenant client is indistinguishable from absent');
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000023',true);
select is((pg_temp.plan_operation('read',jsonb_build_object('plan_id',(select value#>>'{data,id}' from read_results where name='plan')),'b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000113','b3000000-0000-4000-8000-000000000013'))#>>'{data,id}',(select value#>>'{data,id}' from read_results where name='plan'),'assistant can read');
select is(pg_temp.plan_operation('prepare',jsonb_build_object('target_id',(select value#>>'{data,id}' from read_results where name='revision'),'request_id',gen_random_uuid()),'b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000113','b3000000-0000-4000-8000-000000000013')->>'code','FORBIDDEN','assistant cannot generate');
reset role;
update public.salon_memberships set status='revoked',revoked_at=now() where id='b3000000-0000-4000-8000-000000000113';
set local role authenticated;
select is((select count(*) from public.color_plans),0::bigint,'revoked RLS hides plans');
select ok(not(pg_temp.plan_operation('read',jsonb_build_object('plan_id',(select value#>>'{data,id}' from read_results where name='plan')),'b3000000-0000-4000-8000-000000000031','b3000000-0000-4000-8000-000000000113','b3000000-0000-4000-8000-000000000013') ? 'data'),'revoked selected membership cannot read');
select set_config('request.jwt.claim.sub','',true);
select is(pg_temp.plan_operation('read',jsonb_build_object('plan_id',gen_random_uuid()))->>'code','UNAUTHENTICATED','missing JWT denied');
select * from finish();
rollback;
