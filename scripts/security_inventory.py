"""Source inventory is an approval ledger, not generated during verification.

The committed manifest pins every application function definition and HTTP/action
surface. Database verification separately compares the actual migrated catalog.
"""
from pathlib import Path
import hashlib
import json
import re
import os

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'contracts/security-inventory.json'

def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()

def discover(root=ROOT):
    functions = {}
    # Dollar quoted function bodies are kept intact; definition extends through
    # its matching closing delimiter. Signatures are part of the approval hash.
    pattern = re.compile(r'create\s+(?:or\s+replace\s+)?function\s+((?:public|app_private)\.\w+)\s*\((.*?)\)\s*returns\b.*?\bas\s+(\$[a-zA-Z0-9_]*\$)', re.I|re.S)
    for path in sorted((root/'supabase/migrations').glob('*.sql')):
        sql = path.read_text(encoding='utf-8')
        for m in pattern.finditer(sql):
            end = sql.find(m[3],m.end())
            if end < 0: raise AssertionError(f'Unterminated function: {path.name}')
            head = sql[m.start():m.end()]
            key = m[1].lower()
            # Current application has no overloaded names; fail rather than
            # silently classifying a newly introduced overload as its parent.
            signature = ' '.join(m[2].lower().split())
            if key in functions and functions[key]['signature'] != signature:
                raise AssertionError(f'Overloaded/changed signature needs inventory parser review: {key}')
            functions[key] = dict(source=path.relative_to(root).as_posix(),signature=signature,
                security_definer=bool(re.search(r'security\s+definer',head,re.I)),
                definition_sha256=digest(sql[m.start():end+len(m[3])]))
    routes = {}
    for path in (root/'apps/web/app').rglob('route.ts'):
        source=path.read_text(encoding='utf-8')
        methods=sorted(set(re.findall(r'export\s+(?:(?:async\s+)?function|const|let)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b',source)))
        for block in re.findall(r'export\s*\{([^}]+)\}',source):
            methods += re.findall(r'\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b',block)
        if not methods: raise AssertionError(f'Unrecognized route exports: {path}')
        for method in methods:
            routes[method+' /'+path.parent.relative_to(root/'apps/web/app').as_posix()]=dict(source=path.relative_to(root).as_posix(),definition_sha256=digest(source))
    actions={}
    for directory,dirs,files in os.walk(root/'apps/web'):
        dirs[:]=[d for d in dirs if d not in ('node_modules','.next','captures','test-results','test-results-reliability','.git')]
        for filename in files:
            if not filename.endswith(('.ts','.tsx')):continue
            path=Path(directory)/filename
            source=path.read_text(encoding='utf-8')
            if not re.match(r'\s*[\"\']use server[\"\']',source):continue
            for name in re.findall(r'export\s+async\s+function\s+(\w+)',source):
                actions[path.relative_to(root).as_posix()+'#'+name]=dict(source=path.relative_to(root).as_posix(),definition_sha256=digest(source))
    return dict(functions=functions,routes=routes,actions=actions)

def validate(root=ROOT):
    inventory=json.loads((root/'contracts/security-inventory.json').read_text(encoding='utf-8'))
    actual=discover(root)
    migrations={p.name:digest(p.read_text(encoding='utf-8')) for p in sorted((root/'supabase/migrations').glob('*.sql'))}
    assert inventory['migration_sha256']==migrations,'Migration changed or added without security inventory review (including dynamic SQL patches)'
    required={'domain','authentication','membership','location_scope','permission','entitlement','allowed_roles','access','idempotency','audit','direct_client_callable','evidence'}
    for kind,found in actual.items():
        registered=inventory[kind]
        assert set(registered)==set(found), (kind,'unclassified',sorted(set(found)-set(registered)),'stale',sorted(set(registered)-set(found)))
        for name,surface in found.items():
            entry=registered[name]
            assert required <= entry.keys(), (name,'missing security classification')
            assert all(entry[field] not in ('',None,[]) for field in required), (name,'empty classification')
            assert entry['source']==surface['source'] and entry['definition_sha256']==surface['definition_sha256'], (name,'changed surface requires explicit security review')
            for field in ('signature','security_definer'):
                if field in surface: assert entry[field]==surface[field], (name,field)
            assert all((root/p).is_file() for p in entry['evidence']), (name,'missing evidence')
    return inventory

if __name__=='__main__':
    data=validate()
    print('PASS: security inventory', {k:len(data[k]) for k in ('functions','routes','actions')}, 'SECURITY DEFINER',sum(e['security_definer'] for e in data['functions'].values()))
