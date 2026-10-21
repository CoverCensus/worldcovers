"""Read and write complete, portable Collection bundles."""

from __future__ import annotations

import hashlib
import json
import shutil
import socket
import subprocess
import tempfile
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.management.base import CommandError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models, transaction
from django.db.migrations.recorder import MigrationRecorder
from django.db.models import Q
from django.utils import timezone
from reversion.models import Revision, Version

from common import models as catalog
from common.management.commands.verify_media_integrity import _sha256

SCHEMA = "worldcovers.collection_backup.v1"
MODEL_NAMES = (
    "collection", "region", "postoffice", "postofficeregion", "postmaster",
    "postmastertenure", "marking", "cover", "covermarking", "contribution",
    "contributionrecyclebin", "submissiontransaction", "markingversion",
    "coverversion", "markingrecyclebin", "coverrecyclebin", "image",
    "dateseen", "citation", "covervaluation", "referencework", "color",
    "shape", "lettering",
)
MODELS = {f"common.{name}": apps.get_model("common", name) for name in MODEL_NAMES}
MODELS.update({"reversion.revision": Revision, "reversion.version": Version})
ENTRY_MODELS = {"common.marking", "common.cover", "common.contribution"}
JSON_REFS = {
    "marking_id": "marking", "parent_marking_id": "marking",
    "edit_marking_id": "marking", "marking": "marking",
    "cover_id": "cover", "edit_cover_id": "cover", "editCoverId": "cover",
    "materialized_cover_id": "cover", "color_id": "color", "color": "color",
    "shape_id": "shape", "shape": "shape", "lettering_id": "lettering",
    "lettering_style_id": "lettering", "letteringStyleId": "lettering",
    "post_office_id": "postoffice", "region_id": "region",
    "collection_id": "collection", "reference_work_id": "referencework",
    "source_marking_image_id": "image", "image_id": "image",
    "cropped_from": "image", "cropped_from_id": "image",
    "cover_marking_id": "covermarking", "edit_cover_marking_id": "covermarking",
    "contribution_id": "contribution",
    "archived_contribution_id": "contribution",
    "restored_contribution_id": "contribution",
    "parentMarkingId": "marking", "markingId": "marking",
    "editMarkingId": "marking", "coverId": "cover", "regionId": "region",
    "editCoverMarkingId": "covermarking", "referenceWorkId": "referencework",
    "edit_contribution_id": "contribution", "editContributionId": "contribution",
    "date_seen_id": "dateseen", "deleted_cover_marking_id": "covermarking",
    "deleted_contribution_id": "contribution",
}
JSON_REF_LISTS = {name: "referencework" for name in (
    "reference_work_ids", "referenceWorkIds", "reference_work_ids[]",
)}
JSON_STRINGS = {
    "image_metas", "marking_image_metas", "cover_image_metas",
    "reference_work_details", *JSON_REF_LISTS,
}
DERIVED_FIELDS = {
    "earliest_seen", "earliest_seen_granularity", "latest_seen",
    "latest_seen_granularity",
}


class ArchiveJSONEncoder(DjangoJSONEncoder):
    def default(self, value: Any) -> Any:
        if isinstance(value, datetime):
            return value.isoformat()
        return super().default(value)


def json_text(value: Any) -> str:
    return json.dumps(value, cls=ArchiveJSONEncoder, ensure_ascii=True, sort_keys=True, indent=2) + "\n"


def digest(value: Any) -> str:
    return hashlib.sha256(json_text(value).encode("ascii")).hexdigest()


def instance_identity() -> str:
    database = settings.DATABASES["default"]
    return ":".join((socket.getfqdn(), settings.DJANGO_APP_HOSTNAME, database["NAME"]))


def record_key(label: str, pk: Any) -> str:
    return f"{label}:{pk}"


def safe_path(root: Path, name: str) -> Path:
    if not isinstance(name, str) or not name or not name.isascii() or "\\" in name:
        raise CommandError("Invalid media path.")
    relative = Path(name)
    if relative.is_absolute() or any(part in (".", "..") for part in name.split("/")):
        raise CommandError(f"Unsafe media path: {ascii(name)}")
    path = root / relative
    if not path.resolve().is_relative_to(root.resolve()):
        raise CommandError(f"Media path leaves its root: {ascii(name)}")
    # A symlink must never turn a restore into a write outside the bundle.
    current = path
    while current != root:
        if current.is_symlink():
            raise CommandError(f"Symlink in media path: {ascii(name)}")
        current = current.parent
    if root.is_symlink():
        raise CommandError("Media root must not be a symlink.")
    return path


