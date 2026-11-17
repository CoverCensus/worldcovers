"""Command helpers for ASCC orchestration."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def import_bundle_cmd(repo_root: Path, import_args: list[str]) -> list[str]:
    return [
        sys.executable,
        str(repo_root / "backend" / "manage.py"),
        "import_ascc_bundle",
        *import_args,
    ]


def run_command(cmd: list[str], cwd: Path) -> None:
    print()
    print("==> " + " ".join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True)


def run_import_args(args) -> list[str]:
    import_args = []
    if args.actor is not None:
        import_args.extend(["--actor", str(args.actor)])
    if args.refresh_pending:
        import_args.append("--refresh-pending")
    if args.review_report:
        import_args.extend(["--review-report", args.review_report])
    if args.direct:
        import_args.append("--direct")
    if args.only:
        import_args.extend(["--only", args.only])
    if args.allow_missing:
        import_args.append("--allow-missing")
    if args.dry_run:
        import_args.append("--dry-run")
    if args.truncate:
        import_args.append("--truncate")
    if args.skip_report:
        import_args.extend(["--skip-report", args.skip_report])
    return import_args

