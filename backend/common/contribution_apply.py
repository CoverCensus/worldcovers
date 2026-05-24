"""
Apply an approved Contribution to the catalog.

The approve view in backend/common/api/v2/views.py wraps a call to
apply_contribution_to_catalog(contrib) in transaction.atomic(); this
module must therefore NOT open its own transaction. On any error it
raises -- ContributionApplyError for malformed submission data (becomes
a 500 with a field-specific message), or ContributionApplyNotImplemented
for code paths that are not yet supported (becomes a 501 per the
view's existing NotImplementedError branch).

Scope:
  * Marking submissions (type in TOWNMARK/RATEMARK/AUXMARK): create one
    Marking + one-or-more Image rows + zero-or-more Citation rows.
    apply_contribution_to_catalog returns the created Marking.
  * Cover submissions (submission_kind == "cover" or type in FC/FL):
    create one Cover + one CoverMarking (linked to the parent marking,
    review_status=APPROVED) + zero-or-one DateSeen + one-or-more Image
    rows + zero-or-more Citation rows + zero-or-one CoverValuation. The
    cover branch returns a dict, NOT a Marking -- see
    apply_cover_contribution_to_catalog for the exact shape. The approve
    view (common/api/v2/views.py ContributionViewSet.approve) branches on
    the return type.
  * Marking edit flow (edit_postmark_id present in payload) is ignored: a
    new Marking is always created. Approving an edit-draft today therefore
    produces a duplicate row. Follow-up.

The function reads contrib.submitted_data (a JSON blob written by the
v2 ContributionSubmitView) under the caller's transaction.
"""

from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from typing import Any

from django.utils import timezone
from django.utils.dateparse import parse_date

from common.models import (
    Citation,
    Color,
    Cover,
    CoverMarking,
    CoverValuation,
    DateSeen,
    Image,
    Lettering,
    Marking,
    PostOffice,
    PostOfficeRegion,
    ReferenceWork,
    Region,
    Shape,
)


_BOOL_TRUE = {"true", "yes", "1"}
_BOOL_FALSE = {"false", "no", "0"}

_MARKING_TYPES = ("TOWNMARK", "RATEMARK", "AUXMARK")
_COVER_TYPES = ("FC", "FL")


class ContributionApplyError(ValueError):
    """Raised when contribution submitted_data is malformed.

    The approve view surfaces this as a 500 with the error message
    visible to the editor, so messages should name the specific field
    that is missing or invalid.
    """


class ContributionApplyNotImplemented(NotImplementedError):
    """Raised for submission paths that are intentionally not yet built.

    The approve view maps this to HTTP 501 so editors can see that the
    feature is pending rather than that their data was rejected.
    """


def apply_contribution_to_catalog(contrib):
    """
    Apply an approved Contribution to the catalog by creating a Marking
    (+ Images + Citations) from contrib.submitted_data. Caller must wrap
    in a transaction; this function does not.
    """
    payload = contrib.submitted_data or {}
    actor = contrib.contributor

    submission_kind = payload.get("submission_kind") or payload.get("submissionKind")
    sub_type = payload.get("type")
    if submission_kind == "cover" or sub_type in _COVER_TYPES:
        return apply_cover_contribution_to_catalog(contrib)
    if sub_type not in _MARKING_TYPES:
        raise ContributionApplyError(
            "Marking type is required and must be one of "
            "TOWNMARK/RATEMARK/AUXMARK; got {!r}.".format(sub_type)
        )

    state = _required_str(payload, "state")
    town = _required_str(payload, "town")
    inscription = _required_str(payload, "inscription_txt")

    is_manuscript = _coerce_required_bool(payload, "is_manuscript")

    post_office = _resolve_post_office(state, town, actor)

    if is_manuscript:
        shape = None
        lettering = None
        is_irreg = None
    else:
        shape = _resolve_fk(Shape, payload, "shape_id", "shape")
        if shape is None:
            raise ContributionApplyError(
                "shape is required for non-manuscript markings."
            )
        lettering = _resolve_lettering(payload)
        is_irreg = _coerce_required_bool(payload, "is_irreg")

    color = _resolve_fk(Color, payload, "color_id", "color")

    width = _parse_decimal(payload.get("width_mm") or payload.get("widthMm"))
    height = _parse_decimal(payload.get("height_mm") or payload.get("heightMm"))

    desc_raw = (payload.get("desc") or payload.get("description") or "")
    if isinstance(desc_raw, str):
        desc_raw = desc_raw.strip()
    else:
        desc_raw = str(desc_raw).strip()

    date_fmt = payload.get("date_fmt") or payload.get("dateFmt") or None
    if isinstance(date_fmt, str):
        date_fmt = date_fmt.strip() or None

    impression = payload.get("impression") or None
    if isinstance(impression, str):
        impression = impression.strip() or None

    marking_kwargs = dict(
        type=sub_type,
        inscription_txt=inscription,
        desc=desc_raw or None,
        is_manuscript=is_manuscript,
        shape=shape,
        lettering=lettering,
        is_irreg=is_irreg,
        width=width,
        height=height,
        date_fmt=date_fmt,
        impression=impression,
        rate_val=_parse_decimal(payload.get("rate_val")),
        post_office=post_office,
        created_by=actor,
        modified_by=actor,
    )
    if color is not None:
        marking_kwargs["color"] = color

    marking = Marking(**marking_kwargs)
    # full_clean() is belt-and-braces; the explicit checks above produce
    # the friendly messages, but this catches anything we missed (e.g.
    # check constraints we did not enumerate).
    marking.full_clean()
    marking.save()

    _create_images(marking, payload, actor)
    _create_citations(marking, payload, actor)

    return marking


