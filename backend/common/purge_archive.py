"""Archive what a recycle-bin purge removes, and verify it before erasure.

Trello T51. A purge hard-deletes binned Markings and Covers. The ORM then
cascades to approved Contributions (and their archive sidecars), version
snapshots, valuations and cover links, and sets to NULL the foreign keys that
SubmissionTransaction rows and crop Images hold on the deleted rows. This
module writes every such row as a Django JSON fixture, copies the image bytes
of the deleted Image rows, records checksums in a manifest, and re-reads the
whole bundle before anything is deleted.

Restore on the same instance (rows come back with their original primary
keys, still in the recycle bin):

    ./woco loaddata <bundle>/records.json
    cp -rn <bundle>/media/. backend/media/

This is not the editor recycle-bin restore, not a version restore, and not
the S25/S26 application backup; see DECISIONS.md "Preserve Audit History And
Distinguish Recovery Actions".
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core import serializers
from django.core.management.base import CommandError
from django.db.migrations.recorder import MigrationRecorder
from django.db.models import Q, QuerySet
from django.utils import timezone

from common import models as catalog
from common.collection_archive import instance_identity, json_text, safe_path
from common.management.commands.verify_media_integrity import _sha256

SCHEMA = "worldcovers.purge_archive.v1"
DELETED = "deleted"
# The row survives the purge; a foreign key on it is set to NULL.
RELINKED = "relinked"

ScopeEntry = tuple[str, str, QuerySet]


def collect_scope(marking_ids, cover_ids) -> list[ScopeEntry]:
    """Every row the purge deletes or alters, parents before children.

    The list mirrors the on_delete rules that point at Marking and Cover:
    CASCADE rows are DELETED, SET_NULL rows are RELINKED. loaddata replays
    the fixture in file order, so a row's foreign-key targets come first.
    """
    marking_ids, cover_ids = list(marking_ids), list(cover_ids)
    subject = (
        Q(subject_type="MARKING", subject_id__in=marking_ids)
        | Q(subject_type="COVER", subject_id__in=cover_ids)
    )
    images = catalog.Image.objects.filter(subject)
    links = Q(marking_id__in=marking_ids) | Q(cover_id__in=cover_ids)
    return [
        ("common.marking", DELETED, catalog.Marking.all_objects.filter(pk__in=marking_ids)),
        ("common.cover", DELETED, catalog.Cover.all_objects.filter(pk__in=cover_ids)),
        ("common.markingrecyclebin", DELETED,
         catalog.MarkingRecycleBin.objects.filter(marking_id__in=marking_ids)),
        ("common.coverrecyclebin", DELETED,
         catalog.CoverRecycleBin.objects.filter(cover_id__in=cover_ids)),
        ("common.contribution", DELETED,
         catalog.Contribution.objects.filter(marking_id__in=marking_ids)),
        ("common.contributionrecyclebin", DELETED,
         catalog.ContributionRecycleBin.objects.filter(contribution__marking_id__in=marking_ids)),
        ("common.covermarking", DELETED, catalog.CoverMarking.objects.filter(links)),
        ("common.markingversion", DELETED,
         catalog.MarkingVersion.objects.filter(marking_id__in=marking_ids)),
        ("common.coverversion", DELETED,
         catalog.CoverVersion.objects.filter(cover_id__in=cover_ids)),
        ("common.covervaluation", DELETED,
         catalog.CoverValuation.objects.filter(cover_id__in=cover_ids)),
        ("common.image", DELETED, images),
        ("common.dateseen", DELETED, catalog.DateSeen.objects.filter(subject)),
        ("common.citation", DELETED, catalog.Citation.objects.filter(subject)),
        ("common.submissiontransaction", RELINKED,
         catalog.SubmissionTransaction.objects.filter(
             links | Q(contribution__marking_id__in=marking_ids))),
        ("common.image", RELINKED,
         catalog.Image.objects.filter(cropped_from__in=images).exclude(pk__in=images)),
    ]


def scope_keys(scope: list[ScopeEntry]) -> set[tuple[str, Any]]:
    return {
        (label, pk)
        for label, _kind, queryset in scope
        for pk in queryset.values_list("pk", flat=True)
    }


def scope_counts(scope: list[ScopeEntry]) -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = {DELETED: {}, RELINKED: {}}
    for label, kind, queryset in scope:
        counts[kind][label] = counts[kind].get(label, 0) + queryset.count()
    return counts


def scope_queryset(scope: list[ScopeEntry], label: str, kind: str = DELETED) -> QuerySet:
    for entry_label, entry_kind, queryset in scope:
        if entry_label == label and entry_kind == kind:
            return queryset
    raise CommandError(f"Purge scope has no {kind} {label} entry.")


def deleted_images(scope: list[ScopeEntry]) -> QuerySet:
    return scope_queryset(scope, "common.image")


def describe_media(scope: list[ScopeEntry]) -> dict[str, Any]:
    """Which files the deleted Image rows point at, and which are shared.

    Files are never deleted by the purge: storage_filename is shared between
    Image rows (the ASCC colour fan-out) and pending submissions reference
    files that have no Image row yet.
    """
    images = deleted_images(scope)
    names = sorted(set(images.values_list("storage_filename", flat=True)))
    shared = sorted(set(
        catalog.Image.objects.filter(storage_filename__in=names)
        .exclude(pk__in=images.values("pk"))
        .values_list("storage_filename", flat=True)
    ))
    media = Path(settings.MEDIA_ROOT)
    files: dict[str, dict[str, Any]] = {}
    missing: list[str] = []
    for name in names:
        path = safe_path(media, name)
        if not path.is_file():
            missing.append(name)
            continue
        files[name] = {"sha256": _sha256(path), "size": path.stat().st_size}
    return {"names": names, "files": files, "missing": missing, "shared": shared}


def write_bundle(
    scope: list[ScopeEntry], destination: Path, allow_missing_media: bool = False,
    media: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Write records.json, media/ and manifest.json, verify, then publish.

    The bundle is built in a hidden sibling directory and renamed into place
    only after it verifies, so an operator never finds a half-written archive
    at the destination. `media` is a describe_media() result the caller has
    already computed; it is recomputed when absent.
    """
    if destination.exists() or destination.is_symlink():
        raise CommandError(f"Archive destination already exists: {destination}")
    media = media if media is not None else describe_media(scope)
    if media["missing"] and not allow_missing_media:
        listed = ", ".join(ascii(name) for name in media["missing"][:10])
        raise CommandError(
            f"Missing source media for {len(media['missing'])} file(s): {listed}. "
            "Repair the files or pass --allow-missing-media to archive without them."
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".purge-", dir=destination.parent))
    try:
        objects = [row for _label, _kind, queryset in scope for row in queryset.order_by("pk")]
        records = serializers.serialize("json", objects, indent=2)
        (staging / "records.json").write_text(records, encoding="utf-8")
        for name in media["files"]:
            target = safe_path(staging / "media", name)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(safe_path(Path(settings.MEDIA_ROOT), name), target)
        manifest = {
            "schema": SCHEMA,
            "complete": True,
            "source_instance": instance_identity(),
            "application_revision": _revision(),
            "exported_at": timezone.now().isoformat(),
            "migrations": sorted(
                name for app, name in
                MigrationRecorder.Migration.objects.values_list("app", "name") if app == "common"
            ),
            "marking_ids": sorted(scope_queryset(scope, "common.marking").values_list("pk", flat=True)),
            "cover_ids": sorted(scope_queryset(scope, "common.cover").values_list("pk", flat=True)),
            "counts": scope_counts(scope),
            "records": len(objects),
            "records_sha256": hashlib.sha256(records.encode("utf-8")).hexdigest(),
            "files": media["files"],
            "missing_files": media["missing"],
            "shared_files": media["shared"],
            "restore": [
                "./woco loaddata <bundle>/records.json",
                "cp -rn <bundle>/media/. backend/media/",
            ],
        }
        (staging / "manifest.json").write_text(json_text(manifest), encoding="ascii")
        verify_bundle(staging, scope)
        staging.rename(destination)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return manifest


