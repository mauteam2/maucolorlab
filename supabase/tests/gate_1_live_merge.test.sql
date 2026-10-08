begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/gate-1-live.inc
update public.salon_memberships set location_id=null where id='b4000000-0000-4000-8000-000000000111';
insert into public.clients(id,organization_id,full_name,phone,phone_normalized,created_by,updated_by,creation_location_id) values('b4000000-0000-4000-8000-000000000032','b4000000-0000-4000-8000-000000000001','Synthetic live target','+905321111111','+905321111111','b4000000-0000-4000-8000-000000000021','b4000000-0000-4000-8000-000000000021','b4000000-0000-4000-8000-000000000011');
create function pg_temp.merge_guard(status text,loc uuid default 'b4000000-0000-4000-8000-000000000011') returns jsonb language plpgsql as $$declare response jsonb;begin
 update public.live_sessions set status=merge_guard.status,record_version=record_version+1,payload=payload||jsonb_build_object('status',merge_guard.status,'recordVersion',record_version+1) where id='b4000000-0000-4000-8000-000000000803';
 set local role authenticated;
 select public.crm_operation('b4000000-0000-4000-8000-000000000111',loc,jsonb_build_object('type','MERGE','mutation_id',gen_random_uuid(),'review_token',public.crm_read('b4000000-0000-4000-8000-000000000111',loc,'{"operation":"merge_review","source_client_id":"b4000000-0000-4000-8000-000000000031","target_client_id":"b4000000-0000-4000-8000-000000000032"}')#>>'{data,review_token}','decisions',(select jsonb_object_agg(f,'TARGET') from unnest(array['full_name','phone','email','birth_date','preferred_staff_id','preferred_service_ids','request_notes','preferred_channel','allow_manual_contact','do_not_contact']) f)),gen_random_uuid()) into response;
 reset role;return response;
end $$;
select is(pg_temp.merge_guard(s)->>'code','CRM_MERGE_ACTIVE_OPERATION',s||' live operation blocks merge') from unnest(array['PREPARING','READY','IN_PROGRESS','PAUSED','CHECKPOINT_REQUIRED','COMPLETION_REVIEW']) s;
set local role authenticated;
select is(public.client_operation('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011','archive',jsonb_build_object('client_id','b4000000-0000-4000-8000-000000000031','expected_version',1,'request_id',gen_random_uuid()),gen_random_uuid())->>'code','CRM_MERGE_ACTIVE_OPERATION','active live session blocks manual archive');reset role;
insert into public.locations(id,organization_id,name,timezone) values('b4000000-0000-4000-8000-000000000019','b4000000-0000-4000-8000-000000000001','Synthetic other branch','Europe/Istanbul');
select is(pg_temp.merge_guard('PAUSED','b4000000-0000-4000-8000-000000000019')->>'code','CRM_MERGE_ACTIVE_OPERATION','other location live operation blocks global merge');
select ok(pg_temp.merge_guard('ABORTED') ? 'data','terminal stopped live history allows merge');
select is((select client_id::text from public.live_sessions where id='b4000000-0000-4000-8000-000000000803'),'b4000000-0000-4000-8000-000000000031','stopped technical identity remains original');
set local role authenticated;
select is(public.client_operation('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011','archive',jsonb_build_object('client_id','b4000000-0000-4000-8000-000000000032','expected_version',2,'request_id',gen_random_uuid()),gen_random_uuid())#>>'{data,status}','ARCHIVED','terminal family history allows manual archive');reset role;
select * from finish();rollback;
