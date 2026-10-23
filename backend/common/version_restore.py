"""
Version restore for Markings and Covers (Trello T74).

A version snapshot (common.audit.build_*_snapshot) records an Entry's scalar
fields plus its images, dates seen and citations; a Cover snapshot also
records its marking links and valuation. Restoring a version reconciles the
live rows to that snapshot. One plan object serves both the preview the
Editor reads first and the restore that follows, so the two cannot drift:

    plan = plan_marking_restore(marking, snapshot)   # reads only
    preview_payload(plan, version)                   # what the dialog shows
    apply_restore_plan(plan, actor)                  # writes exactly the plan

Identity rules (what counts as "the same row"):

- images:         storage_filename (leading "/" stripped). A row is re-added
                  only when its file is still in storage; a removed row keeps
                  its file on disk, as ImageViewSet.destroy does.
- dates seen:     the normalised (granularity, date_key) pair.
- citations:      (reference_work_id, citation_detail stripped).
- marking links:  marking_id, only for markings still in the catalog.
- valuations:     (amount, appraisal_date).

A snapshot without a relationship key did not record that relationship, so
the current rows are left untouched and the limitation is listed; a key
present with an empty list reconciles to empty. Links between a Marking and
its Covers are not part of a Marking version and are never touched here.

This module opens no transaction; the caller owns transaction.atomic().
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage

from common.models import (
    MARKING_DATE_FMT_CHOICES,
    MARKING_IMPRESSION_CHOICES,
    Citation,
    Color,
    Cover,
    CoverMarking,
    CoverValuation,
    DateSeen,
    Image,
    Lettering,
    Marking,
    MarkingType,
    PostOffice,
    Shape,
)


class RestorePlanError(Exception):
    """The snapshot cannot be read as a version of this Entry."""


LIMIT_MARKING_COVER_LINKS = (
    "Links between this marking and its covers are not part of a marking version and are left unchanged."
)
LIMIT_COVER_DESCRIPTION = "This version did not record the cover description; the current one is left unchanged."
LIMIT_IMAGE_FILE_MISSING = "Image {original} ({storage}) is not restored: its file is no longer in storage."
LIMIT_IMAGES_REATTACHED = (
    "Re-added images are not marked as tracings and show the restoring editor as the uploader; "
    "the version does not record them."
)
LIMIT_LINK_MARKING_MISSING = "Link to marking #{marking_id} is not restored: that marking is removed or no longer exists."
LIMIT_LINKS_REATTACHED = (
    "Re-added marking links have no reviewer notes or contributor comment; the version does not record them."
)
LIMIT_NOT_RECORDED = "This version did not record {what}; the current ones are left unchanged."
LIMIT_DATE_UNREADABLE = "A recorded date could not be read and is not restored."

RELATION_LABELS = {
    "images": "images",
    "dates_seen": "dates",
    "citations": "citations",
    "cover_markings": "marking links",
    "valuations": "valuations",
}


@dataclass
class FieldRow:
    key: str
    label: str
    current: str
    proposed: str
    changed: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "current": self.current,
            "proposed": self.proposed,
            "changed": self.changed,
        }


@dataclass
class RelationPlan:
    kind: str
    add: list[dict[str, Any]] = field(default_factory=list)
    keep: list[Any] = field(default_factory=list)
    update: list[tuple[Any, dict[str, Any]]] = field(default_factory=list)
    remove: list[Any] = field(default_factory=list)
    skipped: list[dict[str, Any]] = field(default_factory=list)

    def counts(self) -> dict[str, int]:
        return {
            "added": len(self.add),
            "removed": len(self.remove),
            "kept": len(self.keep) + len(self.update),
            "skipped": len(self.skipped),
        }

    def changes(self) -> bool:
        return bool(self.add or self.remove or self.update)


@dataclass
class RestorePlan:
    entry_type: str
    subject: Any
    scalars: dict[str, Any]
    fields: list[FieldRow]
    relations: dict[str, RelationPlan]
    limitations: list[str]

    def has_changes(self) -> bool:
        return any(row.changed for row in self.fields) or any(
            relation.changes() for relation in self.relations.values()
        )

    def relationship_counts(self) -> dict[str, dict[str, int]]:
        return {kind: relation.counts() for kind, relation in self.relations.items()}

    def added_marking_ids(self) -> list[int]:
        relation = self.relations.get("cover_markings")
        if relation is None:
            return []
        return [int(row["marking_id"]) for row in relation.add]


# -- display helpers ------------------------------------------------------------------------------


def _decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _decimal_text(value: Any) -> str:
    dec = _decimal(value)
    if dec is None:
        return ""
    return format(dec.normalize(), "f")


def _bool_text(value: Any) -> str:
    if value is None:
        return ""
    return "Yes" if bool(value) else "No"


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _name_lookup(model, ids: set[Any]) -> dict[Any, str]:
    clean = {int(i) for i in ids if i is not None}
    if not clean:
        return {}
    return {pk: name for pk, name in model.objects.filter(pk__in=clean).values_list("pk", "name")}


def _row(key: str, label: str, current: Any, proposed: Any, formatter, *, compare=None) -> FieldRow:
    compare = compare or (lambda value: value if value not in ("", None) else None)
    changed = compare(current) != compare(proposed)
    return FieldRow(key, label, formatter(current), formatter(proposed), changed)


def _keep_if_missing(snapshot: dict[str, Any], key: str, current: Any) -> Any:
    """A field the version did not record keeps its current value."""
    value = snapshot.get(key)
    return current if value is None else value


# -- scalars --------------------------------------------------------------------------------------


def _marking_scalars(marking: Marking, snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "code": _keep_if_missing(snapshot, "code", marking.code),
        "type": snapshot.get("type") or marking.type,
        "catalog_txt": snapshot.get("catalog_txt"),
        "inscription_txt": snapshot.get("inscription_txt") or "",
        "desc": snapshot.get("desc"),
        "post_office_id": _keep_if_missing(snapshot, "post_office_id", marking.post_office_id),
        "shape_id": snapshot.get("shape_id"),
        "lettering_id": snapshot.get("lettering_id"),
        "color_id": snapshot.get("color_id"),
        "is_manuscript": bool(snapshot.get("is_manuscript")),
        "impression": snapshot.get("impression"),
        "is_irreg": snapshot.get("is_irreg"),
        "width": snapshot.get("width"),
        "height": snapshot.get("height"),
        "date_fmt": snapshot.get("date_fmt"),
        "rate_val": snapshot.get("rate_val"),
    }


def _marking_field_rows(marking: Marking, scalars: dict[str, Any]) -> list[FieldRow]:
    shapes = _name_lookup(Shape, {marking.shape_id, scalars["shape_id"]})
    letterings = _name_lookup(Lettering, {marking.lettering_id, scalars["lettering_id"]})
    colors = _name_lookup(Color, {marking.color_id, scalars["color_id"]})
    offices = _name_lookup(PostOffice, {marking.post_office_id, scalars["post_office_id"]})
    types = dict(MarkingType.choices)
    date_fmts = dict(MARKING_DATE_FMT_CHOICES)
    impressions = dict(MARKING_IMPRESSION_CHOICES)

    def lookup(table):
        return lambda value: table.get(int(value), f"#{value}") if value not in (None, "") else ""

    def choice(table):
        return lambda value: table.get(value, _text(value)) if value not in (None, "") else ""

    return [
        _row("code", "Code", marking.code, scalars["code"], _text),
        _row("type", "Type", marking.type, scalars["type"], choice(types)),
        _row("catalog_txt", "Catalog text", marking.catalog_txt, scalars["catalog_txt"], _text),
        _row("inscription_txt", "Inscription", marking.inscription_txt, scalars["inscription_txt"], _text),
        _row("desc", "Description", marking.desc, scalars["desc"], _text),
        _row("post_office_id", "Town", marking.post_office_id, scalars["post_office_id"], lookup(offices)),
        _row("shape_id", "Shape", marking.shape_id, scalars["shape_id"], lookup(shapes)),
        _row("lettering_id", "Lettering", marking.lettering_id, scalars["lettering_id"], lookup(letterings)),
        _row("color_id", "Color", marking.color_id, scalars["color_id"], lookup(colors)),
        _row("is_manuscript", "Manuscript", marking.is_manuscript, scalars["is_manuscript"], _bool_text, compare=bool),
        _row("impression", "Impression", marking.impression, scalars["impression"], choice(impressions)),
        _row("is_irreg", "Irregular", marking.is_irreg, scalars["is_irreg"], _bool_text),
        _row("width", "Width (mm)", marking.width, scalars["width"], _decimal_text, compare=_decimal),
        _row("height", "Height (mm)", marking.height, scalars["height"], _decimal_text, compare=_decimal),
        _row("date_fmt", "Date format", marking.date_fmt, scalars["date_fmt"], choice(date_fmts)),
        _row("rate_val", "Rate", marking.rate_val, scalars["rate_val"], _decimal_text, compare=_decimal),
    ]


def _cover_scalars(cover: Cover, snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "code": _keep_if_missing(snapshot, "code", cover.code),
        "type": snapshot.get("type"),
        "color_id": snapshot.get("color_id"),
        "has_adhesive": bool(snapshot.get("has_adhesive")),
        "height": snapshot.get("height"),
        "width": snapshot.get("width"),
        "is_institutional": snapshot.get("is_institutional"),
    }


def _cover_field_rows(cover: Cover, scalars: dict[str, Any]) -> list[FieldRow]:
    colors = _name_lookup(Color, {cover.color_id, scalars["color_id"]})
    types = Cover.COVER_TYPE_LABELS

    def color(value):
        return colors.get(int(value), f"#{value}") if value not in (None, "") else ""

    def cover_type(value):
        return types.get(value, _text(value)) if value not in (None, "") else ""

    return [
        _row("code", "Code", cover.code, scalars["code"], _text),
        _row("type", "Type", cover.type, scalars["type"], cover_type),
        _row("color_id", "Color", cover.color_id, scalars["color_id"], color),
        _row("has_adhesive", "Adhesive", cover.has_adhesive, scalars["has_adhesive"], _bool_text, compare=bool),
        _row("height", "Height (mm)", cover.height, scalars["height"], _decimal_text, compare=_decimal),
        _row("width", "Width (mm)", cover.width, scalars["width"], _decimal_text, compare=_decimal),
        _row("is_institutional", "Institutional", cover.is_institutional, scalars["is_institutional"], _bool_text),
    ]


# -- relationships --------------------------------------------------------------------------------


def _rows(snapshot: dict[str, Any], key: str) -> list[dict[str, Any]] | None:
    """The snapshot's rows for a relationship, or None when it did not record them."""
    if key not in snapshot:
        return None
    value = snapshot.get(key)
    if value is None:
        return None
    if not isinstance(value, list):
        raise RestorePlanError(f"Snapshot key {key!r} is not a list.")
    return [row for row in value if isinstance(row, dict)]


