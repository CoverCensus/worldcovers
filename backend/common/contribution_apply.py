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
    Lettering,
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
            is_irreg=bool(row.get("is_irreg")) if row.get("is_irreg") is not None else None,
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
            is_irreg=bool(row.get("is_irreg")) if row.get("is_irreg") is not None else None,
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
        state_str = (payload.get("state") or "").strip()
        town_str = (payload.get("town") or "").strip()
        shape_str = (payload.get("shape") or payload.get("type") or "").strip()
        color_str = (payload.get("color") or "").strip()
        manuscript_str = (payload.get("manuscript") or "").strip()
        is_manuscript = manuscript_str.lower() == "yes"

        if not state_str:
            logger.error("contribution_apply: empty state on payload")
            return None
        region = (
            Region.objects.filter(name__iexact=state_str).first()
            or Region.objects.filter(abbrev__iexact=state_str).first()
        )
        if region is None:
            logger.error("contribution_apply: no Region matches state=%r", state_str)
            return None
        post_office = None
        if town_str:
            post_office, _ = PostOffice.objects.get_or_create(
                region=region,
                name=town_str[:255],
                defaults={"created_by": user, "modified_by": user},
            )

        shape = Shape.objects.filter(name__iexact=shape_str).first() if shape_str else None

        color_name = color_str or "Black"
        color, _ = Color.objects.get_or_create(
            name=color_name[:50],
            defaults={"created_by": user, "modified_by": user},
        )

        inscription_txt_str = str(payload.get("inscription_txt") or "").strip()
        postmark = Postmark.objects.create(
            post_office=post_office,
            shape=shape,
            color=color,
            is_manuscript=is_manuscript,
            inscription_txt=inscription_txt_str,
            catalog_txt=inscription_txt_str,
            created_by=user,
            modified_by=user,
        )
        earliest, latest = _parse_dates_seen_from_payload(payload)
        if earliest:
            DateObserved.objects.create(
                postmark=postmark,
                date=earliest,
                created_by=user,
                modified_by=user,
            )

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

        state_str = (payload.get("state") or "").strip()
        town_str = (payload.get("town") or "").strip()
        shape_str = (payload.get("shape") or payload.get("type") or "").strip()
        color_str = (payload.get("color") or "").strip()
        manuscript_str = (payload.get("manuscript") or "").strip()
        is_manuscript = manuscript_str.lower() == "yes"

        if not state_str:
            logger.error("contribution_apply: empty state on payload")
            return None
        region = (
            Region.objects.filter(name__iexact=state_str).first()
            or Region.objects.filter(abbrev__iexact=state_str).first()
        )
        if region is None:
            logger.error("contribution_apply: no Region matches state=%r", state_str)
            return None
        post_office = None
        if town_str:
            post_office, _ = PostOffice.objects.get_or_create(
                region=region,
                name=town_str[:255],
                defaults={"created_by": user, "modified_by": user},
            )

        shape = Shape.objects.filter(name__iexact=shape_str).first() if shape_str else None
        color_name = color_str or "Black"
        color, _ = Color.objects.get_or_create(
            name=color_name[:50],
            defaults={"created_by": user, "modified_by": user},
        )

        postmark.post_office = post_office
        postmark.shape = shape
        postmark.color = color
        postmark.is_manuscript = is_manuscript
        postmark.modified_by = user
        postmark.save(update_fields=["post_office", "shape", "color", "is_manuscript", "modified_by"])

        postmark.dates_observed.all().delete()
        earliest, latest = _parse_dates_seen_from_payload(payload)
        if earliest:
            DateObserved.objects.create(
                postmark=postmark, date=earliest, created_by=user, modified_by=user
            )

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
