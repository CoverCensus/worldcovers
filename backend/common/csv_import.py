"""
Import parsed CSV data (from AdminCsvUpload) into catalog tables.

Two flavors:
  * Legacy importers (lower in this file) load the pre-migration ERD shape
    into Legacy* tables. Kept for archival imports.
  * v2 catalog importers (lower still, marked "v2 catalog importers") load
    the post-migration model.md shape: colors, letterings, shapes, regions,
    post_offices, markings, covers, cover_markings, cover_dates,
    cover_valuations.

All v2 importers fill TimestampedModel.created_by / modified_by from the
caller's user when authenticated, otherwise from the bootstrap superuser
(pk=1). They are idempotent on the table's natural key.

Staff-only at the API/admin layer.
"""
from datetime import date as _date
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.db import transaction

from .models import (
    Lettering,
    Color,
    Shape,
    Region,
    PostOffice,
    Marking,
    MarkingType,
    Cover,
    CoverDate,
    CoverValuation,
    CoverMarking,
    LegacyAbbreviation,
    LegacyRateLocation,
    LegacyRateValue,
    LegacyParseStep,
    LegacyUserState,
    LegacyRawStateDataPendingUpdate,
    LegacyCover,
)

User = get_user_model()


def _audit_user(request_user):
    """Return the user to attribute imports to.

    Preference order:
      1. request_user when authenticated.
      2. The lowest-pk superuser. (Robust against pk=1 having been deleted.)
      3. The lowest-pk staff user.
    Raises RuntimeError if none resolves; TimestampedModel.created_by is
    NOT NULL with on_delete=PROTECT, so we cannot silently fall through.
    """
    if request_user is not None and getattr(request_user, "is_authenticated", False):
        return request_user
    fallback = (
        User.objects.filter(is_superuser=True).order_by("pk").first()
        or User.objects.filter(is_staff=True).order_by("pk").first()
    )
    if fallback is None:
        raise RuntimeError(
            "No audit user available: pass an authenticated request.user or run "
            "'python manage.py createsuperuser' to create one."
        )
    return fallback


def _col_index(headers, candidates):
    """Return index of first header that matches any candidate (case-insensitive)."""
    lower_headers = [h.strip().lower() for h in headers]
    for c in candidates:
        c_lower = c.lower()
        for i, h in enumerate(lower_headers):
            if c_lower in h or h in c_lower:
                return i
    return -1


def _row_val(row, idx, default=""):
    if idx < 0 or idx >= len(row):
        return default
    v = row[idx]
    return (v.strip() if v is not None else "") or default


def import_lettering(data, user):
    """Import rows into Lettering. Expects txtTownmarkLettering or lettering column."""
    headers = data.get("headers") or []
    rows = data.get("rows") or []
    name_idx = _col_index(headers, ["txtTownmarkLettering", "lettering", "name", "lettering_style_name"])
    if name_idx < 0:
        return {"created": 0, "skipped": 0, "errors": ["Missing column: lettering name"]}

    created = 0
    skipped = 0
    errors = []
    for i, row in enumerate(rows):
        name = _row_val(row, name_idx)
        if not name or name.lower() in ("n/a", "na", ""):
            skipped += 1
            continue
        _, was_created = Lettering.objects.get_or_create(
            name=name[:100],
            defaults={"created_by": user, "modified_by": user},
        )
        if was_created:
            created += 1
        else:
            skipped += 1

    return {"created": created, "skipped": skipped, "errors": errors[:20]}


def import_framing(data, user):
    """
    Phase 1: Framing was removed in the model.md realignment. Importer kept
    only as a no-op so existing CSV upload UIs do not 500.
    """
    return {
        "created": 0,
        "skipped": len((data or {}).get("rows") or []),
        "errors": ["Framing has been retired from the model; CSV ignored."],
    }


def import_colors_legacy(data, user):
    """Legacy importer for the old Colors CSV shape (txtName/colorValue).

    Superseded by the v2 import_colors below; kept only because nothing
    references it and removing it could surprise an archived workflow.
    """
    headers = data.get("headers") or []
    rows = data.get("rows") or []
    name_idx = _col_index(headers, ["color", "color_name", "name", "colorName"])
    hex_idx = _col_index(headers, ["hex", "color_value", "colorValue", "value"])
    if name_idx < 0:
        return {"created": 0, "skipped": 0, "errors": ["Missing column: color name"]}

    created = 0
    skipped = 0
    errors = []
    for i, row in enumerate(rows):
        name = _row_val(row, name_idx)
        hex_val = _row_val(row, hex_idx) if hex_idx >= 0 else "#FFFFFF"
        if not name:
            skipped += 1
            continue
        if not hex_val.startswith("#"):
            hex_val = "#" + hex_val if hex_val else "#FFFFFF"
        _, was_created = Color.objects.get_or_create(
            name=name[:50],
            defaults={
                "hex_val": hex_val[:50],
                "created_by": user,
                "modified_by": user,
            },
        )
        if was_created:
            created += 1
        else:
            skipped += 1

    return {"created": created, "skipped": skipped, "errors": errors[:20]}


