"""Real disposable PostgreSQL reporting races and 10k/50k source-derived scale.

No remote database, invented aggregate benchmark, production connection or secrets.
The existing psql backend/barrier transport is reused without executing its suite.
"""
from pathlib import Path
from datetime import datetime,timezone
import os,json,re,time,uuid,statistics
ROOT=Path(__file__).resolve().parents[1]
assert os.environ.get('CI')=='true','Disposable local CI PostgreSQL required'
transport=(ROOT/'scripts/test-costing-concurrency.py').read_text(encoding='utf-8').split('\norg=')[0]
exec(compile(transport,'existing-psql-session-transport','exec'))
org='a9000000-0000-4000-8000-000000000001';loc='a9000000-0000-4000-8000-000000000011'
user='a9000000-0000-4000-8000-000000000021';member='a9000000-0000-4000-8000-000000000111';client='a9000000-0000-4000-8000-000000000031'
a=Session();b=Session();observer=Session();cases=[];performance={}
def auth(s):s.execute(f"set role authenticated;set request.jwt.claim.sub='{user}';")
def now():return datetime.now(timezone.utc).isoformat()
def cmd(t,**fields):return {'type':t,'mutation_id':str(uuid.uuid4()),**({} if t in ('PROCESS','PROCESS_BATCH') else {'reason':'Synthetic reporting barrier'}),**fields}
def rpc(q,domain='finance'):return f"select public.{domain}_operation('{member}','{loc}',{literal(q)},gen_random_uuid());"
def write(q,domain='finance'):
    auth(observer);out=result(observer.execute(rpc(q,domain)));observer.execute('reset role;');assert 'data' in out,out;return out['data']
def report(s=observer,q=None):
    auth(s);out=result(s.execute(f"select public.reporting_snapshot('{member}','{loc}',{literal(q or {})});"));s.execute('reset role;');assert 'data' in out,out;return out['data']
def refresh_sql():return f"select app_private.report_refresh('{org}','{loc}',false);"
def rebuild_sql():return f"select app_private.report_refresh('{org}','{loc}',true);"
def barrier(label,first,second,source=None):
    a.execute('reset role;begin;'+first);b.send('reset role;begin;'+second+'commit;')
    deadline=time.monotonic()+10
    while observer.execute(f'select {a.pid}=any(pg_blocking_pids({b.pid}));')[-1]!='t':
        assert time.monotonic()<deadline,(label,'distinct report worker did not block');time.sleep(.03)
    if source:source()  # Must commit while both reporting transactions remain open.
    a.execute('commit;');b.receive();cases.append(label);print('PASS',label,'(three distinct PostgreSQL backends, real lock wait)')
