"""Add Phase 8 contracts without reformatting unrelated specifications."""
from pathlib import Path
import json
import re
import yaml
root = Path(__file__).resolve().parents[1]
path = root / 'contracts/openapi.yaml'
text = path.read_text(encoding='utf-8').replace('version: 0.21.0', 'version: 0.22.0', 1)
schemas = json.loads((root / 'contracts/offline.schemas.json').read_text(encoding='utf-8'))
schemas['LiveSessionCommand'] = json.loads((root / 'contracts/live-session.schemas.json').read_text(encoding='utf-8'))['LiveSessionCommand']
for name, schema in schemas.items():
    block = ''.join('    ' + line + '\n' for line in yaml.safe_dump({name: schema}, sort_keys=False, allow_unicode=True).splitlines())
    pattern = r'^    ' + re.escape(name) + r':\n.*?(?=^    [A-Za-z][A-Za-z0-9]*:|\Z)'
    if re.search(pattern, text, re.M | re.S):
        text = re.sub(pattern, lambda _: block, text, flags=re.M | re.S)
    else:
        text += block
path.write_text(text, encoding='utf-8', newline='\n')
