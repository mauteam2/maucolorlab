"""Preserve unrelated OpenAPI formatting while integrating the shared Phase 5B shapes."""
from pathlib import Path
import json,re,yaml
root=Path(__file__).resolve().parents[1]
path=root/'contracts/openapi.yaml'
text=path.read_text(encoding='utf-8').replace('version: 0.18.0','version: 0.19.0',1)
for name,schema in json.loads((root/'contracts/costing.schemas.json').read_text(encoding='utf-8')).items():
    block=''.join('    '+line+'\n' for line in yaml.safe_dump({name:schema},sort_keys=False,allow_unicode=True).splitlines())
    pattern=r'^    '+re.escape(name)+r':\n.*?(?=^    [A-Za-z][A-Za-z0-9]*:|\Z)'
    if re.search(pattern,text,re.M|re.S):text=re.sub(pattern,lambda m:block,text,flags=re.M|re.S)
    else:text+=block
ref=lambda name:{'$ref':'#/components/schemas/'+name}
security=[{'bearerAuth':[],'publishableKey':[]}]
paths={}
for rpc,write in [('costing_snapshot',False),('costing_operation',True)]:
    fields={'p_membership_id':{'type':'string','format':'uuid'},'p_location_id':{'type':'string','format':'uuid'},'p_command' if write else 'p_request':ref('CostingCommand' if write else 'CostingReadRequest')}
    if write:fields['p_correlation_id']={'type':'string','format':'uuid'}
    paths['/rest/v1/rpc/'+rpc]={'post':{'summary':'Authorized operational costing; immutable lineage and staff earnings privacy','security':security,'requestBody':{'required':True,'content':{'application/json':{'schema':{'type':'object','additionalProperties':False,'required':list(fields),'properties':fields}}}},'responses':{'200':{'description':'Controlled result or domain conflict','content':{'application/json':{'schema':{'type':'object','properties':{'data':ref('CostingResult' if write else 'CostingSnapshot'),'code':{'type':'string'}}}}}}}}}
paths['/api/costing']={'get':{'summary':'Bounded profitability, cost basis, policy or own/all commission reads','security':[{'sessionCookie':[]}],'parameters':[{'name':n,'in':'query','schema':{'type':'integer' if n=='offset' else 'string'}} for n in ('kind','offset','from','until','charge_id','staff_user_id','stock_item_id')],'responses':{'200':{'description':'Authorized scoped projection','content':{'application/json':{'schema':{'type':'object','properties':{'data':ref('CostingSnapshot')}}}}}}},'post':{'summary':'Permanent idempotent acquisition/policy command; no derived client money','security':[{'sessionCookie':[]}],'parameters':[{'name':'x-workspace-reference','in':'header','required':True,'schema':{'type':'string'}}],'requestBody':{'required':True,'content':{'application/json':{'schema':ref('CostingCommand')}}},'responses':{'200':{'description':'Immutable accepted event'},'409':{'description':'Source, effective date, version or assignment conflict'}}}}
for name,body in paths.items():
    block=''.join('  '+line+'\n' for line in yaml.safe_dump({name:body},sort_keys=False,allow_unicode=True).splitlines())
    pattern=r'^  '+re.escape(name)+r':\n.*?(?=^  /|^components:)'
    if re.search(pattern,text,re.M|re.S):text=re.sub(pattern,lambda m:block,text,flags=re.M|re.S)
    else:text=text.replace('components:\n',block+'components:\n',1)
path.write_text(text,encoding='utf-8',newline='\n')
