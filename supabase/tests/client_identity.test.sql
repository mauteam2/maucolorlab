begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(63);
insert into auth.users(id,email,raw_user_meta_data) values
 ('12000000-0000-4000-8000-000000000001','client-owner-a@elifora.test','{}'),
 ('12000000-0000-4000-8000-000000000002','client-owner-b@elifora.test','{}'),
 ('12000000-0000-4000-8000-000000000003','client-assistant@elifora.test','{}');
insert into public.organizations(id,name,slug,base_currency) values
 ('22000000-0000-4000-8000-000000000001','Clients A','clients-a','TRY'),
 ('22000000-0000-4000-8000-000000000002','Clients B','clients-b','TRY');
insert into public.locations(id,organization_id,name,timezone) values
 ('32000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','Bolu','Europe/Istanbul'),
 ('32000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000001','İzmit','Europe/Istanbul'),
 ('32000000-0000-4000-8000-000000000003','22000000-0000-4000-8000-000000000002','Berlin','Europe/Berlin');
insert into public.salon_memberships(id,organization_id,location_id,user_id,role_code,status,joined_at) values
 ('42000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','owner','active',now()),
 ('42000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002',null,'12000000-0000-4000-8000-000000000002','owner','active',now()),
 ('42000000-0000-4000-8000-000000000003','22000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000003','assistant','active',now());
create temporary table results(key text primary key,value jsonb);
grant all on results to authenticated;
create function pg_temp.call_client(op text,body jsonb) returns jsonb language sql as $$
 select public.client_operation('42000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001',op,body,
 '62000000-0000-4000-8000-000000000001');
$$;
select is(app_private.client_phone_key('0532 123 45 67'),'+905321234567','TR national phone normalized');
select is(app_private.client_phone_key('+90 (532) 123-45-67'),'+905321234567','international TR equivalent');
select is(app_private.client_phone_key('0044 7700 900123','GB'),'+447700900123','international numbers are supported');
select is(app_private.client_phone_key('07700 900123','GB'),null::text,'unsupported national region requires country code');
select is(app_private.client_phone_key('0532INVALID'),null::text,'letters cannot silently enter normalized phone');
select is(app_private.client_name_key('  İŞIL  Yılmaz '),'isil yilmaz','Turkish name normalization is stable');
set local role anon;
select throws_ok($$select * from public.clients$$,'42501',null,'anonymous cannot read clients');
select throws_ok($$select public.client_operation(null,null,'list')$$,'42501',null,'anonymous cannot invoke service');
reset role;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
set local role authenticated;
insert into results values('b',public.client_operation('42000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000003','create',
 '{"full_name":"Private B","phone":"+447700900123","request_id":"72000000-0000-4000-8000-000000000001"}'));
reset role;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(pg_temp.call_client('create','{"phone":"05321234567","request_id":"72000000-0000-4000-8000-000000000002"}')->>'code','VALIDATION_FAILED','name required on server');
insert into results values('a',pg_temp.call_client('create',
 '{"full_name":"Elif Yılmaz","phone":"0532 123 45 67","email":"ELIF@example.test","birth_date":"1990-05-01","request_id":"72000000-0000-4000-8000-000000000003"}'));
select ok((select value->'data'->>'id' is not null from results where key='a'),'authorized normal creation works');
select is((select value->'data'->>'organization_id' from results where key='a'),'22000000-0000-4000-8000-000000000001','organization derived from membership');
select is((select value->'data'->>'created_by' from results where key='a'),'12000000-0000-4000-8000-000000000001','actor derived from JWT');
select is((select count(*) from public.clients),1::bigint,'A reads only own organization clients');
select is(pg_temp.call_client('detail',jsonb_build_object('client_id',(select value->'data'->>'id' from results where key='b')))->>'code','CLIENT_NOT_FOUND','foreign detail does not reveal existence');
select is(pg_temp.call_client('update',jsonb_build_object('client_id',(select value->'data'->>'id' from results where key='b'),
 'expected_version',1,'request_id',gen_random_uuid(),'full_name','Forged','phone','05321234567'))->>'code','CLIENT_NOT_FOUND','A cannot update B');
select is(pg_temp.call_client('archive',jsonb_build_object('client_id',(select value->'data'->>'id' from results where key='b'),
 'expected_version',1,'request_id',gen_random_uuid()))->>'code','CLIENT_NOT_FOUND','A cannot archive B');