def walk_json(value: Any, reference: Callable[[str, Any], Any], key: str = "") -> Any:
    """Translate only the record ID fields used by submissions and snapshots."""
    if key in JSON_STRINGS and isinstance(value, str):
        try:
            parsed = json.loads(value)
        except ValueError:
            return value
        return {"$json": walk_json(parsed, reference, key)}
    if key in JSON_REFS and value not in (None, "", False):
        if isinstance(value, (int, str)) and str(value).isdigit():
            result = reference(f"common.{JSON_REFS[key]}", value)
            return {"$string": result} if isinstance(value, str) else result
    if key in JSON_REF_LISTS and isinstance(value, list):
        return [walk_json(item, reference, "reference_work_id") for item in value]
    if isinstance(value, list):
        return [walk_json(item, reference) for item in value]
    if isinstance(value, dict):
        if any(str(name).startswith("$") for name in value):
            raise CommandError("Source JSON uses reserved Collection bundle keys.")
        # Diff values have the same type as the named snapshot field.
        diff_key = value.get("field", "") if isinstance(value.get("field"), str) else ""
        result = {
            name: walk_json(item, reference, diff_key if name in ("before", "after") else name)
            for name, item in value.items()
        }
        if value.get("subject_type") in ("MARKING", "COVER") and str(value.get("subject_id", "")).isdigit():
            result["subject_id"] = reference(f"common.{value['subject_type'].lower()}", value["subject_id"])
        return result
    return value


def media_names(value: Any) -> set[str]:
    names: set[str] = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if key.endswith("storage_filename") and isinstance(item, str) and item:
                names.add(item)
            names.update(media_names(item))
    elif isinstance(value, list):
        for item in value:
            names.update(media_names(item))
    return names


def collection_scope(collection: catalog.Collection) -> dict[str, set[int]]:
    """Find Collection contents from relationships, not catalog code prefixes."""
    regions = {collection.region_id}
    while True:
        children = set(catalog.Region.objects.filter(
            parent_region_id__in=regions, region_tier__in=catalog.Region.SUBREGION_TIERS,
        ).values_list("pk", flat=True))
        if children <= regions:
            break
        regions.update(children)
    offices = set(catalog.PostOfficeRegion.objects.filter(region_id__in=regions).values_list("post_office_id", flat=True))
    markings = set(catalog.Marking.all_objects.filter(post_office_id__in=offices).values_list("pk", flat=True))
    contributions = set(catalog.Contribution.objects.filter(collection=collection).values_list("pk", flat=True))
    markings.update(catalog.Contribution.objects.filter(pk__in=contributions).exclude(marking=None).values_list("marking_id", flat=True))
    offices.update(catalog.Marking.all_objects.filter(pk__in=markings).values_list("post_office_id", flat=True))
    covers = set(catalog.CoverMarking.objects.filter(marking_id__in=markings).values_list("cover_id", flat=True))
    # Pending Cover submissions can have no Contribution.marking or saved link.
    for row in catalog.Contribution.objects.all():
        data = row.submitted_data or {}
        if not isinstance(data, dict):
            continue
        targets = {int(data[name]) for name, kind in JSON_REFS.items()
                   if kind == "marking" and str(data.get(name, "")).isdigit()}
        if row.pk in contributions or targets & markings or row.marking_id in markings:
            if row.collection_id != collection.pk:
                continue
            contributions.add(row.pk)
            for name, kind in JSON_REFS.items():
                if kind == "cover" and str(data.get(name, "")).isdigit():
                    covers.add(int(data[name]))
    return {"regions": regions, "post_offices": offices, "markings": markings,
            "covers": covers, "contributions": contributions}


