"""Build the initial discovery-only seed from retained official source receipts.

No technical pack is generated or changed. Re-run only for a deliberate new intake;
applied migrations must never be regenerated. UUIDs are deterministic, not identities
borrowed from executable technical catalogs.
"""
import json
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
BRANDS = [
 ('loreal-professionnel', 'loreal', 'L’Oréal Professionnel'),
 ('wella-professionals', 'wella-company', 'Wella Professionals'),
 ('schwarzkopf-professional', 'henkel', 'Schwarzkopf Professional'),
 ('goldwell', 'kao', 'Goldwell'), ('matrix', 'loreal', 'Matrix'),
 ('redken', 'loreal', 'Redken'), ('keune', 'keune', 'Keune'),
 ('revlon-professional', 'revlon', 'Revlon Professional'),
]
LINES = [
 ('loreal-professionnel', 'loreal-us', ['iNOA', 'Majirel', 'Dia Light', 'Dia Color']),
 ('wella-professionals', 'wella-us', ['Koleston Perfect', 'Illumina Color', 'Koleston Xpress']),
 ('wella-professionals', 'wella-touch-us', ['Color Touch']),
 ('wella-professionals', 'wella-touch-guide', ['Color Touch']),
 ('schwarzkopf-professional', 'igora-us', ['IGORA ROYAL', 'IGORA ROYAL ABSOLUTES', 'IGORA VIBRANCE', 'IGORA ROYAL HIGHLIFTS', 'IGORA ROYAL FASHION LIGHTS']),
 ('schwarzkopf-professional', 'igora-zero-us', ['IGORA ZERO AMM']),
 ('goldwell', 'goldwell-ca', ['Topchic', 'Colorance', 'Elumen', 'Topchic Zero']),
 ('matrix', 'matrix-socolor', ['SoColor']), ('matrix', 'matrix-sync', ['SoColor Sync']),
 ('redken', 'redken-charts', ['Shades EQ Gloss', 'Color Gels Lacquers', 'Color Gels Oils']),
 ('keune', 'keune-tinta-uk', ['Tinta Color']), ('keune', 'keune-semi', ['Semi Color']),
 ('keune', 'keune-so-pure', ['So Pure Color']),
 ('revlon-professional', 'revlon-lines', ['Revlonissimo Colorsmetique', 'Revlonissimo Color Sublime']),
 ('revlon-professional', 'revlon-excel-es', ['Color Excel']),
]

def slug(value):
 return value.lower().replace(' ', '-')

def uid(value):
 return str(uuid.uuid5(uuid.NAMESPACE_URL, 'https://elifora.invalid/catalog/discovery/' + value))

def literal(value):
 if value is None: return 'null'
 if isinstance(value, int): return str(value)
 return "'" + str(value).replace("'", "''") + "'"

def inserts(table, rows):
 if not rows: return ''
 keys = list(rows[0])
 return 'insert into public.' + table + '(' + ','.join(keys) + ') values\n' + ',\n'.join(' (' + ','.join(literal(row[k]) for k in keys) + ')' for row in rows) + ';\n'

if __name__ == '__main__':
 sources = json.loads((ROOT / 'apps/web/captures/catalog-intake/sources.json').read_text(encoding='utf-8'))
 assert len(sources) == 15, 'Partial intake must not silently become the initial seed'
 by_source = {row['id']: row for row in sources}
 manufacturers = [dict(id=k, display_name=n) for k,n in [('loreal','L’Oréal'),('wella-company','Wella Company'),('henkel','Henkel'),('kao','Kao'),('keune','Keune'),('revlon','Revlon')]]
 brands = [dict(id=k, manufacturer_id=m, display_name=n) for k,m,n in BRANDS]
 lines, entries, links = {}, {}, []
 source_brand = {}
 for brand, source, names in LINES:
  source_brand[source] = brand
  for name in names:
   key = brand + '-' + slug(name)
   lines[key] = dict(id=key, brand_id=brand, display_name=name)
   region = by_source[source]['region']
   entry = uid(key + ':' + region)
   entries[entry] = dict(id=entry, line_id=key, region=region, revision=1, previous_id=None, state='SOURCE_COLLECTED', technical_line_id=None, last_reviewed_at=None, review_reference=None)
   links.append(dict(entry_id=entry, source_id=source, brand_id=brand, region=region))
 rows = [dict(id=s['id'],brand_id=source_brand[s['id']],region=s['region'],url=s['url'],resolved_url=s['resolvedUrl'],title=s['title'],document_type=s['documentType'],document_version=s['documentVersion'],document_date=s['documentDate'],retrieved_at=s['retrievedAt'],sha256=s['sha256'],byte_length=s['byteLength'],language=s['language'],review_status=s['reviewStatus']) for s in sources]
 metadata = []
 zero_entry = uid('schwarzkopf-professional-igora-zero-amm:US')
 zero_raw = (ROOT / 'apps/web/captures/catalog-intake/igora-zero-us.html').read_text(encoding='utf-8')
 for code in ['10-19','9-42','6-0','6-23','7-55','7-77']:
  assert code in zero_raw
  metadata.append(dict(id='igora-zero-us-' + code,entry_id=zero_entry,source_id='igora-zero-us',kind='SHADE',manufacturer_code=code,display_name=None,documented_level=None,documented_tone=None))
 sync_entry = uid('matrix-socolor-sync:UNKNOWN')
 sync_raw = (ROOT / 'apps/web/captures/catalog-intake/matrix-sync.html').read_text(encoding='utf-8')
 assert 'Medium Brown Mocha' in sync_raw and '10 Volume Matrix Cream Developer' in sync_raw
 metadata.append(dict(id='matrix-sync-5m',entry_id=sync_entry,source_id='matrix-sync',kind='SHADE',manufacturer_code='5M',display_name='Medium Brown Mocha',documented_level=None,documented_tone=None))
 metadata.append(dict(id='matrix-10-volume-cream',entry_id=sync_entry,source_id='matrix-sync',kind='DEVELOPER',manufacturer_code=None,display_name='10 Volume Matrix Cream Developer',documented_level=None,documented_tone=None))
 tables = dict(color_registry_manufacturers=manufacturers,color_registry_brands=brands,color_registry_lines=list(lines.values()),color_registry_entries=list(entries.values()),color_registry_sources=rows,color_registry_line_sources=links,color_registry_metadata=metadata)
 output = dict(schemaVersion=1,purpose='DISCOVERY_ONLY',tables=tables)
 (ROOT / 'contracts/catalogs/global-discovery.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 (ROOT / 'apps/web/captures/catalog-intake/seed.sql').write_text('\n'.join(inserts(k,v) for k,v in tables.items()),encoding='utf-8')
 print({k:len(v) for k,v in tables.items()})
