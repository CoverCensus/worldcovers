"""
Import parsed CSV data (from AdminCsvUpload) into catalog tables.
Maps CSV columns to Django models: lettering, framing, colors.
Staff-only; requires request.user for TimestampedModel (created_by, modified_by).
"""
from django.contrib.auth import get_user_model

from .models import (
    Lettering,
    Framing,
    Color,
    LegacyAbbreviation,
    LegacyRateLocation,
    LegacyRateValue,
    LegacyParseStep,
    LegacyUserState,
    LegacyRawStateDataPendingUpdate,
    LegacyCover,
)

User = get_user_model()


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
    """Import rows into Framing. Expects txtTownmarkFraming or framing column."""
    headers = data.get("headers") or []
    rows = data.get("rows") or []
    name_idx = _col_index(headers, ["txtTownmarkFraming", "framing", "name", "framing_style_name"])
    if name_idx < 0:
        return {"created": 0, "skipped": 0, "errors": ["Missing column: framing name"]}

    created = 0
    skipped = 0
    errors = []
    for i, row in enumerate(rows):
        name = _row_val(row, name_idx)
        if not name or name.lower() in ("n/a", "na", ""):
            skipped += 1
            continue
        _, was_created = Framing.objects.get_or_create(
            name=name[:100],
            defaults={"created_by": user, "modified_by": user},
        )
        if was_created:
            created += 1
        else:
            skipped += 1

    return {"created": created, "skipped": skipped, "errors": errors[:20]}


def import_colors(data, user):
    """Import rows into Colors. Expects color name column; optional hex column."""
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


IMPORTERS = {
    "lettering": import_lettering,
    "framing": import_framing,
    "colors": import_colors,
    "abbreviations": import_abbreviations,
    "rate_location": import_rate_location,
    "rate_value": import_rate_value,
    "parse_steps": import_parse_steps,
    "user_states": import_user_states,
    "pending_updates": import_pending_updates,
    "legacy_covers": import_legacy_covers,
}