def _row_dict(headers, row):
    """Build dict from headers and row; values stripped."""
    return {h.strip(): (row[i].strip() if i < len(row) and row[i] is not None else "") for i, h in enumerate(headers) if h.strip()}


def _parse_int(val, default=None):
    if val is None or str(val).strip() in ("", "NULL", "None"):
        return default
    try:
        return int(float(str(val).strip()))
    except (ValueError, TypeError):
        return default


def _parse_float(val, default=None):
    if val is None or str(val).strip() in ("", "NULL", "None"):
        return default
    try:
        return float(str(val).strip())
    except (ValueError, TypeError):
        return default


def import_abbreviations(data, user=None):
    """Import tblAbbreviations → LegacyAbbreviation. Columns: ID, txtAbbreviation, txtMeaning, nOrder, ynActive."""
    headers = data.get("headers") or []
    rows = data.get("rows") or []
    id_idx = _col_index(headers, ["ID", "id"])
    abb_idx = _col_index(headers, ["txtAbbreviation", "abbreviation"])
    meaning_idx = _col_index(headers, ["txtMeaning", "meaning"])
    order_idx = _col_index(headers, ["nOrder", "order"])
    active_idx = _col_index(headers, ["ynActive", "active"])
    if abb_idx < 0:
        return {"created": 0, "skipped": 0, "errors": ["Missing column: txtAbbreviation"]}
    created = 0
    skipped = 0
    errors = []
    for i, row in enumerate(rows):
        abb = _row_val(row, abb_idx)
        if not abb:
            skipped += 1
            continue
        pk = _parse_int(_row_val(row, id_idx), i + 1) if id_idx >= 0 else (i + 1)
        meaning = _row_val(row, meaning_idx) if meaning_idx >= 0 else ""
        n_order = _parse_int(_row_val(row, order_idx), 0) if order_idx >= 0 else 0
        yn_active = _row_val(row, active_idx).strip() in ("1", "true", "yes", "Y") if active_idx >= 0 else True
        _, was_created = LegacyAbbreviation.objects.update_or_create(
            id=pk,
            defaults={
                "txt_abbreviation": abb[:100],
                "txt_meaning": meaning[:255] if meaning else "",
                "n_order": n_order,
                "yn_active": yn_active,
            },
        )
        if was_created:
            created += 1
    return {"created": created, "skipped": skipped, "errors": errors[:20]}


def import_rate_location(data, user=None):
    """Import tblTownmarkRateLocation → LegacyRateLocation."""
    headers = data.get("headers") or []
    rows = data.get("rows") or []
    id_idx = _col_index(headers, ["nTownmarkRateLocationID", "ID", "id"])
    name_idx = _col_index(headers, ["txtTownmarkRateLocation", "rate_location"])
    mem_idx = _col_index(headers, ["memTownmarkRateLocation", "description"])
    order_idx = _col_index(headers, ["nOrder"])
    active_idx = _col_index(headers, ["ynActive"])
    if name_idx < 0:
        return {"created": 0, "skipped": 0, "errors": ["Missing column: txtTownmarkRateLocation"]}
    created = 0
    skipped = 0
    errors = []
    for i, row in enumerate(rows):
        name = _row_val(row, name_idx)
        if not name:
            skipped += 1
            continue
        pk = _parse_int(_row_val(row, id_idx), i + 1) if id_idx >= 0 else (i + 1)
        mem = _row_val(row, mem_idx) if mem_idx >= 0 else ""
        n_order = _parse_int(_row_val(row, order_idx), 0) if order_idx >= 0 else 0
        yn_active = _row_val(row, active_idx).strip() in ("1", "true", "yes", "Y") if active_idx >= 0 else True
        _, was_created = LegacyRateLocation.objects.update_or_create(
            id=pk,
            defaults={
                "txt_townmark_rate_location": name[:100],
                "mem_townmark_rate_location": mem[:255] if mem else "",
                "n_order": n_order,
                "yn_active": yn_active,
            },
        )
        if was_created:
            created += 1
    return {"created": created, "skipped": skipped, "errors": errors[:20]}


