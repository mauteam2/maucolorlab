"""Add SaaS contracts while preserving unrelated OpenAPI blocks."""
from pathlib import Path
import json, re, yaml
root = Path(__file__).resolve().parents[1]
path = root / 'contracts/openapi.yaml'
text = path.read_text(encoding='utf-8').replace('version: 0.20.0', 'version: 0.21.0', 1)
for name, schema in json.loads((root/'contracts/saas.schemas.json').read_text(encoding='utf-8')).items():
    block = ''.join('    '+line+'\n' for line in yaml.safe_dump({name: schema},sort_keys=False,allow_unicode=True).splitlines())
    pattern = r'^    '+re.escape(name)+r':\n.*?(?=^    [A-Za-z][A-Za-z0-9]*:|\Z)'
    if re.search(pattern,text,re.M|re.S): text = re.sub(pattern,lambda _:block,text,flags=re.M|re.S)
    else: text += block
ref = lambda name: {'$ref': '#/components/schemas/'+name}
paths = {}
for rpc, write in [('saas_snapshot',False),('saas_operation',True)]:
    fields = {'p_membership_id':{'type':'string','format':'uuid'},'p_location_id':{'type':'string','format':'uuid'}}
    if write: fields |= {'p_command':ref('SaaSCommand'),'p_correlation_id':{'type':'string','format':'uuid'}}
    paths['/rest/v1/rpc/'+rpc] = {'post':{'summary':'Authorized organization SaaS governance; membership and domain permissions remain independent','security':[{'bearerAuth':[],'publishableKey':[]}], 'requestBody':{'required':True,'content':{'application/json':{'schema':{'type':'object','additionalProperties':False,'required':list(fields),'properties':fields}}}},'responses':{'200':{'description':'Scoped snapshot / controlled intent result / error'}}}}
paths['/api/saas'] = {'get':{'summary':'Current entitlement snapshot; owner governance fields only','security':[{'sessionCookie':[]}],'responses':{'200':{'description':'Private no-store scoped current snapshot','content':{'application/json':{'schema':{'type':'object','properties':{'data':ref('EntitlementSnapshot')}}}}},'403':{'description':'Membership/scope denied'},'409':{'description':'In-flight account state changed'}}},'post':{'summary':'Owner change request or derived usage rebuild; no caller-owned plan/status','security':[{'sessionCookie':[]}],'parameters':[{'name':'x-workspace-reference','in':'header','required':True,'schema':{'type':'string'}}],'requestBody':{'required':True,'content':{'application/json':{'schema':ref('SaaSCommand')}}},'responses':{'200':{'description':'Intent accepted or derived summary rebuilt'},'403':{'description':'Organization owner scope/permission denied'},'409':{'description':'Version/replay conflict'}}}}
for name, body in paths.items():
    block = ''.join('  '+line+'\n' for line in yaml.safe_dump({name:body},sort_keys=False,allow_unicode=True).splitlines())
    pattern = r'^  '+re.escape(name)+r':\n.*?(?=^  /|^components:)'
    if re.search(pattern,text,re.M|re.S): text = re.sub(pattern,lambda _:block,text,flags=re.M|re.S)
    else: text = text.replace('components:\n',block+'components:\n',1)
path.write_text(text,encoding='utf-8',newline='\n')
