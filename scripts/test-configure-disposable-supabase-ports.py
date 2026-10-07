import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('port_config',Path(__file__).with_name('configure-disposable-supabase-ports.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class DisposablePortTests(unittest.TestCase):
    def test_changes_auxiliary_ports_only(self):
        original='project_id = "elifora"\n[api]\nport = 54321\n[db]\nport = 54322\nshadow_port = 54320\n[studio]\nport = 54323\n[inbucket]\nport = 54324\nsmtp_port = 54325\n[auth]\nsite_url = "http://localhost:3000"\n'
        ports=iter(range(55000,55005));result=module.configure(original,lambda:next(ports))
        self.assertIn('[api]\nport = 54321',result)
        self.assertIn('site_url = "http://localhost:3000"',result)
        for value in range(55000,55005):self.assertIn(str(value),result)
        self.assertNotIn('54322',result)
    def test_other_project_is_denied(self):
        with self.assertRaises(ValueError):module.configure('project_id = "production"\n',lambda:55000)
    def test_missing_fixed_api_origin_is_denied(self):
        with self.assertRaises(ValueError):module.configure('project_id = "elifora"\n[api]\nport = 443\n',lambda:55000)
if __name__=='__main__':unittest.main()