def import_rate_value(data, user=None):
    """Import tblTownmarkRateValue → LegacyRateValue."""
    headers = data.get("headers") or []
    rows = data.get("rows") or []
    id_idx = _col_index(headers, ["nTownmarkRateValueID", "ID", "id"])
    value_idx = _col_index(headers, ["txtTownmarkRateValue", "rate_value"])
    order_idx = _col_index(headers, ["nOrder"])
    active_idx = _col_index(headers, ["ynActive"])
    if value_idx < 0:
        return {"created": 0, "skipped": 0, "errors": ["Missing column: txtTownmarkRateValue"]}
    created = 0
    skipped = 0
    errors = []
    for i, row in enumerate(rows):
        val = _row_val(row, value_idx)
        if val is None or str(val).strip() == "":
            skipped += 1
            continue
        pk = _parse_int(_row_val(row, id_idx), i + 1) if id_idx >= 0 else (i + 1)
        val_str = str(val).strip()[:50]
        n_order = _parse_int(_row_val(row, order_idx), 0) if order_idx >= 0 else 0
        yn_active = _row_val(row, active_idx).strip() in ("1", "true", "yes", "Y") if active_idx >= 0 else True
        _, was_created = LegacyRateValue.objects.update_or_create(
            id=pk,
            defaults={
                "txt_townmark_rate_value": val_str,
                "n_order": n_order,
                "yn_active": yn_active,
            },
        )
        if was_created:
            created += 1
    return {"created": created, "skipped": skipped, "errors": errors[:20]}


def import_parse_steps(data, user=None):
    """Import tblParseSteps → LegacyParseStep."""
    headers = data.get("headers") or []
    rows = data.get("rows") or []
    id_idx = _col_index(headers, ["nParseStepID", "ID", "id"])
    step_idx = _col_index(headers, ["txtParseStep", "parse_step"])
    state_idx = _col_index(headers, ["nStateID", "state_id"])
    completed_idx = _col_index(headers, ["ynCompleted"])
    order_idx = _col_index(headers, ["nOrder"])
    active_idx = _col_index(headers, ["ynActive"])
    if step_idx < 0 or state_idx < 0:
        return {"created": 0, "skipped": 0, "errors": ["Missing columns: txtParseStep, nStateID"]}
    created = 0
    skipped = 0
    errors = []
    for i, row in enumerate(rows):
        step = _row_val(row, step_idx)
        state_id = _parse_int(_row_val(row, state_idx))
        if not step or state_id is None:
            skipped += 1
            continue
        pk = _parse_int(_row_val(row, id_idx), i + 1) if id_idx >= 0 else (i + 1)
        yn_completed = _row_val(row, completed_idx).strip() in ("1", "true", "yes", "Y") if completed_idx >= 0 else False
        n_order = _parse_int(_row_val(row, order_idx), 0) if order_idx >= 0 else 0
        yn_active = _row_val(row, active_idx).strip() in ("1", "true", "yes", "Y") if active_idx >= 0 else True
        _, was_created = LegacyParseStep.objects.update_or_create(
            id=pk,
            defaults={
                "txt_parse_step": step[:255],
                "n_state_id": state_id,
                "yn_completed": yn_completed,
                "n_order": n_order,
                "yn_active": yn_active,
            },
        )
        if was_created:
            created += 1
    return {"created": created, "skipped": skipped, "errors": errors[:20]}


def import_user_states(data, user=None):
    """Import ctUserStates → LegacyUserState."""
    headers = data.get("headers") or []
    rows = data.get("rows") or []
    user_idx = _col_index(headers, ["nUserID", "user_id"])
    state_idx = _col_index(headers, ["nStateID", "state_id"])
    roles_idx = _col_index(headers, ["memRoles", "roles"])
    if user_idx < 0 or state_idx < 0:
        return {"created": 0, "skipped": 0, "errors": ["Missing columns: nUserID, nStateID"]}
    created = 0
    skipped = 0
    errors = []
    for i, row in enumerate(rows):
        n_user_id = _parse_int(_row_val(row, user_idx))
        n_state_id = _parse_int(_row_val(row, state_idx))
        if n_user_id is None or n_state_id is None:
            skipped += 1
            continue
        mem_roles = _row_val(row, roles_idx) if roles_idx >= 0 else ""
        _, was_created = LegacyUserState.objects.update_or_create(
            n_user_id=n_user_id,
            n_state_id=n_state_id,
            defaults={"mem_roles": mem_roles or ""},
        )
        if was_created:
            created += 1
    return {"created": created, "skipped": skipped, "errors": errors[:20]}


