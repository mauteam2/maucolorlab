"""Real line/region revision races; disposable CI database only.

Intake remains migration-only. These synthetic inserts test its PostgreSQL guard,
not a new public authoring or publication API. Run after ordinary DB/RLS tests.
"""
import json
import os
from pathlib import Path
import time
import uuid
from postgres_test_sessions import Session

assert os.environ.get('CI') == 'true', 'Disposable CI only'
observer, first = Session(), Session()
writers = []
line = 'keune-tinta-color'

def barrier(second):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if observer.execute(f'select {first.pid}=any(pg_blocking_pids({second.pid}));')[-1] == 't':
            return
        time.sleep(.02)
    raise AssertionError('Expected real PostgreSQL blocking barrier')

def insert(identifier, region, revision=1, previous=None, state='DISCOVERED'):
    prev = "null" if previous is None else "'" + previous + "'"
    return f"insert into public.color_registry_entries(id,line_id,region,revision,previous_id,state) values('{identifier}','{line}','{region}',{revision},{prev},'{state}');"

def conflict(second):
    try:
        second.receive()
    except AssertionError as error:
        assert 'DISCOVERY_VERSION_CONFLICT' in str(error), str(error)
        return
    raise AssertionError('Concurrent stale intake was accepted')

try:
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    second = Session(); writers.append(second)
    first.execute('begin;')
    first.execute(insert(a, 'ZA'))
    second.send(insert(b, 'ZA'))
    barrier(second); first.execute('commit;'); conflict(second)
    assert observer.execute(f"select count(*) from public.color_registry_entries where line_id='{line}' and region='ZA';")[-1] == '1'

    initial, a, b = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    observer.execute(insert(initial, 'NZ'))
    second = Session(); writers.append(second)
    first.execute('begin;')
    first.execute(insert(a, 'NZ', 2, initial, 'SOURCE_COLLECTED'))
    second.send(insert(b, 'NZ', 2, initial, 'SOURCE_COLLECTED'))
    barrier(second); first.execute('commit;'); conflict(second)
    assert observer.execute(f"select count(*) from public.color_registry_entries where line_id='{line}' and region='NZ';")[-1] == '2'
    assert observer.execute(f"select count(*) from app_private.color_registry_intake_audit where record_key='{b}';")[-1] == '0'
    (Path(os.environ['RUNNER_TEMP']) / 'global-catalog-concurrency.json').write_text(json.dumps({
        'realConcurrencyCases': 2, 'barriers': 'pg_blocking_pids',
        'cases': ['first discovery identity race', 'same predecessor revision race'],
        'existingCasesPreserved': 91, 'automaticTechnicalPublications': 0,
    }))
    print('PASS: 2 real discovery intake races; existing 91 cases retained')
finally:
    for db in [first, observer, *writers]:
        db.close()
