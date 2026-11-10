"""Candidate and conflict rules for catalog source listings."""

import json
import re
from decimal import Decimal

from common.catalog_bundle import RESOURCES
from common.matching import inscription_key, town_match_key
from common.models import (
    CatalogSourceItem,
    Cover,
    CoverMarking,
    DateSeen,
    Image,
    Marking,
    PostOffice,
)

MODELS = {"OFFICE": PostOffice, "MARKING": Marking, "COVER": Cover}
RELATIONS = {"OFFICE": "post_office", "MARKING": "marking", "COVER": "cover"}
FIELDS = {
    "MARKING": (
        "type",
        "inscription_txt",
        "is_manuscript",
        "is_irreg",
        "color",
        "shape",
        "lettering",
        "width",
        "height",
        "date_fmt",
        "impression",
        "rate_val",
        "desc",
    ),
    "COVER": (
        "type",
        "description",
        "color",
        "width",
        "height",
        "has_adhesive",
        "is_institutional",
    ),
}


def values(stem, row, names):
    resource = RESOURCES[stem]()
    return {
        name: resource.fields[name].clean(row) for name in names if row.get(name) not in ("", None)
    }


def legend(text):
    # Preserve ornaments, state abbreviations, and punctuation within a legend.
    return re.sub(r"\s*/\s*", "/", " ".join(text.upper().split()))


def differences(kind, obj, attrs):
    fills, conflicts = [], []
    for field, incoming in attrs.items():
        old = getattr(obj, field)
        if kind == "COVER" and field == "type" and incoming == "UNK":
            continue
        if old in (None, "") or (kind == "COVER" and field == "type" and old == "UNK"):
            fills.append(field)
        elif field == "inscription_txt" and legend(old) == legend(incoming):
            continue
        elif old != incoming:
            conflicts.append(field)
    return fills, conflicts


def full_dates(data):
    return {r["date"] for r in data.get("dates_seen", []) if r["granularity"] == "DAY"}


def office_key(name):
    return town_match_key(re.sub(r"\s*\(C\.?\s*H\.?\)$", "", name, flags=re.IGNORECASE))


def decision(action, reason, target=None, fills=(), candidates=()):
    return {
        "action": action,
        "reason": reason,
        "target": target.pk if target else None,
        "target_code": target.code if target else None,
        "fills": list(fills),
        "candidates": list(candidates),
    }


def printed_size_conflicts(text, width, height):
    sizes = re.findall(r"(\d+(?:\.\d+)?)\s*[xX\u00d7]\s*(\d+(?:\.\d+)?)", text or "")
    return any(
        (width is not None and Decimal(w) != width) or (height is not None and Decimal(h) != height)
        for w, h in sizes
    )


def unresolved_ink_or_size(text, color, width):
    try:
        printed = json.loads(text or "")
    except ValueError:
        printed = None
    return (
        isinstance(printed, list)
        and len(printed) == 8
        and ((printed[4] and not color) or (printed[5] and not width))
    )


