"""Use a verified Collection transfer to guard source state removal."""

import json
from pathlib import Path

from django.core.management.base import CommandError
from django.db import transaction
from django.db.models import Q
from reversion.models import Revision, Version

from common import models as catalog
from common.collection_archive import (
    JSON_REFS,
    collection_scope,
    digest,
    export_payload,
    instance_identity,
    load_bundle,
)
from common.date_range import suppress_date_range_recompute


def remove_transferred_collection(
    region: catalog.Region, bundle: Path, report_path: Path, dry_run: bool,
) -> list[tuple[str, int]]:
    manifest, records = load_bundle(bundle)
    try:
        report = json.loads(report_path.read_text(encoding="ascii"))
    except (OSError, ValueError) as exc:
        raise CommandError("Cannot read the Collection verification report.") from exc
    if (not isinstance(report, dict)
            or report.get("schema") != "worldcovers.collection_verification.v1"
            or report.get("passed") is not True):
        raise CommandError("A passing Collection verification report is required.")
    if (report.get("manifest_sha256") != digest(manifest)
            or report.get("records_sha256") != manifest["records_sha256"]
            or report.get("collection") != manifest["collection"]
            or report.get("source_instance") != manifest["source_instance"]):
        raise CommandError("Verification report does not match this bundle.")
    if not report.get("target_instance") or report["target_instance"] == manifest["source_instance"]:
        raise CommandError("Verification must be from a different WorldCovers instance.")
    if manifest["source_instance"] != instance_identity():
        raise CommandError("This is not the bundle's source instance.")
    collection_id = records[manifest["collection"]]["source_id"]
    with transaction.atomic(), suppress_date_range_recompute():
        try:
            collection = catalog.Collection.objects.select_for_update().get(pk=collection_id, region=region)
        except catalog.Collection.DoesNotExist as exc:
            raise CommandError("Selected state does not match the backed-up Collection.") from exc
        current_manifest, current_records = export_payload(collection)
        if digest(current_records) != manifest["records_sha256"] or current_manifest["files"] != manifest["files"]:
            raise CommandError("Source Collection changed after backup; export and verify it again.")
        scope = collection_scope(collection)
        counts = delete_contents(scope)
        if dry_run:
            transaction.set_rollback(True)
        return counts


def delete_contents(scope: dict[str, set[int]]) -> list[tuple[str, int]]:
    """Remove exclusive contents; retain shared records and all media files."""
    markings, contributions = scope["markings"], scope["contributions"]
    if catalog.Collection.objects.exclude(region_id__in=scope["regions"]).filter(
        region__post_office_regions__post_office__markings__pk__in=markings,
    ).exists():
        raise CommandError("Selected Markings also belong to another Collection.")
    shared = set(catalog.CoverMarking.objects.filter(cover_id__in=scope["covers"])
                 .exclude(marking_id__in=markings).values_list("cover_id", flat=True))
    covers = scope["covers"] - shared
    # A different Collection may have unfinished work against a shared Cover.
    for contribution in catalog.Contribution.objects.exclude(pk__in=contributions):
        if contribution.marking_id in markings:
            raise CommandError("Another Collection has a Contribution for a selected Marking.")
        data = contribution.submitted_data or {}
        if not isinstance(data, dict):
            continue
        for name, kind in JSON_REFS.items():
            if kind == "marking" and str(data.get(name, "")).isdigit() and int(data[name]) in markings:
                raise CommandError("Another Collection has a Contribution for a selected Marking.")
            if kind == "cover" and str(data.get(name, "")).isdigit() and int(data[name]) in covers:
                covers.remove(int(data[name]))
                shared.add(int(data[name]))
    subject = Q(subject_type="MARKING", subject_id__in=markings) | Q(subject_type="COVER", subject_id__in=covers)
    images = catalog.Image.objects.filter(subject)
    if catalog.Image.objects.filter(cropped_from__in=images).exclude(pk__in=images).exists():
        raise CommandError("Images outside the removal scope use a selected image as their crop source.")
    # Retain Post Offices with another Region or Entry.
    offices = set(scope["post_offices"])
    offices -= set(catalog.Marking.all_objects.exclude(pk__in=markings)
                   .filter(post_office_id__in=offices).values_list("post_office_id", flat=True))
    offices -= set(catalog.PostOfficeRegion.objects.filter(post_office_id__in=offices)
                   .exclude(region_id__in=scope["regions"]).values_list("post_office_id", flat=True))
    transactions = catalog.SubmissionTransaction.objects.filter(
        Q(marking_id__in=markings) | Q(contribution_id__in=contributions)
        | Q(cover_id__in=covers),
    ).exclude(cover_id__in=shared)
    transactions = transactions.exclude(
        versions__marking_id__in=catalog.Marking.all_objects.exclude(pk__in=markings).values("pk"),
    ).exclude(
        cover_versions__cover_id__in=catalog.Cover.all_objects.exclude(pk__in=covers).values("pk"),
    )
    operations = [
        ("images", images), ("citations", catalog.Citation.objects.filter(subject)),
        ("dates_seen", catalog.DateSeen.objects.filter(subject)),
        ("cover_valuations", catalog.CoverValuation.objects.filter(cover_id__in=covers)),
        ("cover_markings", catalog.CoverMarking.objects.filter(marking_id__in=markings)),
        ("marking_versions", catalog.MarkingVersion.objects.filter(marking_id__in=markings)),
        ("cover_versions", catalog.CoverVersion.objects.filter(cover_id__in=covers)),
        ("submission_transactions", transactions),
        ("contribution_recycle_bin", catalog.ContributionRecycleBin.objects.filter(contribution_id__in=contributions)),
        ("contributions", catalog.Contribution.objects.filter(pk__in=contributions)),
        ("marking_recycle_bin", catalog.MarkingRecycleBin.objects.filter(marking_id__in=markings)),
        ("cover_recycle_bin", catalog.CoverRecycleBin.objects.filter(cover_id__in=covers)),
        ("covers", catalog.Cover.all_objects.filter(pk__in=covers)),
        ("markings", catalog.Marking.all_objects.filter(pk__in=markings)),
        ("postmaster_tenures", catalog.PostmasterTenure.objects.filter(post_office_id__in=offices)),
        ("post_office_regions", catalog.PostOfficeRegion.objects.filter(post_office_id__in=offices)),
        ("post_offices", catalog.PostOffice.objects.filter(pk__in=offices)),
    ]
    counts = [("shared_covers_retained", len(shared)),
              ("shared_post_offices_retained", len(scope["post_offices"] - offices))]
    for label, queryset in operations:
        ids = list(queryset.values_list("pk", flat=True))
        # Delete only the history of removed objects, not sibling Versions
        # from the same Revision.
        versions = Version.objects.filter(
            content_type__app_label="common", content_type__model=queryset.model._meta.model_name,
            object_id__in=[str(pk) for pk in ids],
        )
        revision_ids = list(versions.values_list("revision_id", flat=True))
        versions.delete()
        Revision.objects.filter(pk__in=revision_ids, version__isnull=True).delete()
        queryset.delete()
        counts.append((label, len(ids)))
    return counts
