"""Integrate runtime-generated finance shapes without reformatting unrelated contracts."""
from pathlib import Path
import json,re,yaml
root=Path(__file__).resolve().parents[1]
path=root/'contracts/openapi.yaml'
text=path.read_text(encoding='utf-8').replace('version: 0.17.0','version: 0.18.0',1)
for name,schema in json.loads((root/'contracts/stock.schemas.json').read_text()).items():
    block=''.join('    '+line+'\n' for line in yaml.safe_dump({name:schema},sort_keys=False,allow_unicode=True).splitlines())
    text=re.sub(r'^    '+re.escape(name)+r':\n.*?(?=^    [A-Za-z][A-Za-z0-9]*:|\Z)',lambda m:block,text,flags=re.M|re.S)
schemas=json.loads((root/'contracts/finance.schemas.json').read_text())
for name,schema in schemas.items():
    block=''.join('    '+line+'\n' for line in yaml.safe_dump({name:schema},sort_keys=False,allow_unicode=True).splitlines())
    pattern=r'^    '+re.escape(name)+r':\n.*?(?=^    [A-Za-z][A-Za-z0-9]*:|\Z)'
    if re.search(pattern,text,re.M|re.S):text=re.sub(pattern,lambda m:block,text,flags=re.M|re.S)
    else:text+=block
contract=yaml.safe_load(text)
security=[{'bearerAuth':[],'publishableKey':[]}]
ref=lambda name:{'$ref':'#/components/schemas/'+name}
paths={}
for rpc,fields,response in [('finance_snapshot',{'p_membership_id':{'type':'string','format':'uuid'},'p_location_id':{'type':'string','format':'uuid'},'p_request':ref('FinanceReadRequest')},'FinanceSnapshot'),('finance_operation',{'p_membership_id':{'type':'string','format':'uuid'},'p_location_id':{'type':'string','format':'uuid'},'p_command':ref('FinanceCommand'),'p_correlation_id':{'type':'string','format':'uuid'}},'FinanceResult')]:
    paths['/rest/v1/rpc/'+rpc]={'post':{'summary':'Authenticated operational finance; fresh database memberships and immutable ledger','security':security,'requestBody':{'required':True,'content':{'application/json':{'schema':{'type':'object','additionalProperties':False,'required':list(fields),'properties':fields}}}},'responses':{'200':{'description':'Domain result or controlled error','content':{'application/json':{'schema':{'type':'object','properties':{'data':ref(response),'code':{'type':'string'}}}}}}}}}
paths['/api/finance']={'get':{'summary':'Bounded location/day, client or appointment financial projection','security':[{'sessionCookie':[]}],'parameters':[{'name':name,'in':'query','schema':{'type':'integer' if name=='offset' else 'string'}} for name in ('day','client_id','appointment_id','document_id','offset')],'responses':{'200':{'description':'Fresh authenticated finance projection','content':{'application/json':{'schema':{'type':'object','properties':{'data':ref('FinanceSnapshot')}}}}}}},'post':{'summary':'Permanent idempotent finance command with workspace reference and same-origin check','security':[{'sessionCookie':[]}],'parameters':[{'name':'x-workspace-reference','in':'header','required':True,'schema':{'type':'string'}}],'requestBody':{'required':True,'content':{'application/json':{'schema':ref('FinanceCommand')}}},'responses':{'200':{'description':'Accepted immutable fact','content':{'application/json':{'schema':{'type':'object','properties':{'data':ref('FinanceResult')}}}}},'409':{'description':'Allocation, refund, currency, stock or cash conflict','content':{'application/json':{'schema':ref('FinanceError')}}}}}}
for name,body in paths.items():
    block=''.join('  '+line+'\n' for line in yaml.safe_dump({name:body},sort_keys=False,allow_unicode=True).splitlines())
    pattern=r'^  '+re.escape(name)+r':\n.*?(?=^  /|^components:)'
    if re.search(pattern,text,re.M|re.S):text=re.sub(pattern,lambda m:block,text,flags=re.M|re.S)
    else:text=text.replace('components:\n',block+'components:\n',1)
path.write_text(text,encoding='utf-8',newline='\n')