def choose_marking(data, office, edition):
    row = data["row"]
    attrs = values("markings", row, FIELDS["MARKING"])
    matches = []
    candidates = []
    reasons = []
    # Earlier creates are separate source listings in this edition.
    created = CatalogSourceItem.objects.filter(
        reference_work__code=edition,
        kind="MARKING",
        applied=True,
        decision__action__in=("create", "existing"),
        marking_id__isnull=False,
    ).values("marking_id")
    pool = (
        Marking.objects.filter(post_office=office, type=row["type"])
        .exclude(pk__in=created)
        .exclude(code__startswith=edition + "-")
        .select_related("shape", "color", "lettering")
    )
    words = legend(row["inscription_txt"])
    broad_key = inscription_key(re.sub(r"\s*\([^)]*\)$", "", words))
    days = full_dates(data)
    for obj in pool:
        if legend(obj.inscription_txt) != words:
            if inscription_key(obj.inscription_txt) == broad_key:
                candidates.append(obj.pk)
                reasons.append(f"{obj.pk} inscription or lettering differs")
            continue
        candidates.append(obj.pk)
        fills, conflicts = differences("MARKING", obj, attrs)
        if (
            ("width" in fills or "height" in fills)
            and printed_size_conflicts(obj.catalog_txt, attrs.get("width"), attrs.get("height"))
        ) or (
            (attrs.get("width") is None or attrs.get("height") is None)
            and printed_size_conflicts(row.get("catalog_txt"), obj.width, obj.height)
        ):
            conflicts.append("dimensions in catalog text")
        if unresolved_ink_or_size(
            row.get("catalog_txt"), attrs.get("color"), attrs.get("width")
        ) or (unresolved_ink_or_size(obj.catalog_txt, obj.color_id, obj.width)):
            conflicts.append("unmapped source ink or dimensions")
        if conflicts:
            reasons.append(f"{obj.pk} differs on " + ", ".join(conflicts))
            continue
        same_day = (
            days
            and DateSeen.objects.filter(
                subject_type="MARKING", subject_id=obj.pk, granularity="DAY", date__in=days
            ).exists()
        )
        w, h = attrs.get("width"), attrs.get("height")
        same_size = w and obj.width == w and (obj.height or w) == (h or w)
        same_ink = obj.color_id and attrs.get("color") == obj.color
        if (obj.type == "TOWNMARK" and same_day) or (same_size and same_ink):
            if (
                obj.earliest_seen_granularity == "DAY"
                and obj.latest_seen_granularity == "DAY"
                and obj.earliest_seen
                and obj.latest_seen
                and days
                and len(days) == len(data.get("dates_seen", []))
                and (
                    max(days) < obj.earliest_seen.isoformat()
                    or min(days) > obj.latest_seen.isoformat()
                )
            ):
                reasons.append(f"{obj.pk} has a separate observed date range")
                continue
            why = "same full date" if same_day else "matching dimensions and ink"
            matches.append((obj, fills, why))
    if len(matches) == 1:
        target, fills, why = matches[0]
        return decision("reuse", "Office and inscription agree, " + why, target, fills, candidates)
    if len(matches) > 1:
        reasons.insert(
            0, "Multiple corroborated Markings: " + ", ".join(str(m.pk) for m, _, _ in matches)
        )
    reason = "; ".join(reasons) or "No unique corroborated Marking"
    return decision("create", reason, candidates=candidates)


def choose_cover(data, parent_items):
    # Require an identical whole-cover scan AND a common resolved Marking.
    parents = [item.marking_id for item in parent_items if item.marking_id]
    checksums = [
        i["file_checksum"]
        for i in data.get("images", [])
        if i["image_view"] in ("FRONT", "BACK") and i["file_checksum"]
    ]
    subjects = Image.objects.filter(
        subject_type="COVER", image_view__in=("FRONT", "BACK"), file_checksum__in=checksums
    ).values("subject_id")
    edition = parent_items[0].reference_work
    same_edition = CatalogSourceItem.objects.filter(
        reference_work=edition,
        kind="COVER",
        applied=True,
        decision__action__in=("create", "existing"),
        cover_id__isnull=False,
    ).values("cover_id")
    candidates = list(
        Cover.objects.filter(pk__in=subjects, cover_markings__marking_id__in=parents)
        .exclude(pk__in=same_edition)
        .exclude(code__startswith=edition.code + "-")
        .distinct()
    )
    if len(candidates) == 1:
        obj = candidates[0]
        fills, conflicts = differences("COVER", obj, values("covers", data["row"], FIELDS["COVER"]))
        for row in data.get("cover_valuations", []):
            appraisal = values("cover_valuations", row, ("amt", "appraisal_date"))
            if (
                appraisal.get("amt") is not None
                and obj.valuations.filter(
                    appraisal_date=appraisal.get("appraisal_date"),
                    amt__isnull=False,
                )
                .exclude(amt=appraisal["amt"])
                .exists()
            ):
                conflicts.append("valuation")
        for p, link in zip(parent_items, data["cover_markings"], strict=True):
            existing = CoverMarking.objects.filter(cover=obj, marking_id=p.marking_id).first()
            if existing:
                proposed = values("cover_markings", link, ("is_backstamp", "placement"))
                conflicts.extend(
                    k
                    for k, v in proposed.items()
                    if getattr(existing, k) not in (None, "") and getattr(existing, k) != v
                )
        if not conflicts:
            return decision(
                "reuse", "Whole-cover scan and linked Marking agree", obj, fills, [obj.pk]
            )
    return decision(
        "create", "No unique compatible physical Cover", candidates=[c.pk for c in candidates]
    )
