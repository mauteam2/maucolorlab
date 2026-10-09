"""Disposable PostgreSQL backends: finance barriers and meaningful ledger scale.
No production connection or mocked database. Every race observes pg_blocking_pids.
"""
from pathlib import Path
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
org='f4000000-0000-4000-8000-000000000001';loc='f4000000-0000-4000-8000-000000000011';user='f4000000-0000-4000-8000-000000000021';member='f4000000-0000-4000-8000-000000000111';client='f4000000-0000-4000-8000-000000000031';cash='f5000000-0000-4000-8000-000000000101';item='c4000000-0000-4000-8000-000000000101'
def auth(s):s.execute(f"set role authenticated;set request.jwt.claim.sub='{user}';")
def rpc(q):return f"select public.finance_operation('{member}','{loc}',{literal(q)},gen_random_uuid());"
def command(t,**fields):return {'type':t,'mutation_id':identifier(),'reason':'Synthetic factual verification',**fields}
def posted(t,n,**fields):return command(t,id=identifier(),client_id=client,currency='TRY',amount_minor=str(n),description='Synthetic finance fact',occurred_at=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),**fields)
def charge(n):return posted('MANUAL_CHARGE',n,tax_rate_bps=0,tax_inclusive=True)
def payment(n,allocations=None,method='CARD',deposit=False):
    q=posted('DEPOSIT' if deposit else 'PAYMENT',n,method=method,appointment_id=None,external_reference=None)
    q.pop('description')
    if not deposit:q.update(allocations=allocations or [],confirm_credit=True)
    return q
def allocate(pid,cid,n):return command('ALLOCATE',client_id=client,payment_id=pid,allocations=[{'charge_id':cid,'amount_minor':str(n)}])
def refund(pid,n):return command('REFUND',id=identifier(),original_payment_id=pid,amount_minor=str(n),occurred_at=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()))
observer=Session();a=Session();b=Session();count=0;performance={}
def write(q):auth(observer);r=result(observer.execute(rpc(q)));assert 'data' in r,r;observer.execute('reset role;');return q['id']
def race(label,first,second,expected=None):
    global count
    auth(a);auth(b)
    initial=result(a.execute("begin;set local lock_timeout='15s';"+first));assert 'data' in initial,(label,initial)
    b.send("begin;set local lock_timeout='15s';"+second+';commit;')
    deadline=time.monotonic()+10
    while observer.execute(f'select {a.pid}=any(pg_blocking_pids({b.pid}));')[-1]!='t':
        assert time.monotonic()<deadline,label+': lock barrier missing'
        time.sleep(.03)
    a.execute('commit;');out=result(b.receive());assert out.get('code')==expected,(label,out)
    count+=1;print('PASS',label,'(distinct PostgreSQL backends; blocking barrier observed)')
    return out
