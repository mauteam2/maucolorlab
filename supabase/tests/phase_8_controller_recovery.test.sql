begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/gate-1-live.inc

create function pg_temp.recovery_packet(device uuid default 'b4000000-0000-4000-8000-000000000982',extra jsonb default '{}') returns jsonb language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('organizationId',s.organization_id,'actorId',auth.uid(),'membershipId','b4000000-0000-4000-8000-000000000111','locationId',s.location_id,'sessionId',s.id,'previousHash',s.content_hash,'resultHash',repeat('f',64),'expiresAt',statement_timestamp()+interval '2 minutes',
 'input',jsonb_build_object('type','RECOVER_CONTROL','mutation_id',gen_random_uuid(),'device_id',device,'expected_version',s.record_version,'control_epoch',s.control_epoch,'reason','Synthetic controller device lost'),
 'result',s.payload||jsonb_build_object('recordVersion',s.record_version+1,'updatedAt',statement_timestamp(),'controllerUserId',auth.uid(),'controllerDeviceId',device,'controlEpoch',s.control_epoch+1,
 'deviations',s.payload->'deviations'||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'type','PROFESSIONAL_DECISION','reason','Synthetic controller device lost','changedBy',auth.uid(),'at',statement_timestamp(),'before',jsonb_build_object('user',s.controller_user_id,'device',s.controller_device_id,'epoch',s.control_epoch),'after',jsonb_build_object('user',auth.uid(),'device',device,'epoch',s.control_epoch+1))))||extra)
 from public.live_sessions s where id='b4000000-0000-4000-8000-000000000803';
$$;
insert into result values('recovery-before',(select payload from public.live_sessions where id='b4000000-0000-4000-8000-000000000803'));
set local role authenticated;
insert into result values('recovery-packet',pg_temp.recovery_packet());
insert into result values('recovery-accepted',pg_temp.live_store((select value from result where name='recovery-packet')));
select is((select value->>'controllerDeviceId' from result where name='recovery-accepted'),'b4000000-0000-4000-8000-000000000982','owner recovers lost controller without old-device confirmation');
select is((select value->>'controlEpoch' from result where name='recovery-accepted'),'2','recovery increments epoch exactly once');
select is((select value-array['recordVersion','updatedAt','controllerUserId','controllerDeviceId','controlEpoch','deviations'] from result where name='recovery-accepted'),(select value-array['recordVersion','updatedAt','controllerUserId','controllerDeviceId','controlEpoch','deviations'] from result where name='recovery-before'),'all technical state, timer anchors and history preserved');
select is(pg_temp.live_store((select value from result where name='recovery-packet')),(select value from result where name='recovery-accepted'),'recovery replay returns original acceptance without new epoch');
select is(pg_temp.live_store(pg_temp.recovery_packet('b4000000-0000-4000-8000-000000000983','{"status":"IN_PROGRESS"}'))->>'code','LIVE_RESULT_INVALID','signed recovery cannot alter technical execution');
select is(pg_temp.live_store(pg_temp.recovery_packet('b4000000-0000-4000-8000-000000000983','{"controlEpoch":100}'))->>'code','LIVE_RESULT_INVALID','signed recovery cannot choose an arbitrary epoch');
reset role;
select is((select count(*) from public.audit_events where action='live_session.recover_control'),1::bigint,'one immutable recovery audit');
select ok((select metadata#>>'{previous_controller,epoch}'='1' and metadata#>>'{new_controller,epoch}'='2' and metadata->>'reason'='Synthetic controller device lost' and metadata ? 'subscription' and metadata ? 'recovered_at' from public.audit_events where action='live_session.recover_control'),'audit includes old/new controller, epoch, reason, time and freshly locked subscription state');
select is((select count(*) from public.live_session_versions where input->>'type'='RECOVER_CONTROL'),1::bigint,'one accepted recovery version');
update public.salon_memberships set role_code='colorist' where id='b4000000-0000-4000-8000-000000000111';
set local role authenticated;
select is(pg_temp.live_store(pg_temp.recovery_packet())->>'code','FORBIDDEN','normal colorist control cannot exercise recovery permission');
reset role;
update public.salon_memberships set role_code='manager' where id='b4000000-0000-4000-8000-000000000111';
set local role authenticated;
select is(pg_temp.live_store(pg_temp.recovery_packet('b4000000-0000-4000-8000-000000000984'))->>'controlEpoch','3','active manager can recover');
reset role;
update public.salon_memberships set status='revoked',revoked_at=now() where id='b4000000-0000-4000-8000-000000000111';
set local role authenticated;
select is(pg_temp.live_store(pg_temp.recovery_packet())->>'code','MEMBERSHIP_REVOKED','revoked membership cannot recover');
select is((select count(*) from public.live_sessions),0::bigint,'revocation still conceals live state with RLS');
reset role;
select * from finish();rollback;