def apply_cover_contribution_to_catalog(contrib) -> dict:
    """
    Materialize an approved cover Contribution into the catalog: create one
    Cover, one CoverMarking (linked to the parent Marking, review_status
    APPROVED), zero-or-one DateSeen, one-or-more Image rows, zero-or-more
    Citation rows, and zero-or-one CoverValuation -- all from
    contrib.submitted_data. The caller (ContributionViewSet.approve) owns the
    transaction.atomic(); this function MUST NOT open its own.

    Returns a dict so the approve view can tell covers from markings:
        {
            "kind": "cover",
            "cover": <Cover>,
            "cover_marking": <CoverMarking>,    # review_status == APPROVED
            "parent_marking": <Marking>,
        }
    The CoverMarking.reviewer is left null here (the approving editor is not
    available in this function); the approve view backfills reviewer /
    review_notes after this returns.
    """
    payload = contrib.submitted_data or {}
    actor = contrib.contributor

    # Parent marking: the form sends both parent_marking_id and marking_id.
    parent_id = None
    for k in ("parent_marking_id", "marking_id", "marking"):
        raw = payload.get(k)
        if raw in (None, ""):
            continue
        try:
            parent_id = int(raw)
            break
        except (TypeError, ValueError):
            continue
    if parent_id is None:
        raise ContributionApplyError(
            "parent_marking_id (or marking_id) is required for a cover submission."
        )
    # all_objects so a recycle-binned parent still resolves (mirrors
    # _resolve_parent_marking_post_office in common/api/v2/views.py).
    try:
        parent_marking = Marking.all_objects.get(pk=parent_id)
    except Marking.DoesNotExist:
        raise ContributionApplyError("Unknown parent marking id: {}".format(parent_id))

    cover_type = payload.get("type")
    if isinstance(cover_type, str):
        cover_type = cover_type.strip().upper() or None
    if cover_type is not None and cover_type not in _COVER_TYPES:
        raise ContributionApplyError(
            "Cover type must be FC or FL; got {!r}.".format(cover_type)
        )

    color = _resolve_fk(Color, payload, "color_id", "color")
    has_adhesive = _coerce_optional_bool(payload, "has_adhesive", False)
    is_institutional = _coerce_optional_bool(payload, "is_institutional", None)
    width = _parse_decimal(payload.get("width_mm") or payload.get("widthMm"))
    height = _parse_decimal(payload.get("height_mm") or payload.get("heightMm"))

    cover = Cover(
        type=cover_type,
        color=color,
        has_adhesive=bool(has_adhesive),
        is_institutional=is_institutional,
        width=width,
        height=height,
        created_by=actor,
        modified_by=actor,
    )
    # code is assigned inside Cover.save() (it is blank until the row has a pk),
    # so exclude it from validation here.
    cover.full_clean(exclude=["code"])
    cover.save()

    is_backstamp = _coerce_optional_bool(payload, "is_backstamp", False)
    placement = payload.get("placement")
    if isinstance(placement, str):
        placement = placement.strip() or None
    else:
        placement = None
    comment_raw = payload.get("contributor_comment") or payload.get("comment_for_editor") or ""
    comment = comment_raw.strip() if isinstance(comment_raw, str) else str(comment_raw).strip()

    cover_marking, _created = CoverMarking.objects.get_or_create(
        cover=cover,
        marking=parent_marking,
        defaults=dict(
            is_backstamp=bool(is_backstamp),
            placement=placement,
            contributor_comment=comment or None,
            review_status=CoverMarking.REVIEW_APPROVED,
            reviewed_at=timezone.now(),
            created_by=actor,
            modified_by=actor,
        ),
    )

    _create_cover_date_seen(cover, payload, actor)
    _create_cover_images(cover, payload, actor)
    _create_cover_citations(cover, payload, actor)
    _create_cover_valuation(cover, payload, actor)

    return {
        "kind": "cover",
        "cover": cover,
        "cover_marking": cover_marking,
        "parent_marking": parent_marking,
    }


