begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/gate-1-identity.sql
-- Remove only synthetic resource allocations before moving this test appointment.
delete from public.salon_appointment_resources where appointment_id='a4000000-0000-4000-8000-000000000301';
create function pg_temp.merge_command() returns jsonb language sql volatile as $$select jsonb_build_object('type','MERGE','mutation_id',gen_random_uuid(),'review_token',pg_temp.crmread('{"operation":"merge_review","source_client_id":"a4000000-0000-4000-8000-000000000031","target_client_id":"a4000000-0000-4000-8000-000000000032"}')#>>'{data,review_token}','decisions',(select jsonb_object_agg(f,'TARGET') from unnest(array['full_name','phone','email','birth_date','preferred_staff_id','preferred_service_ids','request_notes','preferred_channel','allow_manual_contact','do_not_contact']) f));$$;
update public.salon_appointments set status='CONFIRMED',completed_at=null where id='a4000000-0000-4000-8000-000000000301';
set local role authenticated;
select is(pg_temp.crm(pg_temp.merge_command())->>'code','CRM_MERGE_ACTIVE_OPERATION','confirmed source appointment blocks merge');
select is((select status from public.clients where id='a4000000-0000-4000-8000-000000000031'),'ACTIVE','blocked merge never archives identity');
reset role;
update public.salon_appointments set status='ARRIVED' where id='a4000000-0000-4000-8000-000000000301';set local role authenticated;
select is(pg_temp.crm(pg_temp.merge_command())->>'code','CRM_MERGE_ACTIVE_OPERATION','arrived appointment blocks merge');reset role;
update public.salon_appointments set status='IN_SERVICE',client_id='a4000000-0000-4000-8000-000000000032' where id='a4000000-0000-4000-8000-000000000301';set local role authenticated;
select is(pg_temp.crm(pg_temp.merge_command())->>'code','CRM_MERGE_ACTIVE_OPERATION','target family active service also blocks merge');reset role;
-- Organization-wide identity requires checks beyond the operator's current location.
insert into public.locations(id,organization_id,name,timezone) values('a4000000-0000-4000-8000-000000000019','a4000000-0000-4000-8000-000000000001','Synthetic other branch','Europe/Istanbul');
insert into public.salon_staff select (jsonb_populate_record(null::public.salon_staff,to_jsonb(s)||jsonb_build_object('location_id','a4000000-0000-4000-8000-000000000019'))).* from public.salon_staff s where membership_id='a4000000-0000-4000-8000-000000000111' and location_id='a4000000-0000-4000-8000-000000000011';
update public.salon_appointments set location_id='a4000000-0000-4000-8000-000000000019' where id='a4000000-0000-4000-8000-000000000301';set local role authenticated;
select is(pg_temp.crm(pg_temp.merge_command())->>'code','CRM_MERGE_ACTIVE_OPERATION','active operation in another branch blocks global identity merge');reset role;
update public.salon_appointments set status='COMPLETED',completed_at=now() where id='a4000000-0000-4000-8000-000000000301';set local role authenticated;
insert into salon_results values('gate-merge',pg_temp.crm(pg_temp.merge_command()));
select ok((select value ? 'data' from salon_results where name='gate-merge'),'terminal history does not block merge');
select is((select client_id::text from public.salon_appointments where id='a4000000-0000-4000-8000-000000000301'),'a4000000-0000-4000-8000-000000000032','historical appointment attribution was not moved');
select is((select client_id::text from public.hair_passports where id='a4000000-0000-4000-8000-000000000701'),'a4000000-0000-4000-8000-000000000031','historical passport attribution was not moved');
reset role;
select ok((select m.source_after_version=s.version and m.target_after_version=t.version from public.client_merge_operations m join public.clients s on s.id=m.source_client_id join public.clients t on t.id=m.target_client_id where m.id=(select (value#>>'{data,id}')::uuid from salon_results where name='gate-merge')),'stored after versions equal actual returned versions');
insert into public.clients(id,organization_id,full_name,phone,phone_normalized,created_by,updated_by,creation_location_id) values('a4000000-0000-4000-8000-000000000035','a4000000-0000-4000-8000-000000000001','Synthetic chain target','+905321234567','+905321234567','a4000000-0000-4000-8000-000000000021','a4000000-0000-4000-8000-000000000021','a4000000-0000-4000-8000-000000000011');
create function pg_temp.chain_command() returns jsonb language sql volatile as $$select jsonb_build_object('type','MERGE','mutation_id',gen_random_uuid(),'review_token',pg_temp.crmread('{"operation":"merge_review","source_client_id":"a4000000-0000-4000-8000-000000000032","target_client_id":"a4000000-0000-4000-8000-000000000035"}')#>>'{data,review_token}','decisions',(select jsonb_object_agg(f,'TARGET') from unnest(array['full_name','phone','email','birth_date','preferred_staff_id','preferred_service_ids','request_notes','preferred_channel','allow_manual_contact','do_not_contact']) f));$$;
-- Legacy alias activity must still block a second merge of the canonical family.
update public.salon_appointments set client_id='a4000000-0000-4000-8000-000000000031',status='CONFIRMED',completed_at=null where id='a4000000-0000-4000-8000-000000000301';set local role authenticated;
select is(pg_temp.crm(pg_temp.chain_command())->>'code','CRM_MERGE_ACTIVE_OPERATION','active alias record blocks chained canonical-family merge');reset role;
update public.salon_appointments set status='CANCELLED',cancelled_at=now() where id='a4000000-0000-4000-8000-000000000301';set local role authenticated;
insert into salon_results values('gate-chain',pg_temp.crm(pg_temp.chain_command()));
select ok((select value ? 'data' from salon_results where name='gate-chain'),'terminal alias history allows reviewed chain');
select is((select count(*) from public.client_merge_links where target_client_id='a4000000-0000-4000-8000-000000000035'),2::bigint,'A to B to C has two flattened unique aliases');
select throws_ok($$select app_private.crm_merge_has_active_operation('a4000000-0000-4000-8000-000000000111','a4000000-0000-4000-8000-000000000011','a4000000-0000-4000-8000-000000000031','a4000000-0000-4000-8000-000000000032')$$,'42501',null,'unexposed merge probe not callable by ordinary authenticated role');
reset role;
select * from finish();rollback;
