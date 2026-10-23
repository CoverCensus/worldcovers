"""
Current values of an edit's target, in the keys the edit forms submit (T39).

The review page sets these beside a pending edit so an Editor can see what
approval will change. Each value mirrors what the edit form prefills from the
record (Contribute.tsx for Markings, CoverEdit.tsx for Covers), so a field the
Contributor left alone compares equal to the submission.
"""
import re

from common.models import Citation, DateSeen

_URL_TAIL = re.compile(r"https?://\S+$")
_LEGACY_PAGE = re.compile(r"^Page number:\s*(.*)$", re.IGNORECASE | re.MULTILINE)
_LEGACY_URL = re.compile(r"^Citation url:\s*(.*)$", re.IGNORECASE | re.MULTILINE)


def _citation_detail_parts(text):
    """Split a stored citation_detail into (page_number, url) the way the
    forms' parseCitationDetail (lib/submissionCitations.ts) does."""
    legacy_page = _LEGACY_PAGE.search(text)
    legacy_url = _LEGACY_URL.search(text)
    if legacy_page or legacy_url:
        return (
            legacy_page.group(1).strip() if legacy_page else "",
            legacy_url.group(1).strip() if legacy_url else "",
        )
    url_match = _URL_TAIL.search(text)
    url = url_match.group(0) if url_match else ""
    page = text[: len(text) - len(url)] if url else text
    page = re.sub(r"^p\.\s*", "", re.sub(r"\s+-\s*$", "", page)).strip()
    return page, url


def _citation_keys(citations):
    """citations: (reference_work_id, citation_detail) pairs in record order."""
    ids, details = [], []
    for reference_work_id, detail in citations:
        page_number, url = _citation_detail_parts(str(detail or ""))
        ids.append(reference_work_id)
        details.append(
            {"reference_work_id": reference_work_id, "page_number": page_number, "url": url}
        )
    return {"reference_work_ids": ids, "reference_work_details": details}


def _digits(value):
    # The Marking form keeps only digits and dots when it prefills a size.
    return re.sub(r"[^0-9.]", "", "" if value is None else str(value))


def marking_edit_baseline(record):
    """Map a MarkingSerializer representation (what the edit form prefills
    from) to the submit keys of a Marking edit."""
    counties = [
        r for r in record.get("regions") or []
        if str(r.get("region_tier") or "").upper() == "COUNTY"
    ]
    county = counties[0] if counties else None
    baseline = {
        "state": record.get("state") or "",
        # A re-picked state may come back as its abbreviation; the page
        # treats either as the same state.
        "state_abbrev": record.get("state_abbrev") or "",
        "town": record.get("town") or "",
        # Trello T70: the town's county, from its region links (current-first;
        # a town with several county links shows the first). "" / None when
        # the town has no county link, so the comparison can say "Approval
        # links the town to this county".
        "county": county["name"] if county else "",
        "county_id": county["id"] if county else None,
        "type": record.get("type") or "",
        "catalog_code": (record.get("code") or "").strip(),
        "inscription_txt": record.get("inscription_txt") or "",
        "is_manuscript": bool(record.get("is_manuscript")),
        "is_irreg": bool(record.get("is_irreg")),
        "shape": record.get("shape_name") or "",
        "shape_id": record.get("shape"),
        "color": record.get("color_name") or "",
        "color_id": record.get("color"),
        "lettering_id": record.get("lettering"),
        "lettering_style_name": record.get("lettering_name") or "",
        "width_mm": _digits(record.get("width")),
        "height_mm": _digits(record.get("height")),
        "impression": record.get("impression") or "",
        "rate_val": "" if record.get("rate_val") is None else str(record["rate_val"]),
        "date_fmt": record.get("date_fmt") or "",
        "desc": record.get("desc") or "",
    }
    for prefix, field in (("marking_erd", "earliest_seen"), ("marking_lrd", "latest_seen")):
        if record.get(field):
            baseline[prefix] = record[field]
            baseline[f"{prefix}_granularity"] = record.get(f"{field}_granularity") or ""
    baseline.update(
        _citation_keys(
            (row.get("reference_work"), row.get("citation_detail"))
            for row in record.get("citations") or []
        )
    )
    return baseline


def cover_edit_baseline(cover, cover_marking):
    """The submit keys of a Cover edit, from the Cover and the CoverMarking
    link the edit targets (the link carries is_backstamp)."""
    baseline = {
        "type": cover.type or "",
        "is_institutional": bool(cover.is_institutional),
        "is_backstamp": bool(cover_marking.is_backstamp) if cover_marking else False,
        "description": cover.description or "",
    }
    seen = DateSeen.objects.filter(
        subject_type=DateSeen.SUBJECT_COVER, subject_id=cover.pk
    ).first()
    if seen is None or (seen.date_year is None and seen.date is None):
        baseline["cover_date_unknown"] = True
    elif seen.date_year is None:
        # Older rows carry only a date and its granularity.
        baseline["cover_date"] = seen.date.isoformat()
        baseline["cover_granularity"] = seen.granularity or ""
    else:
        baseline["cover_date_year"] = str(seen.date_year)
        if seen.date_month:
            baseline["cover_date_month"] = str(seen.date_month)
        if seen.date_day:
            baseline["cover_date_day"] = str(seen.date_day)
    baseline.update(
        _citation_keys(
            Citation.objects.filter(subject_type="COVER", subject_id=cover.pk)
            .order_by("pk")
            .values_list("reference_work_id", "citation_detail")
        )
    )
    return baseline