def _plan_images(subject_type: str, subject_id: int, snapshot: dict[str, Any], limitations: list[str]) -> RelationPlan:
    plan = RelationPlan("images")
    wanted = _rows(snapshot, "images")
    if wanted is None:
        limitations.append(LIMIT_NOT_RECORDED.format(what=RELATION_LABELS["images"]))
        return plan
    current = {
        (row.storage_filename or "").lstrip("/"): row
        for row in Image.objects.filter(subject_type=subject_type, subject_id=subject_id)
    }
    seen: set[str] = set()
    for row in wanted:
        storage = (row.get("storage_filename") or "").lstrip("/")
        if not storage or storage in seen:
            continue
        seen.add(storage)
        updates = {
            "display_order": int(row.get("display_order") or 0),
            "image_view": row.get("image_view") or "",
            "image_description": row.get("image_description") or "",
        }
        live = current.get(storage)
        if live is not None:
            if not updates["image_view"]:
                updates["image_view"] = live.image_view
            changed = {k: v for k, v in updates.items() if getattr(live, k) != v}
            (plan.update.append((live, changed)) if changed else plan.keep.append(live))
            continue
        if not default_storage.exists(storage):
            plan.skipped.append(row)
            limitations.append(
                LIMIT_IMAGE_FILE_MISSING.format(
                    original=row.get("original_filename") or "(unnamed)",
                    storage=row.get("storage_filename") or storage,
                )
            )
            continue
        plan.add.append(
            {
                "subject_type": subject_type,
                "subject_id": subject_id,
                "original_filename": row.get("original_filename") or storage.rsplit("/", 1)[-1],
                "storage_filename": row.get("storage_filename") or storage,
                "file_checksum": row.get("file_checksum") or "",
                "mime_type": row.get("mime_type") or "",
                "image_width": int(row.get("image_width") or 0),
                "image_height": int(row.get("image_height") or 0),
                "file_size_bytes": int(row.get("file_size_bytes") or 0),
                **updates,
            }
        )
    plan.remove = [row for storage, row in current.items() if storage not in seen]
    if plan.add:
        limitations.append(LIMIT_IMAGES_REATTACHED)
    return plan


