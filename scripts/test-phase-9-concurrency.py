"""Actual two-connection membership revocation/readiness serialization."""
from pathlib import Path
import json
import os
import time
import statistics
from postgres_test_sessions import Session,auth,result,prefix_fixture

assert os.environ.get('CI')=='true'
root=Path(__file__).resolve().parents[1]
observer,a,b=Session(),Session(),Session()
member='a4000000-0000-4000-8000-000000000111';user='a4000000-0000-4000-8000-000000000021';loc='a4000000-0000-4000-8000-000000000011';appointment='a4000000-0000-4000-8000-000000000301'
read=f"select public.appointment_readiness('{member}','{loc}','{appointment}');"
cases=[]
def wait(blocker,blocked):
 deadline=time.monotonic()+10
 while time.monotonic()<deadline:
  if observer.execute(f'select {blocker.pid}=any(pg_blocking_pids({blocked.pid}));')[-1]=='t':return
  time.sleep(.02)
 raise AssertionError('No real PostgreSQL blocking barrier')
try:
 observer.execute('create schema gate_test;grant usage on schema gate_test to authenticated;')
 text=prefix_fixture('fixtures/phase-9-salon.inc','-- END_PHASE_9_FIXTURE','salon_results')
 observer.execute('begin;'+text+'commit;')
 observer.execute(f"update public.salon_memberships set role_code='reception',location_id='{loc}' where id='{member}';")
 # Read first: active membership share lock protects this projection until it
 # finishes. Revoke waits; every subsequent read observes the committed revoke.
 auth(a,user);a.execute('begin;');assert 'data' in result(a.execute(read))
 b.send(f"update public.salon_memberships set status='revoked',revoked_at=now() where id='{member}';")
 wait(a,b);a.execute('commit;');b.receive();assert result(a.execute(read))['code']=='MEMBERSHIP_REVOKED'
 cases.append('readiness SHARE lock vs membership revoke; next read denied')
 observer.execute(f"update public.salon_memberships set status='active',revoked_at=null where id='{member}';")
 # Revoke first: a read blocked on membership must re-read the committed state.
 b.execute(f"begin;update public.salon_memberships set status='revoked',revoked_at=now() where id='{member}';")
 a.send(read);wait(b,a);b.execute('commit;');assert result(a.receive())['code']=='MEMBERSHIP_REVOKED'
 cases.append('membership revoke vs readiness; stale projection not released')
 observer.execute(f"update public.salon_memberships set status='active',revoked_at=null where id='{member}';")
 times=[]
 for _ in range(5):
  start=time.monotonic();assert 'data' in result(a.execute(read));times.append((time.monotonic()-start)*1000)
 (Path(os.environ['RUNNER_TEMP'])/'phase-9-security-performance.json').write_text(json.dumps({'cases':cases,'real_concurrency_cases':len(cases),'readiness_samples_ms':times,'readiness_median_ms':statistics.median(times),'inventory_runtime_overhead_ms':0,'inventory_execution':'CI only, no request middleware'},indent=2))
 print('PASS: 2 real PostgreSQL security/recovery races; observed pg_blocking_pids barriers; original 87 retained separately')
finally:
 for db in (a,b,observer):db.close()
