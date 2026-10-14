begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/gate-1-live.inc

create function pg_temp.factual(kind text,extra jsonb default '{}') returns jsonb language plpgsql volatile as $$
declare payload jsonb;
begin
 if kind='TEST' then
  payload:='{"request_id":"b4000000-0000-4000-8000-000000000971","type":"POROSITY","result":{"state":"KNOWN","value":"HIGH"}}'::jsonb||extra;
  return public.hair_physical_test_operation('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011','b4000000-0000-4000-8000-000000000031',payload,'b4000000-0000-4000-8000-000000000979');
 end if;
 payload:='{"request_id":"b4000000-0000-4000-8000-000000000972","category":"COLOR","performed_on":{"state":"UNKNOWN","value":null},"product":{"state":"UNKNOWN","value":null},"description":"Synthetic delayed factual intent","evidence":{"source":"HISTORICAL"}}'::jsonb||extra;
 return public.hair_history_operation('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011','b4000000-0000-4000-8000-000000000031',payload,'b4000000-0000-4000-8000-000000000979');
end $$;
set local role authenticated;
insert into result values('replay-test',pg_temp.factual('TEST')),('replay-history',pg_temp.factual('HISTORY'));
select ok((select value ? 'data' from result where name='replay-test'),'physical append accepted');
select ok((select value ? 'data' from result where name='replay-history'),'history append accepted');
select is(pg_temp.factual('TEST'),(select value from result where name='replay-test'),'immediate physical replay returns accepted result');
select is(pg_temp.factual('HISTORY'),(select value from result where name='replay-history'),'immediate history replay returns accepted result');
reset role;
create temporary table replay_counts as select
 (select count(*) from public.hair_physical_tests) tests,(select count(*) from public.hair_history_events) history,
 (select count(*) from public.hair_evidence) evidence,(select count(*) from public.audit_events) audits;
-- This timestamp has no operational authority after Phase 8. Age the former TTL
-- metadata without changing the accepted identity, hash, fact or response.
update app_private.hair_core_mutation_receipts set expires_at=now()-interval '3 days'
 where request_id in ('b4000000-0000-4000-8000-000000000971','b4000000-0000-4000-8000-000000000972');
set local role authenticated;
select is(pg_temp.factual('TEST'),(select value from result where name='replay-test'),'physical commit-without-response replays beyond former TTL');
select is(pg_temp.factual('HISTORY'),(select value from result where name='replay-history'),'history commit-without-response replays beyond former TTL');
select is(pg_temp.factual('TEST','{"notes":"Changed payload"}')->>'code','CONFLICT','physical identity cannot accept a changed payload');
select is(pg_temp.factual('HISTORY','{"description":"Changed payload"}')->>'code','CONFLICT','history identity cannot accept a changed payload');
reset role;
select ok((select tests=(select count(*) from public.hair_physical_tests) and history=(select count(*) from public.hair_history_events) and evidence=(select count(*) from public.hair_evidence) and audits=(select count(*) from public.audit_events) from replay_counts),'delayed replay creates no duplicate fact, evidence or audit');
select throws_ok($$update app_private.hair_core_mutation_receipts set payload_hash='changed'$$,'23514','IMMUTABLE_HAIR_REPLAY','accepted hashes immutable even to privileged accidental writes');
select throws_ok($$delete from app_private.hair_core_mutation_receipts$$,'23514','IMMUTABLE_HAIR_REPLAY','accepted identities cannot be deleted');
set local role authenticated;
select throws_ok($$select * from app_private.hair_core_mutation_receipts$$,'42501',null,'normal role cannot enumerate private receipt responses');
select set_config('request.jwt.claim.sub','b4000000-0000-4000-8000-000000000022',true);
select ok(pg_temp.factual('TEST') ? 'code','cross-organization physical replay denied');
select ok(pg_temp.factual('HISTORY') ? 'code','cross-organization history replay denied');
reset role;
update public.live_sessions set status='ABORTED',record_version=record_version+1,payload=payload||jsonb_build_object('status','ABORTED','recordVersion',record_version+1) where id='b4000000-0000-4000-8000-000000000803';
select set_config('request.jwt.claim.sub','b4000000-0000-4000-8000-000000000021',true);
set local role authenticated;
select ok(public.client_operation('b4000000-0000-4000-8000-000000000111','b4000000-0000-4000-8000-000000000011','archive',jsonb_build_object('client_id','b4000000-0000-4000-8000-000000000031','expected_version',(select version from public.clients where id='b4000000-0000-4000-8000-000000000031'),'request_id',gen_random_uuid()),gen_random_uuid()) ? 'data','terminal history permits archive');
select is(pg_temp.factual('TEST')->>'code','CLIENT_ARCHIVED','archived client blocks physical replay');
select is(pg_temp.factual('HISTORY')->>'code','CLIENT_ARCHIVED','archived client blocks history replay');
reset role;
update public.salon_memberships set status='revoked',revoked_at=now() where id='b4000000-0000-4000-8000-000000000111';
set local role authenticated;
select is(pg_temp.factual('TEST')->>'code','MEMBERSHIP_REVOKED','revoked membership blocks physical replay');
select is(pg_temp.factual('HISTORY')->>'code','MEMBERSHIP_REVOKED','revoked membership blocks history replay');
reset role;
select * from finish();rollback;
