"""Recipient lifecycle races on real isolated PostgreSQL backend connections.

Disposable CI only. Every expected wait is observed through pg_blocking_pids;
neither sleeps nor mocked parallel promises are accepted as a race barrier.
"""
import json
import os
import time
import uuid
from pathlib import Path
from postgres_test_sessions import Session, auth, result

assert os.environ.get('CI') == 'true', 'Disposable CI database required'
observer, a, b = Session(), Session(), Session()
cases = []


def fixture(user=None):
    user = user or str(uuid.uuid4())
    org, loc, mid = (str(uuid.uuid4()) for _ in range(3))
    observer.execute(f"""insert into auth.users(id,email) values('{user}','race-{user}@example.invalid') on conflict(id) do nothing;
    insert into public.organizations(id,name,slug,base_currency) values('{org}','Synthetic invite race','race-{org}','TRY');
    insert into public.locations(id,organization_id,name,timezone) values('{loc}','{org}','Synthetic location','Europe/Istanbul');
    insert into public.salon_memberships(id,organization_id,location_id,user_id,role_code,status)
    values('{mid}','{org}','{loc}','{user}','colorist','invited');""")
    return user, org, loc, mid


def accept(mid, rid):
    return f"select public.accept_my_membership_invitation('{mid}','{rid}','ab550000-0000-4000-8000-000000000001');"


def wait():
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if observer.execute(f'select {a.pid}=any(pg_blocking_pids({b.pid}));')[-1] == 't':
            return
        time.sleep(.02)
    raise AssertionError('No real lock wait observed')


def audit_count(mid, expected=1):
    assert observer.execute(f"select count(*) from public.audit_events where entity_id='{mid}' and action='membership.invite_accepted';")[-1] == str(expected)


try:
    for same_request in (True, False):
        user, org, loc, mid = fixture()
        auth(a, user); auth(b, user)
        rid = str(uuid.uuid4())
        a.execute('begin;'); first = result(a.execute(accept(mid, rid)))
        b.send(accept(mid, rid if same_request else str(uuid.uuid4())))
        wait(); a.execute('commit;'); second = result(b.receive())
        assert first == second and first['data']['state'] == 'ACTIVE'
        audit_count(mid)
        cases.append('same membership / ' + ('same' if same_request else 'different') + ' request converges')

    user, org, loc, mid = fixture()
    _, _, _, other_mid = fixture(user)
    auth(a, user); auth(b, user); rid = str(uuid.uuid4())
    a.execute('begin;'); result(a.execute(accept(mid, rid)))
    b.send(accept(other_mid, rid)); wait(); a.execute('commit;')
    assert result(b.receive())['code'] == 'INVITATION_REPLAY_CONFLICT'
    audit_count(mid); audit_count(other_mid, 0)
    cases.append('same actor request / different organization target conflicts')

    user, org, loc, mid = fixture(); rid = str(uuid.uuid4())
    auth(a, user); auth(b, user)
    a.execute('begin;'); rolled = result(a.execute(accept(mid, rid)))
    b.send(accept(mid, rid)); wait(); a.execute('rollback;'); committed = result(b.receive())
    assert committed['data']['state'] == 'ACTIVE' and committed['data']['joined_at'] != rolled['data']['joined_at']
    audit_count(mid)
    assert observer.execute(f"select count(*) from app_private.membership_acceptance_receipts where actor_id='{user}';")[-1] == '1'
    cases.append('rolled-back acceptance / retry commits one receipt and audit')

    user, org, loc, mid = fixture(); rid = str(uuid.uuid4())
    a.execute('reset role;begin;')
    a.execute(f"update public.salon_memberships set status='revoked',revoked_at=clock_timestamp() where id='{mid}';")
    auth(b, user); b.send(accept(mid, rid)); wait(); a.execute('commit;')
    assert result(b.receive())['code'] == 'INVITATION_REVOKED'
    audit_count(mid, 0)
    cases.append('revocation wins / acceptance cannot resurrect')

    user, org, loc, mid = fixture(); rid = str(uuid.uuid4())
    auth(a, user); a.execute('begin;'); result(a.execute(accept(mid, rid)))
    b.execute('reset role;'); b.send(f"update public.salon_memberships set status='revoked',revoked_at=clock_timestamp() where id='{mid}';")
    wait(); a.execute('commit;'); b.receive()
    assert result(a.execute(accept(mid, rid)))['code'] == 'INVITATION_REVOKED'
    audit_count(mid)
    cases.append('acceptance wins / subsequent revocation invalidates receipt replay')

    for table, key in (('organizations', 'org'), ('locations', 'loc')):
        user, org, loc, mid = fixture(); rid = str(uuid.uuid4())
        target = org if key == 'org' else loc
        a.execute('reset role;begin;')
        a.execute(f"update public.{table} set archived_at=clock_timestamp() where id='{target}';")
        auth(b, user); b.send(accept(mid, rid)); wait(); a.execute('commit;')
        assert result(b.receive())['code'] == 'INVITATION_UNAVAILABLE'
        audit_count(mid, 0)
        cases.append(table + ' archive wins / acceptance unavailable')

    user, org, loc, mid = fixture(); rid = str(uuid.uuid4())
    auth(a, user); a.execute('begin;'); result(a.execute(accept(mid, rid)))
    b.execute('reset role;'); b.send(f"update public.locations set archived_at=clock_timestamp() where id='{loc}';")
    wait(); a.execute('commit;'); b.receive()
    assert result(a.execute(accept(mid, rid)))['code'] == 'INVITATION_UNAVAILABLE'
    audit_count(mid)
    cases.append('acceptance archive fence / later archive invalidates replay')

    (Path(os.environ['RUNNER_TEMP']) / 'pass-5a-invitation-concurrency.json').write_text(json.dumps({
        'realConcurrencyCases': len(cases), 'barriers': 'pg_blocking_pids', 'cases': cases,
    }, indent=2))
    print(f'PASS: {len(cases)} real membership invitation concurrency cases; no deadline inflation')
finally:
    for connection in (a, b, observer):
        connection.close()
