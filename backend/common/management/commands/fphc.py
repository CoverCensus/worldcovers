"""Extract, munge, or import the Florida Postal History Catalog."""
import csv
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

from common.catalog_import import import_catalog
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.core.management.base import BaseCommand, CommandError
from import_export.exceptions import ImportExportError


class Command(BaseCommand):
    help = __doc__
    requires_system_checks = ()

    def add_arguments(self, parser):
        commands = parser.add_subparsers(dest="stage", required=True)
        extract = commands.add_parser("extract")
        for key in ("pdf", "out-dir", "cache-dir", "pages"):
            extract.add_argument("--" + key)
        extract.add_argument("--force", action="store_true")
        munge = commands.add_parser("munge")
        for key in ("input", "input-dir", "out-dir"):
            munge.add_argument("--" + key, type=Path)
        munge.add_argument("--reference-work-code", choices=["FPHC2"], default="FPHC2")
        munge.add_argument("--region-abbrev", choices=["FL"], default="FL")
        load = commands.add_parser("import")
        load.add_argument("directory", type=Path)
        load.add_argument("--review-report", "--skip-report", dest="review_report")
        load.add_argument("--refresh-pending", action="store_true")
        load.add_argument("--actor", type=int, default=1)
        load.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        try:
            self.run_stage(opts)
        except (ValueError, OSError, KeyError, ObjectDoesNotExist, ValidationError,
                ImportExportError, subprocess.CalledProcessError) as exc:
            raise CommandError(ascii(str(exc))) from exc

    def run_stage(self, opts):
        if opts["stage"] == "import":
            directory = opts["directory"]
            manifest = json.loads((directory / "fphc_manifest.json").read_text())
            with (directory / "reference_works.csv").open(newline="") as stream:
                codes = [r["code"] for r in csv.DictReader(stream)]
            if manifest.get("catalog") != "FPHC2" or codes != ["FPHC2"]:
                raise CommandError("Expected an FPHC2 bundle")
            actor = get_user_model().objects.filter(pk=opts["actor"]).first()
            if actor is None:
                raise CommandError("Unknown import user.")
            report = opts["review_report"] or directory / "fphc_review.csv"
            import_catalog(directory, actor, opts["dry_run"], self.stdout, report, opts["refresh_pending"], edition="FPHC2")
            self.stdout.write(f"Review report: {report}")
            return
        repo = Path(__file__).resolve().parents[4]
        sys.path.insert(0, str(repo / "tools"))
        try:
            from bodger_tools import BodgerError, installation
            try:
                root, python = installation()
            except BodgerError as exc:
                raise CommandError(str(exc)) from exc
        finally:
            sys.path.pop(0)
        tools = root / "tools"
        wip = tools / "wip"
        if opts["stage"] == "extract":
            cmd = [python, tools / "fphc_extract.py"]
            for key in ("pdf", "out_dir", "cache_dir", "pages"):
                if opts[key]:
                    cmd.extend(["--" + key.replace("_", "-"), opts[key]])
            if opts["force"]:
                cmd.append("--force")
            subprocess.run(cmd, check=True)
            return
        out = opts["out_dir"] or repo / "tools/wip/out/fphc2_fl"
        subprocess.run([python, tools / "fphc_data_munger.py", "--input",
                        opts["input"] or wip / "out/fphc/manifest.json", "--input-dir",
                        opts["input_dir"] or wip / "in", "--out-dir", out,
                        "--reference-work-code", opts["reference_work_code"],
                        "--region-abbrev", opts["region_abbrev"]], check=True)
        with (out / "images.csv").open(newline="") as stream:
            for row in csv.DictReader(stream):
                name = Path(row["storage_filename"])
                if name.parts != ("fl", name.name):
                    raise CommandError("Invalid Florida media path")
                source = wip / "out/media" / name
                target = repo / "backend/media" / name
                target.parent.mkdir(parents=True, exist_ok=True)
                for path in (source, target):
                    if (path == source or path.exists()) and (
                        hashlib.sha256(path.read_bytes()).hexdigest() != row["file_checksum"]
                    ):
                        raise CommandError("Image checksum mismatch: " + str(name))
                if not target.exists():
                    shutil.copyfile(source, target)
        cache = wip / "cache/fphc"
        cache.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(out / "fphc_manifest.json", cache / "run.json")
