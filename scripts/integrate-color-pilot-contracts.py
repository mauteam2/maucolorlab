"""Extend only Color Engine contracts; historical schema remains accepted."""
from pathlib import Path
import json,re,yaml,subprocess,copy
root=Path(__file__).resolve().parents[1]
p=root/'contracts/openapi.yaml'
s=subprocess.check_output(['git','show','77c20bfee4ba6c62c8f02ed7bab060a7b9764e60:contracts/openapi.yaml'],text=True,encoding='utf-8').replace('version: 0.23.0','version: 0.24.0',1)
legacy=yaml.safe_load(s)['components']['schemas']
generated=json.loads((root/'contracts/color-pilot.schemas.json').read_text(encoding='utf-8'))
current=generated['ColorPlanning']
current['properties']['engineVersion']={'type':'string','const':'color-engine/1.1.0'}
current['required']+=['targetInterpretation','confidenceBand','riskBand']
additions={'ColorPlanningV11':current,'TargetInterpretation':generated['TargetInterpretation'],'ColorTargetOptions':generated['ColorTargetOptions'],
    'ColorPlanningCurrent':{'oneOf':[{'$ref':'#/components/schemas/ColorPlanning'},{'$ref':'#/components/schemas/ColorPlanningV11'}]}}
for name in ('StoredColorPlan','ColorPlanResult'):
    value=copy.deepcopy(legacy[name])
    encoded=json.dumps(value).replace('#/components/schemas/ColorPlanning"','#/components/schemas/ColorPlanningCurrent"').replace('#/components/schemas/StoredColorPlan"','#/components/schemas/StoredColorPlanCurrent"')
    additions[name+'Current']=json.loads(encoded)
# Historical pinned schemas remain byte/semantic identical. Only live response paths
# and non-pinned downstream consumer refs accept the versioned union.
protected=json.loads((root/'contracts/fixtures/phase-1f-schema-fingerprints.json').read_text(encoding='utf-8'))
for name,value in legacy.items():
    if name in protected:continue
    encoded=json.dumps(value).replace('#/components/schemas/ColorPlanning"','#/components/schemas/ColorPlanningCurrent"')
    changed=json.loads(encoded)
    if changed!=value:additions[name]=changed
paths,components=s.split('\ncomponents:',1)
s=paths.replace("#/components/schemas/ColorPlanResult'","#/components/schemas/ColorPlanResultCurrent'")+ '\ncomponents:'+components
for name,schema in additions.items():
    block=''.join('    '+line+'\n' for line in yaml.safe_dump({name:schema},sort_keys=False,allow_unicode=True).splitlines())
    pattern=r'^    '+re.escape(name)+r':\n.*?(?=^    [A-Za-z][A-Za-z0-9]*:|\Z)'
    if re.search(pattern,s,re.M|re.S):s=re.sub(pattern,lambda _:block,s,flags=re.M|re.S)
    else:s+=block
route='''  /api/color-target-options:
    get:
      operationId: readColorTargetOptions
      summary: Controlled qualitative target metadata, separate from manufacturer chemistry
      security:
      - cookieAuth: []
      responses:
        '200':
          description: Active technical member; no Color Engine usage is consumed
          content:
            application/json:
              schema:
                type: object
                additionalProperties: false
                required: [data, correlationId]
                properties:
                  data:
                    $ref: '#/components/schemas/ColorTargetOptions'
                  correlationId:
                    type: string
                    format: uuid
        '400':
          description: Query arguments rejected
        '401':
          description: Current provider session required
        '403':
          description: Current clients, Hair Passport and Color Plan read permissions required
'''
assert '/api/color-target-options:' not in s
s=s.replace('\ncomponents:', '\n'+route+'components:',1)
p.write_text(s,encoding='utf-8',newline='\n')
