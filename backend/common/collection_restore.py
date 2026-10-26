"""Restore a Collection graph without overwriting destination data."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.core.management.base import CommandError
from django.db import IntegrityError, models, transaction
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone

from common import models as catalog
from common.collection_archive import (
    DERIVED_FIELDS,
    MODELS,
    digest,
    instance_identity,
    json_text,
    load_bundle,
    safe_path,
)
from common.date_range import (
    compute_marking_date_ranges,
    refresh_marking_date_ranges,
    suppress_date_range_recompute,
)
from common.management.commands.verify_media_integrity import _sha256

NATURAL_KEYS = {
    "common.region": ("name", "abbrev", "region_tier", "parent_region", "established_date", "defunct_date"),
    "common.collection": ("region",),
    "common.color": ("name",), "common.shape": ("name",),
    "common.lettering": ("name",),
    "common.postmaster": ("name", "sort_name"),
    "common.postofficeregion": ("post_office", "region", "valid_from"),
    "common.postmastertenure": ("post_office", "postmaster", "date_appointed", "event"),
    "common.covermarking": ("cover", "marking"),
    "common.markingversion": ("marking", "version_no"),
    "common.coverversion": ("cover", "version_no"),
    "common.image": ("subject_type", "subject_id", "storage_filename"),
    "common.citation": ("subject_type", "subject_id", "reference_work", "citation_detail"),
    "common.dateseen": ("subject_type", "subject_id", "date_year", "date_month", "date_day", "granularity"),
    "common.covervaluation": ("cover", "appraisal_date", "amt"),
    "reversion.revision": ("date_created", "user", "comment"),
    "reversion.version": ("revision", "content_type", "object_id", "db", "format"),
}


class UnresolvedReference(Exception):
    pass


def decode(value: Any, ids: dict[str, Any]) -> Any:
    if isinstance(value, list):
        return [decode(item, ids) for item in value]
    if not isinstance(value, dict):
        return value
    if "$record" in value:
        if set(value) != {"$record"} or value["$record"] not in ids:
            raise UnresolvedReference(str(value))
        return ids[value["$record"]]
    if "$historical" in value:
        details = value["$historical"]
        historical_models = {*MODELS, get_user_model()._meta.label_lower}
        if set(value) != {"$historical"} or not isinstance(details, dict) or set(details) != {"source_instance", "model", "source_id"} or details["model"] not in historical_models:
            raise CommandError("Invalid historical source reference.")
        return {"source_reference": details}
    if "$user" in value:
        if set(value) != {"$user"} or not isinstance(value["$user"], str):
            raise CommandError("Invalid user reference.")
        try:
            return get_user_model().objects.get(username=value["$user"]).pk
        except get_user_model().DoesNotExist as exc:
            raise CommandError(f"Missing target user: {ascii(value['$user'])}") from exc
    if "$type" in value:
        if set(value) != {"$type"} or value["$type"] not in MODELS:
            raise CommandError("Invalid content type reference.")
        app, model = value["$type"].split(".")
        return ContentType.objects.get(app_label=app, model=model).pk
    if "$json" in value:
        if set(value) != {"$json"}:
            raise CommandError("Invalid JSON reference.")
        return json.dumps(decode(value["$json"], ids), ensure_ascii=True, sort_keys=True)
    if "$string" in value:
        if set(value) != {"$string"}:
            raise CommandError("Invalid string reference.")
        decoded = decode(value["$string"], ids)
        return decoded if isinstance(decoded, dict) else str(decoded)
    if any(name.startswith("$") for name in value):
        raise CommandError("Unknown bundle reference.")
    return {name: decode(item, ids) for name, item in value.items()}


def typed_fields(row: dict[str, Any], ids: dict[str, Any], include_json: bool = True) -> dict[str, Any]:
    result = {}
    model = MODELS[row["model"]]
    for name, value in row["fields"].items():
        field = model._meta.get_field(name)
        if isinstance(field, models.JSONField) or name == "serialized_data":
            if not include_json:
                continue
        value = decode(value, ids)
        if not isinstance(field, models.JSONField):
            value = (field.target_field if field.is_relation else field).to_python(value)
        if not field.is_relation:
            field.run_validators(value)
        result[field.attname] = value
    return result


def matching_record(row: dict[str, Any], fields: dict[str, Any], source: str, claimed: set[tuple[str, Any]]) -> models.Model | None:
    model = MODELS[row["model"]]
    manager = model._base_manager
    mapping = catalog.CollectionTransferMap.objects.filter(
        source_instance=source, source_model=row["model"], source_id=row["source_id"],
    ).first()
    if mapping:
        obj = manager.filter(pk=mapping.target_id).first()
        if obj is not None:
            return obj
    # Catalog codes and transaction UUIDs take precedence over other keys.
    for name in ("code", "transaction_uuid"):
        if fields.get(name):
            return manager.filter(**{name: fields[name]}).first()
    if model._meta.pk.is_relation:
        return manager.filter(pk=fields[model._meta.pk.attname]).first()
    names = NATURAL_KEYS.get(row["model"])
    if row["model"] == "common.contribution" and fields.get("marking_id"):
        names = ("marking",)
    if names:
        query = {model._meta.get_field(name).attname: fields[model._meta.get_field(name).attname] for name in names}
        matches = list(manager.filter(**query)[:2])
        if len(matches) > 1:
            raise CommandError(f"Ambiguous target match: {row['model']}:{row['source_id']}")
        return matches[0] if matches else None
    # Records without a natural key can be reused only when all scalar
    # fields, including original audit times, agree. Claim each target once
    # so two distinct pending records cannot collapse into one.
    matches = [obj for obj in manager.filter(**fields)[:3]
               if (row["model"], obj.pk) not in claimed]
    if len(matches) > 1:
        raise CommandError(f"Ambiguous target match: {row['model']}:{row['source_id']}")
    return matches[0] if matches else None


def normalized(value: Any) -> Any:
    # Database drivers return Decimal, UUID and datetime objects.
    return json.loads(json_text(value))


def compare_record(obj: models.Model, fields: dict[str, Any], key: str) -> None:
    differences = []
    for name, expected in fields.items():
        if obj._meta.label_lower == "common.marking" and name in DERIVED_FIELDS:
            continue
        actual = getattr(obj, name)
        if name == "serialized_data":
            actual, expected = json.loads(actual), json.loads(expected)
        if normalized(actual) != normalized(expected):
            differences.append(name)
    if differences:
        raise CommandError(f"Target differs for {key}: {', '.join(differences)}")


def check_migrations(manifest: dict[str, Any]) -> None:
    applied = set(MigrationRecorder.Migration.objects.filter(app="common").values_list("name", flat=True))
    migrations = manifest.get("migrations")
    if not isinstance(migrations, list) or not all(isinstance(name, str) for name in migrations):
        raise CommandError("Invalid bundle migration state.")
    if not set(migrations) <= applied:
        raise CommandError("Target has not applied the source application migrations.")
    if "0022_collectiontransfermap" not in applied:
        raise CommandError("Apply the Collection transfer migration before restore.")


def check_media(manifest: dict[str, Any], root: Path, require_all: bool) -> None:
    for name, info in manifest["files"].items():
        path = safe_path(root, name)
        if not path.exists() and not require_all:
            continue
        if not path.is_file() or path.stat().st_size != info["size"] or _sha256(path) != info["sha256"]:
            raise CommandError(f"Missing or conflicting target media: {ascii(name)}")


def restore_graph(manifest: dict[str, Any], records: dict[str, Any]) -> tuple[dict[str, Any], int]:
    ids: dict[str, Any] = {}
    created: set[str] = set()
    claimed: set[tuple[str, Any]] = set()
    pending = dict(records)
    # Foreign keys go first; JSON is filled only after every ID is known.
    while pending:
        progress = False
        for key, row in list(pending.items()):
            try:
                fields = typed_fields(row, ids, include_json=False)
            except UnresolvedReference:
                continue
            model = MODELS[row["model"]]
            obj = matching_record(row, fields, manifest["source_instance"], claimed)
            if obj is None:
                if row["external"]:
                    raise CommandError(f"Missing external target record: {key}")
                # Uncoded Post Offices have no safe global name key. Source
                # mappings keep them distinct without guessing at identity.
                obj = model(**fields)
                model._base_manager.bulk_create([obj])
                # bulk_create stamps auto_now fields. Restore source times.
                model._base_manager.filter(pk=obj.pk).update(**fields)
                created.add(key)
            ids[key] = obj.pk
            identity = (row["model"], obj.pk)
            if identity in claimed:
                raise CommandError(f"Two source records resolve to one target: {key}")
            claimed.add(identity)
            del pending[key]
            progress = True
        if not progress:
            raise CommandError("Unresolved or cyclic record references: " + ", ".join(pending))
    for key, row in records.items():
        try:
            fields = typed_fields(row, ids)
        except UnresolvedReference as exc:
            raise CommandError(f"Unresolved JSON reference in {key}: {exc}") from exc
        model = MODELS[row["model"]]
        if key in created:
            model._base_manager.filter(pk=ids[key]).update(**fields)
        else:
            compare_record(model._base_manager.get(pk=ids[key]), fields, key)
        catalog.CollectionTransferMap.objects.update_or_create(
            source_instance=manifest["source_instance"], source_model=row["model"],
            source_id=row["source_id"],
            defaults={"target_id": str(ids[key]), "record_digest": digest(row)},
        )
    refresh_marking_date_ranges([ids[key] for key, row in records.items() if row["model"] == "common.marking"])
    return ids, len(created)


def verify_graph(manifest: dict[str, Any], records: dict[str, Any]) -> dict[str, Any]:
    ids = {}
    for key, row in records.items():
        mapping = catalog.CollectionTransferMap.objects.filter(
            source_instance=manifest["source_instance"], source_model=row["model"],
            source_id=row["source_id"],
        ).first()
        if not mapping or mapping.record_digest != digest(row):
            raise CommandError(f"Missing or stale transfer mapping: {key}")
        ids[key] = MODELS[row["model"]]._meta.pk.to_python(mapping.target_id)
    for key, row in records.items():
        model = MODELS[row["model"]]
        try:
            obj = model._base_manager.get(pk=ids[key])
            compare_record(obj, typed_fields(row, ids), key)
        except (model.DoesNotExist, UnresolvedReference) as exc:
            raise CommandError(f"Missing restored record or reference: {key}") from exc
    verify_membership(manifest, records, ids)
    marking_ids = [ids[key] for key, row in records.items() if row["model"] == "common.marking"]
    computed = compute_marking_date_ranges(marking_ids)
    for marking in catalog.Marking.all_objects.filter(pk__in=marking_ids):
        actual = (marking.earliest_seen, marking.earliest_seen_granularity,
                  marking.latest_seen, marking.latest_seen_granularity)
        if actual != computed[marking.pk]:
            raise CommandError(f"Target Marking date range is stale: {marking.pk}")
    return ids


def verify_membership(manifest: dict[str, Any], records: dict[str, Any], ids: dict[str, Any]) -> None:
    """An extra child or link is a difference too, not a successful copy."""
    from common.collection_archive import collection_scope

    expected = {
        label: {ids[key] for key, row in records.items() if row["model"] == label and not row["external"]}
        for label in MODELS
    }
    collection = catalog.Collection.objects.get(pk=ids[manifest["collection"]])
    scope = collection_scope(collection)
    for label, name in (("common.marking", "markings"), ("common.cover", "covers"), ("common.contribution", "contributions")):
        if scope[name] != expected[label]:
            raise CommandError(f"Target Collection membership differs: {label}")
    markings, covers = scope["markings"], scope["covers"]
    from django.db.models import Q
    subject = Q(subject_type="MARKING", subject_id__in=markings) | Q(subject_type="COVER", subject_id__in=covers)
    queries = [model.objects.filter(subject) for model in (catalog.Image, catalog.Citation, catalog.DateSeen)]
    queries.extend((
        catalog.CoverMarking.objects.filter(Q(cover_id__in=covers) | Q(marking_id__in=markings)),
        catalog.MarkingVersion.objects.filter(marking_id__in=markings),
        catalog.CoverVersion.objects.filter(cover_id__in=covers),
        catalog.CoverValuation.objects.filter(cover_id__in=covers),
        catalog.MarkingRecycleBin.objects.filter(marking_id__in=markings),
        catalog.CoverRecycleBin.objects.filter(cover_id__in=covers),
        catalog.ContributionRecycleBin.objects.filter(contribution_id__in=scope["contributions"]),
        catalog.PostOfficeRegion.objects.filter(post_office_id__in=scope["post_offices"]),
        catalog.PostmasterTenure.objects.filter(post_office_id__in=scope["post_offices"]),
        catalog.SubmissionTransaction.objects.filter(Q(marking_id__in=markings) | Q(cover_id__in=covers) | Q(contribution_id__in=scope["contributions"])),
    ))
    for query in queries:
        label = query.model._meta.label_lower
        if set(query.values_list("pk", flat=True)) != expected[label]:
            raise CommandError(f"Target related records differ: {label}")


def restore_collection(bundle: Path, dry_run: bool = False) -> int:
    manifest, records = load_bundle(bundle)
    check_migrations(manifest)
    media = Path(settings.MEDIA_ROOT)
    check_media(manifest, media, require_all=False)
    installed: list[Path] = []
    committed = False
    # Copy and verify before the database transaction. No live files change
    # during dry-run. A killed process can leave only verified orphan files;
    # a retry reuses them by checksum.
    with tempfile.TemporaryDirectory(prefix="woco-collection-") as temporary:
        staging = Path(temporary)
        for name, info in manifest["files"].items():
            target = safe_path(staging, name)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(safe_path(bundle / "media", name), target)
            if _sha256(target) != info["sha256"]:
                raise CommandError("Bundle media changed during staging.")
        try:
            with transaction.atomic(), suppress_date_range_recompute():
                restore_graph(manifest, records)
                verify_graph(manifest, records)
                if not dry_run:
                    check_media(manifest, media, require_all=False)
                    for name in manifest["files"]:
                        target = safe_path(media, name)
                        if target.exists():
                            continue
                        target.parent.mkdir(parents=True, exist_ok=True)
                        temporary_path = None
                        try:
                            # Publish complete bytes in one operation on the
                            # media filesystem. A killed copy never leaves a
                            # partial file at a live storage filename.
                            with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".collection-", delete=False) as output:
                                temporary_path = Path(output.name)
                                with safe_path(staging, name).open("rb") as source:
                                    shutil.copyfileobj(source, output)
                                output.flush()
                                os.fsync(output.fileno())
                            os.chmod(temporary_path, 0o644)
                            os.link(temporary_path, target)
                            installed.append(target)
                        except FileExistsError:
                            check_media(manifest, media, require_all=False)
                        finally:
                            if temporary_path:
                                temporary_path.unlink(missing_ok=True)
                    check_media(manifest, media, require_all=True)
                else:
                    transaction.set_rollback(True)
            committed = not dry_run
        except (IntegrityError, ValidationError, ValueError, OSError) as exc:
            raise CommandError(f"Collection restore failed: {ascii(str(exc))}") from exc
        finally:
            if not committed:
                for path in installed:
                    path.unlink(missing_ok=True)
    return len(records)


def verify_collection(bundle: Path) -> dict[str, Any]:
    manifest, records = load_bundle(bundle)
    check_migrations(manifest)
    with transaction.atomic():
        ids = verify_graph(manifest, records)
        check_media(manifest, Path(settings.MEDIA_ROOT), require_all=True)
    return {
        "schema": "worldcovers.collection_verification.v1", "passed": True,
        "verified_at": timezone.now().isoformat(), "target_instance": instance_identity(),
        "source_instance": manifest["source_instance"],
        "manifest_sha256": digest(manifest), "records_sha256": manifest["records_sha256"],
        "collection": manifest["collection"], "target_collection_id": ids[manifest["collection"]],
        "records_checked": len(records), "files_checked": len(manifest["files"]),
    }