def _date_identity(subject_type: str, subject_id: int, row: dict[str, Any]) -> tuple[tuple[str, str], dict[str, Any]]:
    probe = DateSeen(
        subject_type=subject_type,
        subject_id=subject_id,
        date=row.get("date"),
        granularity=row.get("granularity"),
        date_year=row.get("date_year"),
        date_month=row.get("date_month"),
        date_day=row.get("date_day"),
    )
    probe.normalize_date_parts()
    fields = {
        "subject_type": subject_type,
        "subject_id": subject_id,
        "date": probe.date,
        "granularity": probe.granularity,
        "date_year": probe.date_year,
        "date_month": probe.date_month,
        "date_day": probe.date_day,
    }
    return (probe.granularity, probe.date_key), fields


def _plan_dates_seen(subject_type: str, subject_id: int, snapshot: dict[str, Any], limitations: list[str]) -> RelationPlan:
    plan = RelationPlan("dates_seen")
    wanted = _rows(snapshot, "dates_seen")
    if wanted is None:
        limitations.append(LIMIT_NOT_RECORDED.format(what=RELATION_LABELS["dates_seen"]))
        return plan
    current = {
        (row.granularity, row.date_key): row
        for row in DateSeen.objects.filter(subject_type=subject_type, subject_id=subject_id)
    }
    seen: set[tuple[str, str]] = set()
    unreadable = False
    for row in wanted:
        try:
            identity, fields = _date_identity(subject_type, subject_id, row)
        except (ValidationError, ValueError, TypeError):
            plan.skipped.append(row)
            unreadable = True
            continue
        if identity in seen:
            continue
        seen.add(identity)
        live = current.get(identity)
        if live is not None:
            plan.keep.append(live)
        else:
            plan.add.append(fields)
    plan.remove = [row for identity, row in current.items() if identity not in seen]
    if unreadable:
        limitations.append(LIMIT_DATE_UNREADABLE)
    return plan


