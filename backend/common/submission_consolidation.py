"""
Helpers for keeping only the latest non-draft Submission per contributor and
catalog target.

Runbook:
  cwd: repo root
  command: .venv/bin/python backend/manage.py test common.tests.test_submission_consolidation
  expected exit code: 0

Target shape example:
  {"kind": "marking", "id": 123}
  {"kind": "cover", "id": 456}
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from common.models import Submission, Cover, Marking, SubmissionTransaction


@dataclass(frozen=True)
class SubmissionTarget:
    kind: str
    id: int


def _parse_positive_int(value) -> int | None:
    if value in (None, ""):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _is_cover_payload(submitted_data: dict) -> bool:
    kind = str(
        submitted_data.get("submission_kind")
        or submitted_data.get("submissionKind")
        or ""
    ).strip().lower()
    if kind == "cover":
        return True
    if kind == "marking":
        return False
    type_value = str(submitted_data.get("type") or "").strip().upper()
    if type_value in {"TOWNMARK", "RATEMARK", "AUXMARK"}:
        return False
    parent = (
        submitted_data.get("parent_marking_id")
        or submitted_data.get("parentMarkingId")
        or submitted_data.get("marking_id")
        or submitted_data.get("markingId")
    )
    has_parent = _parse_positive_int(parent) is not None
    has_cover_type = type_value in Cover.COVER_TYPE_CODES
    has_cover_date = bool(
        str(
            submitted_data.get("cover_date")
            or submitted_data.get("coverDate")
            or ""
        ).strip()
    )
    has_cover_date = has_cover_date or any(
        submitted_data.get(key) not in (None, "")
        for key in ("cover_date_year", "cover_date_month", "cover_date_day")
    )
    has_cover_date = has_cover_date or str(
        submitted_data.get("cover_date_unknown") or ""
    ).strip().lower() in {"true", "1", "yes", "on"}
    has_town = bool(str(submitted_data.get("town") or "").strip())
    return has_parent and (has_cover_type or has_cover_date) and not has_town


def _first_positive_int(submitted_data: dict, keys: Iterable[str]) -> int | None:
    for key in keys:
        value = _parse_positive_int(submitted_data.get(key))
        if value is not None:
            return value
    return None


def submission_target(submission: Submission) -> SubmissionTarget | None:
    submitted_data = (
        submission.submitted_data
        if isinstance(submission.submitted_data, dict)
        else {}
    )
    if _is_cover_payload(submitted_data):
        cover_id = _first_positive_int(
            submitted_data,
            (
                "cover_id",
                "coverId",
                "edit_cover_id",
                "editCoverId",
                "materialized_cover_id",
                "materializedCoverId",
            ),
        )
        if cover_id is None:
            return None
        return SubmissionTarget("cover", cover_id)

    marking_id = (
        _parse_positive_int(submission.marking_id)
        or _first_positive_int(
            submitted_data,
            (
                "edit_marking_id",
                "editMarkingId",
                "original_marking_id",
                "originalMarkingId",
                "marking_id",
                "markingId",
            ),
        )
    )
    if marking_id is None:
        return None
    return SubmissionTarget("marking", marking_id)


def _target_object(target: SubmissionTarget):
    if target.kind == "marking":
        return Marking.all_objects.filter(pk=target.id).first()
    if target.kind == "cover":
        return Cover.all_objects.filter(pk=target.id).first()
    return None


def _same_target(submission: Submission, target: SubmissionTarget) -> bool:
    candidate = submission_target(submission)
    return candidate == target


def _superseded_payload(submission: Submission) -> dict:
    return {
        "submission_id": submission.pk,
        "status": submission.status,
        "collection_id": submission.collection_id,
        "submitted_data": submission.submitted_data or {},
        "created_date": submission.created_date,
        "modified_date": submission.modified_date,
    }


def consolidate_superseded_submissions(
    *,
    current: Submission,
    target: SubmissionTarget | None = None,
    actor=None,
    source: str = SubmissionTransaction.SOURCE_SYSTEM,
) -> int:
    """
    Delete older non-draft Submission rows for current.contributor and target.

    Drafts are intentionally retained because a draft is still editable working
    state, not dashboard history. The current row is never deleted.
    """
    if current.status == Submission.STATUS_DRAFT or getattr(current, "catalog_source", None):
        return 0
    resolved = target or submission_target(current)
    if resolved is None:
        return 0

    target_obj = _target_object(resolved)
    candidates = (
        Submission.objects.filter(contributor=current.contributor, catalog_source__isnull=True)
        .exclude(pk=current.pk)
        .exclude(status=Submission.STATUS_DRAFT)
        .order_by("modified_date", "pk")
    )

    from common.audit import log_submission_transaction

    deleted = 0
    for candidate in candidates:
        if not _same_target(candidate, resolved):
            continue
        log_submission_transaction(
            action=SubmissionTransaction.ACTION_SUBMISSION_SUPERSEDED,
            actor=actor,
            submission=None,
            marking=target_obj if resolved.kind == "marking" else None,
            cover=target_obj if resolved.kind == "cover" else None,
            source=source,
            before_payload=_superseded_payload(candidate),
            after_payload={},
            extra_payload={
                "superseded_submission_id": candidate.pk,
                "superseded_by_submission_id": current.pk,
                "target_kind": resolved.kind,
                "target_id": resolved.id,
            },
        )
        candidate.delete()
        deleted += 1
    return deleted


__all__ = [
    "SubmissionTarget",
    "consolidate_superseded_submissions",
    "submission_target",
]
