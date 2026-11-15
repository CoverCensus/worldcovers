"""Route FPHC figures with an unidentified Post Office to Florida Editors."""

from common.api.v2.permissions import user_is_responsible_for_post_office
from common.audit import log_cover_restored, log_marking_restored
from common.catalog_codes import strip_catalog_code_keys
from common.catalog_source_approval import apply_catalog_entry
from common.catalog_source_matching import decision
from common.contribution_apply import ContributionApplyError
from common.fphc_foreign_review import florida_review_collection, withdraw_source_target
from common.models import CatalogSourceItem, CoverRecycleBin, Marking, MarkingRecycleBin, PostOffice

REASON = "Identify the Post Office for the FPHC Marking."
OFFICE_PREFIX = "unidentified office"


def review_links(items):
    offices = {code for (kind, code), data in items.items()
               if kind == "OFFICE" and data["row"]["name"].strip().lower().startswith(OFFICE_PREFIX)}
    marks = {code: [] for (kind, code), data in items.items()
             if kind == "MARKING" and data["row"]["post_office"] in offices}
    covers = {}
    for (kind, code), data in items.items():
        if kind != "COVER":
            continue
        for link in data["cover_markings"]:
            if link["marking"] in marks:
                marks[link["marking"]].append(code)
                covers.setdefault(code, []).append(link["marking"])
    return marks, covers


def queue_office_review(item, data, items, marks, covers, actor, references):
    from common.catalog_import import queue_entry, refresh_receipt

    if item.decision.get("office_review"):
        refresh_receipt(item, data, False)
        return "skip"
    if item.applied or item.contribution_id:
        refresh_receipt(item, data, False)
    # A queued match was only proposed. Leave the existing catalog target alone.
    if not item.applied:
        if item.kind == "MARKING":
            item.marking = None
        else:
            item.cover = None
    withdraw_source_target(item, actor, covers, REASON)
    item.applied = False
    item.decision = decision("review", REASON)
    item.decision["office_review"] = True
    is_mark = item.kind == "MARKING"
    linked = (marks if is_mark else covers)[item.source_key]
    images = []
    town = ""
    if is_mark:
        town = items["OFFICE", data["row"]["post_office"]]["row"]["name"]
        for code in linked:
            images.extend(items["COVER", code].get("images", []))
    message = ("Cover evidence: " if is_mark else "Approve the linked Marking first: ") + ", ".join(linked)
    queue_entry(item, florida_review_collection(actor), actor, town, references,
                review_note=message, cover_images=images)
    item.save()
    return "review"


def approve_office_review(item, ticket, actor, office_code):
    item = CatalogSourceItem.objects.select_for_update().get(pk=item.pk)
    if item.applied or not item.decision.get("office_review"):
        raise ContributionApplyError("This Entry is no longer pending office review.")
    if strip_catalog_code_keys(ticket.submitted_data) != item.decision["review_payload"]:
        raise ContributionApplyError("The submission differs from the source proposal.")
    office, parents = None, []
    if item.kind == "MARKING":
        office = PostOffice.objects.select_for_update().filter(code=office_code).first() if office_code else None
        if not office or office.name.strip().lower().startswith(OFFICE_PREFIX):
            raise ContributionApplyError("Select an identified Post Office by its catalog code.")
        if not user_is_responsible_for_post_office(actor, office):
            raise ContributionApplyError("Select a Post Office within your assigned Collections.")
        obj, bin_model, log_restore = item.marking, MarkingRecycleBin, log_marking_restored
        item.decision["editor_office_code"] = office.code
    else:
        for link in item.evidence["cover_markings"]:
            parent = CatalogSourceItem.objects.get(reference_work=item.reference_work, kind="MARKING",
                                                   source_key=link["marking"])
            if not parent.applied or not Marking.objects.filter(pk=parent.marking_id).exists():
                raise ContributionApplyError("Approve the linked Marking before this Cover.")
            parents.append(parent)
        obj, bin_model, log_restore = item.cover, CoverRecycleBin, log_cover_restored
    code = ticket.submitted_data["catalog_code"]
    if obj:
        if obj.code != code:
            raise ContributionApplyError("Keep the existing catalog code.")
        removed, _ = bin_model.objects.filter(**{item.kind.lower(): obj}, reason=REASON).delete()
        if not removed:
            raise ContributionApplyError("The stored Entry is no longer in office review.")
        if office:
            obj.post_office = office
            obj.modified_by = actor
            obj.save(update_fields=["post_office", "modified_by", "modified_date"])
        log_restore(obj, actor)
    return apply_catalog_entry(item, actor, code, office, parents, obj, [])