def import_pending_updates(data, user=None):
    """Import tblRawStateData_pendingUpdate → LegacyRawStateDataPendingUpdate (payload = full row dict)."""
    headers = data.get("headers") or []
    rows = data.get("rows") or []
    id_idx = _col_index(headers, ["id", "ID"])
    raw_id_idx = _col_index(headers, ["nRawStateDataID", "raw_state_data_id"])
    state_idx = _col_index(headers, ["nStateID", "state_id"])
    created = 0
    skipped = 0
    errors = []
    for i, row in enumerate(rows):
        payload = _row_dict(headers, row)
        pk = _parse_int(payload.get("id") or (row[id_idx] if id_idx >= 0 and id_idx < len(row) else None), i + 1)
        n_raw = _parse_int(payload.get("nRawStateDataID") or (row[raw_id_idx] if raw_id_idx >= 0 and raw_id_idx < len(row) else None))
        n_state = _parse_int(payload.get("nStateID") or (row[state_idx] if state_idx >= 0 and state_idx < len(row) else None))
        _, was_created = LegacyRawStateDataPendingUpdate.objects.update_or_create(
            id=pk,
            defaults={
                "n_raw_state_data_id": n_raw,
                "n_state_id": n_state,
                "payload": payload,
            },
        )
        if was_created:
            created += 1
    return {"created": created, "skipped": skipped, "errors": errors[:20]}


def import_legacy_covers(data, user=None):
    """Import tblCovers → LegacyCover. Maps CSV columns to model fields."""
    headers = data.get("headers") or []
    rows = data.get("rows") or []
    id_idx = _col_index(headers, ["nCoverID", "id"])
    created = 0
    skipped = 0
    errors = []
    for i, row in enumerate(rows):
        d = _row_dict(headers, row)
        cover_id = _parse_int(d.get("nCoverID") or d.get("id") or (row[id_idx] if id_idx >= 0 and id_idx < len(row) else None))
        if cover_id is None:
            cover_id = i + 1
        n_user_id = _parse_int(d.get("nUserID"))
        if n_user_id is None:
            skipped += 1
            continue
        defaults = {
            "txt_cover_key_id": (d.get("txtCoverKeyID") or "")[:100],
            "txt_state_abv": (d.get("txtStateAbv") or "")[:20],
            "txt_territory": (d.get("txtTerritory") or "")[:255],
            "txt_town": (d.get("txtTown") or "")[:255],
            "txt_townmark_shape": (d.get("txtTownmarkShape") or "")[:100],
            "txt_lettering": (d.get("txtLettering") or "")[:100],
            "txt_townmark_framing": (d.get("txtTownmarkFraming") or "")[:100],
            "txt_date_format": (d.get("txtDateFormat") or "")[:100],
            "txt_rate": (d.get("txtRate") or "")[:50],
            "txt_rate_text": (d.get("txtRateText") or "")[:255],
            "txt_second_rate": (d.get("txtSecondRate") or "")[:255],
            "n_width": _parse_float(d.get("nWidth")),
            "n_height": _parse_float(d.get("nHeight")),
            "txt_color": (d.get("txtColor") or "")[:100],
            "n_earliest_use_day": _parse_int(d.get("nEarliestUseDay")),
            "n_earliest_use_month": _parse_int(d.get("nEarliestUseMonth")),
            "n_earliest_use_year": _parse_int(d.get("nEarliestUseYear")),
            "n_latest_use_day": _parse_int(d.get("nLatestUseDay")),
            "n_latest_use_month": _parse_int(d.get("nLatestUseMonth")),
            "n_latest_use_year": _parse_int(d.get("nLatestUseYear")),
            "mem_ascc_text": d.get("memASCCText") or "",
            "mem_notes": d.get("memNotes") or "",
            "mem_other_char": d.get("memOtherChar") or "",
            "n_estimated_value": _parse_float(d.get("nEstimatedValue")),
            "txt_published_id": (d.get("txtPublishedID") or "")[:100],
            "txt_image1": (d.get("txtImage1") or "")[:255],
            "txt_image2": (d.get("txtImage2") or "")[:255],
        }
        _, was_created = LegacyCover.objects.update_or_create(
            id=cover_id,
            defaults={"n_user_id": n_user_id, **defaults},
        )
        if was_created:
            created += 1
    return {"created": created, "skipped": skipped, "errors": errors[:20]}


# =====================================================================
# v2 catalog importers (model.md shape)
# =====================================================================
#
# Manifest order (also the dependency order for import_apmc_bundle):
#   colors, letterings, shapes, regions, post_offices, markings,
#   covers, cover_markings, cover_dates, cover_valuations
#
# Every v2 importer:
#   * is wrapped in transaction.atomic so a bad row aborts that table cleanly
#   * upserts on the table's natural key (see manifest in plan / model.md)
#   * resolves FKs by natural key, with a per-call cache to avoid N queries
#   * sets created_by/modified_by from _audit_user(user); on update keeps
#     created_by but refreshes modified_by
#   * returns {"created", "updated", "skipped", "errors": [...]} -- the API
#     and admin actions read these counters

