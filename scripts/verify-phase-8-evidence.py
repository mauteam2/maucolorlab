"""Fail CI when successful Phase 8 runs do not retain their safe evidence."""
from pathlib import Path
import json
import re

web = Path(__file__).resolve().parents[1] / 'apps/web'
full = web / 'test-results'
repeated = web / 'test-results-reliability'

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

for folder in (full, repeated):
    summary = read(folder / 'reliability-summary.json')
    assert summary['mode'] == 'production-next-build-start' and summary['status'] == 'passed'
    for key in ('first_run_failures', 'retry_passes', 'retry_attempts', 'skipped'):
        assert summary[key] == 0, (folder.name, key)
    if folder == repeated:
        assert (summary['unique_scenarios'], summary['first_run_passes'], summary['repetitions']) == (8, 80, 10)
    else:
        assert summary['unique_scenarios'] >= 194 and summary['first_run_passes'] == summary['unique_scenarios']

diagnostics = list(repeated.rglob('sanitized-route-diagnostics.json'))
assert len(diagnostics) == 80, 'Every real repetition must retain sanitized diagnostics'
for path in [*diagnostics, *full.rglob('sanitized-route-diagnostics.json')]:
    data = read(path)
    assert set(data) == {'state', 'records'}
    if data['state'] is not None:
        assert set(data['state']) == {'hidden', 'online', 'busy_forms', 'loading_statuses', 'document_width', 'viewport_width'}
    assert len(data['records']) <= 150
    for row in data['records']:
        assert set(row) == {'route', 'status', 'elapsed_ms', 'correlation_id'}
        assert row['route'].startswith('/api/') and '?' not in row['route']
        assert not re.search(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', row['route'], re.I)

for name, keys in {
    'phase-8-draft-performance.json': {'draft_save_ms', 'explicit_sync_and_readback_ms'},
    'phase-8-replay-performance.json': {'idempotent_replay_ms'},
    'phase-8-batch-performance.json': {'intents', 'local_capture_total_ms', 'average_local_capture_ms', 'authenticated_reload_restore_ms', 'first_batch_intents', 'first_batch_sync_and_readback_ms'},
}.items():
    files = list(full.rglob(name))
    assert len(files) == 2, f'Missing desktop/mobile measurement: {name}'
    for path in files:
        metrics = read(path)
        assert set(metrics) == keys and all(isinstance(value, (int, float)) and value >= 0 for value in metrics.values())
        if 'first_batch_intents' in metrics:
            assert metrics['first_batch_intents'] == 10 and metrics['intents'] == 11

print('PASS: retained 80 sanitized real-repetition diagnostics, six desktop/mobile measurements and clean first-pass summaries')
