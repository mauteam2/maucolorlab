import copy,unittest
from pilot_readiness import CATEGORIES,validate_checklist,validate_queue
def checklist():return {'schemaVersion':1,'releaseSha':'a'*40,'environment':'staging','checks':{k:dict(status='BLOCKED',reason='External evidence required',evidence=[],reviewedBy=None,reviewedAt=None) for k in CATEGORIES}}
def queue():
    event=lambda state:dict(state=state,reviewedAt='2026-10-19T12:00:00Z',reviewedBy='TECHNICAL_REVIEWER',method='HUMAN_DOCUMENT_REVIEW',reason='Official document reviewed',officialOriginConfirmed=True)
    return dict(schemaVersion=1,documents=[dict(id='sample',manufacturer='Sample',brand='Sample',line='Sample',title='Official guide',version='UNKNOWN',region='UNKNOWN',origin='https://manufacturer.example/guide',sha256='a'*64,events=[event(s) for s in ['RECEIVED','UNDER_REVIEW','VERIFIED']])])
class ReadinessTests(unittest.TestCase):
    def test_blocked_is_no_go(self):self.assertEqual(validate_checklist(checklist()),'NO_GO')
    def test_all_categories_required(self):
        d=checklist();del d['checks']['AUTH']
        with self.assertRaises(AssertionError):validate_checklist(d)
    def test_pass_without_evidence_denied(self):
        d=checklist();d['checks']['BACKUP']['status']='PASS'
        with self.assertRaises(AssertionError):validate_checklist(d)
    def test_public_production_not_approved(self):
        d=checklist();d['environment']='production'
        with self.assertRaises(AssertionError):validate_checklist(d)
    def test_even_na_does_not_approve_required_domain(self):
        d=checklist()
        for c in d['checks'].values():c.update(status='PASS',evidence=['reviewed evidence'],reviewedBy='OPERATOR',reviewedAt='2026-10-19T12:00:00Z')
        self.assertEqual(validate_checklist(d),'CONTROLLED_PILOT_GO_WITH_LIMITATIONS');d['checks']['AUTH']['status']='NOT_APPLICABLE';self.assertEqual(validate_checklist(d),'NO_GO')
    def test_queue_does_not_publish(self):self.assertEqual(validate_queue(queue())['executableCatalogChanges'],0)
    def test_no_direct_verified_transition(self):
        d=queue();d['documents'][0]['events']=d['documents'][0]['events'][2:]
        with self.assertRaises(AssertionError):validate_queue(d)
    def test_ocr_not_verification(self):
        d=queue();d['documents'][0]['events'][2]['method']='AI_EXTRACTION'
        with self.assertRaises(AssertionError):validate_queue(d)
    def test_retailer_not_official(self):
        d=queue();d['documents'][0]['events'][2]['officialOriginConfirmed']=False
        with self.assertRaises(AssertionError):validate_queue(d)
    def test_missing_checksum_denied(self):
        d=queue();d['documents'][0]['sha256']='UNKNOWN'
        with self.assertRaises(AssertionError):validate_queue(d)
    def test_duplicate_receipt_denied(self):
        d=queue();d['documents']*=2
        with self.assertRaises(AssertionError):validate_queue(d)
    def test_empty_queue_is_honest(self):self.assertEqual(validate_queue({'schemaVersion':1,'documents':[]})['documents'],0)
    def test_credential_bearing_origin_denied(self):
        d=queue();d['documents'][0]['origin']='https://operator:private@manufacturer.example/guide'
        with self.assertRaises(AssertionError):validate_queue(d)
    def test_timezone_required(self):
        d=checklist();d['checks']['AUTH'].update(status='PASS',evidence=['hosted evidence'],reviewedBy='OPERATOR',reviewedAt='2026-10-19T12:00:00')
        with self.assertRaises(AssertionError):validate_checklist(d)
unittest.main()