class GraphExporter:
    def __init__(self, collection: catalog.Collection):
        self.collection = collection
        self.scope = collection_scope(collection)
        self.records: dict[str, dict[str, Any]] = {}
        self.pending: deque[tuple[str, Any, bool]] = deque()
        self.files: set[str] = set()
        self.users: set[str] = set()
        self.owned = {
            "common.marking": self.scope["markings"],
            "common.cover": self.scope["covers"],
            "common.contribution": self.scope["contributions"],
        }

    def reference(self, label: str, pk: Any, external: bool = False) -> dict[str, str]:
        if label not in MODELS:
            raise CommandError(f"Unsupported record dependency: {label}")
        external = external or (label in ENTRY_MODELS and int(pk) not in self.owned[label])
        self.pending.append((label, pk, external))
        return {"$record": record_key(label, pk)}

    def add(self, queryset: models.QuerySet) -> None:
        for pk in queryset.values_list("pk", flat=True):
            self.reference(queryset.model._meta.label_lower, pk)

    def seed(self) -> None:
        s = self.scope
        self.reference("common.collection", self.collection.pk)
        self.add(catalog.PostOffice.objects.filter(pk__in=s["post_offices"]))
        self.add(catalog.PostOfficeRegion.objects.filter(post_office_id__in=s["post_offices"]))
        self.add(catalog.PostmasterTenure.objects.filter(post_office_id__in=s["post_offices"]))
        self.add(catalog.Marking.all_objects.filter(pk__in=s["markings"]))
        self.add(catalog.Cover.all_objects.filter(pk__in=s["covers"]))
        self.add(catalog.Contribution.objects.filter(pk__in=s["contributions"]))
        self.add(catalog.Contribution.objects.filter(marking_id__in=s["markings"]))
        self.add(catalog.ContributionRecycleBin.objects.filter(contribution_id__in=s["contributions"]))
        self.add(catalog.CoverMarking.objects.filter(cover_id__in=s["covers"]))
        for model, field, ids in (
            (catalog.MarkingVersion, "marking_id", s["markings"]),
            (catalog.CoverVersion, "cover_id", s["covers"]),
            (catalog.MarkingRecycleBin, "marking_id", s["markings"]),
            (catalog.CoverRecycleBin, "cover_id", s["covers"]),
            (catalog.CoverValuation, "cover_id", s["covers"]),
        ):
            self.add(model.objects.filter(**{f"{field}__in": ids}))
        subject = Q(subject_type="MARKING", subject_id__in=s["markings"]) | Q(subject_type="COVER", subject_id__in=s["covers"])
        for model in (catalog.Image, catalog.Citation, catalog.DateSeen):
            self.add(model.objects.filter(subject))
        self.add(catalog.SubmissionTransaction.objects.filter(
            Q(marking_id__in=s["markings"]) | Q(cover_id__in=s["covers"])
            | Q(contribution_id__in=s["contributions"]),
        ))

    def history_reference(self, label: str, pk: Any) -> dict[str, Any]:
        if not MODELS[label]._base_manager.filter(pk=pk).exists():
            # History can name a record that was already deleted at export.
            # Keep its source identity, never a destination integer that might
            # refer to a different live record.
            return {"$historical": {"source_instance": instance_identity(), "model": label, "source_id": str(pk)}}
        return self.reference(label, pk)

    def fields(
        self, model: type[models.Model], values: dict[str, Any], external: bool,
        historical: bool = False,
    ) -> dict[str, Any]:
        known = {field.name for field in model._meta.concrete_fields}
        result = {name: value for name, value in values.items() if historical and name not in known}
        for field in model._meta.concrete_fields:
            if field.primary_key and not field.is_relation:
                continue
            if field.name not in values:
                continue
            value = values[field.name]
            if field.is_relation and value is not None:
                related = field.remote_field.model
                if related is get_user_model():
                    user = related.objects.filter(pk=value).first()
                    if user is None and historical:
                        value = {"$historical": {
                            "source_instance": instance_identity(),
                            "model": related._meta.label_lower, "source_id": str(value),
                        }}
                    elif user is None:
                        raise CommandError("Required source audit user is missing.")
                    else:
                        self.users.add(user.username)
                        value = {"$user": user.username}
                elif related is ContentType:
                    value = {"$type": ContentType.objects.get(pk=value).model_class()._meta.label_lower}
                else:
                    value = (self.history_reference(related._meta.label_lower, value)
                             if historical else self.reference(related._meta.label_lower, value, external))
            elif field.name == "subject_id":
                label = f"common.{str(values['subject_type']).lower()}"
                value = self.reference(label, value)
            elif isinstance(field, models.JSONField):
                reference = self.reference if model is catalog.Contribution else self.history_reference
                value = walk_json(value, reference)
            result[field.name] = value
        if model is Version:
            label = ContentType.objects.get(pk=values["content_type"]).model_class()._meta.label_lower
            result["object_id"] = {"$string": self.reference(label, values["object_id"])}
            if values["format"] != "json":
                raise CommandError("Only JSON django-reversion records can be transferred.")
            serialized = json.loads(values["serialized_data"])
            for item in serialized:
                item_model = MODELS[item["model"]]
                item["pk"] = self.reference(item["model"], item["pk"])
                item["fields"] = self.fields(item_model, item["fields"], external, historical=True)
            result["serialized_data"] = {"$json": serialized}
        return result

    def collect_files(self, value: Any) -> None:
        self.files.update(media_names(value))

    def build(self) -> dict[str, dict[str, Any]]:
        self.seed()
        history_seen: set[str] = set()
        while self.pending:
            label, pk, external = self.pending.popleft()
            key = record_key(label, pk)
            if key in self.records:
                continue
            model = MODELS[label]
            try:
                obj = model._base_manager.get(pk=pk)
            except model.DoesNotExist as exc:
                raise CommandError(f"Missing required source record: {key}") from exc
            if model in (catalog.Image, catalog.Citation, catalog.DateSeen):
                owner = f"common.{obj.subject_type.lower()}"
                external = external or obj.subject_id not in self.owned[owner]
            values = {f.name: f.value_from_object(obj) for f in model._meta.concrete_fields}
            self.records[key] = {"model": label, "source_id": str(pk), "external": external, "fields": {}}
            fields = self.fields(model, values, external)
            self.records[key]["fields"] = json.loads(json_text(fields))
            self.collect_files(fields)
            if model is catalog.PostOffice and not external:
                self.add(catalog.PostOfficeRegion.objects.filter(post_office_id=pk))
                self.add(catalog.PostmasterTenure.objects.filter(post_office_id=pk))
            if label.startswith("common.") and not external and key not in history_seen:
                history_seen.add(key)
                ct = ContentType.objects.get_for_model(model)
                self.add(Version.objects.filter(content_type=ct, object_id=str(pk)))
        return dict(sorted(self.records.items()))


