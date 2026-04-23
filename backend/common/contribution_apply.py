"""
Helpers for applying a Contribution's submitted_data to the catalog.
Called via Contribution.apply_to_catalog(); isolated here to avoid circular
imports between models.py and the API view layer.
"""
import json
import logging
import re
from datetime import date, datetime

logger = logging.getLogger(__name__)
from decimal import Decimal, InvalidOperation
from typing import Optional, Tuple

from django.contrib.auth import get_user_model

from common.models import (
    Auxmark,
    Color,
    DateObserved,
    Framing,
    Lettering,
    MarkFraming,
    Postmark,
    PostmarkImage,
    PostmarkRatemark,
    PostOffice,
    Ratemark,
    Region,
    Shape,
)

_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_YEAR_RE = re.compile(r"^\d{4}$")
_YEAR_RANGE_RE = re.compile(r"^\s*(\d{4})\s*[-–—]\s*(\d{4})\s*$")


def _get_contribution_user():
    """User for creating Postmark and related TimestampedModel from a contribution (no request user)."""
    User = get_user_model()
    return User.objects.filter(is_superuser=True).first() or User.objects.first()


def _coerce_optional_bool(value):
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    if s in {"true", "1", "yes", "y", "on"}:
        return True
    if s in {"false", "0", "no", "n", "off"}:
        return False
    return None


def _first_present(payload: dict, *keys: str):
    for key in keys:
        if key in payload:
            value = payload.get(key)
            if value is None:
                continue
            if isinstance(value, str):
                value = value.strip()
                if value == "":
                    continue
            return value
    return None


def _parse_dates_seen_from_payload(payload: dict) -> Tuple[date, date]:
    """
    Parse earliest/latest date seen from contribution payload.

    Supports:
    - first_seen/last_seen (or firstSeen/lastSeen) as YYYY or YYYY-MM-DD
    - date_range/dateRange as:
        - YYYY
        - YYYY-YYYY
        - YYYY-MM-DD
        - YYYY-MM-DD - YYYY-MM-DD (spaces around dash)
    """
    def _get(*keys: str) -> str:
        for k in keys:
            v = payload.get(k)
            if v is None:
                continue
            s = str(v).strip()
            if s != "":
                return s
        return ""

    first_raw = _get("first_seen", "firstSeen")
    last_raw = _get("last_seen", "lastSeen")
    range_raw = _get("date_range", "dateRange")

    def _parse_token(tok: str, *, is_latest: bool) -> Optional[date]:
        t = (tok or "").strip()
        if not t:
            return None
        if _ISO_DATE_RE.match(t):
            try:
                return datetime.fromisoformat(t).date()
            except ValueError:
                return None
        if _YEAR_RE.match(t):
            y = max(1, min(int(t), 9999))
            return date(y, 12, 31) if is_latest else date(y, 1, 1)
        return None

    if first_raw or last_raw:
        e = _parse_token(first_raw or last_raw, is_latest=False) or date(1900, 1, 1)
        l = _parse_token(last_raw or first_raw, is_latest=True) or date(1900, 12, 31)
        return (e, l) if e <= l else (l, e)

    s = (range_raw or "").strip()
    if not s:
        return date(1900, 1, 1), date(1900, 12, 31)

    m = _YEAR_RANGE_RE.match(s)
    if m:
        y1 = max(1, min(int(m.group(1)), 9999))
        y2 = max(1, min(int(m.group(2)), 9999))
        e = date(y1, 1, 1)
        l = date(y2, 12, 31)
        return (e, l) if e <= l else (l, e)

    if _ISO_DATE_RE.match(s):
        d = _parse_token(s, is_latest=False) or date(1900, 1, 1)
        return d, d

    parts = re.split(r"\s+[-–—]\s+", s)
    if len(parts) >= 2:
        e = _parse_token(parts[0], is_latest=False) or date(1900, 1, 1)
        l = _parse_token(parts[1], is_latest=True) or e
        return (e, l) if e <= l else (l, e)

    try:
        y = int(s.strip()[:4])
        y = max(1, min(y, 9999))
        return date(y, 1, 1), date(y, 12, 31)
    except Exception:
        return date(1900, 1, 1), date(1900, 12, 31)


