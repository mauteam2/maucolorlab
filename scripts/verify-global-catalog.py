"""Offline source-intake integrity. This is never technical human approval."""
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.parse import urlparse

root = Path(__file__).resolve().parents[1]
tables = json.loads((root/'contracts/catalogs/global-discovery.json').read_text(encoding='utf-8'))['tables']
spec = importlib.util.spec_from_file_location('seed', root/'scripts/build-global-catalog-seed.py')
seed = importlib.util.module_from_spec(spec); spec.loader.exec_module(seed)
expected = '\n'.join(seed.inserts(table, rows) for table, rows in tables.items())
actual = (root/'supabase/migrations/20261021130803_global_catalog_official_source_intake.sql').read_text(encoding='utf-8-sig')
assert actual.split('\n',1)[1].strip() == expected.strip(), 'Seed and retained receipts differ'
assert [len(tables[key]) for key in ('color_registry_manufacturers','color_registry_brands','color_registry_lines','color_registry_entries','color_registry_sources','color_registry_metadata')] == [6,8,29,30,15,8]
hosts = {'us.lorealprofessionnel.com','www.wella.com','www.schwarzkopf-professional.com','www.goldwell.com','www.matrix.com','www.redkenpro.com','professional.uk.keune.com','www.keune.com','professional.keune.com','www.revlonprofessional.com'}
for source in tables['color_registry_sources']:
    for field in ('url','resolved_url'):
        parsed=urlparse(source[field]); assert parsed.scheme=='https' and parsed.hostname in hosts
    assert len(source['sha256'])==64 and source['byte_length']>3000
    assert source['review_status']=='SOURCE_COLLECTED'
    assert source['document_version'] is None and source['document_date'] is None
assert all(row['state']=='SOURCE_COLLECTED' and row['technical_line_id'] is None and row['last_reviewed_at'] is None for row in tables['color_registry_entries'])
assert all(row['documented_level'] is None and row['documented_tone'] is None for row in tables['color_registry_metadata'])
original=root/'contracts/catalogs/schwarzkopf-igora-royal-absolutes.json'
assert hashlib.sha256(original.read_text(encoding='utf-8').encode('utf-8')).hexdigest()=='c49ea00c8b1a5e9fd365969cf10d02abc48681aa15096228bf20c609df4c49fc'
print('PASS: 8 discovered brands / 29 lines / 30 regional entries / 15 official receipts / 7 shade + 1 developer metadata; IGORA technical pack unchanged; zero publications')
