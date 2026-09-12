begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(44);
-- Synthetic identities share a phone across tenants intentionally.
insert into auth.users(id,email,raw_user_meta_data) values
 ('b4000000-0000-4000-8000-000000000021','hair-write-owner-a@elifora.test','{}'),('b4000000-0000-4000-8000-000000000022','hair-write-owner-b@elifora.test','{}'),
 ('b4000000-0000-4000-8000-000000000023','hair-write-assistant@elifora.test','{}'),('b4000000-0000-4000-8000-000000000024','hair-write-reception@elifora.test','{}');
insert into public.organizations(id,name,slug,base_currency) values
 ('b4000000-0000-4000-8000-000000000001','Hair A','hair-write-a','TRY'),('b4000000-0000-4000-8000-000000000002','Hair B','hair-write-b','TRY');
insert into public.locations(id,organization_id,name,timezone) values
 ('b4000000-0000-4000-8000-000000000011','b4000000-0000-4000-8000-000000000001','A One','Europe/Istanbul'),('b4000000-0000-4000-8000-000000000013','b4000000-0000-4000-8000-000000000001','A Two','Europe/Istanbul'),
 ('b4000000-0000-4000-8000-000000000012','b4000000-0000-4000-8000-000000000002','B One','Europe/Istanbul');
insert into public.salon_memberships(id,organization_id,location_id,user_id,role_code,status,joined_at) values
 ('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000011','b4000000-0000-4000-8000-000000000021','owner','active',now()),
 ('b4000000-0000-4000-8000-000000000112','b4000000-0000-4000-8000-000000000002',null,'b4000000-0000-4000-8000-000000000022','owner','active',now()),
 ('b4000000-0000-4000-8000-000000000113','b4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000013','b4000000-0000-4000-8000-000000000023','assistant','active',now()),
 ('b4000000-0000-4000-8000-000000000114','b4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000011','b4000000-0000-4000-8000-000000000024','reception','active',now());
insert into public.clients(id,organization_id,full_name,phone,phone_normalized,created_by,updated_by,creation_location_id) values
 ('b4000000-0000-4000-8000-000000000031','b4000000-0000-4000-8000-000000000001','Hair Client A','+905321234567','+905321234567','b4000000-0000-4000-8000-000000000021','b4000000-0000-4000-8000-000000000021','b4000000-0000-4000-8000-000000000011'),
 ('b4000000-0000-4000-8000-000000000032','b4000000-0000-4000-8000-000000000002','Hair Client B','+905321234567','+905321234567','b4000000-0000-4000-8000-000000000022','b4000000-0000-4000-8000-000000000022','b4000000-0000-4000-8000-000000000012'),
 ('b4000000-0000-4000-8000-000000000033','b4000000-0000-4000-8000-000000000001','Hair Client A Two','+905329999999','+905329999999','b4000000-0000-4000-8000-000000000021','b4000000-0000-4000-8000-000000000021','b4000000-0000-4000-8000-000000000011');



create temporary table results(name text primary key,value jsonb);
grant all on results to authenticated;
create function pg_temp.mutate(op text,payload jsonb default '{}',client uuid default 'b4000000-0000-4000-8000-000000000031',membership uuid default 'b4000000-0000-4000-8000-000000000111',location uuid default 'b4000000-0000-4000-8000-000000000011')
returns jsonb language sql volatile security invoker as $$
 select public.hair_core_operation(membership,location,client,op,jsonb_build_object('request_id',gen_random_uuid())||payload,'b4000000-0000-4000-8000-000000000900');
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','b4000000-0000-4000-8000-000000000021',true);