def _extract_image_metas_from_payload(payload):
    """
    Normalize contribution image metadata into a flat list.
    Supports explicit grouped keys and legacy image_meta/image_metas payloads.
    """
    category_map = {
        "postmark_image_metas": "postmark",
        "ratemark_image_metas": "ratemark",
        "auxmark_image_metas": "auxmark",
    }
    normalized = []

    def _append_many(raw_items, default_category):
        if not isinstance(raw_items, list):
            return
        for raw in raw_items:
            if not isinstance(raw, dict):
                continue
            storage = raw.get("storage_filename")
            if not storage:
                continue
            category = str(raw.get("mark_category") or raw.get("image_category") or default_category or "postmark").strip().lower()
            normalized.append(
                {
                    "storage_filename": storage,
                    "original_filename": (raw.get("original_filename") or "image")[:255],
                    "file_checksum": (raw.get("file_checksum") or "")[:64],
                    "mime_type": (raw.get("mime_type") or "image/jpeg")[:50],
                    "image_width": raw.get("image_width", 0),
                    "image_height": raw.get("image_height", 0),
                    "file_size_bytes": raw.get("file_size_bytes", 0),
                    "mark_category": category,
                    "image_description": (raw.get("image_description") or "").strip(),
                }
            )

    has_grouped = False
    for key, category in category_map.items():
        raw_items = payload.get(key)
        if isinstance(raw_items, list) and raw_items:
            has_grouped = True
        _append_many(raw_items, category)

    if has_grouped:
        return normalized

    _append_many(payload.get("image_metas"), "postmark")
    raw_single = payload.get("image_meta")
    if isinstance(raw_single, dict):
        _append_many([raw_single], "postmark")
    return normalized


def _create_postmark_images_from_payload(postmark, user, payload, replace_existing=False):
    image_metas = _extract_image_metas_from_payload(payload)
    if not image_metas:
        return False
    if replace_existing:
        PostmarkImage.objects.filter(postmark=postmark).delete()

    category_prefix = {
        "postmark": "Postmark",
        "ratemark": "Ratemark",
        "auxmark": "Auxmark",
    }

    for idx, meta in enumerate(image_metas):
        category = str(meta.get("mark_category") or "postmark").strip().lower()
        prefix = category_prefix.get(category, "Postmark")
        custom_description = (meta.get("image_description") or "").strip()
        image_description = custom_description or f"{prefix} image"
        PostmarkImage.objects.create(
            postmark=postmark,
            original_filename=meta.get("original_filename", "image")[:255],
            storage_filename=meta["storage_filename"],
            file_checksum=meta.get("file_checksum", "")[:64],
            mime_type=meta.get("mime_type", "image/jpeg")[:50],
            image_width=meta.get("image_width", 0),
            image_height=meta.get("image_height", 0),
            file_size_bytes=meta.get("file_size_bytes", 0),
            image_view="FULL",
            image_description=image_description,
            display_order=idx,
            uploaded_by=user,
            created_by=user,
            modified_by=user,
        )
    return True


def _extract_mark_entries(payload, key):
    """
    Normalize ratemarks/auxmarks payloads from JSON body or multipart string field.
    """
    raw = payload.get(key)
    if raw is None:
        return []
    if isinstance(raw, list):
        return [row for row in raw if isinstance(row, dict)]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [row for row in parsed if isinstance(row, dict)]
        except json.JSONDecodeError:
            return []
    return []


def _as_decimal(value):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        return None


def _parse_dimensions_from_payload(payload: dict):
    width = _as_decimal(_first_present(payload, "width_mm", "widthMm"))
    height = _as_decimal(_first_present(payload, "height_mm", "heightMm"))
    if width is not None or height is not None:
        return width, height

    dimensions_raw = _first_present(payload, "dimensions")
    if not dimensions_raw:
        return None, None

    text = str(dimensions_raw).lower().replace("mm", " ").strip()
    match = re.search(r"(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)", text)
    if not match:
        return None, None
    return _as_decimal(match.group(1)), _as_decimal(match.group(2))


