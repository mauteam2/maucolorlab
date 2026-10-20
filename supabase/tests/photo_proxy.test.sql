begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/gate-1-live.inc
insert into public.live_photos values('b4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000803','b4000000-0000-4000-8000-000000000991','BEFORE','proxy/qualified-reservation','image/png','b4000000-0000-4000-8000-000000000021',statement_timestamp());
create function pg_temp.proxy(extra jsonb default '{}',wrong_signature boolean default false) returns jsonb language plpgsql as $$
declare e text;sig text;begin
 e:=(jsonb_build_object('membershipId','b4000000-0000-4000-8000-000000000111','locationId','b4000000-0000-4000-8000-000000000011','sessionId','b4000000-0000-4000-8000-000000000803','photoId','b4000000-0000-4000-8000-000000000991','clientId','b4000000-0000-4000-8000-000000000031','method','POST','digest',repeat('a',64),'size',4194304,'expiresAt',clock_timestamp()+interval '30 seconds')||extra)::text;
 select encode(extensions.hmac(convert_to('elifora/photo-proxy/v1'||chr(10)||e,'UTF8'),secret,'sha256'),'hex') into sig from app_private.color_engine_keys where id=1;
 return public.live_photo_access(e,case when wrong_signature then repeat('0',64) else sig end);
end$$;
-- Test-only signer cannot be granted to application users in a shared environment.
-- Run it as the database test operator while retaining the authenticated subject.
select set_config('request.jwt.claim.sub','b4000000-0000-4000-8000-000000000021',true);
select ok(pg_temp.proxy() ? 'data','signed boundary-size upload validates reservation, owner and current quota');
select throws_ok($q$select pg_temp.proxy('{}',true)$q$,'42501','FORBIDDEN','caller cannot mint a proxy proof');
select throws_ok($q$select pg_temp.proxy('{"size":4194305}')$q$,'42501','FORBIDDEN','one byte above shared limit denied');
select throws_ok($q$select pg_temp.proxy(jsonb_build_object('expiresAt',clock_timestamp()-interval '1 second'))$q$,'42501','FORBIDDEN','expired proof denied');
select is(pg_temp.proxy('{"clientId":"b4000000-0000-4000-8000-000000000032"}')->>'code','FORBIDDEN','foreign client cannot be substituted');
select is(pg_temp.proxy('{"locationId":"b4000000-0000-4000-8000-000000000012"}')->>'code','TENANT_CONTEXT_INVALID','foreign location denied');
select is(pg_temp.proxy('{"method":"GET","digest":null,"size":0}')#>>'{data,path}','proxy/qualified-reservation','current technical read uses relational authorization');
set local role authenticated;
select throws_ok($q$insert into storage.objects(bucket_id,name) values('live-technical','proxy/qualified-reservation')$q$,'42501',null,'direct even qualified insert cannot bypass decoder');
select is((select count(*) from storage.objects where bucket_id='live-technical'),0::bigint,'direct SELECT cannot obtain protected bytes or sign a URL');
reset role;
update public.salon_memberships set status='revoked',revoked_at=now() where id='b4000000-0000-4000-8000-000000000111';
select ok(pg_temp.proxy() ? 'code','correct proof cannot bypass revoked membership');
select ok(pg_temp.proxy('{"method":"GET","digest":null,"size":0}') ? 'code','revoked read rejected before privileged storage');
select is((select file_size_limit from storage.buckets where id='live-technical'),4194304::bigint,'provider bucket matches Web limit');
select ok(not has_function_privilege('service_role','public.live_photo_access(text,text)','execute'),'admin storage identity cannot authorize itself');
update public.salon_memberships set status='active',revoked_at=null where id='b4000000-0000-4000-8000-000000000111';
insert into storage.objects(bucket_id,name) values('live-technical','proxy/qualified-reservation');
insert into public.live_photos values('b4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000803','b4000000-0000-4000-8000-000000000992','BEFORE','proxy/internal-insert-probe','image/png','b4000000-0000-4000-8000-000000000021',statement_timestamp());
-- Storage API enables this transport guard before DELETE. Simulate that context
-- so this assertion proves RLS denial rather than the provider's SQL-only guard.
select set_config('storage.allow_delete_query','true',true);
set local role elifora_live_writer;
select is((select count(*) from storage.objects where bucket_id='live-technical'),1::bigint,'signed Live persistence can check required object existence');
select throws_ok($q$insert into storage.objects(bucket_id,name) values('live-technical','proxy/internal-insert-probe')$q$,'42501',null,'inherited grants cannot bypass image validation');
with changed as (update storage.objects set user_metadata='{}' where bucket_id='live-technical' returning id)
select is((select count(*) from changed),0::bigint,'internal existence reader cannot replace object metadata');
with changed as (delete from storage.objects where bucket_id='live-technical' returning id)
select is((select count(*) from changed),0::bigint,'internal existence reader cannot delete evidence');
reset role;
select * from finish();
rollback;