def _plan_citations(subject_type: str, subject_id: int, snapshot: dict[str, Any], limitations: list[str]) -> RelationPlan:
    plan = RelationPlan("citations")
    wanted = _rows(snapshot, "citations")
    if wanted is None:
        limitations.append(LIMIT_NOT_RECORDED.format(what=RELATION_LABELS["citations"]))
        return plan
    current = {
        (row.reference_work_id, (row.citation_detail or "").strip()): row
        for row in Citation.objects.filter(subject_type=subject_type, subject_id=subject_id)
    }
    seen: set[tuple[int, str]] = set()
    for row in wanted:
        ref_id = row.get("reference_work_id")
        if not ref_id:
            continue
        identity = (int(ref_id), (row.get("citation_detail") or "").strip())
        if identity in seen:
            continue
        seen.add(identity)
        live = current.get(identity)
        if live is not None:
            plan.keep.append(live)
        else:
            plan.add.append(
                {
                    "subject_type": subject_type,
                    "subject_id": subject_id,
                    "reference_work_id": identity[0],
                    "citation_detail": identity[1],
                }
            )
    plan.remove = [row for identity, row in current.items() if identity not in seen]
    return plan


def _plan_cover_markings(cover: Cover, snapshot: dict[str, Any], limitations: list[str]) -> RelationPlan:
    plan = RelationPlan("cover_markings")
    wanted = _rows(snapshot, "cover_markings")
    if wanted is None:
        limitations.append(LIMIT_NOT_RECORDED.format(what=RELATION_LABELS["cover_markings"]))
        return plan
    current = {row.marking_id: row for row in cover.cover_markings.all()}
    seen: set[int] = set()
    for row in wanted:
        marking_id = row.get("marking_id")
        if marking_id is None:
            continue
        marking_id = int(marking_id)
        if marking_id in seen:
            continue
        seen.add(marking_id)
        updates = {
            "is_backstamp": bool(row.get("is_backstamp")),
            "placement": row.get("placement"),
            "review_status": row.get("review_status") or CoverMarking.REVIEW_APPROVED,
        }
        live = current.get(marking_id)
        if live is not None:
            changed = {k: v for k, v in updates.items() if getattr(live, k) != v}
            (plan.update.append((live, changed)) if changed else plan.keep.append(live))
            continue
        if not Marking.objects.filter(pk=marking_id).exists():
            plan.skipped.append(row)
            limitations.append(LIMIT_LINK_MARKING_MISSING.format(marking_id=marking_id))
            continue
        plan.add.append({"cover_id": cover.pk, "marking_id": marking_id, **updates})
    plan.remove = [row for marking_id, row in current.items() if marking_id not in seen]
    if plan.add:
        limitations.append(LIMIT_LINKS_REATTACHED)
    return plan