def _resolve_lettering_from_payload(payload: dict, *, is_manuscript: bool):
    if is_manuscript:
        return None
    lettering_id = _first_present(
        payload, "lettering_style_id", "letteringStyleId", "lettering_id", "letteringId"
    )
    if lettering_id is not None:
        try:
            return Lettering.objects.filter(pk=int(lettering_id)).first()
        except (TypeError, ValueError):
            pass
    lettering_name = _first_present(payload, "lettering", "lettering_style_name", "letteringStyleName")
    if lettering_name is not None:
        return Lettering.objects.filter(name__iexact=str(lettering_name).strip()).first()
    return None


def _normalize_choice(value, allowed_values):
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    lowered = raw.lower()
    for allowed in allowed_values:
        if lowered == str(allowed).lower():
            return allowed
    return None


def _resolve_date_fmt_from_payload(payload: dict):
    direct = _first_present(payload, "date_fmt", "dateFmt")
    normalized_direct = _normalize_choice(
        direct, [choice[0] for choice in Postmark.DATE_FMT_CHOICES]
    )
    if normalized_direct:
        return normalized_direct

    raw_ids = _first_present(
        payload,
        "date_format_ids",
        "dateFormatIds",
        "date_format_id",
        "dateFormatId",
    )
    format_ids = []
    if isinstance(raw_ids, list):
        format_ids = raw_ids
    elif raw_ids is not None:
        format_ids = [raw_ids]

    for raw in format_ids:
        try:
            idx = int(raw) - 1
        except (TypeError, ValueError):
            continue
        if 0 <= idx < len(Postmark.DATE_FMT_CHOICES):
            return Postmark.DATE_FMT_CHOICES[idx][0]
    return None


def _resolve_region_from_payload(payload: dict):
    state_region_id = _first_present(payload, "state_region_id", "stateRegionId")
    if state_region_id is not None:
        try:
            region_by_id = Region.objects.filter(pk=int(state_region_id)).first()
            if region_by_id:
                return region_by_id
        except (TypeError, ValueError):
            pass

    state_str = str(_first_present(payload, "state") or "").strip()
    if not state_str:
        return None
    return (
        Region.objects.filter(name__iexact=state_str).first()
        or Region.objects.filter(abbrev__iexact=state_str).first()
    )


def _resolve_shape_from_payload(payload: dict):
    shape_id = _first_present(payload, "shape_id", "shapeId")
    if shape_id is not None:
        try:
            shape_by_id = Shape.objects.filter(pk=int(shape_id)).first()
            if shape_by_id:
                return shape_by_id
        except (TypeError, ValueError):
            pass

    shape_str = str(_first_present(payload, "shape", "type") or "").strip()
    if not shape_str:
        return None
    return Shape.objects.filter(name__iexact=shape_str).first()


def _resolve_color_from_payload(payload: dict, user):
    color_id = _first_present(payload, "color_id", "colorId")
    if color_id is not None:
        try:
            color_by_id = Color.objects.filter(pk=int(color_id)).first()
            if color_by_id:
                return color_by_id
        except (TypeError, ValueError):
            pass

    color_name = str(_first_present(payload, "color") or "").strip()
    if color_name:
        color = Color.objects.filter(name__iexact=color_name).first()
        if color:
            return color

    return (
        Color.objects.filter(name__iexact="Black").first()
        or Color.objects.first()
        or Color.objects.create(
            name="Black",
            created_by=user,
            modified_by=user,
        )
    )


