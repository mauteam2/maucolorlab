"""Real disposable PostgreSQL connections; wait barriers use pg_blocking_pids.

Run only after local Supabase migrations/tests. Docker psql sessions are separate
backend connections, never a shared transaction or mocked Promise.all. Test-only
helpers/fixtures are created in an unexposed schema on the disposable database.
No connection string, key, customer payload or signing material is printed.
"""
from pathlib import Path
import json
import os
import queue
import subprocess
import threading
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = "supabase_db_elifora"
assert os.environ.get("CI") == "true", "Disposable CI database required"


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
    session.execute(f"set role authenticated;set request.jwt.claim.sub='{user}';")


def prefix_fixture(name, stop, table):
    text=(ROOT/"supabase/tests"/name).read_text(encoding="utf-8").split(stop)[0]
    # Assertions in the original pgTAP files are independently executed by CI.
    # Here only fixture creation statements are retained. pg_temp helpers become
    # shared test helpers because concurrent connections cannot see each other's
    # temporary schema. No test helper is part of production migrations.
    lines=[line for line in text.splitlines() if not line.startswith(("begin;", "select no_plan", "select is(", "select ok(", "select throws_ok(", "select lives_ok("))]
    text="\n".join(lines).replace("create temporary table", "create table gate_test.").replace("pg_temp.", "gate_test.")
    # Table creation already has schema; qualify remaining references.
    import re
    text=re.sub(r"\b(from|into|on)\s+"+table+r"\b", lambda match: match[1]+" gate_test."+table,text,flags=re.I)
    text=text.replace("gate_test. "+table,"gate_test."+table)
    return text+"\nreset role;"


observer = Session()
sessions=[]
count=0
try:
    assert observer.execute("select current_database();")[-1]=="postgres"
    observer.execute("create schema gate_test;grant usage on schema gate_test to authenticated;")
    observer.execute(prefix_fixture("client_crm.test.sql", "insert into salon_results values('merge_review'", "salon_results"))
    observer.execute(prefix_fixture("live_color_session.test.sql", "select is((select value->>'status' from result where name='live-created')", "result"))
    observer.execute("reset role;update public.salon_appointments set status='CANCELLED',cancelled_at=now() where status not in ('COMPLETED','CANCELLED','NO_SHOW');update public.salon_memberships set location_id=null where id='b4000000-0000-4000-8000-000000000111';")
    a,b=Session(),Session();sessions=[a,b]
    assert len({a.pid,b.pid,observer.pid})==3

    def race(label, first, second, check, user="a4000000-0000-4000-8000-000000000021"):
        global count
        auth(a,user);auth(b,user)
        a.execute("begin;set local lock_timeout='10s';"+first)
        b.send("begin;set local lock_timeout='10s';"+second+";commit;")
        deadline=time.monotonic()+10
        blocked=False
        while time.monotonic()<deadline:
            blockers=observer.execute(f"select {a.pid}=any(pg_blocking_pids({b.pid}));")[-1]
            if blockers=="t":
                blocked=True
                break
            time.sleep(.03)
        assert blocked,label+": second connection did not wait on first backend"
        a.execute("commit;")
        response=result(b.receive())
        check(response)
        count+=1
        print("PASS",label,"(distinct backends; blocking barrier observed)")

    member="a4000000-0000-4000-8000-000000000111";loc="a4000000-0000-4000-8000-000000000011"
    source="a4000000-0000-4000-8000-000000000031";target="a4000000-0000-4000-8000-000000000032"
    decisions={k:"TARGET" for k in ["full_name","phone","email","birth_date","preferred_staff_id","preferred_service_ids","request_notes","preferred_channel","allow_manual_contact","do_not_contact"]}
    def rpc(command):
        return f"select public.crm_operation('{member}','{loc}',{literal(command)},gen_random_uuid());"
    def review():
        auth(observer,"a4000000-0000-4000-8000-000000000021")
        value=result(observer.execute(f"select public.crm_read('{member}','{loc}',{literal({'operation':'merge_review','source_client_id':source,'target_client_id':target})});"))
        observer.execute("reset role;")
        return {"type":"MERGE","mutation_id":str(uuid.uuid4()),"review_token":value["data"]["review_token"],"decisions":decisions}
    def edit(client):
        version=int(observer.execute(f"select version from public.clients where id='{client}';")[-1])
        return f"select public.client_operation('{member}','{loc}','update',{literal({'client_id':client,'expected_version':version,'request_id':str(uuid.uuid4()),'full_name':'Concurrent preserved edit','phone':'+905321234567'})},gen_random_uuid());"
    def code(expected):
        def check(value):
            assert value.get("code")==expected,(expected,value.get("code"))
        return check
    for client,label in [(source,"source edit vs merge"),(target,"target edit vs merge")]:
        merge=review()
        race(label,edit(client),rpc(merge),code("CRM_REVIEW_EXPIRED"))
        assert observer.execute(f"select full_name from public.clients where id='{client}';")[-1]=="Concurrent preserved edit"
    merge=review();auth(observer,"a4000000-0000-4000-8000-000000000021")
    merged=result(observer.execute(rpc(merge)));assert "data" in merged,merged
    observer.execute("reset role;")
    reverse={"type":"MERGE_REVERSE","mutation_id":str(uuid.uuid4()),"merge_id":merged["data"]["id"],"reason":"Concurrent correction"}
    race("target edit vs reversal",edit(target),rpc(reverse),code("CRM_CONFLICT"))
    # Stored versions are the actual locked row versions, never guessed values.
    assert observer.execute(f"select source_after_version=(select version from public.clients where id='{source}') from public.client_merge_operations where id='{merged['data']['id']}';")[-1]=="t"
    # Lifecycle/read gates exercise the same series lock, using a real reviewed
    # pilot catalog and signed live input from the independently tested fixture.
    user="b4000000-0000-4000-8000-000000000021"
    catalog=observer.execute("select catalog_id from public.controlled_brand_recipes limit 1;")[-1]
    observer.execute(f"insert into app_private.catalog_operators(user_id) values('{user}') on conflict do nothing;")
    auth(observer,user)
    seed=result(observer.execute("select value from gate_test.result where name='live-envelope';"))
    observer.execute("reset role;update public.live_sessions set status='READY',payload=jsonb_set(payload,'{status}','\"READY\"') where id='b4000000-0000-4000-8000-000000000803';")
    current=result(observer.execute("select payload from public.live_sessions where id='b4000000-0000-4000-8000-000000000803';"))
    start=dict(seed);start['sessionId']=current['id'];start['previousHash']='e'*64
    start['input']={"type":"START","mutation_id":str(uuid.uuid4()),"device_id":current['controllerDeviceId'],"expected_version":1,"control_epoch":1}
    start['result']=dict(current,status="IN_PROGRESS",recordVersion=2)
    live=f"select gate_test.live_store({literal(start)});"
    retire=f"select public.catalog_governance('RETIRE','{catalog}','Concurrency regression',gen_random_uuid());"
    race("RETIRE vs Live START",retire,live,code("SESSION_START_BLOCKED_STALE_INPUT"),user)
    print(f"Gate 1 real multi-connection cases executed: {count}")
finally:
    for connection in sessions:
        connection.close()
    observer.close()
