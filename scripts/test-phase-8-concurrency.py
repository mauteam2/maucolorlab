"""Phase 8: committed original intent on distinct disposable PostgreSQL backends.
Every race proves a server-side wait with pg_blocking_pids. No API/DB mocks.
"""
from pathlib import Path
from datetime import datetime, timezone
import json
import os
import time
import uuid
import statistics
from postgres_test_sessions import Session, literal, result, auth

ROOT = Path(__file__).resolve().parents[1]
assert os.environ.get('CI') == 'true', 'Disposable local CI required'
ORG = 'b4000000-0000-4000-8000-000000000001'
LOC = 'b4000000-0000-4000-8000-000000000011'
USER = 'b4000000-0000-4000-8000-000000000021'
MEMBER = 'b4000000-0000-4000-8000-000000000111'
CLIENT = 'b4000000-0000-4000-8000-000000000031'
SESSION = 'b4000000-0000-4000-8000-000000000803'
observer, a, b = Session(), Session(), Session()
cases, performance = [], {'durable_replay_ms': [], 'controller_recovery_ms': []}

def identifier():
    return str(uuid.uuid4())

def now():
    return datetime.now(timezone.utc).isoformat()

def read_head():
    return result(observer.execute(f"select jsonb_build_object('payload',payload,'hash',content_hash) from public.live_sessions where id='{SESSION}';"))

def envelope(kind, head=None, **fields):
    head = head or read_head()
    old = head['payload']
    device = fields.pop('device_id', identifier() if kind == 'RECOVER_CONTROL' else old['controllerDeviceId'])
    stamp = now()
    command = {'type': kind, 'mutation_id': identifier(), 'device_id': device, 'expected_version': old['recordVersion'], 'control_epoch': old['controlEpoch'], **fields}
    target = dict(old, recordVersion=old['recordVersion'] + 1, updatedAt=stamp)
    if kind in ('RECOVER_CONTROL', 'TRANSFER_CONTROL'):
        user = USER if kind == 'RECOVER_CONTROL' else command['user_id']
        target_device = device if kind == 'RECOVER_CONTROL' else command['target_device_id']
        before = {'user': old['controllerUserId'], 'device': old['controllerDeviceId']}
        after = {'user': user, 'device': target_device}
        if kind == 'RECOVER_CONTROL':
            before['epoch'] = old['controlEpoch']
            after['epoch'] = old['controlEpoch'] + 1
        target.update(controllerUserId=user, controllerDeviceId=target_device, controlEpoch=old['controlEpoch'] + 1,
                      deviations=old['deviations'] + [{'id': identifier(), 'type': 'PROFESSIONAL_DECISION', 'reason': command['reason'], 'changedBy': USER, 'at': stamp, 'before': before, 'after': after}])
    elif kind == 'READY':
        target['status'] = 'READY'
    elif kind == 'ABORT':
        target['status'] = 'ABORTED'
    return {'organizationId': ORG, 'actorId': USER, 'membershipId': MEMBER, 'locationId': LOC, 'sessionId': SESSION,
            'previousHash': head['hash'], 'resultHash': uuid.uuid4().hex + uuid.uuid4().hex,
            'expiresAt': datetime.fromtimestamp(time.time() + 120, timezone.utc).isoformat(), 'input': command, 'result': target}

def live(packet):
    return f"select phase8_test.live_store({literal(packet)});"

def race(label, first, second, expected=None, root_first=False):
    auth(a, USER)
    auth(b, USER)
    if root_first:
        a.execute('reset role;')
    initial = result(a.execute("begin;set local lock_timeout='15s';" + first))
    assert not initial.get('code'), (label, initial.get('code'))
    b.send("begin;set local lock_timeout='15s';" + second + ';commit;')
    deadline = time.monotonic() + 10
    while observer.execute(f'select {a.pid}=any(pg_blocking_pids({b.pid}));')[-1] != 't':
        assert time.monotonic() < deadline, label + ': missing PostgreSQL blocking barrier'
        time.sleep(.03)
    a.execute('commit;')
    response = result(b.receive())
    assert response.get('code') == expected, (label, response.get('code'), expected)
    cases.append(label)
    print('PASS', label, '(distinct PostgreSQL backends; observed lock barrier)')
    return initial, response