def _resolve_post_office(region, town_str, user, payload=None):
    post_office_id = _first_present(
        payload if isinstance(payload, dict) else {},
        "post_office_id",
        "postOfficeId",
    )
    if post_office_id is not None:
        try:
            po = PostOffice.objects.select_related("region").filter(pk=int(post_office_id)).first()
            if po:
                if region is None or po.region_id == region.pk:
                    return po
                logger.warning(
                    "contribution_apply: post_office_id=%s region mismatch (expected=%s got=%s); using payload state/town",
                    post_office_id,
                    region.pk,
                    po.region_id,
                )
        except (TypeError, ValueError):
            pass

    if not region or not town_str:
        return None
    return PostOffice.objects.get_or_create(
        region=region,
        name=town_str[:255],
        defaults={"created_by": user, "modified_by": user},
    )[0]


def _build_postmark_updates_from_payload(payload: dict, user):
    state_str = str(_first_present(payload, "state") or "").strip()
    town_str = str(_first_present(payload, "town") or "").strip()
    manuscript_raw = _first_present(payload, "manuscript")
    is_manuscript = str(manuscript_raw or "").strip().lower() == "yes"
    is_irreg = _coerce_optional_bool(_first_present(payload, "is_irreg", "isIrreg"))
    impression = _normalize_choice(
        _first_present(payload, "impression"),
        [choice[0] for choice in Postmark.IMPRESSION_CHOICES],
    )
    date_type = _normalize_choice(
        _first_present(payload, "date_type", "dateType"),
        [choice[0] for choice in Postmark.DATE_TYPE_CHOICES],
    )
    date_fmt = _resolve_date_fmt_from_payload(payload)
    width, height = _parse_dimensions_from_payload(payload)
    inscription_txt = str(_first_present(payload, "inscription_txt", "inscriptionTxt") or "").strip()

    if not state_str:
        logger.error("contribution_apply: empty state on payload")
        return None

    region = _resolve_region_from_payload(payload)
    if region is None:
        logger.error("contribution_apply: no Region matches state=%r", state_str)
        return None

    return {
        "post_office": _resolve_post_office(region, town_str, user, payload),
        "shape": _resolve_shape_from_payload(payload),
        "color": _resolve_color_from_payload(payload, user),
        "is_manuscript": is_manuscript,
        "inscription_txt": inscription_txt,
        "catalog_txt": inscription_txt,
        "lettering": _resolve_lettering_from_payload(payload, is_manuscript=is_manuscript),
        "impression": impression,
        "is_irreg": is_irreg,
        "width": width,
        "height": height,
        "date_type": date_type,
        "date_fmt": date_fmt,
    }


def _sync_dates_observed_from_payload(postmark, user, payload, replace_existing=False):
    if replace_existing:
        postmark.dates_observed.all().delete()

    earliest, latest = _parse_dates_seen_from_payload(payload)
    rows = [(earliest, "DAY")]
    if latest and latest != earliest:
        rows.append((latest, "DAY"))

    for observed_date, granularity in rows:
        if not observed_date:
            continue
        DateObserved.objects.create(
            postmark=postmark,
            date=observed_date,
            granularity=granularity,
            created_by=user,
            modified_by=user,
        )


def _extract_framing_ids_from_payload(payload):
    """
    Normalize framing ids from contribution payload.
    Supports framing_style_ids/framingStyleIds as list or JSON string,
    with fallback to single framing_style_id/framingStyleId.
    """
    if not isinstance(payload, dict):
        return []

    raw_ids = payload.get("framing_style_ids")
    if raw_ids in (None, ""):
        raw_ids = payload.get("framingStyleIds")

    parsed_ids = []
    if isinstance(raw_ids, list):
        parsed_ids = raw_ids
    elif isinstance(raw_ids, str):
        s = raw_ids.strip()
        if s:
            try:
                loaded = json.loads(s)
                if isinstance(loaded, list):
                    parsed_ids = loaded
                else:
                    parsed_ids = [loaded]
            except json.JSONDecodeError:
                parsed_ids = [part.strip() for part in s.split(",") if part.strip()]

    normalized = []
    seen = set()
    for v in parsed_ids:
        try:
            iv = int(v)
        except (TypeError, ValueError):
            continue
        if iv > 0 and iv not in seen:
            seen.add(iv)
            normalized.append(iv)

    if normalized:
        return normalized

    single_raw = payload.get("framing_style_id")
    if single_raw in (None, ""):
        single_raw = payload.get("framingStyleId")
    try:
        single_id = int(single_raw)
        if single_id > 0:
            return [single_id]
    except (TypeError, ValueError):
        pass
    return []