def _required_str(payload: dict, key: str) -> str:
    raw = payload.get(key)
    if raw is None:
        raise ContributionApplyError("{} is required.".format(key))
    s = str(raw).strip()
    if not s:
        raise ContributionApplyError("{} is required.".format(key))
    return s


def _coerce_required_bool(payload: dict, key: str) -> bool:
    """
    Parse a required boolean from payload[key]. Accepts True/False, 1/0,
    or the strings "true"/"false"/"yes"/"no" (case-insensitive). Any
    other value -- including missing key -- raises.
    """
    if key not in payload:
        raise ContributionApplyError(
            "{} is required and must be true or false.".format(key)
        )
    raw = payload[key]
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, int):
        if raw == 1:
            return True
        if raw == 0:
            return False
    if isinstance(raw, str):
        s = raw.strip().lower()
        if s in _BOOL_TRUE:
            return True
        if s in _BOOL_FALSE:
            return False
    raise ContributionApplyError(
        "{} is required and must be true or false.".format(key)
    )


def _coerce_optional_bool(payload: dict, key: str, default):
    """
    Parse an optional boolean from payload[key]. Returns `default` when the key
    is missing, empty, or unparseable (lenient -- these cover fields are
    optional). Accepts True/False, 1/0, or the strings
    "true"/"false"/"yes"/"no" (case-insensitive).
    """
    if key not in payload:
        return default
    raw = payload[key]
    if raw is None or raw == "":
        return default
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, int):
        if raw == 1:
            return True
        if raw == 0:
            return False
        return default
    if isinstance(raw, str):
        s = raw.strip().lower()
        if s in _BOOL_TRUE:
            return True
        if s in _BOOL_FALSE:
            return False
    return default


def _parse_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError):
            return None
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return Decimal(s)
        except (InvalidOperation, ValueError):
            return None
    return None


def _resolve_fk(model, payload: dict, id_key: str, name_key: str, *fallback_id_keys: str):
    """
    Try id_key (and any fallback_id_keys) by primary key; on missing id
    that does not resolve, raise. Then try name_key by case-insensitive
    name match. Returns None if nothing resolves.
    """
    id_keys: tuple[str, ...] = (id_key,) + fallback_id_keys
    for k in id_keys:
        raw = payload.get(k)
        if raw is None or raw == "":
            continue
        try:
            pk = int(raw)
        except (TypeError, ValueError):
            continue
        try:
            return model.objects.get(pk=pk)
        except model.DoesNotExist:
            raise ContributionApplyError(
                "Unknown {} id: {}".format(model.__name__.lower(), pk)
            )
    raw_name = payload.get(name_key)
    if raw_name is None:
        return None
    name = str(raw_name).strip()
    if not name:
        return None
    return model.objects.filter(name__iexact=name).first()


