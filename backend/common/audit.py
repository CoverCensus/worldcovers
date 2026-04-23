from __future__ import annotations

from typing import Any
from uuid import uuid4

from django.db.models import Max
from django.utils import timezone

from common.models import (
    Citation,
    DateObserved,
    Postmark,
    PostmarkImage,
    PostmarkVersion,
    SubmissionTransaction,
)


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return str(value)
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return str(value)


def build_postmark_snapshot(postmark: Postmark | None) -> dict[str, Any]:
    if not postmark:
        return {}

    post_office = getattr(postmark, "post_office", None)
    region = getattr(post_office, "region", None) if post_office else None
    dates = (
        postmark.dates_observed.order_by("date").values("date", "granularity")
        if hasattr(postmark, "dates_observed")
        else []
    )
    images = (
        postmark.images.order_by("display_order").values(
            "original_filename",
            "storage_filename",
            "file_checksum",
            "mime_type",
            "image_width",
            "image_height",
            "file_size_bytes",
            "image_view",
            "image_description",
            "display_order",
        )
        if hasattr(postmark, "images")
        else []
    )
    citations = Citation.objects.filter(
        subject_type="POSTMARK",
        subject_id=postmark.pk,
    ).order_by("reference_work_id", "citation_detail").values(
        "reference_work_id",
        "citation_detail",
    )

    return _json_safe(
        {
            "postmark_id": postmark.pk,
            "code": postmark.code,
            "catalog_txt": postmark.catalog_txt,
            "inscription_txt": postmark.inscription_txt,
            "post_office_id": postmark.post_office_id,
            "town": post_office.name if post_office else "",
            "region_id": post_office.region_id if post_office else None,
            "state": region.name if region else "",
            "shape_id": postmark.shape_id,
            "lettering_id": postmark.lettering_id,
            "color_id": postmark.color_id,
            "is_manuscript": postmark.is_manuscript,
            "impression": postmark.impression,
            "is_irreg": postmark.is_irreg,
            "width": postmark.width,
            "height": postmark.height,
            "date_type": postmark.date_type,
            "date_fmt": postmark.date_fmt,
            "dates_observed": list(dates),
            "images": list(images),
            "citations": list(citations),
            "captured_at": timezone.now(),
        }
    )


def compute_payload_diff(before_payload: Any, after_payload: Any) -> list[dict[str, Any]]:
    before_dict = before_payload if isinstance(before_payload, dict) else {}
    after_dict = after_payload if isinstance(after_payload, dict) else {}
    keys = sorted(set(before_dict.keys()) | set(after_dict.keys()))
    diff: list[dict[str, Any]] = []
    for key in keys:
        if key == "captured_at":
            continue
        before_val = before_dict.get(key)
        after_val = after_dict.get(key)
        if before_val != after_val:
            diff.append(
                {
                    "field": key,
                    "before": _json_safe(before_val),
                    "after": _json_safe(after_val),
                }
            )
    return diff


def log_submission_transaction(
    *,
    action: str,
    actor=None,
    contribution=None,
    postmark=None,
    source: str = SubmissionTransaction.SOURCE_SYSTEM,
    before_payload: Any = None,
    after_payload: Any = None,
    extra_payload: Any = None,
) -> SubmissionTransaction:
    before_safe = _json_safe(before_payload or {})
    after_safe = _json_safe(after_payload or {})
    extra_safe = _json_safe(extra_payload or {})
    return SubmissionTransaction.objects.create(
        transaction_uuid=uuid4(),
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        contribution=contribution,
        postmark=postmark,
        source=source,
        before_payload=before_safe,
        after_payload=after_safe,
        diff_payload=compute_payload_diff(before_safe, after_safe),
        extra_payload=extra_safe,
    )


def create_postmark_version(postmark: Postmark, transaction: SubmissionTransaction | None, actor=None) -> PostmarkVersion:
    latest = PostmarkVersion.objects.filter(postmark=postmark).aggregate(max_no=Max("version_no"))["max_no"] or 0
    return PostmarkVersion.objects.create(
        postmark=postmark,
        version_no=latest + 1,
        snapshot=build_postmark_snapshot(postmark),
        transaction=transaction,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
    )


def restore_postmark_from_snapshot(postmark: Postmark, snapshot: dict[str, Any], actor) -> Postmark:
    if not isinstance(snapshot, dict):
        return postmark

    postmark.code = snapshot.get("code")
    postmark.catalog_txt = snapshot.get("catalog_txt") or ""
    postmark.inscription_txt = snapshot.get("inscription_txt") or ""
    postmark.post_office_id = snapshot.get("post_office_id")
    postmark.shape_id = snapshot.get("shape_id")
    postmark.lettering_id = snapshot.get("lettering_id")
    postmark.color_id = snapshot.get("color_id")
    postmark.is_manuscript = bool(snapshot.get("is_manuscript"))
    postmark.impression = snapshot.get("impression")
    postmark.is_irreg = snapshot.get("is_irreg")
    postmark.width = snapshot.get("width")
    postmark.height = snapshot.get("height")
    postmark.date_type = snapshot.get("date_type")
    postmark.date_fmt = snapshot.get("date_fmt")
    if actor and getattr(actor, "is_authenticated", False):
        postmark.modified_by = actor
    postmark.save()

    user_for_related = actor if actor and getattr(actor, "is_authenticated", False) else postmark.modified_by

    postmark.dates_observed.all().delete()
    for row in snapshot.get("dates_observed", []) or []:
        raw_date = row.get("date")
        if not raw_date:
            continue
        DateObserved.objects.create(
            postmark=postmark,
            date=raw_date,
            granularity=(row.get("granularity") or "DAY")[:5],
            created_by=user_for_related,
            modified_by=user_for_related,
        )

    PostmarkImage.objects.filter(postmark=postmark).delete()
    for idx, row in enumerate(snapshot.get("images", []) or []):
        storage_filename = row.get("storage_filename")
        if not storage_filename:
            continue
        PostmarkImage.objects.create(
            postmark=postmark,
            original_filename=(row.get("original_filename") or "image")[:255],
            storage_filename=storage_filename[:255],
            file_checksum=(row.get("file_checksum") or "")[:64],
            mime_type=(row.get("mime_type") or "image/jpeg")[:50],
            image_width=row.get("image_width") or 0,
            image_height=row.get("image_height") or 0,
            file_size_bytes=row.get("file_size_bytes") or 0,
            image_view=(row.get("image_view") or "FULL")[:20],
            image_description=(row.get("image_description") or "").strip(),
            display_order=row.get("display_order") if row.get("display_order") is not None else idx,
            uploaded_by=user_for_related,
            created_by=user_for_related,
            modified_by=user_for_related,
        )

    Citation.objects.filter(subject_type="POSTMARK", subject_id=postmark.pk).delete()
    for row in snapshot.get("citations", []) or []:
        ref_id = row.get("reference_work_id")
        if not ref_id:
            continue
        Citation.objects.create(
            reference_work_id=ref_id,
            subject_type="POSTMARK",
            subject_id=postmark.pk,
            citation_detail=(row.get("citation_detail") or "").strip(),
            created_by=user_for_related,
            modified_by=user_for_related,
        )

    return postmark
