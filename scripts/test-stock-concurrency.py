"""Phase 4C distinct PostgreSQL backends, observed lock barriers and 10k ledger probe.
Disposable local CI only. Test helpers never enter the application schema/API.
"""
from pathlib import Path
import json,os,queue,re,subprocess,threading,time,uuid,statistics
ROOT=Path(__file__).resolve().parents[1]
CONTAINER="supabase_db_elifora"
assert os.environ.get("CI")=="true", "Disposable CI PostgreSQL required"
class Session:
    def __init__(self):
        self.process = subprocess.Popen(
            ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
        self.lines = queue.Queue()
        def collect():
            for line in self.process.stdout:
                self.lines.put(line.rstrip())
            self.lines.put(None)
        threading.Thread(target=collect, daemon=True).start()
        self.pid = int(self.execute("select pg_backend_pid();")[-1])

    def send(self, sql):
        self.end = "gate_barrier_" + uuid.uuid4().hex
        self.process.stdin.write(sql + "\n\\echo " + self.end + "\n")
        self.process.stdin.flush()

    def receive(self, timeout=30):
        result = []
        deadline = time.monotonic() + timeout
        while True:
            line = self.lines.get(timeout=max(.1, deadline-time.monotonic()))
            if line is None:
                raise AssertionError("Database session failed: " + "\n".join(result[-8:]))
            if line == self.end:
                return result
            result.append(line)

    def execute(self, sql):
        self.send(sql)
        return self.receive()

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.write("\\q\n")
            self.process.stdin.flush()
            self.process.wait(timeout=10)


def literal(value):
    return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"


def result(lines):
    return json.loads(next(line for line in reversed(lines) if line.startswith("{")))


def auth(session, user):
    session.execute(f"set role authenticated;set search_path=stock_test,public,extensions;set request.jwt.claim.sub='{user}';")

def fixture():
    text=(ROOT/'supabase/tests/fixtures/stock.inc').read_text(encoding='utf-8').replace('\\ir gate-1-live.inc',(ROOT/'supabase/tests/fixtures/gate-1-live.inc').read_text(encoding='utf-8'))
    text=text.replace('@elifora.test','@stock-concurrency.elifora.test').replace("'controlled-a'","'stock-controlled-a'").replace("'controlled-b'","'stock-controlled-b'").replace('b4000000','d4000000').replace('pg_temp.','stock_test.').replace('set local search_path=public,extensions','set local search_path=stock_test,public,extensions')
    for table in ('result','chosen'):text=text.replace('create temporary table '+table,'create table stock_test.'+table)
    return 'begin;set local search_path=stock_test,public,extensions;'+text+'\nreset role;commit;'

observer=Session();a=Session();b=Session();count=0
member='d4000000-0000-4000-8000-000000000111';loc='d4000000-0000-4000-8000-000000000011';user='d4000000-0000-4000-8000-000000000021'
item='c4000000-0000-4000-8000-000000000101';color='c4000000-0000-4000-8000-000000000111';developer='c4000000-0000-4000-8000-000000000112'
session='d4000000-0000-4000-8000-000000000803';bowl='d4000000-0000-4000-8000-000000000901'
def rpc(q):return f"select public.stock_operation('{member}','{loc}',{literal(q)},gen_random_uuid());"
def command(t,**kw):return {'type':t,'mutation_id':str(uuid.uuid4()),**kw}
def move(t,i,n):return rpc(command(t,stock_item_id=i,lot_id=None,quantity=n,unit='GRAM',occurred_at='2026-10-09T12:00:00Z',reference=None,reason='Synthetic concurrency movement'))
def process(e):return rpc(command('PROCESS',event_id=e,lot_id=None))
def balance(i):return float(observer.execute(f"select coalesce(sum(quantity_delta),0) from public.stock_movements where stock_item_id='{i}';")[-1])
def usage(new_bowl,n=30):
    return f"insert into public.live_usage(organization_id,session_id,id,bowl_id,recipe_id,product_id,product_version,prepared_grams,used_grams,waste_grams,recorded_by,recorded_at) select s.organization_id,s.id,gen_random_uuid(),'{new_bowl}',r.id,p.id,p.version,{n},0,{n},s.controller_user_id,statement_timestamp() from public.live_sessions s join public.controlled_brand_recipes r on r.id=s.current_recipe_id join public.catalog_products p on p.id=r.product_id where s.id='{session}';"
def event(new_bowl):return observer.execute(f"select id from public.stock_source_events where bowl_id='{new_bowl}' order by created_at,id limit 1;")[-1]
def race(label,first,second,expected=None):
    global count
    auth(a,user);auth(b,user)
    initial=result(a.execute("begin;set local lock_timeout='10s';"+first));assert not initial.get('code'),(label,initial)
    b.send("begin;set local lock_timeout='10s';"+second+';commit;')
    deadline=time.monotonic()+10
    while observer.execute(f"select {a.pid}=any(pg_blocking_pids({b.pid}));")[-1]!='t':
        assert time.monotonic()<deadline,label+': missing real lock barrier'
        time.sleep(.03)
    a.execute('commit;');value=result(b.receive());assert value.get('code')==expected,(label,value)
    count+=1;print('PASS',label,'(distinct backends; PostgreSQL blocking barrier observed)')
    return value
try:
    assert len({a.pid,b.pid,observer.pid})==3
    observer.execute('create schema stock_test;grant usage on schema stock_test to authenticated;')
    observer.execute(fixture());auth(observer,user)
    for identifier,column in ((color,'product_id'),(developer,'developer_id')):
        value=result(observer.execute(f"select stock_test.item('{identifier}',(select {column} from public.controlled_brand_recipes where id=(select current_recipe_id from public.live_sessions where id='{session}')));"));assert value['data']['status']=='SAVED',value
        assert not result(observer.execute(move('OPENING',identifier,100))).get('code')
    observer.execute('reset role;')
    race('two receipts serialize without lost quantity',move('RECEIPT',item,10),move('RECEIPT',item,20));assert balance(item)==130
    race('two adjustments cannot overspend',move('ADJUSTMENT_OUT',item,100),move('ADJUSTMENT_OUT',item,40),'STOCK_INSUFFICIENT');assert balance(item)==30
    observer.execute(usage(bowl));ev=event(bowl)
    race('same source with two mutation IDs consumes once',process(ev),process(ev));assert balance(color)==70
    assert observer.execute(f"select count(*) from public.stock_movements where source_event_id='{ev}';")[-1]=='1'
    second_bowl=str(uuid.uuid4());observer.execute(usage(second_bowl,10))
    race('usage and manual adjustment share item lock',process(event(second_bowl)),move('ADJUSTMENT_IN',color,5));assert balance(color)==65
    count_id=str(uuid.uuid4());auth(observer,user)
    assert not result(observer.execute(rpc(command('COUNT_CREATE',id=count_id,reason='Concurrent count',lines=[{'stock_item_id':color,'lot_id':None,'counted_quantity':60}])))).get('code')
    observer.execute('reset role;');third_bowl=str(uuid.uuid4());observer.execute(usage(third_bowl,5))
    race('count confirmation rechecks intervening consumption',process(event(third_bowl)),rpc(command('COUNT_CONFIRM',id=count_id,reason='Validate current basis')),'STOCK_COUNT_STALE');assert balance(color)==60
    observer.execute(f"create function stock_test.material(n numeric,previous uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare new_id uuid:=gen_random_uuid();begin insert into public.live_material_reconciliations(id,organization_id,location_id,session_id,client_id,bowl_id,recipe_id,mutation_id,supersedes_id,prepared_grams,used_grams,waste_grams,reason,recorded_by,recorded_at,correlation_id) select new_id,s.organization_id,s.location_id,s.id,s.client_id,'{bowl}',s.current_recipe_id,gen_random_uuid(),previous,n,0,n,'Concurrency measurement',s.controller_user_id,statement_timestamp(),gen_random_uuid() from public.live_sessions s where s.id='{session}';return new_id;end $$;")
    first=observer.execute('select stock_test.material(80);')[-1];latest=observer.execute(f"select stock_test.material(100,'{first}');")[-1]
    product=observer.execute(f"select product_id from public.controlled_brand_recipes where id=(select current_recipe_id from public.live_sessions where id='{session}');")[-1]
    old_event=observer.execute(f"select id from public.stock_source_events where source_event_id='{first}' and product_id='{product}';")[-1]
    new_event=observer.execute(f"select id from public.stock_source_events where source_event_id='{latest}' and product_id='{product}';")[-1]
    race('reconciliation correction and concurrent processing use latest leaf',process(old_event),process(new_event));assert balance(color)==40
    observer.execute(f"select stock_test.material(120,'{latest}');")
    next_event=observer.execute(f"select id from public.stock_source_events where product_id='{product}' and status='PENDING' order by created_at desc limit 1;")[-1]
    auth(a,user);a.execute('begin;'+process(next_event));b.execute('reset role;')
    leaf=observer.execute(f"select id from public.live_material_reconciliations x where x.session_id='{session}' and not exists(select 1 from public.live_material_reconciliations y where y.supersedes_id=x.id);")[-1]
    b.execute(f"begin;select stock_test.material(140,'{leaf}');commit;");a.execute('commit;')
    last_event=observer.execute(f"select id from public.stock_source_events where product_id='{product}' and status='PENDING' order by created_at desc limit 1;")[-1]
    auth(observer,user);assert result(observer.execute(process(last_event)))['data']['status']=='PROCESSED';observer.execute('reset role;');assert balance(color)==20
    count+=1;print('PASS correction enqueue during in-flight consumption remains durable (distinct backends)')
    auth(observer,user);count_id=str(uuid.uuid4())
    assert not result(observer.execute(rpc(command('COUNT_CREATE',id=count_id,reason='Cutover barrier count',lines=[{'stock_item_id':item,'lot_id':None,'counted_quantity':25}])))).get('code')
    observer.execute('reset role;')
    new_bowl=str(uuid.uuid4());sql=usage(new_bowl,1)
    observer.execute(f"create function stock_test.enqueue() returns jsonb language plpgsql security definer set search_path='' as $$begin {sql} return '{{\"data\":{{\"status\":\"QUEUED\"}}}}'::jsonb;end $$;")
    race('count confirmation and technical enqueue have an observed cutover barrier',rpc(command('COUNT_CONFIRM',id=count_id,reason='Confirm measured count')),'select stock_test.enqueue();');assert balance(item)==25
    first_bowl=str(uuid.uuid4());second_bowl=str(uuid.uuid4())
    observer.execute(usage(first_bowl,2)+usage(second_bowl,3))
    race('two distinct usage events serialize without lost consumption',process(event(first_bowl)),process(event(second_bowl)));assert balance(color)==15
    observer.execute(f"insert into public.stock_movements(organization_id,location_id,stock_item_id,movement_type,quantity_delta,unit,reason,recorded_by,occurred_at,correlation_id,mutation_id) select 'd4000000-0000-4000-8000-000000000001','{loc}','{item}','RECEIPT',1,'GRAM','Synthetic performance ledger','{user}',statement_timestamp()-n*interval '1 second',gen_random_uuid(),gen_random_uuid() from generate_series(1,10000)n;analyze public.stock_movements;")
    auth(observer,user);metrics={}
    def measure(label,sql):
        samples=[]
        for _ in range(3):
            query=sql() if callable(sql) else sql
            start=time.monotonic();observer.execute(query);samples.append((time.monotonic()-start)*1000)
        metrics[label]=round(statistics.median(samples),2);assert max(samples)<10000,(label,samples)
    snap=lambda q:f"select public.stock_snapshot('{member}','{loc}',{literal(q)});"
    measure('directory_balance_and_low_stock_actions',snap({}))
    measure('item_balance_lot_history',snap({'item_id':item}))
    measure('movement_history',f"select id,quantity_delta from public.stock_movements where organization_id='d4000000-0000-4000-8000-000000000001' and location_id='{loc}' and stock_item_id='{item}' order by occurred_at desc,id limit 100;")
    measure('receipt_posting',lambda:move('RECEIPT',item,1))
    measure('physical_count_basis',lambda:rpc(command('COUNT_CREATE',id=str(uuid.uuid4()),reason='Performance count',lines=[{'stock_item_id':item,'lot_id':None,'counted_quantity':10025}])))
    def confirm_query():
        identifier=str(uuid.uuid4())
        current=float(observer.execute(f"select sum(quantity_delta) from public.stock_movements where stock_item_id='{item}';")[-1])
        created=result(observer.execute(rpc(command('COUNT_CREATE',id=identifier,reason='Performance confirmation basis',lines=[{'stock_item_id':item,'lot_id':None,'counted_quantity':current-1}]))))
        assert created['data']['status']=='SAVED',created
        return rpc(command('COUNT_CONFIRM',id=identifier,reason='Performance measured count'))
    measure('physical_count_confirmation',confirm_query)
    plan_sql=f"select id,quantity_delta from public.stock_movements where organization_id='d4000000-0000-4000-8000-000000000001' and location_id='{loc}' and stock_item_id='{item}' order by occurred_at desc,id limit 100"
    plan=json.loads('\n'.join(observer.execute('explain(analyze,buffers,format json) '+plan_sql+';')))
    report={'synthetic_movements':10000,'connections':3,'concurrency_cases':count,'median_ms':metrics,'history_plan':plan}
    if os.environ.get('RUNNER_TEMP'):(Path(os.environ['RUNNER_TEMP'])/'stock-performance.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('Stock real multi-connection cases executed:',count)
    print('Stock 10,000-movement performance median milliseconds:',json.dumps(metrics,sort_keys=True))
finally:
    a.close();b.close();observer.close()

