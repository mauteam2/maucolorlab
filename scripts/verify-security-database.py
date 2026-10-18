"""Inspect the real migrated PostgreSQL catalog, not a migration-text guess."""
import json
import os
from pathlib import Path
from security_inventory import validate
from postgres_test_sessions import Session, result

assert os.environ.get('CI')=='true','Disposable local CI only'
inventory=validate()
db=Session()
try:
    catalog=result(db.execute("""select jsonb_build_object(
    'functions',(select jsonb_agg(jsonb_build_object('name',n.nspname||'.'||p.proname,'signature',p.oid::regprocedure::text,'definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'settings',p.proconfig,'grants',(select jsonb_agg(jsonb_build_object('role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type)) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
    'relations',(select jsonb_agg(jsonb_build_object('name',n.nspname||'.'||c.relname,'kind',c.relkind,'rls',c.relrowsecurity,'options',c.reloptions,'grants',(select jsonb_agg(jsonb_build_object('role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type)) from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 's'::"char" else 'r'::"char" end,c.relowner))) a))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private') and c.relkind in ('r','p','v','m','S') and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')),
    'buckets',(select jsonb_agg(jsonb_build_object('id',id,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)) from storage.buckets),
    'policies',(select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check)) from pg_policies where schemaname in ('public','app_private','storage')),
    'roles',(select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypassrls',rolbypassrls,'login',rolcanlogin)) from pg_roles where rolname in ('anon','authenticated','service_role') or rolname like 'elifora_%')
    );"""))
    functions=catalog['functions']
    assert len(functions)==len(inventory['functions']), 'Function count/overload drift'
    assert {f['name'] for f in functions}==set(inventory['functions']), 'Unclassified runtime function'
    for f in functions:
        assert f['definer']==inventory['functions'][f['name']]['security_definer'],f
        assert f['owner'] not in ('anon','authenticated','service_role'),f
        assert any(v in ('search_path=""','search_path=') for v in f['settings'] or []), (f['name'],'unsafe search_path')
        assert not any(g['role']=='PUBLIC' for g in f['grants'] or []),(f['name'],'implicit PUBLIC execute')
        if f['name']!='app_private.require_active_session':
            assert not any(g['role'] in ('anon','service_role') for g in f['grants'] or []),(f['name'],'unnecessary anon/service execute')
    for table in catalog['relations']:
        if table['kind'] in ('r','p'): assert table['rls'],(table['name'],'RLS disabled')
        for grant in table['grants'] or []:
            assert grant['role'] not in ('PUBLIC','anon'),(table['name'],'public relation privilege')
            if grant['role']=='authenticated':assert grant['privilege']=='SELECT',(table['name'],'direct domain write')
        if table['kind']=='v' and any(g['role']=='authenticated' for g in table['grants'] or []):assert 'security_invoker=true' in (table['options'] or []),table
    for bucket in catalog['buckets'] or []:assert not bucket['public'],bucket['id']
    for role in catalog['roles']:
        if role['name']!='service_role':assert not role['superuser'] and not role['bypassrls'],role
        if role['name'].startswith('elifora_'):assert not role['login'],role
    path=Path(os.environ['RUNNER_TEMP'])/'phase-9-database-security.json'
    path.write_text(json.dumps(catalog,indent=2))
    print('PASS: real catalog/grant review:',len(functions),'functions;',sum(f['definer'] for f in functions),'SECURITY DEFINER;',len(catalog['relations']),'relations;',len(catalog['policies']),'RLS policies')
finally:db.close()
