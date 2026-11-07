"""Optional file-based catalog tools, run in bodger's own environment."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import subprocess
import sys

from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[1]


class BodgerError(Exception):
    """The optional extraction checkout is missing or incomplete."""


def installation() -> tuple[Path, Path]:
    load_dotenv(REPO_ROOT / ".env")
    value = os.environ.get("BODGER_ROOT")
    root = Path(value).expanduser().resolve() if value else REPO_ROOT.parent / "bodger"
    python = root / ".venv" / "bin" / "python"
    if not (root / "tools" / "ascc_data_munger.py").is_file():
        raise BodgerError(
            f"Bodger is required for extraction: missing tools at {root}. "
            "Clone git@github.com:CoverCensus/bodger.git beside WorldCovers, "
            "or set BODGER_ROOT to its checkout. See docs/devel/PIPELINE.md."
        )
    if not python.is_file() or not os.access(python, os.X_OK):
        raise BodgerError(
            f"Bodger's Python environment is missing at {python}. "
            "Run uv sync --locked in the bodger checkout."
        )
    load_dotenv(root / ".env")
    return root, python


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="./woco bodger", description=__doc__)
    parser.add_argument("tool", help="script name in bodger/tools, without .py")
    parser.add_argument("args", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[a-z][a-z0-9_]*", args.tool):
        parser.error("tool must be a lowercase script name, without a path or .py")
    try:
        root, python = installation()
        script = root / "tools" / f"{args.tool}.py"
        if not script.is_file():
            raise BodgerError(f"Bodger tool not found: {script}")
        return subprocess.run([str(python), str(script), *args.args], check=False).returncode
    except BodgerError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