def verify_bundle(path: Path, scope: list[ScopeEntry]) -> dict[str, Any]:
    """Re-read a bundle and prove it covers the scope before any delete.

    Rows are deserialized but never saved. Every archived file is re-hashed
    against the manifest and against the Image rows that point at it.
    """
    try:
        manifest = json.loads(safe_path(path, "manifest.json").read_text(encoding="ascii"))
        records = safe_path(path, "records.json").read_bytes()
    except (OSError, ValueError) as exc:
        raise CommandError(f"Cannot read purge archive: {ascii(str(exc))}") from exc
    if not isinstance(manifest, dict) or manifest.get("schema") != SCHEMA:
        raise CommandError("Unsupported purge archive.")
    if hashlib.sha256(records).hexdigest() != manifest.get("records_sha256"):
        raise CommandError("Archive records checksum differs.")
    found = {
        (item.object._meta.label_lower, item.object.pk)
        for item in serializers.deserialize("json", records.decode("utf-8"))
    }
    expected = scope_keys(scope)
    if found != expected:
        raise CommandError(
            f"Archive records differ from the purge scope: "
            f"{len(found)} archived, {len(expected)} in scope."
        )
    if manifest.get("counts") != scope_counts(scope):
        raise CommandError("Archive counts differ from the purge scope.")
    files = manifest.get("files")
    if not isinstance(files, dict):
        raise CommandError("Archive has no media manifest.")
    names = set(deleted_images(scope).values_list("storage_filename", flat=True))
    if set(files) | set(manifest.get("missing_files", [])) != names:
        raise CommandError("Archive media manifest does not cover the deleted Image rows.")
    recorded = dict(
        deleted_images(scope).exclude(file_checksum="")
        .values_list("storage_filename", "file_checksum")
    )
    for name, info in files.items():
        file = safe_path(path / "media", name)
        if (not isinstance(info, dict) or not file.is_file()
                or file.stat().st_size != info.get("size")
                or _sha256(file) != info.get("sha256")):
            raise CommandError(f"Missing or damaged archive media: {ascii(name)}")
        if recorded.get(name, info["sha256"]) != info["sha256"]:
            raise CommandError(f"Archived file differs from its Image checksum: {ascii(name)}")
    return manifest


def default_archive_dir() -> Path:
    stamp = timezone.now().strftime("%Y%m%dT%H%M%SZ")
    return Path(settings.REPO_ROOT) / "tools" / "wip" / "out" / f"recycle-bin-purge-{stamp}"


def _revision() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=settings.REPO_ROOT, text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
