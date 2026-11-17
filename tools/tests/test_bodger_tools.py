"""Keep extraction optional and run it outside the Django environment."""

import argparse
import json
from pathlib import Path
import sys
from unittest.mock import patch

import pytest

import ascc_cli
import bodger_tools
import woco_cli


def checkout(tmp_path: Path) -> Path:
    root = tmp_path / "bodger with spaces"
    (root / "tools").mkdir(parents=True)
    (root / "tools/ascc_data_munger.py").write_text("", encoding="ascii")
    python = root / ".venv/bin/python"
    python.parent.mkdir(parents=True)
    python.symlink_to(sys.executable)
    return root


def test_extraction_missing_has_setup_error_without_starting_a_process(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("BODGER_ROOT", str(tmp_path / "missing"))
    with patch("subprocess.run") as run:
        assert ascc_cli.main(["munge", "VA"]) == 2
    run.assert_not_called()
    assert "Bodger is required for extraction" in capsys.readouterr().err


def test_existing_bundle_import_does_not_require_bodger(tmp_path, monkeypatch):
    monkeypatch.setenv("BODGER_ROOT", str(tmp_path / "missing"))
    with patch.object(bodger_tools, "installation", side_effect=AssertionError("must stay optional")):
        with patch.object(ascc_cli, "run_command") as run:
            assert ascc_cli.main(["import", "bundle with spaces", "--dry-run"]) == 0
    command = run.call_args.args[0]
    assert command[0] == sys.executable
    assert command[2:] == ["import_ascc_bundle", "bundle with spaces", "--dry-run"]


def test_drop_does_not_require_bodger():
    with patch.object(bodger_tools, "installation", side_effect=AssertionError("must stay optional")):
        with patch.object(ascc_cli, "run_command") as run:
            assert ascc_cli.main(["drop", "USA-VA1", "--dry-run"]) == 0
    assert run.call_args.args[0][0] == sys.executable


def test_base_django_commands_do_not_check_bodger(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["woco", "help"])
    with patch.object(bodger_tools, "installation", side_effect=AssertionError("must stay optional")):
        with patch("django.core.management.execute_from_command_line") as execute:
            woco_cli.main()
    execute.assert_called_once_with(["woco", "help"])


def test_extraction_requires_its_own_environment(tmp_path, monkeypatch):
    root = checkout(tmp_path)
    (root / ".venv/bin/python").unlink()
    monkeypatch.setenv("BODGER_ROOT", str(root))
    with pytest.raises(bodger_tools.BodgerError, match="uv sync --locked"):
        bodger_tools.installation()


@pytest.mark.parametrize("tool", ["vphc_extract", "society_extract"])
def test_generic_tool_preserves_arguments_and_exit_status(tmp_path, monkeypatch, capfd, tool):
    root = checkout(tmp_path)
    (root / "tools" / f"{tool}.py").write_text(
        'import json, sys\nprint(json.dumps(sys.argv[1:]))\nsys.exit(23)\n', encoding="ascii")
    monkeypatch.setenv("BODGER_ROOT", str(root))
    assert bodger_tools.main([tool, "--xlsx", "source with spaces.xlsx"]) == 23
    assert json.loads(capfd.readouterr().out) == ["--xlsx", "source with spaces.xlsx"]


def test_bodger_alias_dispatches_without_django(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["woco", "bodger", "vphc_extract", "--help"])
    with patch.object(bodger_tools, "main", return_value=0) as main:
        with patch("django.core.management.execute_from_command_line", side_effect=AssertionError("Django")):
            with pytest.raises(SystemExit) as result:
                woco_cli.main()
    assert result.value.code == 0
    main.assert_called_once_with(["vphc_extract", "--help"])


def test_help_and_invalid_tool_do_not_check_installation():
    with patch.object(bodger_tools, "installation", side_effect=AssertionError("not needed")):
        with pytest.raises(SystemExit) as result:
            bodger_tools.main(["--help"])
        assert result.value.code == 0
        with pytest.raises(SystemExit) as result:
            bodger_tools.main(["../../backend/manage"])
        assert result.value.code == 2


def test_ascc_stages_use_bodger_but_import_uses_worldcovers(tmp_path, monkeypatch):
    root = checkout(tmp_path)
    monkeypatch.setenv("BODGER_ROOT", str(root))
    names = ("TOOLS_DIR", "WIP_DIR", "WIP_IN", "WIP_CACHE", "BODGER_PYTHON", "BODGER_MEDIA")
    for name in names:
        monkeypatch.setattr(ascc_cli, name, getattr(ascc_cli, name))
    ascc_cli.configure_bodger()
    paths = ascc_cli.v1_state_paths("VA")
    assert paths.catalog_rows.is_relative_to(root)
    assert paths.bundle_dir == ascc_cli.REPO_ROOT / "tools/wip/out/v1_va"
    args = argparse.Namespace(reference_work="ASCC6")
    command = ascc_cli.munger_cmd(paths, args)
    assert command[:2] == [str(root / ".venv/bin/python"), str(root / "tools/ascc_data_munger.py")]
    assert ascc_cli.import_bundle_cmd([str(paths.bundle_dir)])[0] == sys.executable


def test_ocr_images_reach_bodger_metadata_and_worldcovers_media(tmp_path, monkeypatch):
    monkeypatch.setattr(ascc_cli, "BODGER_MEDIA", tmp_path / "bodger-media")
    paths = argparse.Namespace(
        state="VA", media_dir=tmp_path / "app-media/va", images_dir=tmp_path / "images")
    paths.images_dir.mkdir()
    (paths.images_dir / "va-1-1-1.png").write_bytes(b"test image bytes")
    assert ascc_cli.copy_marking_images(paths) == 1
    assert (tmp_path / "bodger-media/va/va-1-1-1.png").read_bytes() == b"test image bytes"
    assert (paths.media_dir / "va-1-1-1.png").read_bytes() == b"test image bytes"
