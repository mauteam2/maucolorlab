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
    text="\n".join(lines).replace("create temporary table "+table, "create table gate_test."+table).replace("pg_temp.", "gate_test.")
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
    observer.execute("begin;"+prefix_fixture("client_crm.test.sql", "insert into salon_results values('merge_review'", "salon_results")+"commit;")
    observer.execute("begin;"+prefix_fixture("live_color_session.test.sql", "select is((select value->>'status' from result where name='live-created')", "result")+"commit;")
    observer.execute("reset role;update public.salon_appointments set status='CANCELLED',cancelled_at=now() where status not in ('COMPLETED','CANCELLED','NO_SHOW');update public.salon_memberships set location_id=null where id='b4000000-0000-4000-8000-000000000111';")
    a,b=Session(),Session();sessions=[a,b]
    assert len({a.pid,b.pid,observer.pid})==3

    def race(label, first, second, check, user="a4000000-0000-4000-8000-000000000021", first_expected=None):
        global count
        auth(a,user);auth(b,user)
        first_result=result(a.execute("begin;set local lock_timeout='10s';"+first))
        assert first_result.get("code")==first_expected,(label,first_result.get("code"))
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
        return f"select public.client_operation('{member}','{loc}','update',{literal({'client_id':client,'expected_version':version,'request_id':str(uuid.uuid4()),'full_name':'Concurrent preserved edit '+client[-4:],'phone':'+90532999'+str(uuid.UUID(client).int % 10000).zfill(4)})},gen_random_uuid());"
    def code(expected):
        def check(value):
            assert value.get("code")==expected,(expected,value.get("code"))
        return check
    for client,label in [(source,"source edit vs merge"),(target,"target edit vs merge")]:
        merge=review()
        race(label,edit(client),rpc(merge),code("CRM_REVIEW_EXPIRED"))
        assert observer.execute(f"select full_name from public.clients where id='{client}';")[-1]=="Concurrent preserved edit "+client[-4:]
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
    def pair():
        global source,target
        source,target=str(uuid.uuid4()),str(uuid.uuid4())
        for client,label in [(source,"source"),(target,"target")]:
            observer.execute(f"insert into public.clients(id,organization_id,full_name,phone,phone_normalized,created_by,updated_by,creation_location_id) values('{client}','a4000000-0000-4000-8000-000000000001','Synthetic race {label} {client}','+905321234567','+905321234567','a4000000-0000-4000-8000-000000000021','a4000000-0000-4000-8000-000000000021','{loc}');")
    pair();merge=review();stale_edit=edit(target)
    race("merge vs target edit",rpc(merge),stale_edit,code("CONFLICT"))
    auth(observer,"a4000000-0000-4000-8000-000000000021")
    merge_id=result(observer.execute(f"select jsonb_build_object('id',id) from public.client_merge_operations where source_client_id='{source}';"))["id"]
    observer.execute("reset role;")
    race("reversal vs target edit",rpc({"type":"MERGE_REVERSE","mutation_id":str(uuid.uuid4()),"merge_id":merge_id,"reason":"Explicit reversal"}),edit(target),code("CONFLICT"))
    for ordering in ["edit-first","reverse-first"]:
        pair();command=review();auth(observer,"a4000000-0000-4000-8000-000000000021")
        merge_id=result(observer.execute(rpc(command)))['data']['id'];observer.execute("reset role;")
        reversal=rpc({"type":"MERGE_REVERSE","mutation_id":str(uuid.uuid4()),"merge_id":merge_id,"reason":"Source identity race"})
        source_edit=edit(source)
        if ordering=="edit-first":race("archived source edit vs reversal",source_edit,reversal,lambda value: "data" in value or (_ for _ in ()).throw(AssertionError(value)),first_expected="CLIENT_ARCHIVED")
        else:race("reversal vs source edit",reversal,source_edit,code("CONFLICT"))
    pair();forward=review()
    source,target=target,source;backward=review();source,target=target,source
    race("opposite-direction merges use deterministic locks",rpc(forward),rpc(backward),code("CRM_REVIEW_EXPIRED"))

    # Appointment transitions and merges share the organization barrier.
    pair();merge=review();appointment=str(uuid.uuid4())
    auth(observer,"a4000000-0000-4000-8000-000000000021")
    booking={"type":"APPOINTMENT_SAVE","mutation_id":str(uuid.uuid4()),"id":appointment,"expected_version":0,"definition":{"client_id":source,"service_id":"a4000000-0000-4000-8000-000000000101","staff_membership_id":member,"local_start":"2026-10-20T10:00","utc_offset_minutes":None,"scheduled_duration_minutes":None,"adjustment_reason":None,"notes":None,"status":"CONFIRMED"}}
    booked=result(observer.execute(f"select public.salon_operation('{member}','{loc}',{literal(booking)},gen_random_uuid());"));assert booked.get("data",{}).get("status")=="CONFIRMED",booked
    observer.execute("reset role;")
    def transition(status,version):
        command={"type":"APPOINTMENT_TRANSITION","mutation_id":str(uuid.uuid4()),"id":appointment,"expected_version":version,"status":status,"reason":"Explicit concurrency regression"}
        return f"select public.salon_operation('{member}','{loc}',{literal(command)},gen_random_uuid());"
    race("appointment ARRIVED vs MERGE",transition("ARRIVED",1),rpc(merge),code("CRM_MERGE_ACTIVE_OPERATION"))
    race("MERGE guard vs appointment IN_SERVICE",rpc(merge),transition("IN_SERVICE",2),lambda value: value['data']['status']=="IN_SERVICE" or (_ for _ in ()).throw(AssertionError("transition failed")),first_expected="CRM_MERGE_ACTIVE_OPERATION")
    race("appointment CANCEL vs MERGE",transition("CANCELLED",3),rpc(merge),lambda value: "data" in value or (_ for _ in ()).throw(AssertionError(value)))

    def fresh_live(prefix):
        """Independent real verified pilot fixture for each destructive lifecycle race."""
        table="result_"+prefix
        text=prefix_fixture("live_color_session.test.sql", "select is((select value->>'status' from result where name='live-created')", "result")
        text=text.replace("b4000000",prefix+"000000").replace("gate_test.result", "gate_test."+table)
        text=text.replace("create function gate_test.","create or replace function gate_test.")
        for name in ["controlled-a","controlled-b","live-assistant","live-viewer"]:
            text=text.replace(name+"@",name+"-"+prefix+"@")
        text=text.replace("'controlled-a'","'controlled-a-"+prefix+"'").replace("'controlled-b'","'controlled-b-"+prefix+"'")
        previous=observer.execute("select id from public.brand_catalog_releases where pilot_key='schwarzkopf-igora-royal-absolutes' and state in ('PUBLISHED','RETIRED') order by version desc limit 1;")[-1]
        text=text.replace("'IMPORT',null", "'IMPORT','"+previous+"'")
        text=text.replace("'catalogVersion',1", "'catalogVersion',(value#>>'{catalog,release,version}')::integer")
        text=text.replace("'productVersion',1", "'productVersion',(select version from public.catalog_products where id=chosen.product_id)")
        text=text.replace("'developerVersion',1", "'developerVersion',(select version from public.catalog_products where id=chosen.developer_id)")
        observer.execute("reset role;drop table if exists pg_temp.chosen;begin;"+text+"commit;")
        owner=prefix+"000000-0000-4000-8000-000000000021"
        member_id=prefix+"000000-0000-4000-8000-000000000111"
        location=prefix+"000000-0000-4000-8000-000000000011"
        client=prefix+"000000-0000-4000-8000-000000000031"
        sid=prefix+"000000-0000-4000-8000-000000000803"
        observer.execute(f"update public.salon_memberships set location_id=null where id='{member_id}';update public.live_sessions set status='READY',payload=jsonb_set(payload,'{{status}}','\"READY\"') where id='{sid}';")
        record=result(observer.execute(f"select payload from public.live_sessions where id='{sid}';"))
        env=result(observer.execute(f"select value from gate_test.{table} where name='live-envelope';"))
        stamp=observer.execute("select statement_timestamp()::text;")[-1]
        expires=observer.execute("select (statement_timestamp()+interval '2 minutes')::text;")[-1]
        env.update(sessionId=sid,previousHash='e'*64,expiresAt=expires)
        env['input']={"type":"START","mutation_id":str(uuid.uuid4()),"device_id":record['controllerDeviceId'],"expected_version":1,"control_epoch":1}
        env['result']=dict(record,status="IN_PROGRESS",recordVersion=2,updatedAt=stamp,startedAt=stamp)
        recipe=result(observer.execute(f"select value from gate_test.{table} where name='envelope';"))
        recipe['input']['request_id']=str(uuid.uuid4());recipe['expiresAt']=expires
        catalog_id=observer.execute(f"select current_recipe_id from public.live_sessions where id='{sid}';")[-1]
        catalog_id=observer.execute(f"select catalog_id from public.controlled_brand_recipes where id='{catalog_id}';")[-1]
        return owner,member_id,location,client,catalog_id,f"select gate_test.live_store({literal(env)});",f"select gate_test.store({literal(recipe)});"
    for prefix,order in [("b5","retire-first"),("b6","create-first")]:
        owner,_,_,_,cat,_,create=fresh_live(prefix)
        retire=f"select public.catalog_governance('RETIRE','{cat}','Concurrent recipe regression',gen_random_uuid());"
        if order=="retire-first":race("RETIRE vs recipe CREATE",retire,create,code("COLOR_PLAN_SOURCE_CONFLICT"),owner)
        else:race("recipe CREATE vs RETIRE",create,retire,lambda value: value['catalogId']==cat or (_ for _ in ()).throw(AssertionError("retirement failed")),owner)
    owner,_,_,_,cat,start,_=fresh_live("b7")
    race("Live START vs RETIRE",start,f"select public.catalog_governance('RETIRE','{cat}','Concurrent start regression',gen_random_uuid());",lambda value: value['catalogId']==cat or (_ for _ in ()).throw(AssertionError("retirement failed")),owner)
    owner,_,_,_,cat,start,_=fresh_live("b8")
    auth(observer,owner)
    next_catalog=result(observer.execute(f"select public.catalog_governance('IMPORT',null,'Next version regression',gen_random_uuid(),'{cat}');"))["catalogId"]
    observer.execute(f"select public.catalog_governance(op,'{next_catalog}','Next version regression',gen_random_uuid()) from unnest(array['START_REVIEW','COMPLETE_REVIEW','VALIDATE_GOLDEN','APPROVE']) op;")
    observer.execute("reset role;")
    race("new catalog PUBLISH vs old catalog START",f"select public.catalog_governance('PUBLISH','{next_catalog}','Concurrent version publish',gen_random_uuid());",start,code("SESSION_START_BLOCKED_STALE_INPUT"),owner)
    # Existing READY operation blocks merge regardless of which transaction wins.
    owner,live_member,live_loc,live_client,_,start,_=fresh_live("b9")
    target_client=str(uuid.uuid4())
    org="b9000000-0000-4000-8000-000000000001"
    observer.execute(f"insert into public.clients(id,organization_id,full_name,phone,phone_normalized,created_by,updated_by,creation_location_id) values('{target_client}','{org}','Synthetic live merge target','+905329998877','+905329998877','{owner}','{owner}','{live_loc}');")
    auth(observer,owner)
    token=result(observer.execute(f"select public.crm_read('{live_member}','{live_loc}',{literal({'operation':'merge_review','source_client_id':live_client,'target_client_id':target_client})});"))["data"]["review_token"]
    observer.execute("reset role;")
    merge=f"select public.crm_operation('{live_member}','{live_loc}',{literal({'type':'MERGE','mutation_id':str(uuid.uuid4()),'review_token':token,'decisions':decisions})},gen_random_uuid());"
    race("Live START vs MERGE",start,merge,code("CRM_MERGE_ACTIVE_OPERATION"),owner)
    # A blocked merge still retains its transaction locks until COMMIT.
    owner,live_member,live_loc,live_client,_,start,_=fresh_live("ba")
    target_client=str(uuid.uuid4());org="ba000000-0000-4000-8000-000000000001"
    observer.execute(f"insert into public.clients(id,organization_id,full_name,phone,phone_normalized,created_by,updated_by,creation_location_id) values('{target_client}','{org}','Synthetic live merge target','+905329998877','+905329998877','{owner}','{owner}','{live_loc}');")
    auth(observer,owner)
    token=result(observer.execute(f"select public.crm_read('{live_member}','{live_loc}',{literal({'operation':'merge_review','source_client_id':live_client,'target_client_id':target_client})});"))["data"]["review_token"]
    observer.execute("reset role;")
    merge=f"select public.crm_operation('{live_member}','{live_loc}',{literal({'type':'MERGE','mutation_id':str(uuid.uuid4()),'review_token':token,'decisions':decisions})},gen_random_uuid());"
    race("MERGE guard vs Live START",merge,start,lambda value: value['status']=="IN_PROGRESS" or (_ for _ in ()).throw(AssertionError("start failed")),owner,first_expected="CRM_MERGE_ACTIVE_OPERATION")
    owner,_,_,_,cat,start,_=fresh_live("bb")
    rule=observer.execute(f"select id from public.catalog_compatibility_rules where catalog_id='{cat}' limit 1;")[-1]
    observer.execute("create function gate_test.change_compatibility(rule_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin update public.catalog_compatibility_rules set outcome='UNKNOWN' where id=rule_id;return jsonb_build_object('code','UNEXPECTED_WRITE');exception when check_violation then return jsonb_build_object('code',sqlerrm);end $$;")
    race("Live execution vs immutable compatibility change",start,f"select gate_test.change_compatibility('{rule}');",code("IMMUTABLE_CATALOG_CONTENT"),owner)
    assert observer.execute(f"select outcome<>'UNKNOWN' from public.catalog_compatibility_rules where id='{rule}';")[-1]=="t"
    print(f"Gate 1 real multi-connection cases executed: {count}")
finally:
    for connection in sessions:
        connection.close()
    observer.close()
