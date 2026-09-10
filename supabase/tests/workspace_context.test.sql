begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(23);
insert into auth.users (id, email, raw_user_meta_data) values
 ('11000000-0000-4000-8000-000000000001','workspace-a@elifora.test','{}'),
 ('11000000-0000-4000-8000-000000000002','workspace-b@elifora.test','{}');
insert into public.organizations(id,name,slug,base_currency) values
 ('21000000-0000-4000-8000-000000000001','Workspace A','workspace-a','TRY'),
 ('21000000-0000-4000-8000-000000000002','Workspace B','workspace-b','TRY');
insert into public.locations(id,organization_id,name,timezone) values
 ('31000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','Bolu','Europe/Istanbul'),
 ('31000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000001','İzmit','Europe/Istanbul'),
 ('31000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000002','B location','Europe/Istanbul');
insert into public.salon_memberships(id,organization_id,location_id,user_id,role_code,status,joined_at) values
 ('41000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','owner','active',now()),
 ('41000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002',null,'11000000-0000-4000-8000-000000000002','owner','active',now());
set local role anon;
select throws_ok($$select * from public.list_workspace_contexts()$$,'42501',null,'anonymous cannot discover workspaces');
reset role;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.list_workspace_contexts()),1::bigint,'own active membership is usable');
select is((select membership_id from public.list_workspace_contexts()),'41000000-0000-4000-8000-000000000001'::uuid,'only own membership returned');
select is((select count(*) from public.list_workspace_contexts() where organization_id='21000000-0000-4000-8000-000000000002'),0::bigint,'manipulated organization filter cannot escape RLS');
select is((select count(*) from public.list_workspace_contexts() where location_id='31000000-0000-4000-8000-000000000002'),0::bigint,'location scope cannot escape');
select is((select membership_status from public.list_workspace_contexts()),'active','status is active');
select is((select role from public.list_workspace_contexts()),'owner','role comes from membership');
select ok((select cardinality(permissions)>0 from public.list_workspace_contexts()),'permissions resolved on server');
select throws_ok($$insert into public.organizations(name,slug,base_currency) values ('Forged','forged','TRY')$$,'42501',null,'bootstrap cannot create organizations');
select throws_ok($$insert into public.locations(organization_id,name,timezone) values ('21000000-0000-4000-8000-000000000001','Forged','Europe/Istanbul')$$,'42501',null,'bootstrap cannot create locations');
select throws_ok($$update public.salon_memberships set role_code='owner'$$,'42501',null,'selection cannot alter membership');
select throws_ok($$insert into public.salon_memberships(organization_id,user_id,role_code,status) values ('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','owner','active')$$,'42501',null,'selection cannot forge membership');
reset role;
select is((select count(*) from public.organizations),2::bigint,'selection did not mutate organizations');
select is((select count(*) from public.salon_memberships),2::bigint,'selection did not mutate memberships');
-- Organization-wide membership expands only to its actual active locations.
update public.salon_memberships set location_id=null where id='41000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*) from public.list_workspace_contexts()),2::bigint,'organization scope expands to two usable locations');
reset role;
select is(app_private.user_has_permission('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','memberships.read'),true,'real assigned location has permission');
select is(app_private.user_has_permission('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000099','memberships.read'),false,'nonexistent location is denied');
select is(app_private.user_has_permission('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000003','memberships.read'),false,'foreign organization location is denied');
update public.locations set archived_at=now() where id='31000000-0000-4000-8000-000000000002';
set local role authenticated;
select is((select count(*) from public.list_workspace_contexts()),1::bigint,'archived locations excluded');
reset role;
-- Unrelated user in same organization: owner may inspect memberships under Phase 0 policies,
-- but discovery deliberately returns only the caller's own memberships.
insert into public.salon_memberships(organization_id,location_id,user_id,role_code,status,joined_at)
values ('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','assistant','active',now());
set local role authenticated;
select is((select count(*) from public.list_workspace_contexts()),1::bigint,'even owner discovery excludes other users in same salon');
reset role;
update public.salon_memberships set status='revoked', revoked_at=now() where id='41000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*) from public.list_workspace_contexts()),0::bigint,'revocation removes usable context with existing JWT');
select is((select count(*) from public.locations),0::bigint,'revoked account loses protected salon access immediately');
reset role;
select is((select count(*) from auth.users where id='11000000-0000-4000-8000-000000000001'),1::bigint,'revocation preserves auth account');
select * from finish();
rollback;