_BOOL_TRUE = {"1", "true", "t", "yes", "y"}
_BOOL_FALSE = {"0", "false", "f", "no", "n"}


def _parse_bool(val, default=None):
    if val is None:
        return default
    s = str(val).strip().lower()
    if s == "" or s in ("null", "none"):
        return default
    if s in _BOOL_TRUE:
        return True
    if s in _BOOL_FALSE:
        return False
    return default


def _parse_decimal(val, default=None):
    if val is None:
        return default
    s = str(val).strip().replace(",", "")
    if s == "" or s.lower() in ("null", "none"):
        return default
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return default


def _parse_iso_date(val, default=None):
    if val is None:
        return default
    s = str(val).strip()
    if s == "" or s.lower() in ("null", "none"):
        return default
    try:
        y, m, d = s.split("-", 2)
        return _date(int(y), int(m), int(d))
    except (ValueError, TypeError):
        return default


def _norm(val):
    """Trim whitespace; treat blank/null sentinels as None."""
    if val is None:
        return None
    s = str(val).strip()
    if s == "" or s.lower() in ("null", "none", "n/a", "na"):
        return None
    return s


def _iter_rows(data):
    """Yield (row_index, row_dict) pairs from {headers, rows} payload."""
    headers = [h.strip() for h in (data.get("headers") or [])]
    rows = data.get("rows") or []
    for i, row in enumerate(rows):
        d = {}
        for j, h in enumerate(headers):
            if not h:
                continue
            v = row[j] if j < len(row) else None
            d[h] = (v.strip() if isinstance(v, str) else v)
        yield i, d


def _empty_result():
    return {"created": 0, "updated": 0, "skipped": 0, "errors": []}


def _bump(result, was_created):
    if was_created:
        result["created"] += 1
    else:
        result["updated"] += 1


@transaction.atomic
def import_colors(data, user=None):
    """Color: natural key = name. Optional columns: hex_val, pantone_code."""
    audit = _audit_user(user)
    result = _empty_result()
    for i, row in _iter_rows(data):
        name = _norm(row.get("name"))
        if not name:
            result["skipped"] += 1
            continue
        hex_val = _norm(row.get("hex_val")) or "#FFFFFF"
        if not hex_val.startswith("#"):
            hex_val = "#" + hex_val
        pantone = _norm(row.get("pantone_code"))
        obj, created = Color.objects.get_or_create(
            name=name[:50],
            defaults={
                "hex_val": hex_val[:50],
                "pantone_code": pantone,
                "created_by": audit,
                "modified_by": audit,
            },
        )
        if not created:
            obj.hex_val = hex_val[:50]
            obj.pantone_code = pantone
            obj.modified_by = audit
            obj.save(update_fields=["hex_val", "pantone_code", "modified_by", "modified_date"])
        _bump(result, created)
    return result


@transaction.atomic
def import_letterings(data, user=None):
    """Lettering: natural key = name."""
    audit = _audit_user(user)
    result = _empty_result()
    for i, row in _iter_rows(data):
        name = _norm(row.get("name"))
        if not name:
            result["skipped"] += 1
            continue
        _, created = Lettering.objects.get_or_create(
            name=name[:100],
            defaults={"created_by": audit, "modified_by": audit},
        )
        _bump(result, created)
    return result


@transaction.atomic
def import_shapes(data, user=None):
    """Shape: natural key = name. Optional column: code."""
    audit = _audit_user(user)
    result = _empty_result()
    for i, row in _iter_rows(data):
        name = _norm(row.get("name"))
        if not name:
            result["skipped"] += 1
            continue
        code = _norm(row.get("code"))
        obj, created = Shape.objects.get_or_create(
            name=name[:100],
            defaults={"code": code, "created_by": audit, "modified_by": audit},
        )
        if not created and code and obj.code != code:
            obj.code = code
            obj.modified_by = audit
            obj.save(update_fields=["code", "modified_by", "modified_date"])
        _bump(result, created)
    return result


