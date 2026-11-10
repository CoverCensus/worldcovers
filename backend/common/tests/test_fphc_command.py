"""Test the Florida command without a database or the private catalog."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.management import call_command, CommandError
from django.test import SimpleTestCase


class FloridaCommandTests(SimpleTestCase):
    def test_import_checks_catalog_before_loading(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp)
            (path / "fphc_manifest.json").write_text('{"catalog":"ASCC6"}')
            (path / "reference_works.csv").write_text("code\nASCC6\n")
            with self.assertRaisesMessage(CommandError, "Expected an FPHC2 bundle"):
                call_command("fphc", "import", tmp)

    def test_extract_forwards_options(self):
        root = Path(__file__).resolve().parents[3]
        import sys
        with patch.object(sys, "path", [str(root / "tools"), *sys.path]):
            with patch("bodger_tools.installation", return_value=(Path("/bodger"), "/python")):
                with patch("subprocess.run") as run:
                    call_command("fphc", "extract", "--pdf", "test.pdf", "--pages", "53", "--force")
        run.assert_called_once_with(["/python", Path("/bodger/tools/fphc_extract.py"),
                                     "--pdf", "test.pdf", "--pages", "53", "--force"], check=True)
