"""Reconcile a prepared catalog bundle against the catalog and queue Entries."""

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

from django.core.management.base import CommandError
from django.db import transaction

from common.catalog_bundle import RESOURCES, _load_dataset
from common.fphc_foreign_review import route_foreign_item
from common.catalog_source_approval import apply_catalog_entry
from common.catalog_codes import strip_catalog_code_keys
from common.catalog_source_matching import (
    FIELDS,
    MODELS,
    RELATIONS,
    choose_cover,
    choose_marking,
    decision,
    office_key,
    values,
)
from common.catalog_source_rows import source_citations, source_items
from common.models import (
    CatalogSourceItem,
    Citation,
    Collection,
    Contribution,
    PostOffice,
    PostOfficeRegion,
    ReferenceWork,
    Region,
)


def queue_entry(item, collection, actor, town, references, parent_id=None, *, review_note="", cover_images=()):
    source = item.evidence
    row = source["row"]
    plan = item.decision
    citations = source_citations(source, item.reference_work.code)
    payload = {
        "submission_kind": item.kind.lower(),
        "state": collection.region.name,
        "town": town,
        "type": row["type"],
        "comment_for_editor": (
            f"{item.source_key}: {plan['action']}. {plan['reason']}. "
            f"Fill: {', '.join(plan['fills']) or 'none'}. "
            f"Candidates: {plan['candidates']}. Source: "
            + (row.get("catalog_txt") or row.get("description", ""))
        ),
        "reference_work_ids": list(dict.fromkeys(references[code] for code, _ in citations)),
        "reference_work_details": [
            {
                "reference_work_id": references[code],
                "page_number": detail.removeprefix("p. "),
            }
            for code, detail in citations
        ],
    }
    target = getattr(item, RELATIONS[item.kind])
    if target:
        cited = Citation.objects.filter(subject_type=item.kind, subject_id=target.pk)
        for ref_id, detail in cited.values_list("reference_work_id", "citation_detail"):
            if ref_id not in payload["reference_work_ids"]:
                payload["reference_work_ids"].append(ref_id)
            locator = {"reference_work_id": ref_id, "page_number": detail.removeprefix("p. ")}
            if locator not in payload["reference_work_details"]:
                payload["reference_work_details"].append(locator)
    for field in FIELDS[item.kind]:
        if target and not plan.get("office_review") and field not in plan["fills"] and field not in ("type",):
            continue
        if row.get(field) not in ("", None):
            value = row[field]
            if field in ("is_irreg", "is_manuscript", "is_institutional", "has_adhesive"):
                value = MODELS[item.kind]._meta.get_field(field).to_python(value)
            payload[field + "_mm" if field in ("width", "height") else field] = value
    if target:
        payload["edit_" + item.kind.lower() + "_id"] = target.pk
    if parent_id:
        payload["parent_marking_id"] = parent_id
    # Source identity stays on the receipt even when an Editor assigns a code.
    payload["catalog_code"] = target.code if target and target.code else item.source_key
    if review_note:
        payload["comment_for_editor"] += "\n" + review_note
        if item.kind == "MARKING":
            payload["requires_catalog_office"] = True
    for image_kind, image_rows in ((item.kind.lower(), source.get("images", [])), ("cover", cover_images)):
        if not image_rows:
            continue
        shown = (
            "storage_filename",
            "original_filename",
            "image_description",
            "file_checksum",
            "mime_type",
            "file_size_bytes",
            "image_width",
            "image_height",
        )
        payload[image_kind + "_image_metas"] = [
            {k: r[k] for k in shown if k in r} for r in image_rows
        ]
    if item.kind == "MARKING":
        payload["marking_dates_seen"] = [
            {
                k: v
                for k, v in r.items()
                if k in ("granularity", "date", "date_year", "date_month", "date_day") and v
            }
            for r in source.get("dates_seen", [])
        ]
    if plan.get("foreign_review"):
        payload["requires_catalog_marking"] = True
        payload["comment_for_editor"] += "\n" + plan["foreign_text"]
    if item.kind == "COVER" and (plan.get("foreign_review") or plan.get("office_review")):
        for obs in source.get("dates_seen", [])[:1]:
            payload["cover_date"] = obs["date"]
            payload["cover_granularity"] = obs["granularity"]
            for part in ("year", "month", "day"):
                if obs.get("date_" + part):
                    payload["cover_date_" + part] = int(obs["date_" + part])
    # A queued import is a proposal against specific evidence. Do not apply
    # different fields from those an Editor saw after a Submission revision.
    item.decision["review_payload"] = strip_catalog_code_keys(payload)
    if item.contribution_id:
        ticket = item.contribution
        ticket.submitted_data = payload
        ticket.save(update_fields=["submitted_data", "modified_date"])
    else:
        item.contribution = Contribution.objects.create(
            collection=collection,
            contributor=actor,
            created_by=actor,
            modified_by=actor,
            submitted_data=payload,
            status=Contribution.STATUS_PENDING,
        )