@transaction.atomic
def import_regions(data, user=None):
    """Region: natural key = (abbrev, region_tier).

    Two-pass: pass 1 creates rows with parent_region=None, pass 2 resolves
    parent_region_abbrev. Required columns: name, abbrev, region_tier.
    Optional: parent_region_abbrev, established_date, defunct_date.
    """
    audit = _audit_user(user)
    result = _empty_result()
    rows_buffered = list(_iter_rows(data))
    valid_tiers = {c[0] for c in Region.REGION_TIER_CHOICES}

    # Pass 1: create / update without parent
    for i, row in rows_buffered:
        abbrev = _norm(row.get("abbrev"))
        tier = _norm(row.get("region_tier"))
        name = _norm(row.get("name"))
        if not abbrev or not tier or not name:
            result["skipped"] += 1
            continue
        if tier not in valid_tiers:
            result["errors"].append(f"row {i}: invalid region_tier {tier!r}")
            continue
        obj, created = Region.objects.get_or_create(
            abbrev=abbrev[:3],
            region_tier=tier,
            defaults={
                "name": name[:100],
                "established_date": _parse_iso_date(row.get("established_date")),
                "defunct_date": _parse_iso_date(row.get("defunct_date")),
                "created_by": audit,
                "modified_by": audit,
            },
        )
        if not created:
            obj.name = name[:100]
            obj.established_date = _parse_iso_date(row.get("established_date"))
            obj.defunct_date = _parse_iso_date(row.get("defunct_date"))
            obj.modified_by = audit
            obj.save(update_fields=["name", "established_date", "defunct_date", "modified_by", "modified_date"])
        _bump(result, created)

    # Pass 2: resolve parent_region_abbrev
    by_abbrev = {r.abbrev: r for r in Region.objects.all()}
    for i, row in rows_buffered:
        parent_abbrev = _norm(row.get("parent_region_abbrev"))
        if not parent_abbrev:
            continue
        abbrev = _norm(row.get("abbrev"))
        if not abbrev:
            continue
        child = by_abbrev.get(abbrev)
        parent = by_abbrev.get(parent_abbrev)
        if child is None:
            continue
        if parent is None:
            result["errors"].append(f"row {i}: parent_region_abbrev {parent_abbrev!r} not found")
            continue
        if child.parent_region_id != parent.pk:
            child.parent_region = parent
            child.modified_by = audit
            child.save(update_fields=["parent_region", "modified_by", "modified_date"])
    return result


@transaction.atomic
def import_post_offices(data, user=None):
    """PostOffice: natural key = (name, region_abbrev). Required: name, region_abbrev."""
    audit = _audit_user(user)
    result = _empty_result()
    region_by_abbrev = {r.abbrev: r for r in Region.objects.all()}
    for i, row in _iter_rows(data):
        name = _norm(row.get("name"))
        region_abbrev = _norm(row.get("region_abbrev"))
        if not name or not region_abbrev:
            result["skipped"] += 1
            continue
        region = region_by_abbrev.get(region_abbrev)
        if region is None:
            result["errors"].append(f"row {i}: region_abbrev {region_abbrev!r} not found")
            continue
        _, created = PostOffice.objects.get_or_create(
            name=name[:255],
            region=region,
            defaults={"created_by": audit, "modified_by": audit},
        )
        _bump(result, created)
    return result


def _lookup_cache(model, attr):
    return {getattr(o, attr): o for o in model.objects.all()}