insert into results values('created',pg_temp.mutate('create_passport','{"request_id": "b4000000-0000-4000-8000-000000000901", "technical": {"natural_level": {"state": "KNOWN", "value": 5}, "porosity": {"state": "UNKNOWN", "value": null}, "technical_notes": "Synthetic note"}}'::jsonb));
select is((select value#>>'{data,core,state}' from results where name='created'),'UNVERIFIED','authorized creation has explicit unverified state');
select is((select jsonb_agg(region.dto->>'type' order by region.dto->>'type') from results r,lateral jsonb_array_elements(r.value#>'{data,regions}') region(dto) where r.name='created'),'["ENDS","MID_LENGTHS","ROOT"]'::jsonb,'creates exactly three standard regions');
select is(pg_temp.mutate('create_passport','{"request_id": "b4000000-0000-4000-8000-000000000901", "technical": {"natural_level": {"state": "KNOWN", "value": 5}, "porosity": {"state": "UNKNOWN", "value": null}, "technical_notes": "Synthetic note"}}'::jsonb),(select value from results where name='created'),'retry returns original result and identifiers');
select is((select count(*) from public.audit_events where correlation_id='b4000000-0000-4000-8000-000000000900'),4::bigint,'retry does not duplicate creation audit');
select is(pg_temp.mutate('create_passport','{}'::jsonb)->>'code','HAIR_PASSPORT_ALREADY_EXISTS','second current passport rejected');
select is(pg_temp.mutate('create_passport','{"request_id": "b4000000-0000-4000-8000-000000000901", "technical": {}}'::jsonb)->>'code','CONFLICT','request key cannot represent changed payload');
select is(pg_temp.mutate('create_passport','{}'::jsonb,'b4000000-0000-4000-8000-000000000032')->>'code','CLIENT_NOT_FOUND','foreign client is inaccessible');
select is(pg_temp.mutate('create_passport','{"organization_id": "b4000000-0000-4000-8000-000000000002"}'::jsonb)->>'code','VALIDATION_FAILED','caller cannot supply organization ownership');
select is(pg_temp.mutate('create_passport','{}'::jsonb,'b4000000-0000-4000-8000-000000000033')#>>'{data,core,state}','NOT_ASSESSED','minimal creation does not manufacture UNKNOWN values');
insert into results values('updated',pg_temp.mutate('update_passport','{"request_id": "b4000000-0000-4000-8000-000000000902", "expected_version": 1, "technical": {"porosity": {"state": "NOT_APPLICABLE", "value": null}}}'::jsonb));
select is((select value#>'{data,core,values,natural_level}' from results where name='updated'),'{"state":"KNOWN","value":5}'::jsonb,'partial update preserves omitted known level');
select is((select value#>>'{data,passport,version}' from results where name='updated'),'2','successful update advances version once');
select is(pg_temp.mutate('update_passport','{"request_id": "b4000000-0000-4000-8000-000000000902", "expected_version": 1, "technical": {"porosity": {"state": "NOT_APPLICABLE", "value": null}}}'::jsonb),(select value from results where name='updated'),'successful update retry precedes stale version check');
select is(pg_temp.mutate('update_passport','{"expected_version": 1, "technical": {"technical_notes": "Stale"}}'::jsonb)->>'code','CONFLICT','stale edit cannot overwrite current state');
select is(pg_temp.mutate('update_passport','{"expected_version": 2, "technical": {"natural_level": {"state": "NOT_ASSESSED", "value": null}, "technical_notes": null}}'::jsonb)#>'{data,core,values,natural_level}','{"state":"NOT_ASSESSED","value":null}'::jsonb,'explicit not-assessed clears a known value');
select ok(exists(select 1 from public.audit_events where action='hair_passport.updated' and metadata->'changed_fields' ?& array['natural_level_state','natural_level','technical_notes']) and not exists(select 1 from public.audit_events where metadata::text like '%Synthetic note%'),'audit contains changed fields without raw notes');
select is(pg_temp.mutate('update_passport','{"expected_version": 3, "technical": {"tone": {"state": "UNKNOWN", "value": null}}, "organization_id": "b4000000-0000-4000-8000-000000000002"}'::jsonb)->>'code','VALIDATION_FAILED','update cannot rewrite organization_id');
select is(pg_temp.mutate('update_passport','{"expected_version": 3, "technical": {"tone": {"state": "UNKNOWN", "value": null}}, "client_id": "b4000000-0000-4000-8000-000000000002"}'::jsonb)->>'code','VALIDATION_FAILED','update cannot rewrite client_id');
select is(pg_temp.mutate('update_passport','{"expected_version": 3, "technical": {"tone": {"state": "UNKNOWN", "value": null}}, "created_by": "b4000000-0000-4000-8000-000000000002"}'::jsonb)->>'code','VALIDATION_FAILED','update cannot rewrite created_by');
select is(pg_temp.mutate('update_passport','{"expected_version": 3, "technical": {"natural_level": {"state": "KNOWN", "value": null}}}'::jsonb)->>'code','INVALID_TECHNICAL_STATE','inconsistent technical state rejected');
select is(pg_temp.mutate('update_passport','{"expected_version": 3, "technical": {"density": {"state": "KNOWN", "value": "INVALID"}}}'::jsonb)->>'code','INVALID_TECHNICAL_STATE','invalid technical enum rejected');
insert into results values('region',pg_temp.mutate('create_region','{"request_id": "b4000000-0000-4000-8000-000000000903", "region_type": "CUSTOM", "label": "Synthetic band", "technical": {"perceived_level": {"state": "KNOWN", "value": 8}}}'::jsonb));
select is((select value#>>'{data,region,type}' from results where name='region'),'CUSTOM','authorized custom region is created');
select is(pg_temp.mutate('create_region','{"request_id": "b4000000-0000-4000-8000-000000000903", "region_type": "CUSTOM", "label": "Synthetic band", "technical": {"perceived_level": {"state": "KNOWN", "value": 8}}}'::jsonb),(select value from results where name='region'),'region creation is retry safe');
select is(pg_temp.mutate('create_region','{"region_type": "ROOT"}'::jsonb)->>'code','HAIR_REGION_ALREADY_EXISTS','existing standard region cannot duplicate');
select is(pg_temp.mutate('create_region','{"region_type": "INVALID"}'::jsonb)->>'code','VALIDATION_FAILED','unknown region type rejected');
select is(pg_temp.mutate('create_region','{"region_type": "CUSTOM"}'::jsonb)->>'code','VALIDATION_FAILED','custom label required');
select is(pg_temp.mutate('create_region','{"region_type": "NAPE"}'::jsonb,'b4000000-0000-4000-8000-000000000032')->>'code','CLIENT_NOT_FOUND','foreign passport cannot receive region');
insert into results values('region_update',pg_temp.mutate('update_region',jsonb_build_object('region_id',(select value#>>'{data,region,id}' from results where name='region'),'expected_version',1,'label','Revised band','technical','{"porosity":{"state":"UNKNOWN","value":null}}'::jsonb)));
select is((select value#>>'{data,region,assessment,values,perceived_level,value}' from results where name='region_update'),'8','region update preserves omitted technical value');
select is((select value#>>'{data,region,version}' from results where name='region_update'),'2','region label and state change share one version');
select is(pg_temp.mutate('update_region','{"region_id": "b4000000-0000-4000-8000-000000000999", "expected_version": 1, "label": "Other"}'::jsonb)->>'code','HAIR_REGION_NOT_FOUND','unknown region does not leak existence');
select is(pg_temp.mutate('update_region',jsonb_build_object('region_id',(select value#>>'{data,region,id}' from results where name='region'),'expected_version',2,'label','Move'),'b4000000-0000-4000-8000-000000000033')->>'code','HAIR_REGION_NOT_FOUND','same tenant different passport cannot capture a region');
select is(pg_temp.mutate('update_region','{"region_id": "b4000000-0000-4000-8000-000000000999", "expected_version": 1, "label": "Move", "passport_id": "b4000000-0000-4000-8000-000000000999"}'::jsonb)->>'code','VALIDATION_FAILED','region parent cannot be rewritten');
select ok((select count(*)=0 from public.hair_observations) and (select count(*)=0 from public.hair_evidence) and (select count(*)=0 from public.hair_physical_tests) and (select count(*)=0 from public.hair_history_events),'core operations never manufacture evidence or history');
select throws_ok($$insert into public.hair_passports(organization_id,client_id) values('b4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000031')$$,'42501','permission denied for table hair_passports','authenticated caller has no privileged direct writes');
select set_config('request.jwt.claim.sub','b4000000-0000-4000-8000-000000000023',true);
select is(pg_temp.mutate('create_passport','{}'::jsonb,'b4000000-0000-4000-8000-000000000031','b4000000-0000-4000-8000-000000000113','b4000000-0000-4000-8000-000000000013')->>'code','FORBIDDEN','assistant cannot create');
select set_config('request.jwt.claim.sub','b4000000-0000-4000-8000-000000000021',true);
select is(pg_temp.mutate('update_passport','{"expected_version": 3, "technical": {"technical_notes": "Bad scope"}}'::jsonb,'b4000000-0000-4000-8000-000000000031','b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000012')->>'code','TENANT_CONTEXT_INVALID','arbitrary location cannot authorize');
-- Existing evidence is fixture setup through the prior internal writer, never through this service.
reset role;
set local role elifora_hair_writer;
insert into public.hair_evidence(id,organization_id,client_id,passport_id,source_type)
 select 'b4000000-0000-4000-8000-000000000061',organization_id,client_id,id,'IMPORTED_UNVERIFIED'
 from public.hair_passports where client_id='b4000000-0000-4000-8000-000000000033';
insert into public.hair_observations(id,organization_id,client_id,passport_id,evidence_id,natural_level_state,natural_level)
 select 'b4000000-0000-4000-8000-000000000071',organization_id,client_id,id,'b4000000-0000-4000-8000-000000000061','KNOWN',6
 from public.hair_passports where client_id='b4000000-0000-4000-8000-000000000033';
insert into public.hair_observations(id,organization_id,client_id,passport_id,region_id,evidence_id,perceived_level_state,perceived_level)
 select 'b4000000-0000-4000-8000-000000000072',organization_id,client_id,passport_id,id,'b4000000-0000-4000-8000-000000000061','KNOWN',8
 from public.hair_regions where client_id='b4000000-0000-4000-8000-000000000033' and region_type='ROOT';
update public.hair_passports set current_observation_id='b4000000-0000-4000-8000-000000000071' where client_id='b4000000-0000-4000-8000-000000000033';
update public.hair_regions set current_observation_id='b4000000-0000-4000-8000-000000000072' where client_id='b4000000-0000-4000-8000-000000000033' and region_type='ROOT';
set local role authenticated;
select is(pg_temp.mutate('update_passport','{"expected_version":2,"technical":{"porosity":{"state":"UNKNOWN","value":null}}}','b4000000-0000-4000-8000-000000000033')#>>'{data,core,values,natural_level,value}','6','first core edit retains omitted values from existing observation');
select is(pg_temp.mutate('update_region',jsonb_build_object('expected_version',2,'region_id',(select id from public.hair_regions where client_id='b4000000-0000-4000-8000-000000000033' and region_type='ROOT'),'technical','{"porosity":{"state":"UNKNOWN","value":null}}'::jsonb),'b4000000-0000-4000-8000-000000000033')#>>'{data,region,assessment,values,perceived_level,value}','8','first regional edit retains omitted observation values');
select ok((select count(*)=2 from public.hair_observations) and (select count(*)=1 from public.hair_evidence) and
 (select current_observation_id='b4000000-0000-4000-8000-000000000071' from public.hair_passports where client_id='b4000000-0000-4000-8000-000000000033'),'core edits retain existing observation identity and do not create provenance');
reset role; delete from public.role_permissions where role_code='owner' and permission_code='hair_passport.update';
insert into public.clients(id,organization_id,full_name,phone,phone_normalized,created_by,updated_by,creation_location_id) values('b4000000-0000-4000-8000-000000000034','b4000000-0000-4000-8000-000000000001','Create only','+905321111111','+905321111111','b4000000-0000-4000-8000-000000000021','b4000000-0000-4000-8000-000000000021','b4000000-0000-4000-8000-000000000011');
set local role authenticated;
select is(jsonb_array_length(pg_temp.mutate('create_passport','{}'::jsonb,'b4000000-0000-4000-8000-000000000034')#>'{data,regions}'),3,'create-only permission initializes all defaults atomically');
select is(pg_temp.mutate('create_region','{"region_type": "NAPE"}'::jsonb)->>'code','FORBIDDEN','create-only permission cannot add arbitrary regions');
reset role; insert into public.role_permissions(role_code,permission_code) values('owner','hair_passport.update');
set local role elifora_hair_writer;
update public.hair_regions set status='ARCHIVED' where id=(select (value#>>'{data,region,id}')::uuid from results where name='region');
set local role authenticated;
select is(pg_temp.mutate('update_region',jsonb_build_object('region_id',(select value#>>'{data,region,id}' from results where name='region'),'expected_version',3,'label','Archived'))->>'code','HAIR_REGION_NOT_FOUND','archived region cannot be edited');
reset role; update public.clients set status='ARCHIVED' where id='b4000000-0000-4000-8000-000000000031';set local role authenticated;
select is(pg_temp.mutate('create_passport','{"request_id": "b4000000-0000-4000-8000-000000000901", "technical": {"natural_level": {"state": "KNOWN", "value": 5}, "porosity": {"state": "UNKNOWN", "value": null}, "technical_notes": "Synthetic note"}}'::jsonb)->>'code','CLIENT_ARCHIVED','archived client blocks even a successful receipt replay');
reset role; update public.clients set status='ACTIVE' where id='b4000000-0000-4000-8000-000000000031';set local role elifora_hair_writer; update public.hair_passports set status='ARCHIVED' where client_id='b4000000-0000-4000-8000-000000000031';set local role authenticated;
select is(pg_temp.mutate('update_passport','{"expected_version": 4, "technical": {"technical_notes": "Archived"}}'::jsonb)->>'code','HAIR_PASSPORT_NOT_FOUND','archived passport cannot be edited');
reset role; update public.salon_memberships set status='revoked',revoked_at=now() where id='b4000000-0000-4000-8000-000000000111';set local role authenticated;
select is(pg_temp.mutate('update_passport','{"expected_version": 1, "technical": {"technical_notes": "Revoked"}}'::jsonb,'b4000000-0000-4000-8000-000000000033')->>'code','MEMBERSHIP_REVOKED','revoked membership stops all mutation access');
reset role; select * from finish(); rollback;