def write_review_report(report, items, results, edition):
    ids = defaultdict(set)
    for kind, _, _, plan in results:
        ids[kind].update(plan["candidates"])
    codes = {
        kind: dict(MODELS[kind].objects.filter(pk__in=pks).values_list("pk", "code"))
        for kind, pks in ids.items()
    }
    with Path(report).open("w", encoding="ascii", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(
            (
                "kind",
                "source_key",
                "action",
                "target_code",
                "target_id",
                "reason",
                "fill_values",
                "source_text",
                "citation",
                "candidates",
                "candidate_codes",
            )
        )
        for kind, code, action, plan in results:
            data = items[kind, code]
            row = data["row"]
            filled = {field: row[field] for field in plan["fills"]}
            text = row.get("catalog_txt") or row.get("description") or row.get("name", "")
            writer.writerow(
                (
                    kind,
                    code,
                    action,
                    plan.get("target_code") or codes[kind].get(plan["target"], ""),
                    plan["target"],
                    plan["reason"],
                    json.dumps(filled),
                    text.encode("ascii", "backslashreplace").decode(),
                    ", ".join(
                        f"{ref} {detail}".strip() for ref, detail in source_citations(data, edition)
                    )
                    if kind != "OFFICE"
                    else "",
                    json.dumps(plan["candidates"]),
                    json.dumps([codes[kind].get(pk) for pk in plan["candidates"]]),
                )
            )


def refresh_receipt(item: CatalogSourceItem, data: dict, refresh: bool) -> bool:
    code = item.source_key
    if item.applied and not getattr(item, RELATIONS[item.kind] + "_id"):
        raise CommandError(f"The saved target of {code} was removed. Review its source mapping.")
    if not item.applied and not item.contribution_id:
        raise CommandError(f"The Submission for {code} was removed. Review its source mapping.")
    pending = not item.applied and item.contribution.status == Contribution.STATUS_PENDING
    saved = item.evidence
    # The standalone review 19 supplement kept extra source notes on receipts
    # and flattened line breaks in image captions. Preserve those old notes.
    if (item.applied or item.decision.get("office_review")) and "source_evidence" in saved and "source_sha256" in saved:
        saved = {k: v for k, v in saved.items() if k not in ("source_evidence", "source_sha256")}
        if "images" in saved and len(saved["images"]) == len(data.get("images", [])):
            imgs = []
            for old, new in zip(saved["images"], data["images"], strict=True):
                if old["image_description"].split() == new["image_description"].split():
                    old = dict(old, image_description=new["image_description"])
                imgs.append(old)
            saved = dict(saved, images=imgs)
    if saved != data:
        delta = {
            key: {"saved": item.evidence.get(key), "incoming": data.get(key)}
            for key in item.evidence.keys() | data.keys()
            if item.evidence.get(key) != data.get(key)
        }
        if not (refresh and pending):
            raise CommandError(f"Source {code} changed: {json.dumps(delta, ensure_ascii=True)}")
        item.evidence = data
    return refresh and pending


def load_lookups(directory, actor, allow_missing):
    for stem in ("colors", "letterings", "shapes", "regions", "reference_works"):
        if allow_missing and not (directory / (stem + ".csv")).exists():
            continue
        dataset = _load_dataset(directory / (stem + ".csv"))
        audit_columns = [
            dataset.headers.index(name)
            for name in ("created_by", "modified_by")
            if name in dataset.headers
        ]
        for index, record in enumerate(dataset):
            record = list(record)
            for column in audit_columns:
                record[column] = str(actor.pk)
            dataset[index] = record
        RESOURCES[stem]().import_data(dataset, raise_errors=True)


def office_candidates(items, edition, actor, publish=False):
    regions = Region.objects.filter(region_tier__in=("STATE", "TERRITORY", "DISTRICT"))
    by_code = {r.code: r for r in regions}
    office_regions = {}
    office_names = Counter()
    for (kind, code), data in items.items():
        if kind == "OFFICE":
            links = data.get("post_office_regions", [])
            linked = {r["region"] for r in links} & by_code.keys()
            if not links and edition == "FPHC2" and code.startswith("FPHC2-O-"):
                office_regions[code] = None
                continue
            if len(linked) != 1:
                raise CommandError(f"Expected one Collection Region for Post Office {code}.")
            region = by_code[linked.pop()]
            office_regions[code] = region
            office_names[region.abbrev, office_key(data["row"]["name"])] += 1
    collections = {}
    queue_regions = {r for r in office_regions.values() if r} if not publish else set()
    if not publish and None in office_regions.values():
        queue_regions.add(by_code["USA-FL1"])
    for region in sorted(queue_regions, key=lambda r: r.pk):
        collection, _ = Collection.objects.select_for_update().get_or_create(
            region=region, defaults={"name": region.name, "created_by": actor, "modified_by": actor}
        )
        if not collection.is_active:
            raise CommandError(f"The {region.name} Collection is inactive.")
        collections[region.pk] = collection
    offices = defaultdict(list)
    for region_abbrev in {r.abbrev for r in office_regions.values() if r}:
        local = PostOffice.objects.filter(
            post_office_regions__region__in=regions.filter(abbrev=region_abbrev)
        ).distinct()
        for obj in local:
            offices[region_abbrev, office_key(obj.name)].append(obj)
    return office_regions, collections, offices, office_names


def import_catalog(
    directory, actor, dry_run, stdout, report, refresh=False, *, edition=None, allow_missing=False, publish=False, foreign=None
):
    report = Path(report)
    protected = {directory / (stem + ".csv") for stem in RESOURCES}
    protected.update(
        directory / name
        for name in (
            "fphc_manifest.json",
            "source_marking_map.csv",
            "fphc_pipeline_warnings.csv",
            "v1_pipeline_warnings.csv",
        )
    )
    if report.resolve() in {path.resolve() for path in protected}:
        raise CommandError("Choose a report path outside the bundle input files.")
    edition, items = source_items(directory, edition, allow_missing)
    foreign = foreign or {}
    if any(("MARKING", code) not in items for code in foreign):
        raise CommandError("Foreign Marking decision does not name a bundle Marking.")
    review_covers = {code for (kind, code), data in items.items() if kind == "COVER"
                     and any(link["marking"] in foreign for link in data["cover_markings"])}
    from common.fphc_office_review import queue_office_review, review_links
    office_marks, office_covers = review_links(items) if edition == "FPHC2" else ({}, {})
    results = []
    with transaction.atomic():
        load_lookups(directory, actor, allow_missing)
        ref = ReferenceWork.objects.get(code=edition)
        references = dict(ReferenceWork.objects.values_list("code", "pk"))
        office_regions, collections, offices, office_names = office_candidates(
            items, edition, actor, publish
        )
        def queue_collection(office_code):
            region = office_regions[office_code]
            if region is None:
                return next(c for c in collections.values() if c.region.code == "USA-FL1")
            return collections[region.pk]

        bindings = {}
        for (kind, code), data in items.items():
            item, fresh = CatalogSourceItem.objects.select_for_update().get_or_create(
                reference_work=ref,
                kind=kind,
                source_key=code,
                defaults={"evidence": data, "decision": {}},
            )
            bindings[kind, code] = item
            if (kind == "MARKING" and code in foreign) or (kind == "COVER" and code in review_covers):
                action = route_foreign_item(item, data, foreign, actor, references, review_covers)
                results.append((kind, code, action, item.decision))
                continue
            if (kind == "MARKING" and code in office_marks) or (kind == "COVER" and code in office_covers):
                action = queue_office_review(item, data, items, office_marks, office_covers, actor, references)
                results.append((kind, code, action, item.decision))
                continue
            if not fresh and not refresh_receipt(item, data, refresh):
                if publish and not item.applied:
                    if item.contribution.status != Contribution.STATUS_PENDING:
                        raise CommandError(f"Cannot publish {code} with status {item.contribution.status}.")
                    from common.api.v2.views import _approve_contribution
                    _approve_contribution(item.contribution, actor=actor, review_notes="Catalog import")
                    item.refresh_from_db()
                    results.append((kind, code, item.decision["action"], item.decision))
                    continue
                results.append((kind, code, "skip", item.decision))
                continue
            model = MODELS[kind]
            row = data["row"]
            if kind == "OFFICE":
                region = office_regions[code]
                name_key = (region.abbrev if region else None, office_key(row["name"]))
            old = model.objects.filter(code=code).first()
            if old and fresh:
                # Adopt a previous direct import only when provenance agrees.
                if kind == "OFFICE":
                    verified = old.name == row["name"] and (old in offices[name_key] if region else not old.post_office_regions.exists())
                elif kind == "COVER" and not data.get("citations"):
                    # Earlier ASCC bundles cited the parent Marking only.
                    verified = all(
                        old.cover_markings.filter(
                            marking_id=bindings["MARKING", link["marking"]].marking_id
                        ).exists()
                        for link in data["cover_markings"]
                    )
                else:
                    verified = (
                        kind != "MARKING" or old.catalog_txt == row["catalog_txt"]
                    ) and Citation.objects.filter(
                        reference_work__code__in=[c for c, _ in source_citations(data, edition)],
                        subject_type=kind,
                        subject_id=old.pk,
                    ).exists()
                if not verified:
                    raise CommandError(f"Existing code {code} has different provenance.")
                setattr(item, RELATIONS[kind], old)
                item.decision = decision("existing", "Previously imported source code", old)
                item.applied = True
            elif kind == "OFFICE":
                candidates = offices[name_key]
                if len(candidates) == 1 and office_names[name_key] == 1:
                    obj = candidates[0]
                    item.decision = decision("reuse", f"Unique {region.name} office name", obj)
                else:
                    obj = PostOffice.objects.create(
                        name=row["name"], code=code, created_by=actor, modified_by=actor
                    )
                    item.decision = decision(
                        "create",
                        "No unique office in the source jurisdiction",
                        candidates=[c.pk for c in candidates],
                    )
                item.post_office = obj
                for link in data.get("post_office_regions", []):
                    attrs = values(
                        "post_office_regions", link, ("region", "valid_from", "valid_to")
                    )
                    PostOfficeRegion.objects.get_or_create(
                        post_office=obj,
                        region=attrs["region"],
                        valid_from=attrs.get("valid_from"),
                        defaults={
                            "valid_to": attrs.get("valid_to"),
                            "created_by": actor,
                            "modified_by": actor,
                        },
                    )
                item.applied = True
            else:
                if kind == "MARKING":
                    office_code = row["post_office"]
                    parents = []
                    office = bindings["OFFICE", office_code].post_office
                    item.decision = choose_marking(data, office, edition)
                else:
                    parents = [bindings["MARKING", link["marking"]] for link in data["cover_markings"]]
                    office_code = parents[0].evidence["row"]["post_office"]
                    office = bindings["OFFICE", office_code].post_office
                    item.decision = choose_cover(data, parents)
                target = item.decision["target"]
                setattr(item, RELATIONS[kind] + "_id", target)
                if publish:
                    obj = model.objects.select_for_update().get(pk=target) if target else None
                    apply_catalog_entry(item, actor, code, office, parents, obj, item.decision["fills"])
                else:
                    queue_entry(item, queue_collection(office_code), actor, office.name, references,
                                parents[0].marking_id if parents else None)
            item.save()
            results.append((kind, code, item.decision["action"], item.decision))
        write_review_report(report, items, results, edition)
        if dry_run:
            transaction.set_rollback(True)
    counts = Counter((kind, action) for kind, _, action, _ in results)
    stdout.write("Dry run rolled back." if dry_run else ("Main catalog import complete." if publish else "Import review complete."))
    for (kind, action), count in sorted(counts.items()):
        stdout.write(f"  {kind} {action}: {count}")