def core(payload):
    return f"select public.hair_core_operation('{MEMBER}','{LOC}','{CLIENT}','update_passport',{literal(payload)},gen_random_uuid());"

def factual(kind, request_id):
    if kind == 'physical':
        payload = {'request_id': request_id, 'type': 'POROSITY', 'result': {'state': 'KNOWN', 'value': 'HIGH'}}
        rpc = 'hair_physical_test_operation'
    else:
        payload = {'request_id': request_id, 'category': 'COLOR', 'performed_on': {'state': 'UNKNOWN', 'value': None}, 'product': {'state': 'UNKNOWN', 'value': None}, 'description': 'Synthetic delayed original intent', 'evidence': {'source': 'HISTORICAL'}}
        rpc = 'hair_history_operation'
    return f"select public.{rpc}('{MEMBER}','{LOC}','{CLIENT}',{literal(payload)},gen_random_uuid());"

def reactivate():
    observer.execute(f"reset role;update public.salon_memberships set status='active',revoked_at=null where id='{MEMBER}';")

def revoke():
    return f"update public.salon_memberships set status='revoked',revoked_at=now() where id='{MEMBER}';select jsonb_build_object('revoked',true);"

def suspended():
    return f"select app_private.saas_control('{ORG}',jsonb_build_object('type','SUBSCRIPTION','expected_version',(select version from app_private.saas_accounts where organization_id='{ORG}'),'plan_version_id',app_private.saas_current('{ORG}')->>'plan_version_id','status','SUSPENDED'),'PHASE8_TEST','Synthetic concurrent restriction',gen_random_uuid());"

def restore_subscription():
    # Reactivating a revoked member is correctly new structural work and remains
    # blocked during suspension. Only the disposable operator restores ACTIVE.
    observer.execute(suspended().replace("'SUSPENDED'", "'ACTIVE'"))

