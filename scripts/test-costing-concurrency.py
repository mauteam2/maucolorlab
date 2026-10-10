"""Disposable PostgreSQL backends: finance barriers and meaningful ledger scale.
No production connection or mocked database. Every race observes pg_blocking_pids.
"""
from pathlib import Path
from datetime import datetime, timezone
import json,os,queue,subprocess,threading,time,uuid,statistics
ROOT=Path(__file__).resolve().parents[1]
assert os.environ.get('CI')=='true','Disposable CI PostgreSQL required'
class Session:
    def __init__(self):
        self.process=subprocess.Popen(['docker','exec','-i','supabase_db_elifora','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
        self.lines=queue.Queue()
        def collect():
            for line in self.process.stdout:self.lines.put(line.rstrip())
            self.lines.put(None)
        threading.Thread(target=collect,daemon=True).start()
        self.pid=int(self.execute('select pg_backend_pid();')[-1])
    def send(self,sql):
        self.end='finance_barrier_'+uuid.uuid4().hex
        self.process.stdin.write(sql+'\n\\echo '+self.end+'\n');self.process.stdin.flush()
    def receive(self,timeout=60):
        lines=[];deadline=time.monotonic()+timeout
        while True:
            line=self.lines.get(timeout=max(.1,deadline-time.monotonic()))
            if line is None:raise AssertionError('PostgreSQL session failed: '+'\n'.join(lines[-10:]))
            if line==self.end:return lines
            lines.append(line)
    def execute(self,sql):self.send(sql);return self.receive()
    def close(self):
        if self.process.poll() is None:self.process.stdin.write('\\q\n');self.process.stdin.flush();self.process.wait(timeout=10)
def literal(q):return "'"+json.dumps(q).replace("'","''")+"'::jsonb"
def result(lines):return json.loads(next(x for x in reversed(lines) if x.startswith('{')))
def identifier():return str(uuid.uuid4())
org='a7000000-0000-4000-8000-000000000001';loc='a7000000-0000-4000-8000-000000000011';user='a7000000-0000-4000-8000-000000000021';member='a7000000-0000-4000-8000-000000000111';client='a7000000-0000-4000-8000-000000000031';item='c5000000-0000-4000-8000-000000000101';policy='c5000000-0000-4000-8000-000000000201';service='a8000000-0000-4000-8000-000000000801'
observer=Session();a=Session();b=Session();count=0;performance={}
def now():return datetime.now(timezone.utc).isoformat()
def auth(s):s.execute(f"set role authenticated;set request.jwt.claim.sub='{user}';")
def command(t,**fields):return {'type':t,'mutation_id':identifier(),'reason':'Synthetic cost/commission verification',**fields}
def rpc(q,domain='costing'):return f"select public.{domain}_operation('{member}','{loc}',{literal(q)},gen_random_uuid());"
def write(q,domain='costing'):
    auth(observer);reply=result(observer.execute(rpc(q,domain)));observer.execute('reset role;');assert 'data' in reply,reply;return reply['data']
def race(label,first,second,expected=None):
    global count
    auth(a);auth(b);one=result(a.execute("begin;set local lock_timeout='20s';"+first));assert 'data' in one,(label,one)
    b.send("begin;set local lock_timeout='20s';"+second+';commit;');deadline=time.monotonic()+10
    while observer.execute(f'select {a.pid}=any(pg_blocking_pids({b.pid}));')[-1]!='t':
        assert time.monotonic()<deadline,label+': missing lock order';time.sleep(.03)
    a.execute('commit;');out=result(b.receive());assert out.get('code')==expected,(label,out)
    count+=1;print('PASS',label,'(distinct PostgreSQL backends; real blocking observed)');return out
def intake(qty,cost):
    mid=identifier();move=command('RECEIPT',stock_item_id=item,lot_id=None,quantity=qty,unit='GRAM',occurred_at=now(),reference=None,mutation_id=mid)
    return command('INTAKE',mutation_id=mid,stock_command=move,currency='TRY',total_cost_minor=str(cost),unit_cost_numerator=None,unit_cost_denominator=None,cost_basis_at=now(),external_reference=None)
def out(qty):return command('ADJUSTMENT_OUT',stock_item_id=item,lot_id=None,quantity=qty,unit='GRAM',occurred_at=now(),reference=None)
def basis(n,v):return command('SET_BASIS',stock_item_id=item,lot_id=None,expected_version=v,currency='TRY',unit_cost_numerator=str(n),unit_cost_denominator='1',cost_basis_at=now())
def finance_charge(appointment):return command('SERVICE_CHARGE',id=identifier(),appointment_id=appointment)
def policy_version(v,rate):return command('POLICY_VERSION',id=policy,expected_version=v,name='Synthetic commission',domain='SERVICE',method='PERCENT_NET_OF_TAX',rate_bps=rate,fixed_minor=None,currency='TRY',effective_from=now())
def complete(appointment):
    for version,status in [(1,'ARRIVED'),(2,'IN_SERVICE'),(3,'COMPLETED')]:write(command('APPOINTMENT_TRANSITION',id=appointment,expected_version=version,status=status),'salon')
def payment(cid):return command('PAYMENT',id=identifier(),client_id=client,currency='TRY',amount_minor='120000',method='CARD',appointment_id=None,external_reference=None,occurred_at=now(),allocations=[{'charge_id':cid,'amount_minor':'120000'}],confirm_credit=False)
def refund(pid,n):return command('REFUND',id=identifier(),original_payment_id=pid,amount_minor=str(n),occurred_at=now())
try:
    assert len({a.pid,b.pid,observer.pid})==3
    def include(name):
        import re
        text=(ROOT/'supabase/tests/fixtures'/name).read_text(encoding='utf-8')
        return re.sub(r'^\\ir (.+)$',lambda m:include(m.group(1)),text,flags=re.M)
    text=include('costing-salon.inc').replace('b4000000','a7000000').replace('e5000000','a8000000').replace('@elifora.test','@costing-concurrency.elifora.test').replace("'controlled-a'","'costing-controlled-a'").replace("'controlled-b'","'costing-controlled-b'").replace('pg_temp.','costing_test.').replace('set local search_path=public,extensions','set local search_path=costing_test,public,extensions')
    for table in ('result','chosen','appointment_money'):text=text.replace('create temporary table '+table,'create table costing_test.'+table)
    observer.execute('create schema costing_test;grant usage on schema costing_test to authenticated;begin;set local search_path=costing_test,public,extensions;'+text+'\nreset role;commit;')
    # Real Live usage enqueues trusted outbox events; both stock consumers cause
    # the synchronous immutable cost trigger to contend on the same item.
    auth(observer)
    observer.execute("select costing_test.item('c4000000-0000-4000-8000-000000000111',(select product_id from public.controlled_brand_recipes limit 1));select costing_test.move('OPENING','c4000000-0000-4000-8000-000000000111',100);select costing_test.cost_basis('c4000000-0000-4000-8000-000000000111','10',1);")
    observer.execute('reset role;')
    observer.execute(f"update public.live_sessions set record_version=record_version+1,payload=jsonb_set(jsonb_set(payload,'{{recordVersion}}',to_jsonb(record_version+1)),'{{bowls}}',jsonb_build_array(jsonb_build_object('id','a7000000-0000-4000-8000-000000000901','recipeId',current_recipe_id,'regionIds',jsonb_build_array('a7000000-0000-4000-8000-000000000051'),'plannedGrams',60,'preparedGrams',60,'usedGrams',40,'wasteGrams',20,'closed',true))) where id='a7000000-0000-4000-8000-000000000803';insert into public.live_usage(organization_id,session_id,id,bowl_id,recipe_id,product_id,product_version,prepared_grams,used_grams,waste_grams,recorded_by,recorded_at) select s.organization_id,s.id,gen_random_uuid(),'a7000000-0000-4000-8000-000000000901',r.id,r.product_id,1,30,20,10,'{user}',statement_timestamp() from public.live_sessions s join public.controlled_brand_recipes r on r.id=s.current_recipe_id;")
    event=observer.execute('select id from public.stock_source_events limit 1;')[-1]
    race('same usage cost processed twice',rpc(command('PROCESS',event_id=event,lot_id=None),'stock'),rpc(command('PROCESS',event_id=event,lot_id=None),'stock'))
    assert observer.execute(f"select count(*) from public.direct_cost_facts f join public.stock_movements m on m.id=f.stock_movement_id where m.source_event_id='{event}';")[-1]=='1'
    write(command('INTAKE',mutation_id='c5000000-0000-4000-8000-000000000701',stock_command=command('OPENING',mutation_id='c5000000-0000-4000-8000-000000000701',stock_item_id=item,lot_id=None,quantity=100,unit='GRAM',occurred_at=now(),reference=None),currency='TRY',total_cost_minor='1000',unit_cost_numerator=None,unit_cost_denominator=None,cost_basis_at=now(),external_reference=None))
    race('receipt acquisition cost plus actual usage',rpc(intake(100,3000)),rpc(out(10),'stock'))
    assert observer.execute(f"select total_cost_minor from public.direct_cost_facts where stock_item_id='{item}' and quantity='10.00';")[-1]=='200'
    write(policy_version(0,1000))
    write(command('ASSIGN',id=identifier(),staff_user_id=user,policy_id=policy,scope='DEFAULT_SERVICE',service_id=None,category=None,effective_from=now(),effective_until=None))
    first='a8000000-0000-4000-8000-000000000811';second='a8000000-0000-4000-8000-000000000812';complete(first);complete(second)
    cid=finance_charge(first);write(cid,'finance');cid=cid['id']
    race('two commission processors same charge',rpc(command('PROCESS_CHARGE',charge_id=cid)),rpc(command('PROCESS_CHARGE',charge_id=cid)))
    assert observer.execute(f"select count(*) from public.commission_accruals where charge_id='{cid}';")[-1]=='1'
    second_charge=finance_charge(second)
    race('policy version change plus charge posting re-read lifecycle',rpc(policy_version(1,2000)),rpc(second_charge,'finance'))
    assert observer.execute(f"select policy_version from public.commission_accruals where charge_id='{second_charge['id']}';")[-1]=='1', 'completion time, not payment/posting time'
    p=payment(cid);write(p,'finance')
    race('refund plus commission consumer',rpc(refund(p['id'],20000),'finance'),rpc(command('PROCESS_CHARGE',charge_id=cid)))
    race('two concurrent refund adjustments',rpc(refund(p['id'],50000),'finance'),rpc(refund(p['id'],50000),'finance'))
    assert observer.execute(f"select a.amount_minor+coalesce(sum(x.amount_minor),0) from public.commission_accruals a left join public.commission_adjustments x on x.accrual_id=a.id where a.charge_id='{cid}' group by a.amount_minor;")[-1]=='0'
    v=int(observer.execute(f"select max(version) from public.stock_cost_basis_events where stock_item_id='{item}' and stock_lot_id is null;")[-1])
    race('future cost correction plus new usage',rpc(basis(30,v)),rpc(out(10),'stock'))
    retail=command('RETAIL_SALE',id=identifier(),client_id=client,currency='TRY',stock_item_id=item,lot_id=None,quantity='2',unit_price_minor='100',tax_rate_bps=0,tax_inclusive=True,description='Synthetic retail contribution',occurred_at=now());write(retail,'finance')
    race('retail reversal plus immutable cost/profitability consumer',rpc(command('REVERSAL',id=identifier(),document_id=retail['id']),'finance'),rpc(command('PROCESS_CHARGE',charge_id=retail['id'])))
    assert observer.execute(f"select sum(total_cost_minor) from public.direct_cost_facts where finance_document_id='{retail['id']}';")[-1]=='0'
    assert observer.execute(f"select count(*) from public.direct_cost_facts where finance_document_id='{retail['id']}';")[-1]=='2'
    # Mixed operational charge population, not finance payments masquerading as revenue.
    observer.execute(f"insert into public.finance_documents(id,organization_id,location_id,client_id,type,currency,amount_minor,net_amount_minor,tax_amount_minor,tax_rate_bps,tax_inclusive,description,reason,recorded_by,occurred_at,created_at,correlation_id,mutation_id) select gen_random_uuid(),'{org}','{loc}','{client}','SERVICE_CHARGE','TRY',1000,1000,0,0,true,'Synthetic cost-scale service','Synthetic measured performance population','{user}',statement_timestamp()-n*interval '1 second',statement_timestamp(),gen_random_uuid(),gen_random_uuid() from generate_series(1,10000)n;analyze public.finance_documents;analyze public.profitability_revenue_facts;analyze public.commission_accruals;")
    auth(observer)
    requests={'profitability_list':{},'service_profitability_detail':{'charge_id':cid},'staff_commission_period':{'kind':'COMMISSION_ALL'},'finance_day_summary':None,'client_finance_balance':{'client_id':client}}
    for label,q in requests.items():
        is_finance=label.startswith('finance_') or label=='client_finance_balance'
        sql=f"select public.{'finance' if is_finance else 'costing'}_snapshot('{member}','{loc}',{literal(q or {})});"
        observer.execute(sql);samples=[]
        for _ in range(3):start=time.monotonic();out=result(observer.execute(sql));assert 'data' in out,out;samples.append((time.monotonic()-start)*1000)
        plan=observer.execute('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql)
        performance[label]={'median_ms':round(statistics.median(samples),2),'max_ms':round(max(samples),2),'samples':3,'explain_analyze_buffers':plan}
        assert max(samples)<10000,(label,samples)
        print('PERF',label,performance[label]['median_ms'],'ms median')
    path=Path(os.environ['RUNNER_TEMP'])/'costing-performance.json';path.write_text(json.dumps({'real_concurrency_cases':count,'facts':10000,'read':performance,'phase_5a_baseline_ms':{'day_summary':6665.89,'client_balance':6250.27}},indent=2));assert count==8
    print('PASS: 8 real multi-backend costing/commission cases; 10k facts; EXPLAIN ANALYZE BUFFERS evidence')
finally:
    for session in (a,b,observer):session.close()