select is(pg_temp.call_client('create','{"full_name":"Forged","phone":"05329999999","organization_id":"22000000-0000-4000-8000-000000000002","request_id":"72000000-0000-4000-8000-000000000004"}')->>'code','VALIDATION_FAILED','forged organization rejected');
select is(pg_temp.call_client('create','{"full_name":"Forged","phone":"05329999999","created_by":"12000000-0000-4000-8000-000000000002","request_id":"72000000-0000-4000-8000-000000000005"}')->>'code','VALIDATION_FAILED','forged actor rejected');
select throws_ok($$update public.clients set organization_id='22000000-0000-4000-8000-000000000002'$$,'42501',null,'direct ownership rewrite denied');
select throws_ok($$insert into public.clients(organization_id) values ('22000000-0000-4000-8000-000000000002')$$,'42501',null,'direct insert bypass denied');
insert into results values('review',pg_temp.call_client('create',
 '{"full_name":"Family Member","phone":"+905321234567","request_id":"72000000-0000-4000-8000-000000000006"}'));
select is((select value->>'code' from results where key='review'),'DUPLICATE_CLIENT_CANDIDATES','phone match requires server review');
select is((select jsonb_array_length(value->'candidates') from results where key='review'),1,'review returns own candidate only');
select ok((select value->'candidates'->0->>'phone_masked' not like '%5321234567%' from results where key='review'),'candidate phone is masked');
select is((select count(*) from public.clients),1::bigint,'warning has no client write');
select is(pg_temp.call_client('create',jsonb_build_object('full_name','Tampered','phone','+905321234567','request_id',gen_random_uuid(),
 'confirmation_token',(select value->>'confirmation_token' from results where key='review')))->>'code','DUPLICATE_CONFIRMATION_INVALID','confirmation binds exact form');
insert into results values('family',pg_temp.call_client('create',jsonb_build_object('full_name','Family Member','phone','+905321234567',
 'request_id','72000000-0000-4000-8000-000000000006','confirmation_token',(select value->>'confirmation_token' from results where key='review'))));
select ok((select value->'data'->>'id' is not null from results where key='family'),'explicit separate person creation works');
select is((select count(*) from public.clients where phone_normalized='+905321234567'),2::bigint,'phone is not unique and separate identities persist');
select is((select count(*) from public.audit_events where action='client.duplicate_override'),1::bigint,'separate-person decision audited');
select is(pg_temp.call_client('create',
 '{"full_name":"Elif Yılmaz","phone":"0532 123 45 67","email":"ELIF@example.test","birth_date":"1990-05-01","request_id":"72000000-0000-4000-8000-000000000003"}')->'data'->>'id',
 (select value->'data'->>'id' from results where key='a'),'same request retry is idempotent');
insert into results values('international',pg_temp.call_client('create',
 '{"full_name":"International Client","phone":"+447700900123","request_id":"72000000-0000-4000-8000-000000000007"}'));
select ok((select value->'data'->>'id' is not null from results where key='international'),'B phone never creates an A duplicate warning');
select is(jsonb_array_length(pg_temp.call_client('list','{"query":"yilmaz"}')->'data'->'items'),1,'name search works');
select is(jsonb_array_length(pg_temp.call_client('list','{"query":"0532"}')->'data'->'items'),2,'national phone fragment search works');
select is(pg_temp.call_client('list','{}')->'data'->'items'->0->>'email',null::text,'directory does not disclose email');
insert into results values('archived',pg_temp.call_client('archive',jsonb_build_object(
 'client_id',(select value->'data'->>'id' from results where key='a'),'expected_version',1,'request_id',gen_random_uuid())));
select is((select value->'data'->>'status' from results where key='archived'),'ARCHIVED','archive preserves identity');
select is(jsonb_array_length(pg_temp.call_client('list','{"query":"yilmaz"}')->'data'->'items'),0,'active list hides archived clients');
select is(jsonb_array_length(pg_temp.call_client('list','{"query":"yilmaz","status":"ARCHIVED"}')->'data'->'items'),1,'explicit archive list retrieves identity');
insert into results values('restored',pg_temp.call_client('restore',jsonb_build_object(
 'client_id',(select value->'data'->>'id' from results where key='a'),'expected_version',2,'request_id',gen_random_uuid())));
select is((select value->'data'->>'status' from results where key='restored'),'ACTIVE','restore returns active identity');
select is((select count(*) from public.audit_events where action in ('client.archived','client.restored')),2::bigint,'archive and restore history retained');
-- Phone edits use the same review protocol and preserve optimistic concurrency/audit.
insert into results values('edit-payload',jsonb_build_object('client_id',(select value->'data'->>'id' from results where key='international'),
 'expected_version',1,'full_name','International Client','phone','+905321234567','request_id','72000000-0000-4000-8000-000000000020'));