try:
    assert len({a.pid,b.pid,observer.pid})==3
    def include(name):
        text=(ROOT/'supabase/tests/fixtures'/name).read_text()
        import re
        return re.sub(r'^\\ir (.+)$',lambda m:include(m.group(1)),text,flags=re.M)
    text=include('finance.inc').replace('b4000000','f4000000').replace('e5000000','f5000000').replace('@elifora.test','@finance-concurrency.elifora.test').replace("'controlled-a'","'finance-controlled-a'").replace("'controlled-b'","'finance-controlled-b'").replace('pg_temp.','finance_test.')
    for table in ('result','chosen'):text=text.replace('create temporary table '+table,'create table finance_test.'+table)
    observer.execute('create schema finance_test;grant usage on schema finance_test to authenticated;begin;set local search_path=finance_test,public,extensions;'+text+'\nreset role;commit;')
    q=payment(100);race('same payment mutation twice',rpc(q),rpc(q))
    assert observer.execute(f"select count(*) from public.finance_documents where id='{q['id']}';")[-1]=='1'
    cid=write(charge(1000));line=[{'charge_id':cid,'amount_minor':'600'}]
    race('two payments cannot over-allocate one charge',rpc(payment(600,line)),rpc(payment(600,line)),'FINANCE_ALLOCATION_CONFLICT')
    cid=write(charge(1000));pid=write(payment(600,deposit=True))
    race('same deposit cannot be applied twice',rpc(allocate(pid,cid,600)),rpc(allocate(pid,cid,600)),'FINANCE_ALLOCATION_CONFLICT')
    pid=write(payment(1000,deposit=True));cid=write(charge(1000))
    race('refund and allocation recheck remaining credit',rpc(refund(pid,700)),rpc(allocate(pid,cid,400)),'FINANCE_ALLOCATION_CONFLICT')
    pid=write(payment(1000));race('two refunds cannot exceed original payment',rpc(refund(pid,600)),rpc(refund(pid,600)),'FINANCE_REFUND_LIMIT')
    counted=command('CASH_CLOSE_SUBMIT',id=cash,expected_version=1,counted_cash_minor='10000');write(counted)
    race('late cash payment invalidates reviewed close',rpc(payment(100,method='CASH')),rpc(command('CASH_CLOSE_CONFIRM',id=cash,expected_version=2,acknowledge_difference=True)),'CASH_CLOSE_STALE')
    sale=command('RETAIL_SALE',id=identifier(),client_id=client,currency='TRY',stock_item_id=item,lot_id=None,quantity='60',unit_price_minor='100',tax_rate_bps=0,tax_inclusive=True,description='Synthetic retail',occurred_at=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()))
    stock={'type':'ADJUSTMENT_OUT','mutation_id':identifier(),'stock_item_id':item,'lot_id':None,'quantity':50,'unit':'GRAM','occurred_at':'2026-10-09T12:00:00Z','reference':None,'reason':'Measured concurrent adjustment'}
    stock_rpc=f"select public.stock_operation('{member}','{loc}',{literal(stock)},gen_random_uuid());"
    race('retail and stock adjustment share item lock',rpc(sale),stock_rpc,'STOCK_INSUFFICIENT')
    assert observer.execute(f"select sum(quantity_delta) from public.stock_movements where stock_item_id='{item}';")[-1]=='40.00'
    cid=write(charge(1000));race('client balance payments retain both financial facts',rpc(payment(400,[{'charge_id':cid,'amount_minor':'400'}])),rpc(payment(600,[{'charge_id':cid,'amount_minor':'600'}])))
    assert observer.execute(f"select amount_minor-(select sum(amount_minor) from public.finance_payment_allocations where charge_id='{cid}') from public.finance_documents where id='{cid}';")[-1]=='0'
    # 10k independent immutable facts and their client ledger; no cached balance.
    observer.execute(f"insert into public.finance_documents(id,organization_id,location_id,client_id,type,currency,amount_minor,net_amount_minor,tax_amount_minor,tax_rate_bps,tax_inclusive,description,reason,recorded_by,occurred_at,created_at,correlation_id,mutation_id) select gen_random_uuid(),'{org}','{loc}','{client}',case when n%5=0 then 'EXPENSE' else 'CLIENT_DEBIT' end,'TRY',100,100,0,0,true,'Synthetic scale','Synthetic scale','{user}',statement_timestamp(),statement_timestamp(),gen_random_uuid(),gen_random_uuid() from generate_series(1,10000) n;insert into public.finance_ledger_entries(document_id,organization_id,location_id,client_id,currency,account,amount_minor,recorded_by,created_at) select id,organization_id,location_id,client_id,currency,'CLIENT',amount_minor,recorded_by,created_at from public.finance_documents where description='Synthetic scale' and type='CLIENT_DEBIT';insert into public.finance_expenses(document_id,organization_id,location_id,category,method) select id,organization_id,location_id,'SUPPLIES','CARD' from public.finance_documents where description='Synthetic scale' and type='EXPENSE';analyze public.finance_documents;analyze public.finance_ledger_entries;analyze public.finance_expenses;")
    def read(q):return f"select public.finance_snapshot('{member}','{loc}',{literal(q)});"
    auth(observer)
    for label,sql in [('day_summary',read({})),('client_balance',read({'client_id':client})),('transaction_list',read({'offset':100})),('expense_list',f"select count(*) from (select document_id from public.finance_expenses where organization_id='{org}' and location_id='{loc}' limit 100) x;")]:
        samples=[]
        for _ in range(5):
            started=time.perf_counter();observer.execute(sql);samples.append((time.perf_counter()-started)*1000)
        performance[label]={'samples':5,'median_ms':round(statistics.median(samples),2),'max_ms':round(max(samples),2)}
        assert max(samples)<10000,(label,samples)
    for label,q in [('payment_creation',payment(100)),('refund',refund(pid,100))]:
        started=time.perf_counter();out=result(observer.execute(rpc(q)));assert 'data' in out,(label,out);performance[label]={'elapsed_ms':round((time.perf_counter()-started)*1000,2)}
    cash_row=result(observer.execute(read({})))['data']['cash_sessions'][0]
    out=result(observer.execute(rpc(command('CASH_CLOSE_SUBMIT',id=cash,expected_version=cash_row['version'],counted_cash_minor='10100'))));assert 'data' in out,out
    started=time.perf_counter();out=result(observer.execute(rpc(command('CASH_CLOSE_CONFIRM',id=cash,expected_version=cash_row['version']+1,acknowledge_difference=True))));assert 'data' in out,out
    performance['cash_close']={'elapsed_ms':round((time.perf_counter()-started)*1000,2)}
    evidence={'real_concurrency_cases':count,'scale_documents':10000,'performance':performance,'measurement':'client-to-container psql elapsed; disposable synthetic data'}
    path=Path(os.environ.get('RUNNER_TEMP','/tmp'))/'finance-performance.json';path.write_text(json.dumps(evidence,indent=2))
    print(json.dumps(evidence));print(f'PASS: {count} real finance concurrency cases')
finally:
    for s in (a,b,observer):s.close()