def export_payload(collection: catalog.Collection) -> tuple[dict[str, Any], dict[str, Any]]:
    exporter = GraphExporter(collection)
    records = exporter.build()
    media = Path(settings.MEDIA_ROOT)
    files = {}
    for name in sorted(exporter.files):
        path = safe_path(media, name)
        if not path.is_file():
            raise CommandError(f"Missing source media: {ascii(name)}")
        files[name] = {"sha256": _sha256(path), "size": path.stat().st_size}
    for row in records.values():
        if row["model"] == "common.image" and not row["external"]:
            fields = row["fields"]
            info = files[fields["storage_filename"]]
            if fields["file_checksum"] != info["sha256"] or fields["file_size_bytes"] != info["size"]:
                raise CommandError(f"Source image checksum or size differs: {row['source_id']}")
    counts: dict[str, int] = {}
    for row in records.values():
        counts[row["model"]] = counts.get(row["model"], 0) + 1
    try:
        revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=settings.REPO_ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError):
        revision = "unknown"
    manifest = {
        "schema": SCHEMA, "complete": True, "source_instance": instance_identity(),
        "application_revision": revision, "exported_at": timezone.now().isoformat(),
        "migrations": sorted(name for app, name in MigrationRecorder.Migration.objects.values_list("app", "name") if app == "common"),
        "collection": record_key("common.collection", collection.pk),
        "region": record_key("common.region", collection.region_id),
        "counts": counts, "users": sorted(exporter.users), "files": files,
        "records_sha256": digest(records),
    }
    return manifest, records


