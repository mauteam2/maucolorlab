begin;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('ab500000-0000-4000-8000-000000000001','invite-a@example.invalid'),
 ('ab500000-0000-4000-8000-000000000002','invite-b@example.invalid'),
 ('ab500000-0000-4000-8000-000000000003','invite-owner@example.invalid');
insert into public.organizations(id,name,slug,base_currency) values
 ('ab510000-0000-4000-8000-000000000001','Synthetic Invite A','synthetic-invite-a','TRY'),
 ('ab510000-0000-4000-8000-000000000002','Synthetic Invite B','synthetic-invite-b','TRY');
insert into public.locations(id,organization_id,name,timezone) values
 ('ab520000-0000-4000-8000-000000000001','ab510000-0000-4000-8000-000000000001','Synthetic Main','Europe/Istanbul'),
 ('ab520000-0000-4000-8000-000000000002','ab510000-0000-4000-8000-000000000002','Synthetic Foreign','Europe/Istanbul');
insert into public.salon_memberships(id,organization_id,location_id,user_id,role_code,status,created_by) values
 ('ab530000-0000-4000-8000-000000000001','ab510000-0000-4000-8000-000000000001','ab520000-0000-4000-8000-000000000001','ab500000-0000-4000-8000-000000000001','colorist','invited','ab500000-0000-4000-8000-000000000003'),
 ('ab530000-0000-4000-8000-000000000002','ab510000-0000-4000-8000-000000000002','ab520000-0000-4000-8000-000000000002','ab500000-0000-4000-8000-000000000002','reception','invited','ab500000-0000-4000-8000-000000000003'),
 ('ab530000-0000-4000-8000-000000000003','ab510000-0000-4000-8000-000000000002',null,'ab500000-0000-4000-8000-000000000001','manager','invited',null),
 ('ab530000-0000-4000-8000-000000000004','ab510000-0000-4000-8000-000000000001',null,'ab500000-0000-4000-8000-000000000003','owner','invited',null);