def _sync_postmark_framings_from_payload(postmark, user, payload):
    """
    Replace POSTMARK MarkFraming rows with all selected framing styles in payload.
    Keeps order from framing_style_ids and assigns framing_pos sequentially.
    """
    framing_ids = _extract_framing_ids_from_payload(payload)
    MarkFraming.objects.filter(
        parent_mark_type="POSTMARK",
        parent_mark_id=postmark.pk,
    ).delete()
    if not framing_ids:
        return

    framings_by_id = {
        f.id: f for f in Framing.objects.filter(id__in=framing_ids)
    }
    for idx, framing_id in enumerate(framing_ids, start=1):
        framing = framings_by_id.get(framing_id)
        if not framing:
            continue
        MarkFraming.objects.create(
            parent_mark_type="POSTMARK",
            parent_mark_id=postmark.pk,
            framing=framing,
            framing_pos=idx,
            created_by=user,
            modified_by=user,
        )


def _resolve_shape_for_mark(shape_str):
    name = str(shape_str or "").strip()
    if not name:
        return None
    return Shape.objects.filter(name__iexact=name).first()


def _resolve_color_for_mark(color_str):
    name = str(color_str or "").strip()
    if not name:
        return Color.objects.filter(name__iexact="Black").first() or Color.objects.first()
    color = Color.objects.filter(name__iexact=name).first()
    if color:
        return color
    return Color.objects.filter(name__iexact="Black").first() or Color.objects.first()


def _sync_ratemarks_auxmarks_from_payload(postmark, user, payload):
    """
    Create ratemarks + auxmarks from contribution payload and link them to the postmark.
    """
    ratemark_entries = _extract_mark_entries(payload, "ratemarks")
    auxmark_entries = _extract_mark_entries(payload, "auxmarks")
    if not ratemark_entries and not auxmark_entries:
        return

    default_lettering = Lettering.objects.first()
    created_ratemarks = []
    for row in ratemark_entries:
        manuscript = str(row.get("manuscript") or "").strip().lower() == "yes"
        ratemark = Ratemark.objects.create(
            inscription_txt=str(row.get("inscription_txt") or "").strip(),
            is_manuscript=manuscript,
            shape=_resolve_shape_for_mark(row.get("shape") or row.get("type")),
            lettering=None if manuscript else default_lettering,
            color=_resolve_color_for_mark(row.get("color")),
            impression=str(row.get("impression") or "").strip() or None,
            is_irreg=_coerce_optional_bool(row.get("is_irreg", row.get("isIrreg"))),
            width=_as_decimal(row.get("width_mm")),
            height=_as_decimal(row.get("height_mm")),
            rate_val=_as_decimal(row.get("rate_val")),
            created_by=user,
            modified_by=user,
        )
        PostmarkRatemark.objects.get_or_create(
            postmark=postmark,
            ratemark=ratemark,
            defaults={"placement_type": "SEPARATE", "created_by": user, "modified_by": user},
        )
        created_ratemarks.append(ratemark)

    for row in auxmark_entries:
        manuscript = str(row.get("manuscript") or "").strip().lower() == "yes"
        parent_type = str(row.get("parent_mark_type") or "POSTMARK").strip().upper()
        parent_mark_type = "POSTMARK"
        parent_mark_id = postmark.pk
        if parent_type == "RATEMARK" and created_ratemarks:
            parent_mark_type = "RATEMARK"
            parent_mark_id = created_ratemarks[0].pk

        Auxmark.objects.create(
            parent_mark_type=parent_mark_type,
            parent_mark_id=parent_mark_id,
            inscription_txt=str(row.get("inscription_txt") or "").strip(),
            is_manuscript=manuscript,
            shape=_resolve_shape_for_mark(row.get("shape") or row.get("type")),
            lettering=None if manuscript else default_lettering,
            color=_resolve_color_for_mark(row.get("color")),
            impression=str(row.get("impression") or "").strip() or None,
            is_irreg=_coerce_optional_bool(row.get("is_irreg", row.get("isIrreg"))),
            width=_as_decimal(row.get("width_mm")),
            height=_as_decimal(row.get("height_mm")),
            created_by=user,
            modified_by=user,
        )