def _resolve_lettering(payload: dict) -> Lettering | None:
    """
    Lettering accepts nested-object shapes from older form payloads
    (lettering_style.lettering_style_id, letteringStyle.letteringStyleId)
    in addition to the flat id_key / name_key path used by _resolve_fk.
    """
    nested_id = _read_nested_id(
        payload.get("lettering_style"), "lettering_style_id", "letteringStyleId"
    )
    if nested_id is None:
        nested_id = _read_nested_id(
            payload.get("letteringStyle"), "lettering_style_id", "letteringStyleId"
        )
    if nested_id is not None:
        try:
            return Lettering.objects.get(pk=nested_id)
        except Lettering.DoesNotExist:
            raise ContributionApplyError(
                "Unknown lettering id: {}".format(nested_id)
            )
    return _resolve_fk(
        Lettering,
        payload,
        "lettering_style_id",
        "lettering",
        "lettering_id",
    )


def _read_nested_id(value: Any, snake: str, camel: str) -> int | None:
    if not isinstance(value, dict):
        return None
    v = value.get(snake)
    if v is None:
        v = value.get(camel)
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _resolve_post_office(state_name: str, town_name: str, actor) -> PostOffice:
    """
    Resolve a PostOffice for (state_name, town_name), auto-creating the
    town if it does not yet exist in that state. Regions are NOT
    auto-created; an unknown state is a hard error.
    """
    region = (
        Region.objects.filter(name__iexact=state_name).first()
        or Region.objects.filter(abbrev__iexact=state_name).first()
    )
    if region is None:
        raise ContributionApplyError("Unknown state: {}".format(state_name))

    normalized_name = " ".join(town_name.strip().split()).title()
    po = (
        PostOffice.objects
        .filter(name__iexact=normalized_name, post_office_regions__region=region)
        .first()
    )
    if po is None:
        po = PostOffice.objects.create(
            name=normalized_name,
            created_by=actor,
            modified_by=actor,
        )
    PostOfficeRegion.objects.get_or_create(
        post_office=po,
        region=region,
        defaults={"created_by": actor, "modified_by": actor},
    )
    return po


def _create_images(marking, payload: dict, actor) -> None:
    """
    Create Image rows for the new Marking. At least one image is
    required; a submission with zero images is malformed.
    """
    metas = payload.get("marking_image_metas")
    if not metas:
        metas = payload.get("image_metas")
    if not isinstance(metas, list) or len(metas) == 0:
        raise ContributionApplyError(
            "Marking submission has no images; at least one image is required."
        )

    tags_raw = payload.get("marking_image_tags")
    tags: list[str] = []
    if isinstance(tags_raw, str):
        try:
            parsed = json.loads(tags_raw)
            if isinstance(parsed, list):
                tags = [str(t) for t in parsed]
        except (ValueError, TypeError):
            tags = []
    elif isinstance(tags_raw, list):
        tags = [str(t) for t in tags_raw]

    for i, meta in enumerate(metas):
        if not isinstance(meta, dict):
            raise ContributionApplyError(
                "marking_image_metas[{}] is not an object.".format(i)
            )
        storage_filename = meta.get("storage_filename")
        if not storage_filename:
            raise ContributionApplyError(
                "marking_image_metas[{}].storage_filename is required.".format(i)
            )
        is_tracing = i < len(tags) and tags[i] == "tracing"
        Image.objects.create(
            subject_type=Image.SUBJECT_MARKING,
            subject_id=marking.pk,
            original_filename=str(meta.get("original_filename", "") or ""),
            storage_filename=str(storage_filename),
            file_checksum=str(meta.get("file_checksum", "") or ""),
            mime_type=str(meta.get("mime_type", "") or ""),
            image_width=int(meta.get("image_width") or 0),
            image_height=int(meta.get("image_height") or 0),
            file_size_bytes=int(meta.get("file_size_bytes") or 0),
            image_view="FULL",
            image_description=str(meta.get("image_description", "") or ""),
            is_tracing=is_tracing,
            display_order=i,
            uploaded_by=actor,
            created_by=actor,
            modified_by=actor,
        )


