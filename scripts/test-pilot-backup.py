import importlib.util
from pathlib import Path
import tempfile
import unittest
from cryptography.exceptions import InvalidTag
spec=importlib.util.spec_from_file_location('backup',Path(__file__).with_name('pilot_backup.py'))
backup=importlib.util.module_from_spec(spec);spec.loader.exec_module(backup)
class BackupTests(unittest.TestCase):
 def test_authenticated_roundtrip_includes_independent_bytes_and_keys(self):
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder)/'point.enc';files={'database.data.dump':b'synthetic auth and ledgers','storage/photo':b'synthetic bytes','server-secrets.json':b'synthetic key'}
   backup.seal(files,b'a'*32,p,{'synthetic':True});restored,manifest=backup.unseal(p,b'a'*32)
   self.assertEqual(restored,files);self.assertEqual(len(manifest['files']),3);self.assertNotIn(b'synthetic key',p.read_bytes())
 def test_wrong_key_and_tampering_fail_closed(self):
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder)/'point.enc';backup.seal({'test':b'value'},b'a'*32,p,{})
   with self.assertRaises(InvalidTag):backup.unseal(p,b'b'*32)
   data=bytearray(p.read_bytes());data[-1]^=1;p.write_bytes(data)
   with self.assertRaises(InvalidTag):backup.unseal(p,b'a'*32)
 def test_never_overwrites_a_recovery_point(self):
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder)/'point.enc';backup.seal({},b'a'*32,p,{})
   with self.assertRaises(FileExistsError):backup.seal({},b'a'*32,p,{})
 def test_does_not_store_sensitive_archive_in_checkout(self):
  with self.assertRaises(ValueError):backup.seal({},b'a'*32,Path(__file__).parent/'unsafe.enc',{})
if __name__=='__main__':unittest.main()