def _plan_valuations(cover: Cover, snapshot: dict[str, Any], limitations: list[str]) -> RelationPlan:
    plan = RelationPlan("valuations")
    wanted = _rows(snapshot, "valuations")
    if wanted is None:
        limitations.append(LIMIT_NOT_RECORDED.format(what=RELATION_LABELS["valuations"]))
        return plan
    current = {
        (_decimal_text(row.amt), _text(row.appraisal_date)): row for row in cover.valuations.all()
    }
    seen: set[tuple[str, str]] = set()
    for row in wanted:
        identity = (_decimal_text(row.get("amt")), _text(row.get("appraisal_date")))
        if identity in seen:
            continue
        seen.add(identity)
        live = current.get(identity)
        if live is not None:
            plan.keep.append(live)
        else:
            plan.add.append(
                {
                    "cover_id": cover.pk,
                    "amt": _decimal(row.get("amt")),
                    "appraisal_date": row.get("appraisal_date") or None,
                }
            )
    plan.remove = [row for identity, row in current.items() if identity not in seen]
    return plan


# -- plans ----------------------------------------------------------------------------------------


def _check_snapshot(snapshot: Any) -> dict[str, Any]:
    if not isinstance(snapshot, dict):
        raise RestorePlanError("Version snapshot is not readable.")
    return snapshot


def plan_marking_restore(marking: Marking, snapshot: Any) -> RestorePlan:
    snapshot = _check_snapshot(snapshot)
    limitations: list[str] = []
    scalars = _marking_scalars(marking, snapshot)
    fields = _marking_field_rows(marking, scalars)
    relations = {
        "images": _plan_images(Image.SUBJECT_MARKING, marking.pk, snapshot, limitations),
        "dates_seen": _plan_dates_seen(DateSeen.SUBJECT_MARKING, marking.pk, snapshot, limitations),
        "citations": _plan_citations("MARKING", marking.pk, snapshot, limitations),
    }
    limitations.append(LIMIT_MARKING_COVER_LINKS)
    return RestorePlan("marking", marking, scalars, fields, relations, limitations)


def plan_cover_restore(cover: Cover, snapshot: Any) -> RestorePlan:
    snapshot = _check_snapshot(snapshot)
    limitations: list[str] = []
    scalars = _cover_scalars(cover, snapshot)
    fields = _cover_field_rows(cover, scalars)
    relations = {
        "images": _plan_images(Image.SUBJECT_COVER, cover.pk, snapshot, limitations),
        "dates_seen": _plan_dates_seen(DateSeen.SUBJECT_COVER, cover.pk, snapshot, limitations),
        "citations": _plan_citations("COVER", cover.pk, snapshot, limitations),
        "cover_markings": _plan_cover_markings(cover, snapshot, limitations),
        "valuations": _plan_valuations(cover, snapshot, limitations),
    }
    limitations.append(LIMIT_COVER_DESCRIPTION)
    return RestorePlan("cover", cover, scalars, fields, relations, limitations)


# -- apply ----------------------------------------------------------------------------------------


def _audit_user(actor, subject):
    if actor is not None and getattr(actor, "is_authenticated", False):
        return actor
    return subject.modified_by


_RELATION_MODELS = {
    "images": Image,
    "dates_seen": DateSeen,
    "citations": Citation,
    "cover_markings": CoverMarking,
    "valuations": CoverValuation,
}


def apply_restore_plan(plan: RestorePlan, actor) -> None:
    """Write the plan: scalars, then per relationship remove, update, add.

    Opens no transaction. Removes come before adds so a row that changes
    identity (for example an image that was re-ordered) never collides with
    a unique constraint on the way in.
    """
    subject = plan.subject
    for key, value in plan.scalars.items():
        setattr(subject, key, value)
    user = _audit_user(actor, subject)
    if user is not None:
        subject.modified_by = user
    subject.save()

    for kind, relation in plan.relations.items():
        model = _RELATION_MODELS[kind]
        for row in relation.remove:
            row.delete()
        for row, changes in relation.update:
            for key, value in changes.items():
                setattr(row, key, value)
            row.modified_by = user
            row.save()
        for fields in relation.add:
            extra = {"created_by": user, "modified_by": user}
            if kind == "images":
                extra["uploaded_by"] = user
                extra["is_tracing"] = False
            model.objects.create(**fields, **extra)


# -- preview --------------------------------------------------------------------------------------


def preview_payload(plan: RestorePlan, version, action_label: str | None = None) -> dict[str, Any]:
    return {
        "entry_type": plan.entry_type,
        "entry_id": plan.subject.pk,
        "version_no": version.version_no,
        "version_created_at": version.created_at,
        "version_action_label": action_label,
        "fields": [row.as_dict() for row in plan.fields],
        "relationships": plan.relationship_counts(),
        "limitations": list(plan.limitations),
        "has_changes": plan.has_changes(),
    }
