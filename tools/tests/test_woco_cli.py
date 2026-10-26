"""Tests for the top-level woco command dispatcher.

Run from repo root:
    PYTHONPATH=. .venv/bin/python -m unittest discover \
        -s tools/tests -p 'test_woco_cli.py'

Expected exit code: 0.
"""

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import woco_cli


class WocoLauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "repo with spaces"
        self.root.mkdir()
        shutil.copyfile(Path(woco_cli.__file__).with_name("woco"), self.root / "woco")
        self.bin = Path(self.temp.name) / "bin"
        self.bin.mkdir()
        self.script(self.bin / "uv", 'echo "Unexpected uv call" >&2\nexit 99\n')

    def script(self, path, body):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("#!/bin/sh\n" + body, encoding="ascii")
        path.chmod(0o755)

    def run_launcher(self, *args):
        return subprocess.run(
            ["bash", str(self.root / "woco"), *args],
            cwd=self.temp.name,
            env={**os.environ, "PATH": f"{self.bin}:{os.environ['PATH']}"},
            capture_output=True,
            text=True,
        )

    def test_installed_python_preserves_arguments_and_exit_status_without_uv(self):
        self.script(self.root / ".venv/bin/python", 'printf "%s\\n" "$@"\nexit 23\n')
        result = self.run_launcher("ascc", "import", "bundle with spaces", "--dry-run")
        self.assertEqual(result.returncode, 23)
        self.assertEqual(result.stdout.splitlines(), [
            str(self.root / "woco_cli.py"), "ascc", "import",
            "bundle with spaces", "--dry-run",
        ])
        self.assertEqual(result.stderr, "")

    def test_missing_or_partial_environment_is_not_rebuilt(self):
        for partial in (False, True):
            with self.subTest(partial=partial):
                if partial:
                    (self.root / ".venv/lib").mkdir(parents=True)
                result = self.run_launcher("ascc", "import", "bundle")
                self.assertEqual(result.returncode, 1)
                self.assertIn("Missing Python environment", result.stderr)
                self.assertNotIn("Unexpected uv call", result.stderr)
                self.assertFalse((self.root / ".venv/bin").exists())
                if partial:
                    self.assertTrue((self.root / ".venv/lib").is_dir())

    def test_setup_can_run_without_python(self):
        self.script(self.root / "tools/setup.sh", 'printf "%s\\n" "$@"\nexit 24\n')
        result = self.run_launcher("setup", "prod")
        self.assertEqual(result.returncode, 24)
        self.assertEqual(result.stdout, "prod\n")
        self.assertEqual(result.stderr, "")


class WocoCliAliasTests(unittest.TestCase):
    def run_alias(self, *argv):
        with patch.object(sys, "argv", ["woco", *argv]):
            with patch.object(woco_cli.os, "execv", side_effect=SystemExit(0)) as execv:
                with self.assertRaises(SystemExit) as raised:
                    woco_cli.main()
        self.assertEqual(raised.exception.code, 0)
        return execv.call_args.args

    def test_push_execs_push_data_script_with_remaining_args(self):
        path_arg, argv_arg = self.run_alias("push", "--import", "--state", "VA")

        self.assertEqual(Path(path_arg).name, "push_data.sh")
        self.assertEqual(Path(path_arg).parent.name, "tools")
        self.assertEqual(argv_arg, [path_arg, "--import", "--state", "VA"])

    def test_reload_execs_reload_data_script_with_remaining_args(self):
        path_arg, argv_arg = self.run_alias("reload", "tools/wip/out/v1_va")

        self.assertEqual(Path(path_arg).name, "reload_data.sh")
        self.assertEqual(Path(path_arg).parent.name, "tools")
        self.assertEqual(argv_arg, [path_arg, "tools/wip/out/v1_va"])

    def test_refresh_execs_refresh_data_script_with_remaining_args(self):
        path_arg, argv_arg = self.run_alias("refresh", "tools/wip/out/v1_va")
        self.assertEqual(Path(path_arg).name, "refresh_data.sh")
        self.assertEqual(argv_arg, [path_arg, "tools/wip/out/v1_va"])


if __name__ == "__main__":
    unittest.main()