create temporary table invitation_before as select to_jsonb(m) as data from public.salon_memberships m where id='ab530000-0000-4000-8000-000000000001';
create temporary table invitation_seats_before as select count(distinct user_id) as seats from public.salon_memberships where organization_id='ab510000-0000-4000-8000-000000000001' and status in ('active','invited');
create temporary table invitation_results(key text primary key,data jsonb);
grant all on invitation_results to authenticated;
create function pg_temp.accept_invite(mid uuid,rid uuid default 'ab540000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select public.accept_my_membership_invitation(mid,rid,'ab550000-0000-4000-8000-000000000001');$$;
select ok(not has_function_privilege('anon','public.accept_my_membership_invitation(uuid,uuid,uuid)','EXECUTE'),'anon cannot execute acceptance');
select ok(not has_function_privilege('service_role','public.accept_my_membership_invitation(uuid,uuid,uuid)','EXECUTE'),'service role has no acceptance grant');
select ok(not has_function_privilege('anon','public.read_my_membership_invitations(uuid)','EXECUTE'),'anon cannot read invitations');
select ok(not has_function_privilege('service_role','public.read_my_membership_invitations(uuid)','EXECUTE'),'service role cannot read invitations');
select ok(not has_function_privilege('authenticated','app_private.membership_invitation_view(public.salon_memberships)','EXECUTE'),'projection helper is private');
select ok(not has_table_privilege('authenticated','app_private.membership_acceptance_receipts','SELECT'),'private receipts are not client-readable');
select is(pg_temp.accept_invite('ab530000-0000-4000-8000-000000000001')->>'code','UNAUTHENTICATED','missing auth.uid rejected even under privileged SQL');
set local role anon;
select throws_ok($$select public.accept_my_membership_invitation(null,null,null)$$,'42501',null,'actual anon role rejected');
reset role;
select set_config('request.jwt.claim.sub','ab500000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.list_workspace_contexts()),0::bigint,'invited identity has no workspace');
select ok(not app_private.user_has_permission('ab510000-0000-4000-8000-000000000001','ab520000-0000-4000-8000-000000000001','clients.read'),'invited identity has no salon permission');
select is((select count(*) from public.organizations),0::bigint,'base tenant RLS still hides invited organization');
select is((select count(*) from public.salon_memberships),0::bigint,'ordinary membership RLS not widened for invites');
select is(jsonb_array_length(public.read_my_membership_invitations()->'data'),2,'only own pending invitations returned');
select is(public.read_my_membership_invitations('ab530000-0000-4000-8000-000000000002')->>'code','INVITATION_NOT_FOUND','foreign state lookup is non-enumerating');
select is(public.read_my_membership_invitations('ab530000-0000-4000-8000-000000000099')->>'code','INVITATION_NOT_FOUND','absent state lookup matches foreign');
select is(pg_temp.accept_invite('ab530000-0000-4000-8000-000000000002')->>'code','INVITATION_NOT_FOUND','foreign accept matches absent');
select is(pg_temp.accept_invite('ab530000-0000-4000-8000-000000000099')->>'code','INVITATION_NOT_FOUND','absent accept is non-enumerating');
select is(public.accept_my_membership_invitation('ab530000-0000-4000-8000-000000000001',null,gen_random_uuid())->>'code','VALIDATION_FAILED','missing request identifier denied');
select is(public.accept_my_membership_invitation('ab530000-0000-4000-8000-000000000001',gen_random_uuid(),null)->>'code','VALIDATION_FAILED','missing correlation denied');
insert into invitation_results values('first',pg_temp.accept_invite('ab530000-0000-4000-8000-000000000001'));
select is((select data->'data'->>'state' from invitation_results where key='first'),'ACTIVE','recipient can explicitly accept');
select is((select count(*) from public.list_workspace_contexts()),1::bigint,'fresh workspace RPC now sees accepted membership');
select ok(app_private.user_has_permission('ab510000-0000-4000-8000-000000000001','ab520000-0000-4000-8000-000000000001','clients.read'),'normal active permission activates naturally');
select ok(not app_private.user_has_permission('ab510000-0000-4000-8000-000000000001',null,'memberships.manage'),'colorist cannot choose owner permissions');
select is((select count(*) from public.organizations),1::bigint,'normal RLS exposes own organization only');
select throws_ok($$update public.salon_memberships set role_code='owner'$$,'42501',null,'direct role rewrite remains denied');
insert into invitation_results values('retry',pg_temp.accept_invite('ab530000-0000-4000-8000-000000000001'));
insert into invitation_results values('fresh-request',pg_temp.accept_invite('ab530000-0000-4000-8000-000000000001',gen_random_uuid()));
select is((select data from invitation_results where key='first'),(select data from invitation_results where key='retry'),'exact request retry returns canonical result');
select is((select data->'data' from invitation_results where key='first'),(select data->'data' from invitation_results where key='fresh-request'),'new request on already-active membership preserves canonical result');
select is(pg_temp.accept_invite('ab530000-0000-4000-8000-000000000003')->>'code','INVITATION_REPLAY_CONFLICT','actor request namespace cannot change target across organizations');
select is(jsonb_array_length(public.read_my_membership_invitations()->'data'),1,'accepted item no longer in pending list');
select is(public.read_my_membership_invitations('ab530000-0000-4000-8000-000000000001')->'data'->0->>'state','ACTIVE','explicit own active state remains readable');
reset role;
select is((select status from public.salon_memberships where id='ab530000-0000-4000-8000-000000000001'),'active','persisted state is active');
select ok((select joined_at is not null from public.salon_memberships where id='ab530000-0000-4000-8000-000000000001'),'authoritative joined_at set');
select is((select count(distinct user_id) from public.salon_memberships where organization_id='ab510000-0000-4000-8000-000000000001' and status in ('active','invited')),(select seats from invitation_seats_before),'reserved distinct-person seat count unchanged after acceptance and retries');
select is((select to_jsonb(m)-array['status','joined_at','updated_at'] from public.salon_memberships m where id='ab530000-0000-4000-8000-000000000001'),(select data-array['status','joined_at','updated_at'] from invitation_before),'role scope user invitation attribution unchanged');
select is((select count(*) from public.audit_events where action='membership.invite_accepted' and entity_id='ab530000-0000-4000-8000-000000000001'),1::bigint,'only first transition audited');
select ok((select bool_and(organization_id='ab510000-0000-4000-8000-000000000001') from app_private.membership_acceptance_receipts where membership_id='ab530000-0000-4000-8000-000000000001'),'immutable request provenance carries explicit organization ownership');
select ok((select actor_user_id='ab500000-0000-4000-8000-000000000001' and organization_id='ab510000-0000-4000-8000-000000000001' and correlation_id='ab550000-0000-4000-8000-000000000001' and metadata=jsonb_build_object('request_id','ab540000-0000-4000-8000-000000000001'::uuid) from public.audit_events where action='membership.invite_accepted' and entity_id='ab530000-0000-4000-8000-000000000001'),'audit contains actor entity org correlation and only request provenance');
select throws_ok($$update app_private.membership_acceptance_receipts set membership_id='ab530000-0000-4000-8000-000000000003'$$,'23514','IMMUTABLE_LIVE_HISTORY','request bindings immutable');
select throws_ok($$delete from app_private.membership_acceptance_receipts$$,'23514','IMMUTABLE_LIVE_HISTORY','request bindings cannot be deleted');
update public.salon_memberships set status='revoked',revoked_at=now() where id='ab530000-0000-4000-8000-000000000001';
set local role authenticated;
select is(pg_temp.accept_invite('ab530000-0000-4000-8000-000000000001')->>'code','INVITATION_REVOKED','old success receipt cannot reactivate revoked member');
select is(public.read_my_membership_invitations('ab530000-0000-4000-8000-000000000001')->'data'->0->>'state','REVOKED','own revoked state explicit');
select is((select count(*) from public.list_workspace_contexts()),0::bigint,'revocation still removes workspace');
select ok(not app_private.user_has_permission('ab510000-0000-4000-8000-000000000001','ab520000-0000-4000-8000-000000000001','clients.read'),'revocation still removes permission');
reset role;
update public.organizations set archived_at=now() where id='ab510000-0000-4000-8000-000000000002';
set local role authenticated;
select is(public.read_my_membership_invitations('ab530000-0000-4000-8000-000000000003')->'data'->0->>'state','ORGANIZATION_UNAVAILABLE','own archived org context explicit');
select is(pg_temp.accept_invite('ab530000-0000-4000-8000-000000000003','ab540000-0000-4000-8000-000000000005')->>'code','INVITATION_UNAVAILABLE','archived organization cannot be accepted');
select is(pg_temp.accept_invite('ab530000-0000-4000-8000-000000000001','ab540000-0000-4000-8000-000000000005')->>'code','INVITATION_REPLAY_CONFLICT','failed own unavailable request cannot be transferred to another owned target');
reset role;
update public.organizations set archived_at=null where id='ab510000-0000-4000-8000-000000000002';
update public.locations set archived_at=now() where id='ab520000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','ab500000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(public.read_my_membership_invitations('ab530000-0000-4000-8000-000000000002')->'data'->0->>'state','LOCATION_UNAVAILABLE','archived scoped location explicit');
select is(pg_temp.accept_invite('ab530000-0000-4000-8000-000000000002')->>'code','INVITATION_UNAVAILABLE','archived scoped location acceptance blocked');
reset role;
select is((select status from public.salon_memberships where id='ab530000-0000-4000-8000-000000000002'),'invited','archive does not silently change scope/status');
update public.locations set archived_at=null where id='ab520000-0000-4000-8000-000000000002';
set local role authenticated;
select is(pg_temp.accept_invite('ab530000-0000-4000-8000-000000000002')->'data'->>'role_code','reception','same request UUID belongs to each actor independently');
select ok(not app_private.user_has_permission('ab510000-0000-4000-8000-000000000002','ab520000-0000-4000-8000-000000000002','hair_passport.read'),'accepted reception gains no technical permission');
reset role;
select set_config('request.jwt.claim.sub','ab500000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(pg_temp.accept_invite('ab530000-0000-4000-8000-000000000004')->'data'->>'role_code','owner','legitimately existing invited owner record may be accepted');
reset role;
select is((select count(*) from public.organizations where id in ('ab510000-0000-4000-8000-000000000001','ab510000-0000-4000-8000-000000000002')),2::bigint,'acceptance creates no organization');
select is((select count(*) from public.salon_memberships where organization_id in ('ab510000-0000-4000-8000-000000000001','ab510000-0000-4000-8000-000000000002')),4::bigint,'no duplicate membership or seat');
-- Real authenticated JWT session revocation remains enforced inside RPC too.
select set_config('request.jwt.claims','{"sub":"ab500000-0000-4000-8000-000000000003","role":"authenticated","session_id":"ab560000-0000-4000-8000-000000000099"}',true);
set local role authenticated;
select throws_ok($$select public.read_my_membership_invitations()$$,'PT401','SESSION_EXPIRED','read rejects noncurrent provider session');
select throws_ok($$select pg_temp.accept_invite('ab530000-0000-4000-8000-000000000004')$$,'PT401','SESSION_EXPIRED','acceptance rejects noncurrent provider session');
reset role;
select * from finish();
rollback;
