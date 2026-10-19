"""Offline evidence validation. Never deploys, sends invitations or changes catalogs."""
import argparse,json,re,datetime
from pathlib import Path
CATEGORIES=('SECURITY','DATA','AUTH','COLOR_ENGINE','BRAND_DATA','LIVE','STOCK','FINANCE','REPORTING','OFFLINE','BACKUP','PERFORMANCE','UX','SUPPORT')
STATUSES={'PASS','FAIL','NOT_APPLICABLE','BLOCKED'}
def validate_checklist(data):
    assert set(data)=={'schemaVersion','releaseSha','environment','checks'},'CHECKLIST_SHAPE'
    assert data['schemaVersion']==1 and re.fullmatch('[a-f0-9]{40}',data['releaseSha']),'RELEASE_REQUIRED'
    assert data['environment'] in ('staging','pilot'),'HOSTED_ENVIRONMENT_REQUIRED'
    checks=data['checks'];assert set(checks)==set(CATEGORIES),'CATEGORY_COVERAGE'
    for category,c in checks.items():
        assert set(c)=={'status','reason','evidence','reviewedBy','reviewedAt'},'CHECK_SHAPE'
        assert c['status'] in STATUSES and isinstance(c['reason'],str) and 5<=len(c['reason'])<=1000,'EXPLICIT_STATUS_REQUIRED'
        assert isinstance(c['evidence'],list) and all(isinstance(x,str) and len(x)<=500 for x in c['evidence']),'EVIDENCE_SHAPE'
        if c['status'] in ('PASS','NOT_APPLICABLE'):
            assert c['evidence'] and c['reviewedBy'] and c['reviewedAt'],'REVIEW_EVIDENCE_REQUIRED'
            datetime.datetime.fromisoformat(c['reviewedAt'].replace('Z','+00:00'))
    # All fourteen categories are relevant to this cross-domain Web pilot.
    return 'CONTROLLED_PILOT_GO_WITH_LIMITATIONS' if all(c['status']=='PASS' for c in checks.values()) else 'NO_GO'
TRANSITIONS={None:{'RECEIVED'},'RECEIVED':{'UNDER_REVIEW','REJECTED'},'UNDER_REVIEW':{'VERIFIED','REJECTED'},'VERIFIED':{'SUPERSEDED'},'REJECTED':set(),'SUPERSEDED':set()}
def validate_queue(data):
    assert set(data)=={'schemaVersion','documents'} and data['schemaVersion']==1,'QUEUE_SHAPE'
    ids=set()
    for doc in data['documents']:
        assert set(doc)=={'id','manufacturer','brand','line','title','version','region','origin','sha256','events'},'DOCUMENT_SHAPE'
        assert doc['id'] not in ids;ids.add(doc['id'])
        assert all(isinstance(doc[k],str) and 1<=len(doc[k])<=500 for k in ('id','manufacturer','brand','line','title','version','region','origin','sha256')),'PROVENANCE_REQUIRED'
        assert doc['origin'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',doc['sha256']),'SOURCE_REQUIRED'
        previous=None;last=None
        assert doc['events'],'RECEIPT_REQUIRED'
        for event in doc['events']:
            assert set(event)=={'state','reviewedAt','reviewedBy','method','reason','officialOriginConfirmed'},'REVIEW_SHAPE'
            state=event['state'];assert state in TRANSITIONS[previous],'ILLEGAL_TRANSITION'
            at=datetime.datetime.fromisoformat(event['reviewedAt'].replace('Z','+00:00'));assert at.tzinfo and (last is None or at>=last),'REVIEW_ORDER'
            assert event['reviewedBy'] and 5<=len(event['reason'])<=1000,'CONTROLLED_ACTOR_REQUIRED'
            if state=='VERIFIED':assert event['method']=='HUMAN_DOCUMENT_REVIEW' and event['officialOriginConfirmed'] is True,'HUMAN_OFFICIAL_REVIEW_REQUIRED'
            previous=state;last=at
    return {'status':'PASS','documents':len(ids),'executableCatalogChanges':0}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('kind',choices=['checklist','queue']);p.add_argument('path',type=Path);a=p.parse_args()
    try:
        data=json.loads(a.path.read_text(encoding='utf8'));out=validate_checklist(data) if a.kind=='checklist' else validate_queue(data)
        print(json.dumps({'result':out}));raise SystemExit(1 if out=='NO_GO' else 0)
    except (AssertionError,KeyError,TypeError,ValueError):
        print(json.dumps({'result':'FAIL','code':'INVALID_PILOT_EVIDENCE'}));raise SystemExit(1)