insert into results values('edit-review',pg_temp.call_client('update',(select value from results where key='edit-payload')));
select is((select value->>'code' from results where key='edit-review'),'DUPLICATE_CLIENT_CANDIDATES','phone change must be reviewed');
select is((select phone_normalized from public.clients where id=(select (value->'data'->>'id')::uuid from results where key='international')),'+447700900123','review does not mutate old phone');
insert into results values('edit-confirmed-payload',(select value from results where key='edit-payload')||jsonb_build_object('confirmation_token',(select value->>'confirmation_token' from results where key='edit-review')));
insert into results values('edited',pg_temp.call_client('update',(select value from results where key='edit-confirmed-payload')));
select is((select value->'data'->>'phone_normalized' from results where key='edited'),'+905321234567','explicit reviewed phone update succeeds');
select is((select value->'data'->>'version' from results where key='edited'),'2','update increments version');
select is((select metadata->'old'->>'phone' from public.audit_events where action='client.updated'),'+447700900123','update audit retains old phone');
select is((select metadata->'new'->>'phone' from public.audit_events where action='client.updated'),'+905321234567','update audit retains new phone');
select is(pg_temp.call_client('update',(select value from results where key='edit-confirmed-payload'))->'data'->>'version','2','confirmed update retry is idempotent');
select is(pg_temp.call_client('update',(select value from results where key='edit-confirmed-payload')||jsonb_build_object('request_id',gen_random_uuid(),'expected_version',2))->>'code','DUPLICATE_CONFIRMATION_INVALID','consumed confirmation cannot be replayed with a new request');
select is(pg_temp.call_client('update',(select value from results where key='edit-payload')||jsonb_build_object('request_id',gen_random_uuid()))->>'code','CONFLICT','stale version cannot overwrite changes');
select is(pg_temp.call_client('update',(select value from results where key='edit-confirmed-payload')||'{"full_name":"Altered"}'::jsonb)->>'code','CONFLICT','idempotency key cannot authorize another payload');
select is(pg_temp.call_client('create',jsonb_build_object('full_name','Other Name','phone','05329990001','email','elif@example.test','request_id',gen_random_uuid()))->>'code','DUPLICATE_CLIENT_CANDIDATES','email independently signals duplicates');
select is(pg_temp.call_client('create',jsonb_build_object('full_name','  ELİF  YILMAZ','phone','05329990002','request_id',gen_random_uuid()))->>'code','DUPLICATE_CLIENT_CANDIDATES','exact normalized name independently signals duplicates');
select is(pg_temp.call_client('create',jsonb_build_object('full_name','Elif Other','phone','05329990003','birth_date','1990-05-01','request_id',gen_random_uuid()))->'candidates'->0->'signals'->>0,'BIRTH_DATE','birth date plus name prefix contributes a review signal');
select is(pg_temp.call_client('create',jsonb_build_object('full_name','Invalid Phone','phone','0532INVALID','request_id',gen_random_uuid()))->>'code','VALIDATION_FAILED','service rejects malformed phone');
select is(pg_temp.call_client('create',jsonb_build_object('full_name','Invalid Date','phone','05329990004','birth_date','2999-01-01','request_id',gen_random_uuid()))->>'code','VALIDATION_FAILED','future birth dates rejected');
select throws_ok($$delete from public.clients$$,'42501',null,'normal role cannot hard delete');
select throws_ok($$select * from app_private.client_duplicate_reviews$$,'42501',null,'review tokens are not readable by application role');
select throws_ok($$select * from app_private.client_mutation_receipts$$,'42501',null,'mutation receipts are not readable by application role');
select is((select count(*) from public.audit_events where action='client.updated'),1::bigint,'retries create no duplicate audit');
select ok(not exists(select 1 from public.audit_events where metadata::text like '%confirmation_token%' or metadata::text like '%request_id%'),'audit excludes review tokens and raw request keys');
reset role;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*) from public.clients),3::bigint,'another allowed location reads organization identity');
select is(public.client_operation('42000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000002','create',
 '{"full_name":"Denied","phone":"05329999999","request_id":"72000000-0000-4000-8000-000000000008"}')->>'code','FORBIDDEN','read-only role cannot create');
reset role;
update public.salon_memberships set status='revoked',revoked_at=now() where id='42000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.clients),0::bigint,'revoked membership immediately loses read access');
select is(pg_temp.call_client('list','{}')->>'code','TENANT_CONTEXT_INVALID','revoked selected context cannot use service');
reset role;
update public.organizations set archived_at=now() where id='22000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*) from public.clients),0::bigint,'archived organization membership has no client access');
reset role;
select * from finish();
rollback;
