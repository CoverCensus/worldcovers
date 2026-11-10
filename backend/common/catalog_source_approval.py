"""Apply an Editor-approved catalog source item and preserve its evidence."""

from common.catalog_codes import strip_catalog_code_keys
from common.catalog_source_matching import (
    FIELDS,
    MODELS,
    RELATIONS,
    choose_cover,
    choose_marking,
    values,
)
from common.catalog_source_rows import source_citations
from common.models import (
    CatalogSourceItem,
    Citation,
    Collection,
    CoverMarking,
    CoverValuation,
    DateSeen,
    Image,
    Marking,
    ReferenceWork,
)


def attach_observations(item, obj, actor):
    stamp = {"created_by": actor, "modified_by": actor}
    subject = {"subject_type": item.kind, "subject_id": obj.pk}
    for code, detail in source_citations(item.evidence, item.reference_work.code):
        Citation.objects.get_or_create(
            reference_work=ReferenceWork.objects.get(code=code),
            **subject,
            citation_detail=detail,
            defaults=stamp,
        )
    for row in item.evidence.get("cover_valuations", []):
        attrs = values("cover_valuations", row, ("amt", "appraisal_date"))
        valuation, created = CoverValuation.objects.get_or_create(
            cover=obj,
            appraisal_date=attrs.get("appraisal_date"),
            defaults={**stamp, "amt": attrs.get("amt")},
        )
        if not created and valuation.amt is None and attrs.get("amt") is not None:
            valuation.amt = attrs["amt"]
            valuation.modified_by = actor
            valuation.save(update_fields=["amt", "modified_by", "modified_date"])
        elif not created and attrs.get("amt") is not None and valuation.amt != attrs["amt"]:
            raise ValueError("An existing Cover valuation differs from the source.")
    for row in item.evidence.get("dates_seen", []):
        attrs = values(
            "dates_seen", row, ("date", "granularity", "date_year", "date_month", "date_day")
        )
        DateSeen.objects.get_or_create(**subject, **attrs, defaults=stamp)
    for row in item.evidence.get("images", []):
        fields = (
            "original_filename",
            "file_checksum",
            "mime_type",
            "image_width",
            "image_height",
            "file_size_bytes",
            "image_view",
            "image_description",
            "is_tracing",
            "display_order",
        )
        attrs = values("images", row, fields)
        image, created = Image.objects.get_or_create(
            **subject,
            storage_filename=row["storage_filename"],
            defaults={**stamp, **attrs, "uploaded_by": actor},
        )
        if not created and (
            image.file_checksum != row["file_checksum"] or image.image_view != row["image_view"]
        ):
            raise ValueError("An existing Image has different source evidence.")


def approve_source_entry(item, contribution):
    from common.contribution_apply import ContributionApplyError

    Collection.objects.select_for_update().get(pk=contribution.collection_id)
    item = CatalogSourceItem.objects.select_for_update().get(pk=item.pk)
    if item.applied:
        raise ContributionApplyError("This source listing has already been approved.")
    if strip_catalog_code_keys(contribution.submitted_data) != item.decision["review_payload"]:
        raise ContributionApplyError(
            "The Submission differs from the import proposal. Refresh and review it again."
        )
    data = item.evidence
    row = data["row"]
    actor = contribution.contributor
    stamp = {"created_by": actor, "modified_by": actor}
    kind = item.kind
    attrs = values("markings" if kind == "MARKING" else "covers", row, FIELDS[kind])
    target = item.decision["target"]
    obj = MODELS[kind].objects.select_for_update().filter(pk=target).first() if target else None
    if obj and obj.code and contribution.submitted_data["catalog_code"] != obj.code:
        raise ContributionApplyError("The existing catalog code must be preserved.")
    if target and obj is None:
        raise ContributionApplyError("The proposed target has been removed.")
    if kind == "MARKING":
        office = CatalogSourceItem.objects.get(
            reference_work=item.reference_work, kind="OFFICE", source_key=row["post_office"]
        ).post_office
        if not office:
            raise ContributionApplyError("The resolved Post Office has been removed.")
        live = choose_marking(data, office, item.reference_work.code)
    else:
        parents = [
            CatalogSourceItem.objects.get(
                reference_work=item.reference_work, kind="MARKING", source_key=link["marking"]
            )
            for link in data["cover_markings"]
        ]
        if any(
            not p.applied or not Marking.objects.filter(pk=p.marking_id).exists() for p in parents
        ):
            raise ContributionApplyError("Approve the linked catalog Marking before this Cover.")
        live = choose_cover(data, parents)
    if live["target"] != target or set(live["fills"]) - set(item.decision["fills"]):
        raise ContributionApplyError(
            "The proposed match or blank fields changed. Refresh the catalog proposal."
        )
    if obj:
        for field in live["fills"]:
            setattr(obj, field, attrs[field])
        if live["fills"]:
            obj.modified_by = actor
            obj.full_clean()
            obj.save(update_fields=[*live["fills"], "modified_by", "modified_date"])
    else:
        if kind == "MARKING":
            attrs.update(post_office=office, catalog_txt=row["catalog_txt"])
        obj = MODELS[kind](code=contribution.submitted_data["catalog_code"], **attrs, **stamp)
        obj.full_clean()
        obj.save()
    attach_observations(item, obj, actor)
    setattr(item, RELATIONS[kind], obj)
    item.applied = True
    item.decision["filled"] = {field: row[field] for field in live["fills"]}
    item.save(update_fields=[RELATIONS[kind], "applied", "decision"])
    if kind == "MARKING":
        return obj
    links = []
    for p, link in zip(parents, data["cover_markings"], strict=True):
        attrs = values("cover_markings", link, ("is_backstamp", "placement", "contributor_comment"))
        saved, created = CoverMarking.objects.select_for_update().get_or_create(
            cover=obj,
            marking_id=p.marking_id,
            defaults={**stamp, **attrs, "review_status": CoverMarking.REVIEW_APPROVED},
        )
        if not created:
            missing = [field for field in attrs if getattr(saved, field) in (None, "")]
            for field in missing:
                setattr(saved, field, attrs[field])
            if missing:
                saved.modified_by = actor
                saved.save(update_fields=[*missing, "modified_by", "modified_date"])
        links.append(saved)
    return {
        "kind": "cover",
        "cover": obj,
        "cover_marking": links[0],
        "parent_marking": parents[0].marking,
    }