@transaction.atomic
def import_markings(data, user=None):
    """Marking: natural key = code (unique, must be non-empty for upsert).

    Required columns: code, type, inscription_txt, is_manuscript,
                      post_office_name, region_abbrev.
    Optional: catalog_txt, desc, shape_name, lettering_name, color_name,
              is_irreg, width, height, date_fmt, impression, rate_val.

    Enforces the model's manuscript invariant: when is_manuscript=True we
    null out shape/lettering/is_irreg before save (Marking.save also does
    this, but doing it here keeps the audit log tidy).
    """
    audit = _audit_user(user)
    result = _empty_result()
    valid_types = {c.value for c in MarkingType}
    valid_dfmt = {c[0] for c in Marking.DATE_FMT_CHOICES}
    valid_impr = {c[0] for c in Marking.IMPRESSION_CHOICES}

    shapes = _lookup_cache(Shape, "name")
    letterings = _lookup_cache(Lettering, "name")
    colors = _lookup_cache(Color, "name")
    # post_offices keyed by (name, region_abbrev) for O(1) lookup
    pos = {(po.name, po.region.abbrev): po for po in PostOffice.objects.select_related("region")}

    for i, row in _iter_rows(data):
        code = _norm(row.get("code"))
        if not code:
            result["skipped"] += 1
            continue
        m_type = _norm(row.get("type"))
        if m_type not in valid_types:
            result["errors"].append(f"row {i}: invalid type {m_type!r}")
            continue
        is_ms = _parse_bool(row.get("is_manuscript"), default=False)
        po_name = _norm(row.get("post_office_name"))
        po_region = _norm(row.get("region_abbrev"))
        post_office = pos.get((po_name, po_region)) if po_name and po_region else None
        if post_office is None:
            result["errors"].append(
                f"row {i}: post_office ({po_name!r}, {po_region!r}) not found"
            )
            continue

        shape = letter = color = None
        is_irreg = None
        if not is_ms:
            shape_name = _norm(row.get("shape_name"))
            shape = shapes.get(shape_name) if shape_name else None
            if shape is None:
                result["errors"].append(f"row {i}: shape {shape_name!r} required for non-manuscript")
                continue
            lettering_name = _norm(row.get("lettering_name"))
            if lettering_name:
                letter = letterings.get(lettering_name)
                if letter is None:
                    result["errors"].append(f"row {i}: lettering {lettering_name!r} not found")
                    continue
            is_irreg = _parse_bool(row.get("is_irreg"), default=False)

        # Resolve color explicitly. The model has default=1 (model.md: "BLACK"),
        # but we cannot trust that id=1 exists in the live DB (it can be missing
        # after migrations / seed runs). Resolve by name instead, falling back
        # to BLACK when the row's color_name is empty.
        color_name = _norm(row.get("color_name")) or "BLACK"
        color = colors.get(color_name)
        if color is None:
            result["errors"].append(f"row {i}: color {color_name!r} not found")
            continue

        date_fmt = _norm(row.get("date_fmt"))
        if date_fmt and date_fmt not in valid_dfmt:
            result["errors"].append(f"row {i}: invalid date_fmt {date_fmt!r}")
            continue
        impression = _norm(row.get("impression"))
        if impression and impression not in valid_impr:
            result["errors"].append(f"row {i}: invalid impression {impression!r}")
            continue

        defaults = {
            "type": m_type,
            "catalog_txt": _norm(row.get("catalog_txt")),
            "inscription_txt": _norm(row.get("inscription_txt")) or "",
            "desc": _norm(row.get("desc")),
            "is_manuscript": is_ms,
            "shape": shape,
            "lettering": letter,
            "is_irreg": is_irreg,
            "width": _parse_decimal(row.get("width")),
            "height": _parse_decimal(row.get("height")),
            "date_fmt": date_fmt,
            "impression": impression,
            "rate_val": _parse_decimal(row.get("rate_val")),
            "post_office": post_office,
            "color": color,  # always explicit; do not let model default=1 leak
            "modified_by": audit,
        }
        # create_defaults adds created_by on insert; on update we keep
        # the original created_by untouched.
        _, created = Marking.objects.update_or_create(
            code=code[:30],
            defaults=defaults,
            create_defaults={**defaults, "created_by": audit},
        )
        _bump(result, created)
    return result


@transaction.atomic
def import_covers(data, user=None):
    """Cover: natural key = code (unique, must be non-empty for upsert).

    Required column: code.
    Optional: color_name, type, has_adhesive, height, is_institutional, width.
    """
    audit = _audit_user(user)
    result = _empty_result()
    colors = _lookup_cache(Color, "name")
    valid_types = {c[0] for c in Cover.COVER_TYPE_CHOICES}

    for i, row in _iter_rows(data):
        code = _norm(row.get("code"))
        if not code:
            result["skipped"] += 1
            continue
        color_name = _norm(row.get("color_name"))
        color = colors.get(color_name) if color_name else None
        if color_name and color is None:
            result["errors"].append(f"row {i}: color {color_name!r} not found")
            continue
        c_type = _norm(row.get("type"))
        if c_type and c_type not in valid_types:
            result["errors"].append(f"row {i}: invalid type {c_type!r}")
            continue
        defaults = {
            "color": color,
            "type": c_type,
            "has_adhesive": _parse_bool(row.get("has_adhesive"), default=False),
            "height": _parse_decimal(row.get("height")),
            "is_institutional": _parse_bool(row.get("is_institutional"), default=None),
            "width": _parse_decimal(row.get("width")),
            "modified_by": audit,
        }
        _, created = Cover.objects.update_or_create(
            code=code[:30],
            defaults=defaults,
            create_defaults={**defaults, "created_by": audit},
        )
        _bump(result, created)
    return result


@transaction.atomic
def import_cover_markings(data, user=None):
    """CoverMarking junction: natural key = (cover_code, marking_code).

    Required columns: cover_code, marking_code.
    Optional: is_backstamp, placement.
    """
    audit = _audit_user(user)
    result = _empty_result()
    covers = {c.code: c for c in Cover.objects.exclude(code__isnull=True)}
    markings = {m.code: m for m in Marking.objects.exclude(code__isnull=True)}

    for i, row in _iter_rows(data):
        cc = _norm(row.get("cover_code"))
        mc = _norm(row.get("marking_code"))
        if not cc or not mc:
            result["skipped"] += 1
            continue
        cover = covers.get(cc)
        marking = markings.get(mc)
        if cover is None:
            result["errors"].append(f"row {i}: cover_code {cc!r} not found")
            continue
        if marking is None:
            result["errors"].append(f"row {i}: marking_code {mc!r} not found")
            continue
        defaults = {
            "is_backstamp": _parse_bool(row.get("is_backstamp"), default=False),
            "placement": _norm(row.get("placement")),
            "modified_by": audit,
        }
        _, created = CoverMarking.objects.update_or_create(
            cover=cover,
            marking=marking,
            defaults=defaults,
            create_defaults={**defaults, "created_by": audit},
        )
        _bump(result, created)
    return result