def _create_citations(marking, payload: dict, actor) -> None:
    """
    Create Citation rows from reference_work_ids + reference_work_details.
    Silently no-ops if no reference_work_ids are present.
    """
    ids_raw = payload.get("reference_work_ids")
    if ids_raw is None:
        ids_raw = payload.get("referenceWorkIds")
    if not ids_raw:
        return
    if not isinstance(ids_raw, (list, tuple)):
        raise ContributionApplyError(
            "reference_work_ids must be a list of ids."
        )

    details_raw = payload.get("reference_work_details")
    if details_raw is None:
        details_raw = payload.get("referenceWorkDetails")
    details_list: list[dict] = []
    if isinstance(details_raw, str):
        try:
            parsed = json.loads(details_raw)
            if isinstance(parsed, list):
                details_list = [d for d in parsed if isinstance(d, dict)]
        except (ValueError, TypeError):
            details_list = []
    elif isinstance(details_raw, list):
        details_list = [d for d in details_raw if isinstance(d, dict)]

    detail_by_id: dict[int, dict] = {}
    for entry in details_list:
        try:
            rwid = int(entry.get("reference_work_id"))
        except (TypeError, ValueError):
            continue
        detail_by_id[rwid] = entry

    for rid_raw in ids_raw:
        try:
            rwid = int(rid_raw)
        except (TypeError, ValueError):
            raise ContributionApplyError(
                "Invalid reference work id: {!r}".format(rid_raw)
            )
        try:
            rw = ReferenceWork.objects.get(pk=rwid)
        except ReferenceWork.DoesNotExist:
            raise ContributionApplyError(
                "Unknown reference work id: {}".format(rwid)
            )
        detail = detail_by_id.get(rwid, {})
        page_number = str(detail.get("page_number") or "").strip()
        url = str(detail.get("url") or "").strip()
        if page_number and url:
            citation_detail = "p. {} - {}".format(page_number, url)
        elif page_number:
            citation_detail = "p. {}".format(page_number)
        elif url:
            citation_detail = url
        else:
            citation_detail = ""
        if len(citation_detail) > 500:
            citation_detail = citation_detail[:500]
        Citation.objects.create(
            reference_work=rw,
            subject_type="MARKING",
            subject_id=marking.pk,
            citation_detail=citation_detail,
            created_by=actor,
            modified_by=actor,
        )


def _create_cover_date_seen(cover, payload: dict, actor) -> None:
    """
    Create zero-or-one DateSeen (subject_type=COVER) from cover_date +
    cover_granularity. Optional: covers without a recorded date are valid, so a
    missing cover_date is a no-op. A present-but-unparseable date is an error.
    """
    raw = payload.get("cover_date") or payload.get("coverDate")
    if raw in (None, ""):
        return
    parsed = parse_date(str(raw)[:10])
    if parsed is None:
        raise ContributionApplyError("Invalid cover_date: {!r}".format(raw))
    granularity = payload.get("cover_granularity") or payload.get("coverGranularity") or "DAY"
    if isinstance(granularity, str):
        granularity = granularity.strip().upper() or "DAY"
    if granularity not in ("DAY", "MONTH", "YEAR"):
        raise ContributionApplyError("Invalid cover_granularity: {!r}".format(granularity))
    DateSeen.objects.create(
        subject_type=DateSeen.SUBJECT_COVER,
        subject_id=cover.pk,
        date=parsed,
        granularity=granularity,
        created_by=actor,
        modified_by=actor,
    )


def _create_cover_images(cover, payload: dict, actor) -> None:
    """
    Create Image rows for the new Cover. At least one image is required; a
    submission with zero images is malformed. Mirrors _create_images but writes
    COVER-subject rows with a cover-valid image_view ("FRONT"); the marking
    path's image_view="FULL" is rejected by the DB check constraint for COVER.
    """
    metas = payload.get("cover_image_metas")
    if not metas:
        metas = payload.get("image_metas")
    if not isinstance(metas, list) or len(metas) == 0:
        raise ContributionApplyError(
            "Cover submission has no images; at least one image is required."
        )

    tags_raw = payload.get("cover_image_tags")
    tags: list[str] = []
    if isinstance(tags_raw, str):
        try:
            parsed = json.loads(tags_raw)
            if isinstance(parsed, list):
                tags = [str(t) for t in parsed]
        except (ValueError, TypeError):
            tags = []
    elif isinstance(tags_raw, list):
        tags = [str(t) for t in tags_raw]

    for i, meta in enumerate(metas):
        if not isinstance(meta, dict):
            raise ContributionApplyError(
                "cover_image_metas[{}] is not an object.".format(i)
            )
        storage_filename = meta.get("storage_filename")
        if not storage_filename:
            raise ContributionApplyError(
                "cover_image_metas[{}].storage_filename is required.".format(i)
            )
        is_tracing = i < len(tags) and tags[i] == "tracing"
        Image.objects.create(
            subject_type=Image.SUBJECT_COVER,
            subject_id=cover.pk,
            original_filename=str(meta.get("original_filename", "") or ""),
            storage_filename=str(storage_filename),
            file_checksum=str(meta.get("file_checksum", "") or ""),
            mime_type=str(meta.get("mime_type", "") or ""),
            image_width=int(meta.get("image_width") or 0),
            image_height=int(meta.get("image_height") or 0),
            file_size_bytes=int(meta.get("file_size_bytes") or 0),
            image_view="FRONT",
            image_description=str(meta.get("image_description", "") or ""),
            is_tracing=is_tracing,
            display_order=i,
            uploaded_by=actor,
            created_by=actor,
            modified_by=actor,
        )