def backup_collection(collection_id: int, destination: Path) -> None:
    if destination.exists() or destination.is_symlink():
        raise CommandError("Bundle destination already exists.")
    try:
        collection = catalog.Collection.objects.get(pk=collection_id)
    except catalog.Collection.DoesNotExist as exc:
        raise CommandError(f"No Collection with ID {collection_id}.") from exc
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".collection-", dir=destination.parent))
    try:
        with transaction.atomic():
            manifest, records = export_payload(collection)
            for name in manifest["files"]:
                target = safe_path(staging / "media", name)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(safe_path(Path(settings.MEDIA_ROOT), name), target)
            (staging / "records.json").write_text(json_text(records), encoding="ascii")
            (staging / "manifest.json").write_text(json_text(manifest), encoding="ascii")
            load_bundle(staging)
        staging.rename(destination)
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def load_bundle(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        manifest = json.loads(safe_path(path, "manifest.json").read_text(encoding="ascii"))
        records = json.loads(safe_path(path, "records.json").read_text(encoding="ascii"))
    except (OSError, ValueError) as exc:
        raise CommandError(f"Cannot read Collection bundle: {ascii(str(exc))}") from exc
    if not isinstance(manifest, dict) or manifest.get("schema") != SCHEMA or manifest.get("complete") is not True:
        raise CommandError("Unsupported or incomplete Collection bundle.")
    if not isinstance(records, dict) or digest(records) != manifest.get("records_sha256"):
        raise CommandError("Collection record checksum differs.")
    source = manifest.get("source_instance")
    if not isinstance(source, str) or not source or len(source) > 255:
        raise CommandError("Invalid source instance identity.")
    counts: dict[str, int] = {}
    for key, row in records.items():
        if not isinstance(row, dict) or not isinstance(row.get("model"), str) or row["model"] not in MODELS:
            raise CommandError(f"Unsupported bundle record: {ascii(key)}")
        model = MODELS[row["model"]]
        fields = {f.name for f in model._meta.concrete_fields if not f.primary_key or f.is_relation}
        if not isinstance(row.get("fields"), dict) or set(row["fields"]) != fields:
            raise CommandError(f"Incompatible fields for {ascii(key)}")
        source_id = row.get("source_id")
        if (not isinstance(source_id, str) or not source_id.isascii()
                or not source_id.isdigit() or len(source_id) > 64
                or key != record_key(row["model"], source_id)):
            raise CommandError("Invalid source record identity.")
        if not isinstance(row.get("external"), bool):
            raise CommandError("Invalid external record flag.")
        counts[row["model"]] = counts.get(row["model"], 0) + 1
    if counts != manifest.get("counts"):
        raise CommandError("Bundle record counts differ from the manifest.")
    for row in records.values():
        validate_references(row["fields"], records)
        for field in MODELS[row["model"]]._meta.concrete_fields:
            if not field.is_relation:
                continue
            value = row["fields"][field.name]
            if value is None and field.null:
                continue
            related = field.remote_field.model
            marker = "$user" if related is get_user_model() else "$type" if related is ContentType else "$record"
            if not isinstance(value, dict) or set(value) != {marker}:
                raise CommandError(f"Invalid foreign key: {row['model']}.{field.name}")
            if marker == "$record" and records[value[marker]]["model"] != related._meta.label_lower:
                raise CommandError(f"Wrong foreign key model: {row['model']}.{field.name}")
    for name in ("collection", "region"):
        root = manifest.get(name)
        if not isinstance(root, str) or root not in records or records[root]["model"] != f"common.{name}":
            raise CommandError(f"Bundle has no root {name}.")
    if not isinstance(manifest.get("files"), dict):
        raise CommandError("Bundle has no media manifest.")
    if set(manifest["files"]) != media_names(records):
        raise CommandError("Media manifest does not cover the record graph.")
    for name, info in manifest["files"].items():
        file = safe_path(path / "media", name)
        if (not isinstance(info, dict) or not file.is_file()
                or file.stat().st_size != info.get("size")
                or _sha256(file) != info.get("sha256")):
            raise CommandError(f"Missing or damaged bundle media: {ascii(name)}")
    for row in records.values():
        if row["model"] == "common.image":
            fields = row["fields"]
            filename = fields["storage_filename"]
            if not isinstance(filename, str) or filename not in manifest["files"]:
                raise CommandError("Image has no valid bundled media path.")
            info = manifest["files"][filename]
            if fields["file_checksum"] != info["sha256"] or fields["file_size_bytes"] != info["size"]:
                raise CommandError("Image metadata does not match bundled media.")
    return manifest, records


def validate_references(value: Any, records: dict[str, Any]) -> None:
    if isinstance(value, list):
        for item in value:
            validate_references(item, records)
    elif isinstance(value, dict):
        markers = [name for name in value if name.startswith("$")]
        if not markers:
            for item in value.values():
                validate_references(item, records)
            return
        if len(value) != 1:
            raise CommandError("Invalid bundle reference shape.")
        marker = markers[0]
        item = value[marker]
        if marker == "$record":
            if not isinstance(item, str) or item not in records:
                raise CommandError("Bundle references a missing record.")
        elif marker == "$user":
            if not isinstance(item, str) or not item:
                raise CommandError("Invalid bundle username.")
        elif marker == "$type":
            if not isinstance(item, str) or item not in MODELS:
                raise CommandError("Invalid bundle content type.")
        elif marker in ("$string", "$json"):
            validate_references(item, records)
        elif marker == "$historical":
            if not isinstance(item, dict) or set(item) != {"source_instance", "model", "source_id"}:
                raise CommandError("Invalid historical source identity.")
            historical_models = {*MODELS, get_user_model()._meta.label_lower}
            if (not isinstance(item["model"], str) or item["model"] not in historical_models
                    or not isinstance(item["source_id"], str) or not item["source_id"].isdigit()
                    or not isinstance(item["source_instance"], str)):
                raise CommandError("Invalid historical source identity.")
        else:
            raise CommandError("Unknown bundle reference marker.")