try:
    assert len({observer.pid, a.pid, b.pid}) == 3
    observer.execute('create schema phase8_test;grant usage on schema phase8_test to authenticated;')
    fixture = (ROOT / 'supabase/tests/fixtures/gate-1-live.inc').read_text(encoding='utf-8')
    fixture = fixture.replace('pg_temp.', 'phase8_test.').replace('set local search_path=public,extensions', 'set local search_path=phase8_test,public,extensions')
    for table in ('result', 'chosen'):
        fixture = fixture.replace('create temporary table ' + table, 'create table phase8_test.' + table)
    observer.execute('begin;set local search_path=phase8_test,public,extensions;' + fixture + '\nreset role;commit;')

    # Lost-response retries are the very same captured SQL/mutation identities.
    for kind, table, field in [('physical', 'hair_physical_tests', 'test'), ('history', 'hair_history_events', 'history')]:
        mid = identifier()
        sql = factual(kind, mid)
        before = int(observer.execute(f'select count(*) from public.{table};')[-1])
        accepted, replay = race(kind + ' commit without response vs original retry', sql, sql)
        assert accepted['data'][field]['id'] == replay['data'][field]['id']
        observer.execute(f"update app_private.hair_core_mutation_receipts set expires_at=now()-interval '3 days' where request_id='{mid}';")
        started = time.perf_counter()
        _, delayed = race(kind + ' concurrent replay beyond former receipt TTL', sql, sql)
        performance['durable_replay_ms'].append((time.perf_counter() - started) * 1000)
        assert delayed['data'][field]['id'] == accepted['data'][field]['id']
        assert int(observer.execute(f'select count(*) from public.{table};')[-1]) == before + 1

    # All competing commands capture the same head BEFORE either transaction.
    for first_kind, second_kind in [('RECOVER_CONTROL', 'RECOVER_CONTROL'), ('RECOVER_CONTROL', 'READY'), ('READY', 'RECOVER_CONTROL'), ('RECOVER_CONTROL', 'TRANSFER_CONTROL'), ('TRANSFER_CONTROL', 'RECOVER_CONTROL'), ('RECOVER_CONTROL', 'ABORT')]:
        head = read_head()
        # READY races need PREPARING; preserve previous accepted versions rather
        # than deleting them. Test fixture changes use the protected +1 version.
        if head['payload']['status'] != 'PREPARING':
            observer.execute(f"update public.live_sessions set status='PREPARING',record_version=record_version+1,payload=payload||jsonb_build_object('status','PREPARING','recordVersion',record_version+1) where id='{SESSION}';")
            head = read_head()
        def packet(kind):
            fields = {} if kind == 'READY' else {'reason': 'Synthetic explicit device recovery'}
            if kind == 'TRANSFER_CONTROL':
                fields.update(user_id=USER, target_device_id=identifier())
            return envelope(kind, head, **fields)
        started = time.perf_counter()
        race(first_kind + ' vs ' + second_kind, live(packet(first_kind)), live(packet(second_kind)), 'LIVE_SESSION_CONFLICT')
        performance['controller_recovery_ms'].append((time.perf_counter() - started) * 1000)

    head = read_head()
    race('membership revoke vs controller recovery', revoke(), live(envelope('RECOVER_CONTROL', head, reason='Synthetic lost device')), 'MEMBERSHIP_REVOKED', root_first=True)
    reactivate()
    # Suspension changes take the shared organization barrier before the SaaS
    # exclusive lifecycle lock; recovery takes the organization exclusive lock.
    recovery = envelope('RECOVER_CONTROL', reason='Recover safe existing work during suspension')
    race('subscription suspension vs existing controller recovery', suspended(), live(recovery), root_first=True)
    audit = result(observer.execute(f"select metadata from public.audit_events where action='live_session.recover_control' and metadata->>'mutation_id'='{recovery['input']['mutation_id']}';"))
    assert audit['subscription']['status'] == 'SUSPENDED'
    restore_subscription()

    version = int(observer.execute(f"select version from public.hair_passports where client_id='{CLIENT}';")[-1])
    first = {'request_id': identifier(), 'expected_version': version, 'technical': {'technical_notes': 'Synthetic concurrent server edit'}}
    offline = {'request_id': identifier(), 'expected_version': version, 'technical': {'technical_notes': 'Synthetic original offline intent'}}
    race('current Hair edit vs captured offline expected version', core(first), core(offline), 'CONFLICT')
    version = int(observer.execute(f"select version from public.hair_passports where client_id='{CLIENT}';")[-1])
    offline['expected_version'] = version
    race('membership revoke vs pending Hair synchronization', revoke(), core(offline), 'MEMBERSHIP_REVOKED', root_first=True)
    reactivate()
    head = read_head()
    race('safety ABORT vs controller recovery', live(envelope('ABORT', head, reason='Synthetic safety stop')), live(envelope('RECOVER_CONTROL', head, reason='Synthetic lost device')), 'LIVE_SESSION_CONFLICT')
    # Terminal closure remains authoritative even with a freshly captured head.
    auth(observer, USER)
    terminal = result(observer.execute(live(envelope('RECOVER_CONTROL', reason='Cannot reopen terminated work'))))
    assert terminal.get('code') == 'LIVE_SESSION_IMMUTABLE'
    observer.execute('reset role;')
    assert len(cases) == 15, cases
    report = {'cases': cases, 'real_concurrency_cases': len(cases), 'timings_including_observed_barrier': performance,
              'median_ms': {key: statistics.median(value) for key, value in performance.items()}}
    Path(os.environ.get('RUNNER_TEMP', '/tmp'), 'phase-8-concurrency-performance.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('PASS: 15 Phase 8 real multi-connection cases; historical receipts, versions, audits and terminal protection retained')
finally:
    for connection in (a, b, observer):
        connection.close()
