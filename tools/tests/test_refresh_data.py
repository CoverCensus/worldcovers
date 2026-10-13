"""Check that a refresh imports without clearing existing data."""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


class RefreshDataTests(unittest.TestCase):
    def test_refresh_calls_regular_importer(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "tools" / "wip" / "out" / "v1_va").mkdir(parents=True)
            script = root / "tools" / "refresh_data.sh"
            shutil.copy(Path(__file__).resolve().parents[1] / "refresh_data.sh", script)
            woco = root / "woco"
            woco.write_text('#!/usr/bin/env bash\nprintf "%s\\n" "$@"\n', encoding="ascii")
            woco.chmod(0o755)
            result = subprocess.run(
                ["bash", str(script), "tools/wip/out/v1_va"],
                env={"PATH": os.environ["PATH"]}, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.splitlines(), ["ascc", "import", "tools/wip/out/v1_va"])
