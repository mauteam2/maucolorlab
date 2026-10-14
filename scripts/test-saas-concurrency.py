"""Real SaaS quota/provider/usage races in disposable local PostgreSQL only."""
from pathlib import Path
from datetime import datetime, timezone
import os, json, re, time, uuid, statistics
ROOT=Path(__file__).resolve().parents[1]
assert os.environ.get('CI')=='true','Disposable CI database required'
transport=(ROOT/'scripts/test-costing-concurrency.py').read_text(encoding='utf-8').split('\norg=')[0]
exec(compile(transport,'existing-psql-transport','exec'))
org='a7000000-0000-4000-8000-000000000001';loc='a7000000-0000-4000-8000-000000000011'
user='a7000000-0000-4000-8000-000000000021';member='a7000000-0000-4000-8000-000000000111'
a=Session();b=Session();observer=Session();cases=[];plan_version=0;pv=None
def now():return datetime.now(timezone.utc).isoformat()
def auth(s):s.execute(f"set role authenticated;set request.jwt.claim.sub='{user}';")
def control(q):return f"select app_private.saas_control('{org}',{literal(q)},'TEST_OPERATOR','Disposable SaaS barrier',gen_random_uuid());"
def state(status):
    version=observer.execute(f"select version from app_private.saas_accounts where organization_id='{org}';")[-1]
    return control({'type':'SUBSCRIPTION','expected_version':int(version),'plan_version_id':pv,'status':status})
def plan(stock=True,members=None,locations=None,engine=None,apply=True):
    global plan_version,pv
    observer.execute('reset role;')
    q={'type':'PLAN_VERSION','code':'PLAN_B','label':'PLAN_B','development_only':True,'expected_version':plan_version,
       'entitlements':{c:True for c in ('COLOR_ENGINE','BRAND_ADAPTER','LIVE_SESSION','CRM','STOCK','FINANCE','COSTING','COMMISSION','REPORTING','AI_GATEWAY')},
       'quotas':{'ACTIVE_MEMBERS':members,'LOCATIONS':locations,'ENGINE_EXECUTIONS':engine,'STORAGE_BYTES':None}}
    q['entitlements']['STOCK']=stock
    reply=result(observer.execute(control(q)));assert 'data' in reply,reply;pv=reply['data']['id'];plan_version+=1
    if apply:assert 'data' in result(observer.execute(state('ACTIVE')))
def rpc(q):return f"select public.saas_structure_operation('{member}','{loc}',{literal(q)},gen_random_uuid());"
def new_member(uid):return {'type':'CREATE_MEMBER','request_id':str(uuid.uuid4()),'id':str(uuid.uuid4()),'user_id':uid,'role':'colorist','location_id':None}
def new_location():return {'type':'CREATE_LOCATION','request_id':str(uuid.uuid4()),'id':str(uuid.uuid4()),'name':'Synthetic quota edge','timezone':'UTC'}
def stock():return f"select saas_test.stock({literal({'type':'RECEIPT','mutation_id':str(uuid.uuid4()),'stock_item_id':'c5000000-0000-4000-8000-000000000101','lot_id':None,'quantity':1,'unit':'GRAM','occurred_at':now(),'reference':None,'reason':'Synthetic gated operation'})});"
def barrier(label,first,second,expected=None,first_auth=False,second_auth=False):
    a.execute('reset role;');b.execute('reset role;')
    if first_auth:auth(a)
    if second_auth:auth(b)
    one=result(a.execute('begin;'+first));assert 'data' in one,(label,one)
    b.send('begin;'+second+'commit;');deadline=time.monotonic()+10
    while observer.execute(f'select {a.pid}=any(pg_blocking_pids({b.pid}));')[-1]!='t':
        assert time.monotonic()<deadline,(label,'missing real lock wait');time.sleep(.03)
    a.execute('commit;');two=result(b.receive());assert two.get('code')==expected,(label,two)
    a.execute('reset role;');b.execute('reset role;');cases.append(label)
    print('PASS',label,'(three distinct backends, pg_blocking_pids barrier)');return two
