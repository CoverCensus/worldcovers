"""Route Covers with identified foreign strikes to the Florida review queue."""

from django.core.management.base import CommandError

from common.audit import log_cover_removed, log_cover_restored, log_marking_removed
from common.catalog_source_matching import decision
from common.models import (
    CatalogSourceItem, Collection, CoverMarking, CoverRecycleBin, Marking, MarkingRecycleBin, Region,
)

REASON = "Foreign Marking recorded as source evidence for Florida Cover review."


def foreign_markings(figure_rows):
    """Map each foreign strike's bundle Marking code to its decision mark.

    Uses the attributed strike location, independent of the letter's route.
    figure_rows are the parsed lines of the bundle's figure_review.jsonl. The
    Bodger munger assigns catalog codes (FPHC2-M-####) after the build, so the
    code is never rebuilt from the source id here; each deferred_cover row
    carries the final codes in the same order as its decision marks:
      {"source_id": "fphc-...-p0373-i003",
       "review": {"action": "deferred_cover", "markings": [{"region": "Spain", ...}]},
       "deferred_marking_codes": ["FPHC2-M-0911"]}
    """
    marks = {}
    for row in figure_rows:
        entry = row.get("review") or {}
        if entry.get("action") != "deferred_cover":
            continue
        codes = row.get("deferred_marking_codes")
        if codes is None or len(codes) != len(entry["markings"]):
            raise CommandError("Rebuild the FPHC bundle: figure_review lacks deferred Marking codes for "
                               + row["source_id"])
        for code, mark in zip(codes, entry["markings"]):
            if mark["region"] in ("England", "Spain"):
                marks[code] = mark
    return marks


def florida_review_collection(actor):
    region = Region.objects.get(code="USA-FL1")
    collection, _ = Collection.objects.select_for_update().get_or_create(
        region=region, defaults=dict(name=region.name, created_by=actor, modified_by=actor))
    if not collection.is_active:
        raise CommandError("The Florida Collection is inactive.")
    return collection


def withdraw_source_target(item, actor, queue, reason):
    is_mark = item.kind == "MARKING"
    if item.applied:
        obj = item.marking if is_mark else item.cover
        if (obj.code != item.source_key or item.decision["action"] != "create"
                or CatalogSourceItem.objects.filter(**{item.kind.lower(): obj}).exclude(pk=item.pk).exists()):
            raise CommandError("Cannot withdraw a shared catalog target: " + item.source_key)
        if is_mark and CoverMarking.objects.filter(marking=obj).exclude(cover__code__in=queue).exists():
            raise CommandError("Marking also belongs to a different Cover: " + item.source_key)
        bin_model = MarkingRecycleBin if is_mark else CoverRecycleBin
        if bin_model.objects.filter(**{item.kind.lower(): obj}).exclude(reason=reason).exists():
            raise CommandError("Entry was withdrawn for another reason: " + item.source_key)
        if is_mark:
            _, created = MarkingRecycleBin.objects.get_or_create(marking=obj, defaults=dict(removed_by=actor, reason=reason))
            if created:
                log_marking_removed(obj, actor, reason)
        else:
            _, created = CoverRecycleBin.objects.get_or_create(cover=obj, defaults=dict(removed_by=actor, reason=reason))
            if created:
                log_cover_removed(obj, actor, reason)
    if item.contribution_id and item.contribution.status != "pending":
        raise CommandError("Check the existing Editor decision before rerouting " + item.source_key)


def route_foreign_item(item, data, marks, actor, references, queue):
    from common.catalog_import import queue_entry, refresh_receipt

    is_mark = item.kind == "MARKING"
    if item.decision.get("foreign_review"):
        # An Editor's decision, including rejection, survives another import.
        if is_mark:
            if data != item.evidence:
                raise CommandError("Changed foreign Marking evidence: " + item.source_key)
        else:
            refresh_receipt(item, data, False)
        return "skip"

    if item.applied:
        refresh_receipt(item, data, False)
    withdraw_source_target(item, actor, queue, REASON)

    item.evidence = data
    item.applied = False
    item.decision = decision("withhold" if is_mark else "review", REASON)
    item.decision["foreign_review"] = True
    if is_mark:
        # No Marking submission: only the Cover requires an editorial decision.
        if item.contribution_id:
            raise CommandError("A separate foreign Marking submission already exists: " + item.source_key)
    else:
        collection = florida_review_collection(actor)
        foreign = [marks[r["marking"]] for r in data["cover_markings"] if r["marking"] in marks]
        item.decision["foreign_links"] = [r["marking"] for r in data["cover_markings"] if r["marking"] in marks]
        item.decision["foreign_text"] = "\n".join(
            f"{m['inscription']} ({m['office']}, {m['region']}). {m['reason']}" for m in foreign)
        queue_entry(item, collection, actor, "", references)
    item.save()
    return item.decision["action"]


def approve_foreign_cover(item, ticket, actor, marking_code, backstamp):
    from types import SimpleNamespace
    from common.api.v2.permissions import _user_is_responsible_for_marking
    from common.catalog_codes import strip_catalog_code_keys
    from common.catalog_source_approval import apply_catalog_entry
    from common.contribution_apply import ContributionApplyError

    item = CatalogSourceItem.objects.select_for_update().get(pk=item.pk)
    if item.kind != "COVER" or item.applied or not item.decision.get("foreign_review"):
        raise ContributionApplyError("This Cover is not pending foreign Marking review.")
    if strip_catalog_code_keys(ticket.submitted_data) != item.decision["review_payload"]:
        raise ContributionApplyError("The Cover submission differs from the source proposal.")
    selected = Marking.objects.select_for_update().filter(code=marking_code).first()
    if selected is None:
        raise ContributionApplyError("Select an existing catalog Marking by its code.")
    if not _user_is_responsible_for_marking(actor, selected):
        raise ContributionApplyError("Select a Marking within your assigned Collections.")
    obj = item.cover
    if obj:
        if obj.code != ticket.submitted_data["catalog_code"]:
            raise ContributionApplyError("Keep the existing Cover code.")
        removed, _ = CoverRecycleBin.objects.filter(cover=obj, reason=REASON).delete()
        if not removed:
            raise ContributionApplyError("The stored Cover is no longer in this review.")
        log_cover_restored(obj, actor)
    parents, links = [], []
    for link in item.evidence["cover_markings"]:
        foreign = link["marking"] in item.decision["foreign_links"]
        if foreign:
            if obj:
                old = CatalogSourceItem.objects.get(reference_work=item.reference_work,
                                                    kind="MARKING", source_key=link["marking"])
                CoverMarking.objects.filter(cover=obj, marking_id=old.marking_id).delete()
            continue
        parent = CatalogSourceItem.objects.get(reference_work=item.reference_work, kind="MARKING",
                                              source_key=link["marking"])
        if not parent.applied or not Marking.objects.filter(pk=parent.marking_id).exists():
            raise ContributionApplyError("Approve the linked catalog Marking before this Cover.")
        parents.append(parent)
        links.append(link)
    if all(p.marking_id != selected.pk for p in parents):
        parents.append(SimpleNamespace(marking_id=selected.pk, marking=selected))
        links.append({"is_backstamp": str(backstamp)})
    item.decision["editor_marking_code"] = selected.code
    return apply_catalog_entry(item, actor, ticket.submitted_data["catalog_code"], None, parents,
                               obj, [], cover_links=links)