def _delete_then_insert_per_cover(model, cover_code_to_rows, audit):
    """Replace all child rows for each cover in cover_code_to_rows.

    cover_code_to_rows: dict mapping cover instance -> list of build_row dicts
    where build_row will be passed as **kwargs to model(...).
    Returns (created_count, deleted_count).
    """
    created = 0
    deleted = 0
    for cover, row_specs in cover_code_to_rows.items():
        existing = model.objects.filter(cover=cover)
        deleted += existing.count()
        existing.delete()
        for spec in row_specs:
            obj = model(cover=cover, created_by=audit, modified_by=audit, **spec)
            obj.save()
            created += 1
    return created, deleted


@transaction.atomic
def import_cover_dates(data, user=None):
    """CoverDate: no natural key on the row. Strategy: group rows by cover_code,
    delete all CoverDate rows for those covers, re-insert from CSV. Idempotent.

    Required columns: cover_code, date (YYYY-MM-DD), granularity.
    """
    audit = _audit_user(user)
    result = _empty_result()
    covers = {c.code: c for c in Cover.objects.exclude(code__isnull=True)}
    valid_gran = {c[0] for c in CoverDate.GRANULARITY_CHOICES}

    by_cover = {}
    for i, row in _iter_rows(data):
        cc = _norm(row.get("cover_code"))
        if not cc:
            result["skipped"] += 1
            continue
        cover = covers.get(cc)
        if cover is None:
            result["errors"].append(f"row {i}: cover_code {cc!r} not found")
            continue
        gran = _norm(row.get("granularity"))
        if gran not in valid_gran:
            result["errors"].append(f"row {i}: invalid granularity {gran!r}")
            continue
        d = _parse_iso_date(row.get("date"))
        if d is None:
            result["errors"].append(f"row {i}: invalid date {row.get('date')!r}")
            continue
        by_cover.setdefault(cover, []).append({"date": d, "granularity": gran})

    created, _deleted = _delete_then_insert_per_cover(CoverDate, by_cover, audit)
    result["created"] = created
    return result


@transaction.atomic
def import_cover_valuations(data, user=None):
    """CoverValuation: no natural key. Same delete-then-insert strategy as cover_dates.

    Required column: cover_code.
    Optional: amt (decimal, null = unpriced), appraisal_date (YYYY-MM-DD).
    Row order in the CSV is preserved as insertion order, so tier sequence
    can be recovered by ordering on pk.
    """
    audit = _audit_user(user)
    result = _empty_result()
    covers = {c.code: c for c in Cover.objects.exclude(code__isnull=True)}

    by_cover = {}
    for i, row in _iter_rows(data):
        cc = _norm(row.get("cover_code"))
        if not cc:
            result["skipped"] += 1
            continue
        cover = covers.get(cc)
        if cover is None:
            result["errors"].append(f"row {i}: cover_code {cc!r} not found")
            continue
        by_cover.setdefault(cover, []).append({
            "amt": _parse_decimal(row.get("amt")),
            "appraisal_date": _parse_iso_date(row.get("appraisal_date")),
        })

    created, _deleted = _delete_then_insert_per_cover(CoverValuation, by_cover, audit)
    result["created"] = created
    return result


IMPORTERS = {
    # Legacy / pre-migration
    "lettering": import_letterings,
    "framing": import_framing,
    "abbreviations": import_abbreviations,
    "rate_location": import_rate_location,
    "rate_value": import_rate_value,
    "parse_steps": import_parse_steps,
    "user_states": import_user_states,
    "pending_updates": import_pending_updates,
    "legacy_covers": import_legacy_covers,
    # v2 catalog (model.md). Keys match the notebook's CSV stems exactly.
    "colors": import_colors,
    "letterings": import_letterings,
    "shapes": import_shapes,
    "regions": import_regions,
    "post_offices": import_post_offices,
    "markings": import_markings,
    "covers": import_covers,
    "cover_markings": import_cover_markings,
    "cover_dates": import_cover_dates,
    "cover_valuations": import_cover_valuations,
}

# Strict dependency order for bundle / sequenced loads.
# Reused by import_apmc_bundle and admin "import all" actions.
V2_IMPORT_ORDER = (
    "colors",
    "letterings",
    "shapes",
    "regions",
    "post_offices",
    "markings",
    "covers",
    "cover_markings",
    "cover_dates",
    "cover_valuations",
)