def _create_postmark_in_catalog(payload):
    """
    Create a Postmark from a contribution payload.
    Uses direct FK fields (post_office, shape, lettering, color) on new Postmark.
    Returns the Postmark or None on failure.
    """
    user = _get_contribution_user()
    if not user:
        return None
    try:
        updates = _build_postmark_updates_from_payload(payload, user)
        if updates is None:
            return None
        postmark = Postmark.objects.create(
            created_by=user,
            modified_by=user,
            **updates,
        )
        _sync_dates_observed_from_payload(postmark, user, payload, replace_existing=False)

        _sync_postmark_framings_from_payload(postmark, user, payload)
        _create_postmark_images_from_payload(postmark, user, payload, replace_existing=False)
        _sync_ratemarks_auxmarks_from_payload(postmark, user, payload)
        return postmark
    except Exception:
        logger.exception("_create_postmark_in_catalog failed for payload keys=%s", list(payload.keys()))
        return None


def _update_postmark_in_catalog(postmark_id, payload, submitter_name):
    """
    Update an existing Postmark in place from a contribution payload.
    Returns the updated Postmark or None on failure.
    """
    try:
        postmark = Postmark.objects.filter(pk=postmark_id).first()
        if not postmark:
            return None

        user = _get_contribution_user()
        if not user:
            return None

        updates = _build_postmark_updates_from_payload(payload, user)
        if updates is None:
            return None

        postmark.post_office = updates["post_office"]
        postmark.shape = updates["shape"]
        postmark.color = updates["color"]
        postmark.is_manuscript = updates["is_manuscript"]
        postmark.inscription_txt = updates["inscription_txt"]
        postmark.catalog_txt = updates["catalog_txt"]
        postmark.lettering = updates["lettering"]
        postmark.impression = updates["impression"]
        postmark.is_irreg = updates["is_irreg"]
        postmark.width = updates["width"]
        postmark.height = updates["height"]
        postmark.date_type = updates["date_type"]
        postmark.date_fmt = updates["date_fmt"]
        postmark.modified_by = user
        postmark.save(
            update_fields=[
                "post_office",
                "shape",
                "color",
                "is_manuscript",
                "inscription_txt",
                "catalog_txt",
                "lettering",
                "impression",
                "is_irreg",
                "width",
                "height",
                "date_type",
                "date_fmt",
                "modified_by",
            ]
        )

        _sync_dates_observed_from_payload(postmark, user, payload, replace_existing=True)

        _sync_postmark_framings_from_payload(postmark, user, payload)
        _create_postmark_images_from_payload(postmark, user, payload, replace_existing=True)
        _sync_ratemarks_auxmarks_from_payload(postmark, user, payload)
        return postmark
    except Exception:
        logger.exception("_update_postmark_in_catalog failed for postmark_id=%s", postmark_id)
        return None


def apply_contribution_to_catalog(contrib):
    """
    Apply a Contribution's submitted_data to the catalog.
    For new entries (postmark=None): create Postmark via _create_postmark_in_catalog.
    For edits (postmark set): update Postmark via _update_postmark_in_catalog.
    Returns the Postmark or None on failure.
    """
    payload = contrib.submitted_data or {}
    if not payload.get("state") or not payload.get("town"):
        return None
    submitter_name = payload.get("submitter_name", "")
    if contrib.postmark_id:
        return _update_postmark_in_catalog(contrib.postmark_id, payload, submitter_name)
    postmark = _create_postmark_in_catalog(payload)
    if postmark:
        contrib.postmark = postmark
        contrib.save(update_fields=["postmark", "updated_at"])
    return postmark
