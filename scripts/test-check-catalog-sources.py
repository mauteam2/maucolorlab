import hashlib,importlib.util,unittest
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('source_check',Path(__file__).with_name('check-catalog-sources.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class SourceCheckTests(unittest.TestCase):
    def setUp(self):
        self.pdf=b'%PDF-1.7\nsynthetic source-check payload'
        self.source={'id':'synthetic','sourceUrl':'https://dm.henkel-dam.com/is/content/henkel/test','contentSha256':hashlib.sha256(self.pdf).hexdigest()}
    @patch.object(module.shutil,'which',return_value='curl')
    @patch.object(module.subprocess,'check_output')
    def test_unchanged_hash(self,fetch,_):
        fetch.return_value=self.pdf
        self.assertEqual(module.check({'sources':[self.source]})[0]['status'],'UNCHANGED')
        self.assertNotIn('--location',fetch.call_args.args[0])
        self.assertEqual(fetch.call_args.kwargs['timeout'],50)
    @patch.object(module.shutil,'which',return_value='curl')
    @patch.object(module.subprocess,'check_output')
    def test_changed_source_requires_new_draft(self,fetch,_):
        fetch.return_value=self.pdf+b'updated'
        self.assertEqual(module.check({'sources':[self.source]})[0]['status'],'CHANGED_NEW_DRAFT_REQUIRED')
    @patch.object(module.subprocess,'check_output')
    def test_unqualified_host_is_not_fetched(self,fetch):
        with self.assertRaises(ValueError):module.check({'sources':[self.source|{'sourceUrl':'https://reseller.example/manual'}]})
        fetch.assert_not_called()
    @patch.object(module.shutil,'which',return_value='curl')
    @patch.object(module.subprocess,'check_output',return_value=b'<html>redirect</html>')
    def test_non_pdf_rejected(self,*_):
        with self.assertRaises(ValueError):module.check({'sources':[self.source]})
if __name__=='__main__':unittest.main()