def _create_cover_citations(cover, payload: dict, actor) -> None:
    """
    Create Citation rows (subject_type=COVER) from reference_work_ids +
    reference_work_details. Silently no-ops if no reference_work_ids are present.
    Mirrors _create_citations except for the COVER subject.
    """
    ids_raw = payload.get("reference_work_ids")
    if ids_raw is None:
        ids_raw = payload.get("referenceWorkIds")
    if not ids_raw:
        return
    if not isinstance(ids_raw, (list, tuple)):
        raise ContributionApplyError(
            "reference_work_ids must be a list of ids."
        )

    details_raw = payload.get("reference_work_details")
    if details_raw is None:
        details_raw = payload.get("referenceWorkDetails")
    details_list: list[dict] = []
    if isinstance(details_raw, str):
        try:
            parsed = json.loads(details_raw)
            if isinstance(parsed, list):
                details_list = [d for d in parsed if isinstance(d, dict)]
        except (ValueError, TypeError):
            details_list = []
    elif isinstance(details_raw, list):
        details_list = [d for d in details_raw if isinstance(d, dict)]

    detail_by_id: dict[int, dict] = {}
    for entry in details_list:
        try:
            rwid = int(entry.get("reference_work_id"))
        except (TypeError, ValueError):
            continue
        detail_by_id[rwid] = entry

    for rid_raw in ids_raw:
        try:
            rwid = int(rid_raw)
        except (TypeError, ValueError):
            raise ContributionApplyError(
                "Invalid reference work id: {!r}".format(rid_raw)
            )
        try:
            rw = ReferenceWork.objects.get(pk=rwid)
        except ReferenceWork.DoesNotExist:
            raise ContributionApplyError(
                "Unknown reference work id: {}".format(rwid)
            )
        detail = detail_by_id.get(rwid, {})
        page_number = str(detail.get("page_number") or "").strip()
        url = str(detail.get("url") or "").strip()
        if page_number and url:
            citation_detail = "p. {} - {}".format(page_number, url)
        elif page_number:
            citation_detail = "p. {}".format(page_number)
        elif url:
            citation_detail = url
        else:
            citation_detail = ""
        if len(citation_detail) > 500:
            citation_detail = citation_detail[:500]
        Citation.objects.create(
            reference_work=rw,
            subject_type="COVER",
            subject_id=cover.pk,
            citation_detail=citation_detail,
            created_by=actor,
            modified_by=actor,
        )


def _create_cover_valuation(cover, payload: dict, actor) -> None:
    """
    Create zero-or-one CoverValuation from valuation_amt /
    valuation_appraisal_date. Not part of the current draft form payload, so
    this is a no-op unless either field is present.
    """
    amt = _parse_decimal(payload.get("valuation_amt") or payload.get("valuationAmt"))
    date_raw = payload.get("valuation_appraisal_date") or payload.get("valuationAppraisalDate")
    appraisal_date = parse_date(str(date_raw)[:10]) if date_raw else None
    if amt is None and appraisal_date is None:
        return
    CoverValuation.objects.create(
        cover=cover,
        amt=amt,
        appraisal_date=appraisal_date,
        created_by=actor,
        modified_by=actor,
    )


__all__ = [
    "apply_contribution_to_catalog",
    "apply_cover_contribution_to_catalog",
    "ContributionApplyError",
    "ContributionApplyNotImplemented",
]
