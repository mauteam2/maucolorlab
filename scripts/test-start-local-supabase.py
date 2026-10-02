"""Synthetic credential handling and unchanged CLI failure propagation."""
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("local_start", Path(__file__).with_name("start-local-supabase.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LocalStartTests(unittest.TestCase):
    def test_credential_labels_never_leave_cli_wrapper(self):
        for label in ["Secret Key", "Publishable Key", "anon key", "service_role key", "JWT secret"]:
            self.assertNotIn("synthetic-value", module.redact(f"│ {label} │ synthetic-value │\n"))

    def test_unlabelled_tokens_are_redacted(self):
        for token in ["eyJsynthetic.part.signature", "sb_secret_synthetic", "sb_publishable_synthetic", "a" * 64]:
            self.assertNotIn(token, module.redact(f"provider output: {token}\n"))

    def test_diagnostics_remain_readable(self):
        line = "ERROR: permission denied for schema app_private (SQLSTATE 42501)\n"
        self.assertEqual(line, module.redact(line))
        self.assertEqual("Applying migration 20261002121423_color_plan_recipe_foundation.sql...\n",
                         module.redact("Applying migration 20261002121423_color_plan_recipe_foundation.sql...\n"))

    def test_failure_exit_status_is_preserved(self):
        with patch.object(module.subprocess, "Popen") as spawn, patch.object(module.sys, "stdout", new_callable=io.StringIO) as output:
            spawn.return_value.stdout = ["Secret Key: synthetic-value\n", "ERROR: startup failed\n"]
            spawn.return_value.wait.return_value = 1
            self.assertEqual(1, module.main())
            self.assertIn("ERROR: startup failed", output.getvalue())
            self.assertNotIn("synthetic-value", output.getvalue())
            spawn.assert_called_once_with(["supabase", "start"], stdout=module.subprocess.PIPE, stderr=module.subprocess.STDOUT, text=True)


if __name__ == "__main__":
    unittest.main()
