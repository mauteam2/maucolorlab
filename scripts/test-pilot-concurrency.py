"""Two real backend admission lock barriers; disposable CI only."""
import os,time,json,uuid
from pathlib import Path
from postgres_test_sessions import Session,result
assert os.environ.get('CI')=='true'
observer,a,b=Session(),Session(),Session()
owner=str(uuid.uuid4());request=str(uuid.uuid4())
definition='{"name":"Synthetic concurrency","location_name":"Main","timezone":"Europe/Istanbul","base_currency":"TRY"}'
def provision(rid):return f"select app_private.pilot_provision('{rid}','{owner}','{definition}','CI_OPERATOR','Isolated concurrency verification',gen_random_uuid());"
def wait():
 deadline=time.monotonic()+10
 while time.monotonic()<deadline:
  if observer.execute(f'select {a.pid}=any(pg_blocking_pids({b.pid}));')[-1]=='t':return
  time.sleep(.02)
 raise AssertionError('No real blocking barrier')
try:
 observer.execute(f"insert into auth.users(id,email,email_confirmed_at) values('{owner}','pilot-race-{owner}@example.invalid',now());")
 for db in (a,b):db.execute("set app.settings.elifora_environment='staging';set role elifora_pilot_operator;")
 a.execute('begin;');first=result(a.execute(provision(request)))
 b.send(provision(request));wait();a.execute('commit;');assert result(b.receive())==first
 assert observer.execute(f"select count(*) from app_private.pilot_admissions where owner_user_id='{owner}';")[-1]=='1'
 # Rollback releases the admission lock and all provisional tenant rows atomically.
 owner2=str(uuid.uuid4());observer.execute(f"insert into auth.users(id,email,email_confirmed_at) values('{owner2}','pilot-race-{owner2}@example.invalid',now());")
 old=owner;owner=owner2;request=str(uuid.uuid4());a.execute('begin;');rolled=result(a.execute(provision(request)))
 b.send(provision(request));wait();a.execute('rollback;');committed=result(b.receive());assert committed['organization_id']!=rolled['organization_id']
 assert observer.execute(f"select count(*) from public.organizations where id='{rolled['organization_id']}';")[-1]=='0'
 (Path(os.environ['RUNNER_TEMP'])/'phase-10-concurrency.json').write_text(json.dumps({'realConcurrencyCases':2,'barriers':'pg_blocking_pids','cases':['same-request admission retry','rolled-back admission vs retry']}))
 print('PASS: 2 real pilot admission concurrency cases; original 89 retained')
finally:
 for db in (a,b,observer):db.close()
