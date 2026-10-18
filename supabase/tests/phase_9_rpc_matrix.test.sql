begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create temporary table rpc_negative_matrix as
select p.oid,p.proname,format('select public.%I(%s)',p.proname,
 (select string_agg('null::'||t::regtype::text,',' order by position) from unnest(p.proargtypes::oid[]) with ordinality a(t,position))) as sql
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e');
grant select on rpc_negative_matrix to anon,authenticated;
select ok(count(*)>=40,'matrix includes every actual application public RPC, including legacy') from rpc_negative_matrix;
select ok(not has_function_privilege('anon',oid,'EXECUTE'),'anonymous grant denied: '||proname) from rpc_negative_matrix where proname<>'request_session_guard' order by proname;
set local role anon;
select throws_ok(sql,'42501',null,'real anonymous invocation denied: '||proname) from rpc_negative_matrix where proname<>'request_session_guard' order by proname;
select lives_ok('select public.request_session_guard()','explicit no-data pre-request guard supports anonymous request roles without private schema access');
reset role;
select ok(not has_schema_privilege('authenticated','public','CREATE'),'normal clients cannot add callable public functions');
select ok(not has_schema_privilege('anon','public','CREATE'),'anonymous clients cannot add callable public functions');
select ok(not has_schema_privilege('service_role','public','CREATE'),'service role cannot add application public functions');
select * from finish();rollback;