def charge(n='1000'):return cmd('MANUAL_CHARGE',id=str(uuid.uuid4()),client_id=client,currency='TRY',amount_minor=n,tax_rate_bps=0,tax_inclusive=True,description='Recorded source revenue',occurred_at=now())
try:
    assert len({a.pid,b.pid,observer.pid})==3
    def include(name):
        text=(ROOT/'supabase/tests/fixtures'/name).read_text(encoding='utf-8')
        return re.sub(r'^\\ir (.+)$',lambda m:include(m.group(1)),text,flags=re.M)
    fixture=include('costing-salon.inc').replace('b4000000','a9000000').replace('e5000000','aa000000').replace('@elifora.test','@reporting-concurrency.elifora.test').replace("'controlled-a'","'reporting-a'").replace("'controlled-b'","'reporting-b'").replace('pg_temp.','reporting_test.').replace('set local search_path=public,extensions','set local search_path=reporting_test,public,extensions')
    for table in ('result','chosen','appointment_money'):fixture=fixture.replace('create temporary table '+table,'create table reporting_test.'+table)
    observer.execute('create schema reporting_test;grant usage on schema reporting_test to authenticated;begin;create extension if not exists pgtap with schema extensions;set local search_path=reporting_test,public,extensions;select no_plan();'+fixture+'\nreset role;commit;')
    original=charge();write(original);cid=original['id'];report()
    observer.execute(f"select app_private.report_enqueue('{org}','{loc}','REVENUE','{cid}');select app_private.report_enqueue('{org}','{loc}','REVENUE','{cid}');")
    barrier('same source twice converges to one fact',refresh_sql(),refresh_sql())
    assert observer.execute(f"select count(*) from app_private.report_facts where source_id='{cid}' and domain='REVENUE';")[-1]=='1'
    payment=cmd('PAYMENT',id=str(uuid.uuid4()),client_id=client,currency='TRY',amount_minor='1000',method='CARD',appointment_id=None,external_reference=None,occurred_at=now(),allocations=[{'charge_id':cid,'amount_minor':'1000'}],confirm_credit=False);write(payment)
    refund=cmd('REFUND',id=str(uuid.uuid4()),original_payment_id=payment['id'],amount_minor='500',occurred_at=now())
    barrier('charge/refund while refresh waits',refresh_sql(),refresh_sql(),lambda:write(refund))
    assert observer.execute(f"select revenue_minor from app_private.report_facts where source_id='{cid}' and domain='REVENUE';")[-1]=='500'
    item='c5000000-0000-4000-8000-000000000101'
    auth(observer);observer.execute(f"select reporting_test.move('OPENING','{item}',100);");observer.execute('reset role;')
    move=cmd('ADJUSTMENT_OUT',stock_item_id=item,lot_id=None,quantity=5,unit='GRAM',occurred_at=now(),reference=None)
    barrier('stock actual ledger correction while refresh waits',refresh_sql(),refresh_sql(),lambda:write(move,'stock'))
    assert observer.execute(f"select quantity from app_private.report_facts where source_id='{item}' and domain='STOCK_ITEM';")[-1]=='95.00'
    auth(observer);observer.execute("select reporting_test.cost_policy('c5000000-0000-4000-8000-000000000201','PERCENT_NET_OF_TAX',1000);");observer.execute('reset role;')
    write(cmd('ASSIGN',id=str(uuid.uuid4()),staff_user_id=user,policy_id='c5000000-0000-4000-8000-000000000201',scope='DEFAULT_SERVICE',service_id=None,category=None,effective_from=now(),effective_until=None),'costing')
    appointment='aa000000-0000-4000-8000-000000000811'
    auth(observer)
    for version,state in [(1,'ARRIVED'),(2,'IN_SERVICE'),(3,'COMPLETED')]:observer.execute(f"select reporting_test.transition_finance('{appointment}',{version},'{state}');")
    observer.execute('reset role;')
    source=cmd('SERVICE_CHARGE',id=str(uuid.uuid4()),appointment_id=appointment);write(source)
    pay=cmd('PAYMENT',id=str(uuid.uuid4()),client_id=client,currency='TRY',amount_minor='120000',method='CARD',appointment_id=None,external_reference=None,occurred_at=now(),allocations=[{'charge_id':source['id'],'amount_minor':'120000'}],confirm_credit=False);write(pay)
    barrier('commission accrual plus refund adjustment',refresh_sql(),refresh_sql(),lambda:write(cmd('REFUND',id=str(uuid.uuid4()),original_payment_id=pay['id'],amount_minor='60000',occurred_at=now())))
    assert observer.execute(f"select commission_minor from app_private.report_facts where domain='COMMISSION' and details->>'charge_id'='{source['id']}';")[-1]=='5000'
    other='aa000000-0000-4000-8000-000000000812'
    auth(observer)
    for version,state in [(1,'ARRIVED'),(2,'IN_SERVICE')]:observer.execute(f"select reporting_test.transition_finance('{other}',{version},'{state}');")
    observer.execute('reset role;');auth(a);auth(b)
    completed=cmd('APPOINTMENT_TRANSITION',id=other,expected_version=3,status='COMPLETED')
    cancelled=cmd('APPOINTMENT_TRANSITION',id=other,expected_version=3,status='CANCELLED')
    assert 'data' in result(a.execute('begin;'+rpc(completed,'salon')))
    b.send('begin;'+rpc(cancelled,'salon')+'commit;');deadline=time.monotonic()+10
    while observer.execute(f'select {a.pid}=any(pg_blocking_pids({b.pid}));')[-1]!='t':
        assert time.monotonic()<deadline,'appointment lifecycle race did not block';time.sleep(.03)
    a.execute('commit;reset role;');out=result(b.receive());assert 'code' in out,out;b.execute('reset role;');report()
    assert observer.execute(f"select status from app_private.report_facts where domain='APPOINTMENT' and source_id='{other}';")[-1]=='COMPLETED'
    cases.append('completion/cancellation version conflict converges to one terminal state');print('PASS',cases[-1],'(distinct PostgreSQL backends, row/lifecycle blocking observed)')
    # Fresh identities with no active operational state: actual reviewed CRM merge.
    # Gate 1 intentionally requires organization-wide owner/manager membership
    # for identity merges. Give this synthetic observer that authorized scope.
    observer.execute(f"update public.salon_memberships set location_id=null where id='{member}';")
    identities=[str(uuid.uuid4()),str(uuid.uuid4())]
    for index,eid in enumerate(identities):observer.execute(f"insert into public.clients(id,organization_id,full_name,phone,phone_normalized,created_by,updated_by,creation_location_id) values('{eid}','{org}','Synthetic merge identity {index}','+90532000111{index}','+90532000111{index}','{user}','{user}','{loc}');")
    report();before=int(observer.execute(f"select count(*) from app_private.report_facts where domain='CLIENT' and organization_id='{org}';")[-1])
    auth(observer);review=result(observer.execute(f"select public.crm_read('{member}','{loc}',{literal({'operation':'merge_review','source_client_id':identities[0],'target_client_id':identities[1]})});"));observer.execute('reset role;');assert 'data' in review,review
    decisions={f:'SOURCE' for f in ('full_name','phone','email','birth_date','preferred_staff_id','preferred_service_ids','request_notes','preferred_channel','allow_manual_contact','do_not_contact')}
    merge=cmd('MERGE',review_token=review['data']['review_token'],decisions=decisions);merge.pop('reason')
    barrier('client merge plus reporting refresh',refresh_sql(),refresh_sql(),lambda:write(merge,'crm'))
    assert int(observer.execute(f"select count(*) from app_private.report_facts where domain='CLIENT' and organization_id='{org}';")[-1])==before-1
    late=charge('333')
    barrier('projection rebuild plus new committed event',rebuild_sql(),refresh_sql(),lambda:write(late))
    assert observer.execute(f"select revenue_minor from app_private.report_facts where source_id='{late['id']}' and domain='REVENUE';")[-1]=='333'
    # A sequence number is allocated before commit. A later event commits first.
    low=charge('222');auth(a);a.execute('begin;'+rpc(low))
    higher=charge('111');write(higher)
    b.execute('reset role;'+rebuild_sql());a.execute('commit;reset role;');report()
    assert observer.execute(f"select revenue_minor from app_private.report_facts where source_id='{low['id']}' and domain='REVENUE';")[-1]=='222'
    cases.append('late commit below captured sequence watermark survives rebuild');print('PASS',cases[-1],'(distinct PostgreSQL source/rebuild connections)')
    barrier('two rebuilds are serialized and idempotent',rebuild_sql(),rebuild_sql())
    # Actual trusted Live usage and post-stop material reconciliation outbox,
    # followed by the real Stock consumer, not a planned-recipe calculation.
    live_item='c4000000-0000-4000-8000-000000000111';session='a9000000-0000-4000-8000-000000000803';bowl='a9000000-0000-4000-8000-000000000901'
    auth(observer);observer.execute(f"select reporting_test.item('{live_item}',(select product_id from public.controlled_brand_recipes limit 1));select reporting_test.move('OPENING','{live_item}',100);");observer.execute('reset role;')
    observer.execute(f"update public.live_sessions set record_version=record_version+1,payload=jsonb_set(jsonb_set(payload,'{{recordVersion}}',to_jsonb(record_version+1)),'{{bowls}}',jsonb_build_array(jsonb_build_object('id','{bowl}','recipeId',current_recipe_id,'regionIds',jsonb_build_array('a9000000-0000-4000-8000-000000000051'),'plannedGrams',60,'preparedGrams',60,'usedGrams',40,'wasteGrams',20,'closed',true))) where id='{session}';insert into public.live_usage(organization_id,session_id,id,bowl_id,recipe_id,product_id,product_version,prepared_grams,used_grams,waste_grams,recorded_by,recorded_at) select s.organization_id,s.id,gen_random_uuid(),'{bowl}',r.id,p.id,p.version,30,20,10,s.controller_user_id,statement_timestamp() from public.live_sessions s join public.controlled_brand_recipes r on r.id=s.current_recipe_id join public.catalog_products p on p.id=r.product_id;")
    event=observer.execute("select id from public.stock_source_events where source_domain='LIVE_USAGE' order by created_at,id limit 1;")[-1]
    barrier('trusted live usage plus reporting refresh',refresh_sql(),refresh_sql(),lambda:write(cmd('PROCESS',event_id=event,lot_id=None),'stock'))
    assert observer.execute(f"select quantity from app_private.report_facts where domain='STOCK_ITEM' and source_id='{live_item}';")[-1]=='70.00'
    observer.execute(f"update public.live_sessions set record_version=record_version+1,status='ABORTED',payload=jsonb_set(jsonb_set(payload,'{{status}}','\"ABORTED\"'),'{{recordVersion}}',to_jsonb(record_version+1)) where id='{session}';insert into public.live_material_reconciliations(id,organization_id,location_id,session_id,client_id,bowl_id,recipe_id,mutation_id,supersedes_id,prepared_grams,used_grams,waste_grams,reason,recorded_by,recorded_at,correlation_id) select gen_random_uuid(),s.organization_id,s.location_id,s.id,s.client_id,'{bowl}',s.current_recipe_id,gen_random_uuid(),null,80,0,80,'Synthetic post-stop correction',s.controller_user_id,statement_timestamp(),gen_random_uuid() from public.live_sessions s where s.id='{session}';")
    event=observer.execute(f"select e.id from public.stock_source_events e join public.stock_items i on i.catalog_product_id=e.product_id where e.source_domain='MATERIAL_RECONCILIATION' and i.id='{live_item}' order by e.created_at desc,e.id desc limit 1;")[-1]
    barrier('post-stop reconciliation plus reporting refresh',refresh_sql(),refresh_sql(),lambda:write(cmd('PROCESS',event_id=event,lot_id=None),'stock'))
    assert observer.execute(f"select quantity from app_private.report_facts where domain='STOCK_ITEM' and source_id='{live_item}';")[-1]=='60.00'
    # Real source facts: 10k posted revenue facts and 40k historical appointments.
    observer.execute(f"insert into public.finance_documents(id,organization_id,location_id,client_id,type,currency,amount_minor,net_amount_minor,tax_amount_minor,tax_rate_bps,tax_inclusive,description,reason,recorded_by,occurred_at,created_at,correlation_id,mutation_id) select gen_random_uuid(),'{org}','{loc}','{client}','SERVICE_CHARGE','TRY',1000,1000,0,0,true,'Synthetic reporting scale revenue','Reporting source-scale fixture','{user}',statement_timestamp()-n*interval '1 second',statement_timestamp(),gen_random_uuid(),gen_random_uuid() from generate_series(1,10000)n;")
    observer.execute(f"""do $$declare cols text;projection text;begin
     select string_agg(quote_ident(column_name),',' order by ordinal_position),string_agg('(x.r).'||quote_ident(column_name),',' order by ordinal_position) into cols,projection from information_schema.columns where table_schema='public' and table_name='salon_appointments' and is_generated='NEVER';
     execute 'insert into public.salon_appointments('||cols||') select '||projection||' from (select jsonb_populate_record(null::public.salon_appointments,to_jsonb(a)||jsonb_build_object(''id'',gen_random_uuid(),''status'',''COMPLETED'',''completed_at'',statement_timestamp(),''actual_duration_seconds'',3600)) r from public.salon_appointments a cross join generate_series(1,40000)n where a.id=''{appointment}'')x';
    end$$;""")
    auth(observer);start=time.monotonic();rebuilt=result(observer.execute(rpc({'type':'REBUILD'},'reporting')));assert 'data' in rebuilt,rebuilt;performance['rebuild_50k_ms']=round((time.monotonic()-start)*1000,2);observer.execute('reset role;analyze app_private.report_facts;analyze app_private.report_invalidations;')
    facts=int(observer.execute(f"select count(*) from app_private.report_facts where organization_id='{org}' and location_id='{loc}';")[-1]);assert facts>=50000,facts
    for name,q in {'dashboard_summary':{},'report_list':{'kind':'FINANCE','domain':'REVENUE'},'detail':{'kind':'FINANCE','domain':'REVENUE','source_id':cid},'appointment_report':{'kind':'APPOINTMENTS'}}.items():
        report(q=q);samples=[]
        for _ in range(5):start=time.monotonic();out=report(q=q);samples.append((time.monotonic()-start)*1000)
        assert len(out['items'])<=50
        performance[name]={'median_ms':round(statistics.median(samples),2),'max_ms':round(max(samples),2),'samples':5}
        print('PERF',name,performance[name]['median_ms'],'ms median')
    # EXPLAIN executes the internal range/keyset scans, not just an opaque RPC.
    lo=datetime.now(timezone.utc).replace(day=1,hour=0,minute=0,second=0,microsecond=0).isoformat()
    queries={'range_summary':f"select sum(revenue_minor) from app_private.report_facts where organization_id='{org}' and location_id='{loc}' and domain='REVENUE' and at>='{lo}'::timestamptz",'keyset_page':f"select source_id,at from app_private.report_facts where organization_id='{org}' and location_id='{loc}' and domain='REVENUE' order by at desc,source_id desc limit 50",'source_detail':f"select * from app_private.report_facts where organization_id='{org}' and location_id='{loc}' and domain='REVENUE' and source_id='{cid}'"}
    performance['plans']={name:json.loads('\n'.join(observer.execute('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+query+';'))) for name,query in queries.items()}
    assert 'report_period' in json.dumps(performance['plans']['keyset_page'])
    assert 'report_facts_pkey' in json.dumps(performance['plans']['source_detail'])
    (Path(os.environ['RUNNER_TEMP'])/'reporting-performance.json').write_text(json.dumps({'real_concurrency_cases':len(cases),'cases':cases,'source_revenue_facts':10000,'source_appointments':40000,'derived_facts':facts,'read':performance},indent=2))
    assert len(cases)==11
    print('PASS: 11 real reporting concurrency cases; 10k revenue / 40k appointments; 50k+ rebuildable projections; executed EXPLAIN ANALYZE BUFFERS')
finally:
    for s in (a,b,observer):s.close()