try:
    assert len({a.pid,b.pid,observer.pid})==3
    def include(name):
        text=(ROOT/'supabase/tests/fixtures'/name).read_text(encoding='utf-8')
        return re.sub(r'^\\ir (.+)$',lambda m:include(m.group(1)),text,flags=re.M)
    fixture=include('costing-salon.inc').replace('b4000000','a7000000').replace('e5000000','a8000000').replace('@elifora.test','@saas-concurrency.elifora.test').replace("'controlled-a'","'saas-a'").replace("'controlled-b'","'saas-b'").replace('pg_temp.','saas_test.').replace('set local search_path=public,extensions','set local search_path=saas_test,public,extensions')
    for table in ('result','chosen','appointment_money'):fixture=fixture.replace('create temporary table '+table,'create table saas_test.'+table)
    observer.execute('create schema saas_test;grant usage on schema saas_test to authenticated;begin;create extension if not exists pgtap with schema extensions;set local search_path=saas_test,public,extensions;select no_plan();'+fixture+'\nreset role;commit;')
    observer.execute(f"update public.salon_memberships set location_id=null where id='{member}';")
    observer.execute(f"create or replace function saas_test.stock(q jsonb) returns jsonb language plpgsql as $$begin return public.stock_operation('{member}','{loc}',q,gen_random_uuid());exception when raise_exception then return jsonb_build_object('code',sqlerrm);end$$;")
    auth(observer);observer.execute("select saas_test.move('OPENING','c5000000-0000-4000-8000-000000000101',100);");observer.execute('reset role;')
    ids=[str(uuid.uuid4()),str(uuid.uuid4())]
    for n,uid in enumerate(ids):observer.execute(f"insert into auth.users(id,email,raw_user_meta_data) values('{uid}','quota-{n}@saas.elifora.test','{{}}');")
    before=int(observer.execute(f"select count(distinct user_id) from public.salon_memberships where organization_id='{org}' and status in ('active','invited');")[-1])
    plan(members=before+1)
    barrier('two member creations at one remaining reserved seat',rpc(new_member(ids[0])),rpc(new_member(ids[1])),'QUOTA_EXCEEDED',True,True)
    assert int(observer.execute(f"select count(distinct user_id) from public.salon_memberships where organization_id='{org}' and status in ('active','invited');")[-1])==before+1
    before=int(observer.execute(f"select count(*) from public.locations where organization_id='{org}' and archived_at is null;")[-1]);plan(locations=before+1)
    barrier('two location creations at one remaining slot',rpc(new_location()),rpc(new_location()),'QUOTA_EXCEEDED',True,True)
    assert int(observer.execute(f"select count(*) from public.locations where organization_id='{org}' and archived_at is null;")[-1])==before+1
    plan()
    source=observer.execute(f"select source_id from app_private.saas_usage_events where organization_id='{org}' and category='ENGINE_EXECUTIONS' limit 1;")[-1]
    source_hash=observer.execute(f"select source_hash from app_private.saas_usage_events where organization_id='{org}' and source_id='{source}';")[-1]
    usage=f"select app_private.saas_record_usage('{org}','{loc}','ENGINE_EXECUTIONS','COLOR_PLAN','{source}',1,'{source_hash}');select jsonb_build_object('data',true);"
    barrier('same permanent successful engine source processed twice',usage,usage)
    assert observer.execute(f"select count(*) from app_private.saas_usage_events where organization_id='{org}' and source_id='{source}';")[-1]=='1'
    observer.execute(f"create function saas_test.changed_usage() returns jsonb language plpgsql as $$begin perform app_private.saas_record_usage('{org}','{loc}','ENGINE_EXECUTIONS','COLOR_PLAN','{source}',2,'{source_hash}');return jsonb_build_object('data',true);exception when raise_exception then return jsonb_build_object('code',sqlerrm);end$$;")
    barrier('changed permanent usage replay conflicts after the original lock',usage,'select saas_test.changed_usage();','USAGE_REPLAY_CONFLICT')
    plan(stock=False,apply=False)
    barrier('subscription downgrade plus new manual stock work',state('ACTIVE'),stock(),'FEATURE_UNAVAILABLE',False,True)
    plan()
    barrier('subscription suspension plus new gated write',state('SUSPENDED'),stock(),'SUBSCRIPTION_RESTRICTED',False,True)
    plan(stock=False,apply=False)
    out=barrier('plan version transition plus authoritative entitlement read',state('ACTIVE'),f"select public.saas_snapshot('{member}','{loc}');",None,False,True)
    assert next(e for e in out['data']['entitlements'] if e['capability']=='STOCK')['creation_allowed'] is False
    plan()
    observer.execute(f"select app_private.saas_link_provider('{org}','TEST','synthetic-customer','TEST_OPERATOR','Synthetic provider link',gen_random_uuid());")
    version=int(observer.execute(f"select version from app_private.saas_accounts where organization_id='{org}';")[-1])
    cmd={'type':'SUBSCRIPTION','expected_version':version,'plan_version_id':pv,'status':'ACTIVE'}
    event=f"select app_private.saas_provider_event('TEST','synthetic-event','synthetic-customer',repeat('a',64),{literal(cmd)},gen_random_uuid());"
    barrier('duplicate verified provider event is applied once',event,event)
    assert observer.execute("select count(*) from app_private.saas_provider_events where provider='TEST' and external_event_id='synthetic-event';")[-1]=='1'
    assert int(observer.execute(f"select version from app_private.saas_accounts where organization_id='{org}';")[-1])==version+1
    barrier('changed verified provider replay preserves original subscription',event,event.replace("repeat('a',64)","repeat('b',64)"),'PROVIDER_REPLAY_CONFLICT')
    version=int(observer.execute(f"select version from app_private.saas_accounts where organization_id='{org}';")[-1])
    cmd['expected_version']=version
    stale=barrier('provider event ordered behind a newer subscription version',state('ACTIVE'),f"select app_private.saas_provider_event('TEST','out-of-order','synthetic-customer',repeat('c',64),{literal(cmd)},gen_random_uuid());")
    assert stale['data']['status']=='REJECTED' and stale['data']['code']=='SAAS_VERSION_CONFLICT'
    barrier('two usage rebuilds retain the same durable event totals',control({'type':'REBUILD_USAGE'}),control({'type':'REBUILD_USAGE'}))
    # A measured successful Color store uses the real prepare/store RPC and an
    # existing valid engine result, signed locally inside PostgreSQL (never logged).
    plan()
    observer.execute(f"create function saas_test.new_color() returns jsonb language plpgsql security definer set search_path='' as $$declare base public.color_plans%rowtype;packet jsonb;envelope text;sig text;begin select * into base from public.color_plans where organization_id='{org}' and status='DRAFT' limit 1;packet:=base.signed_envelope::jsonb||jsonb_build_object('requestId',gen_random_uuid(),'expiresAt',statement_timestamp()+interval '2 minutes');envelope:=packet::text;select encode(extensions.hmac(convert_to(envelope,'UTF8'),secret,'sha256'),'hex') into sig from app_private.color_engine_keys where id=1;return public.color_plan_operation('{member}','{loc}',base.client_id,'store',jsonb_build_object('envelope',envelope,'signature',sig),gen_random_uuid());end$$;")
    auth(observer)
    # No artificial page-view counter, no forecast and no customer/recipe export.
    perf={}
    queries={'entitlement_snapshot':f"select public.saas_snapshot('{member}','{loc}');",'usage_summary':f"select public.saas_snapshot('{member}','{loc}');",'gated_color_store':'select saas_test.new_color();'}
    for name,sql in queries.items():
        samples=[]
        for _ in range(5):
            start=time.monotonic();reply=result(observer.execute(sql));assert 'data' in reply,(name,reply);samples.append((time.monotonic()-start)*1000)
        perf[name]={'median_ms':round(statistics.median(samples),2),'max_ms':round(max(samples),2),'samples':5}
        print('PERF',name,perf[name]['median_ms'],'ms median')
    observer.execute('reset role;')
    for name in ('quota_gated_member','quota_gated_location'):
        samples=[]
        for _ in range(5):
            if name=='quota_gated_member':
                uid=str(uuid.uuid4());observer.execute(f"insert into auth.users(id,email) values('{uid}','{uid}@saas.elifora.test');");q=new_member(uid)
            else:q=new_location()
            auth(observer);start=time.monotonic();reply=result(observer.execute(rpc(q)));assert 'data' in reply,(name,reply);samples.append((time.monotonic()-start)*1000);observer.execute('reset role;')
        perf[name]={'median_ms':round(statistics.median(samples),2),'max_ms':round(max(samples),2),'samples':5}
        print('PERF',name,perf[name]['median_ms'],'ms median')
    observer.execute('reset role;')
    plan_query=f"select a.version,s.status,s.plan_version_id from app_private.saas_accounts a left join app_private.saas_subscriptions s on s.id=a.subscription_id where a.organization_id='{org}'"
    perf['current_account_plan']=json.loads('\n'.join(observer.execute('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+plan_query+';')))
    assert len(cases)==11
    (Path(os.environ['RUNNER_TEMP'])/'saas-performance.json').write_text(json.dumps({'real_concurrency_cases':len(cases),'cases':cases,'read':perf},indent=2))
    print('PASS: 11 SaaS real concurrency/integrity cases; measured hot paths and executed EXPLAIN ANALYZE BUFFERS')
finally:
    for s in (a,b,observer):s.close()
