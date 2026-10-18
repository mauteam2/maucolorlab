"""Negative regression tests: new or modified surfaces cannot silently pass."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import security_inventory as inventory

class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.original=inventory.validate()
    def check(self,kind,name,entry):
        actual={k:{n:{field:e[field] for field in ('source','definition_sha256','signature','security_definer') if field in e} for n,e in self.original[k].items()} for k in ('functions','routes','actions')}
        actual[kind][name]=entry
        with patch.object(inventory,'discover',return_value=actual):
            with self.assertRaises(AssertionError): inventory.validate()
    def test_new_public_rpc(self):self.check('functions','public.unreviewed',{})
    def test_new_private_definer(self):self.check('functions','app_private.unreviewed',{'security_definer':True})
    def test_new_api(self):self.check('routes','POST /api/unreviewed',{})
    def test_new_action(self):self.check('actions','apps/web/app/actions.ts#unreviewed',{})
    def test_modified_surface(self):
        name=next(iter(self.original['functions']))
        entry=dict(self.original['functions'][name],definition_sha256='0'*64)
        self.check('functions',name,entry)
    def test_discovery_finds_const_route_and_definer(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'supabase/migrations').mkdir(parents=True);(root/'apps/web/app/api/x').mkdir(parents=True)
            (root/'supabase/migrations/test.sql').write_text("create function public.x(a uuid) returns jsonb language sql security definer set search_path='' as $$ select '{}'::jsonb; $$;")
            (root/'apps/web/app/api/x/route.ts').write_text('export const POST=handler;')
            discovered=inventory.discover(root)
            self.assertTrue(discovered['functions']['public.x']['security_definer'])
            self.assertIn('POST /api/x',discovered['routes'])

if __name__=='__main__':unittest.main()
