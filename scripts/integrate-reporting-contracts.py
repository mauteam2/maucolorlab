"""Preserve unrelated OpenAPI blocks while adding Phase 6 shared schemas."""
from pathlib import Path
import json,re,yaml
root=Path(__file__).resolve().parents[1]
path=root/'contracts/openapi.yaml'
text=path.read_text(encoding='utf-8').replace('version: 0.19.0','version: 0.20.0',1)
for name,schema in json.loads((root/'contracts/reporting.schemas.json').read_text(encoding='utf-8')).items():
    block=''.join('    '+line+'\n' for line in yaml.safe_dump({name:schema},sort_keys=False,allow_unicode=True).splitlines())
    pattern=r'^    '+re.escape(name)+r':\n.*?(?=^    [A-Za-z][A-Za-z0-9]*:|\Z)'
    if re.search(pattern,text,re.M|re.S):text=re.sub(pattern,lambda m:block,text,flags=re.M|re.S)
    else:text+=block
ref=lambda name:{'$ref':'#/components/schemas/'+name}
paths={}
for rpc,write in [('reporting_snapshot',False),('reporting_operation',True)]:
    fields={'p_membership_id':{'type':'string','format':'uuid'},'p_location_id':{'type':'string','format':'uuid'},'p_command' if write else 'p_request':ref('ReportCommand' if write else 'ReportRequest')}
    if write:fields['p_correlation_id']={'type':'string','format':'uuid'}
    paths['/rest/v1/rpc/'+rpc]={'post':{'summary':'Permission-scoped derived reports; no source fact mutation','security':[{'bearerAuth':[],'publishableKey':[]}],'requestBody':{'required':True,'content':{'application/json':{'schema':{'type':'object','additionalProperties':False,'required':list(fields),'properties':fields}}}},'responses':{'200':{'description':'Scoped reporting result or controlled domain error'}}}}
paths['/api/reporting']={'get':{'summary':'Bounded location-calendar reports with exact money and stable source cursor','security':[{'sessionCookie':[]}],'parameters':[{'name':n,'in':'query','schema':{'type':'string'}} for n in ('kind','period','from','until','staff_user_id','service_id','category','cursor','domain','segment','source_id')],'responses':{'200':{'description':'Authorized report summary','content':{'application/json':{'schema':{'type':'object','properties':{'data':ref('ReportSummary')}}}}},'403':{'description':'Source permission or scope denied'}}},'post':{'summary':'Scoped audited rebuild/settings or bounded CSV export','security':[{'sessionCookie':[]}],'parameters':[{'name':'x-workspace-reference','in':'header','required':True,'schema':{'type':'string'}}],'requestBody':{'required':True,'content':{'application/json':{'schema':ref('ReportCommand')}}},'responses':{'200':{'description':'Derived operation result or CSV; never source authority'},'409':{'description':'Settings version conflict'}}}}
for name,body in paths.items():
    block=''.join('  '+line+'\n' for line in yaml.safe_dump({name:body},sort_keys=False,allow_unicode=True).splitlines())
    pattern=r'^  '+re.escape(name)+r':\n.*?(?=^  /|^components:)'
    if re.search(pattern,text,re.M|re.S):text=re.sub(pattern,lambda m:block,text,flags=re.M|re.S)
    else:text=text.replace('components:\n',block+'components:\n',1)
path.write_text(text,encoding='utf-8',newline='\n')
