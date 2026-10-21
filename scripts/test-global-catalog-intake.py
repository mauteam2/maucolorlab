"""A PDF URL redirected to HTML must never count as a technical document."""
from email.message import Message
import importlib.util
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('intake',Path(__file__).with_name('collect-global-catalog-sources.py'))
intake=importlib.util.module_from_spec(spec);spec.loader.exec_module(intake)

class Response:
    def __init__(self,body,mime):
        self.body=body;self.url='https://www.wella.com/landing'
        self.headers=Message();self.headers['Content-Type']=mime
    def read(self,limit):return self.body[:limit]
    def __enter__(self):return self
    def __exit__(self,*args):pass

class IntakeTests(unittest.TestCase):
    def test_real_bytes_are_hashed_and_retained_without_technical_approval(self):
        body=b'%PDF-1.7\nsynthetic intake test only'
        with tempfile.TemporaryDirectory() as folder, patch.object(intake,'DEST',Path(folder)), patch.object(intake.urllib.request,'build_opener') as opener:
            opener.return_value.open.return_value=Response(body,'application/pdf')
            result=intake.collect(('wella-touch-guide','https://www.wella.com/example.pdf','UNKNOWN','en','TECHNICAL_GUIDE'))
            self.assertEqual(result['sha256'],hashlib.sha256(body).hexdigest())
            self.assertEqual(result['reviewStatus'],'SOURCE_COLLECTED')
            self.assertEqual((Path(folder)/'wella-touch-guide.pdf').read_bytes(),body)
    def test_technical_pdf_redirect_to_html_is_rejected(self):
        with patch.object(intake.urllib.request,'build_opener') as opener:
            opener.return_value.open.return_value=Response(b'<title>Country selector</title>'+b' '*5000,'text/html')
            with self.assertRaisesRegex(AssertionError,'Expected technical PDF'):
                intake.collect(('wella-touch-guide','https://www.wella.com/example.pdf','UNKNOWN','en','TECHNICAL_GUIDE'))
    def test_pdf_magic_is_required_even_with_pdf_mime(self):
        with patch.object(intake.urllib.request,'build_opener') as opener:
            opener.return_value.open.return_value=Response(b'<html>not a PDF</html>','application/pdf')
            with self.assertRaises(AssertionError):
                intake.collect(('wella-touch-guide','https://www.wella.com/example.pdf','UNKNOWN','en','TECHNICAL_GUIDE'))
    def test_unreviewed_redirect_host_is_rejected(self):
        for url in ('https://retailer.example.invalid/file.pdf','http://www.wella.com/file.pdf'):
            with self.assertRaisesRegex(ValueError,'Unreviewed source redirect'):
                intake.OfficialRedirect().redirect_request(None,None,302,'',{},url)

if __name__=='__main__':unittest.main()
