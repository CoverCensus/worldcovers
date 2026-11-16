"""Extract, munge, or import the Florida Postal History Catalog."""
import csv
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from tempfile import NamedTemporaryFile

from django.conf import settings

from common.catalog_import import import_catalog
from common.fphc_foreign_review import foreign_markings
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.core.management.base import BaseCommand, CommandError
from import_export.exceptions import ImportExportError


def check_package(directory, manifest, media, dry_run):
    """Check the export and stage referenced images before any database writes."""
    counts = manifest["counts"]
    if (not manifest.get("review_sha256") or counts["held_figures"] or counts["held_usage_rows"]
            or counts["emitted_figures"] != counts["images"]
            or counts["usage_rows"] != counts["emitted_usage_rows"] + counts["grouped_usage_rows"]):
        raise ValueError("Main catalog load requires a complete reviewed export")
    if hashlib.sha256((directory / "review_decisions.json").read_bytes()).hexdigest() != manifest["review_sha256"]:
        raise ValueError("Review decisions checksum mismatch")
    required = {"post_offices", "post_office_regions", "markings", "covers", "cover_markings",
                "dates_seen", "images", "citations", "regions", "reference_works", "colors", "shapes", "letterings"}
    for stem in required:
        name = stem + ".csv"
        if hashlib.sha256((directory / name).read_bytes()).hexdigest() != manifest["csv_sha256"][name]:
            raise ValueError("Bundle checksum mismatch: " + name)
    with (directory / "images.csv").open(newline="") as stream:
        images = list(csv.DictReader(stream))
    names = {r["storage_filename"] for r in images}
    if len(names) != len(images) or len(images) != counts["images"]:
        raise ValueError("Image inventory does not match the reviewed figures")
    for row in images:
        name = Path(row["storage_filename"])
        if name.parts != ("fl", name.name) or name.name in (".", "..") or name.name != row["original_filename"]:
            raise ValueError("Invalid Florida media path")
        target = Path(settings.MEDIA_ROOT) / name
        source = media / name
        checksum = row["file_checksum"]
        for path in (source, target):
            if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() != checksum:
                raise ValueError("Image checksum mismatch: " + str(name))
        if target.is_file():
            continue
        if not source.is_file():
            raise ValueError("Missing package image: " + str(name))
        if not dry_run:
            target.parent.mkdir(parents=True, exist_ok=True)
            with NamedTemporaryFile(dir=target.parent) as tmp:
                with source.open("rb") as image:
                    shutil.copyfileobj(image, tmp)
                tmp.flush()
                os.chmod(tmp.name, 0o644)
                try:
                    os.link(tmp.name, target)
                except FileExistsError:
                    if hashlib.sha256(target.read_bytes()).hexdigest() != checksum:
                        raise ValueError("Conflicting media file: " + str(name))


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
        for key in ("input", "input-dir", "out-dir", "review-decisions"):
            munge.add_argument("--" + key, type=Path)
        munge.add_argument("--reference-work-code", choices=["FPHC2"], default="FPHC2")
        munge.add_argument("--region-abbrev", choices=["FL"], default="FL")
        load = commands.add_parser("import")
        load.add_argument("directory", type=Path)
        load.add_argument("--review-report", "--skip-report", dest="review_report")
        load.add_argument("--refresh-pending", action="store_true")
        load.add_argument("--actor", type=int, default=1)
        load.add_argument("--dry-run", action="store_true")
        mode = load.add_mutually_exclusive_group()
        mode.add_argument("--main-catalog", action="store_true")
        mode.add_argument("--queue", action="store_true", help="Send Entries to Editor review.")
        load.add_argument("--media-dir", type=Path, help="Package media root containing fl/.")

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
            complete_format = manifest.get("rule_version", 0) >= 3
            publish = opts["main_catalog"] or (complete_format and not opts["queue"])
            if publish and not complete_format:
                raise CommandError("Rebuild a complete rule version 3 package for the main catalog.")
            if not opts["queue"] and not complete_format and manifest.get("counts", {}).get("held_figures"):
                raise CommandError("Incomplete legacy bundle. Rebuild it or explicitly select --queue.")
            if publish and opts["refresh_pending"]:
                raise CommandError("--refresh-pending requires --queue.")
            if complete_format:
                check_package(directory, manifest, opts["media_dir"] or directory.parent / "media", opts["dry_run"])
            foreign = {}
            if complete_format:
                figure_rows = [json.loads(line) for line in
                               (directory / "figure_review.jsonl").read_text().splitlines() if line.strip()]
                foreign = foreign_markings(figure_rows)
            actor = get_user_model().objects.filter(pk=opts["actor"]).first()
            if actor is None:
                raise CommandError("Unknown import user.")
            report = opts["review_report"] or directory / "fphc_review.csv"
            import_catalog(directory, actor, opts["dry_run"], self.stdout, report, opts["refresh_pending"], edition="FPHC2", publish=publish, foreign=foreign)
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
        if not opts["review_decisions"]:
            raise CommandError("Supply --review-decisions to build the reviewed FPHC package.")
        subprocess.run([python, tools / "fphc_data_munger.py", "--input",
                        opts["input"] or wip / "out/fphc/manifest.json", "--input-dir",
                        opts["input_dir"] or wip / "in", "--out-dir", out,
                        "--reference-work-code", opts["reference_work_code"],
                        "--region-abbrev", opts["region_abbrev"],
                        "--review-decisions", opts["review_decisions"],
                        "--media-dir", out.parent / "media/fl"], check=True)
