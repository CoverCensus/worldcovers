###################################################################################################
## WoCo Commons - Contribution Helpers
## Shared logic for creating/updating catalog entries from contribution payloads.
###################################################################################################
from datetime import date
import re
import uuid

from django.contrib.auth import get_user_model
from django.utils.text import slugify
from django.db.models import Q

from .models import (
    AdministrativeUnit,
    AdministrativeUnitIdentity,
    JurisdictionalAffiliation,
    PostalFacility,
    PostalFacilityIdentity,
    Postmark,
    PostmarkShape,
    LetteringStyle,
    FramingStyle,
    DateFormat,
    Color,
    PostmarkColor,
    PostmarkDatesSeen,
    PostmarkSize,
    PostmarkImage,
)


def get_contribution_user():
    """
    System user for creating Postmark and related TimestampedModel records
    when there is no authenticated request user.
    """
    User = get_user_model()
    return User.objects.filter(is_superuser=True).first() or User.objects.first()


def create_postmark_from_contribution(payload):
    """
    Create a Postmark (and related records) directly in the catalog tables from
    the contribute form payload. Uses a system user for created_by/modified_by.
    Returns the Postmark or None on failure.
    """
    user = get_contribution_user()
    if not user:
        return None
    try:
        state_str = (payload.get("state") or "").strip()
        town_str = (payload.get("town") or "").strip()
        date_range_str = (payload.get("date_range") or "").strip()
        type_str = (payload.get("type") or "").strip()
        color_str = (payload.get("color") or "").strip()
        manuscript_str = (payload.get("manuscript") or "").strip()
        dimensions_str = (payload.get("dimensions") or "").strip()
        description_str = (payload.get("description") or "").strip()
        references_str = (payload.get("references") or "").strip()
        rarity_str = (payload.get("rarity") or "").strip()

        # State: get or create AdministrativeUnit + Identity
        state_slug = slugify(state_str)[:40] or "unknown"
        ref_code = f"CONTRIB-{state_slug}"
        admin_unit, _ = AdministrativeUnit.objects.get_or_create(
            reference_code=ref_code,
            defaults={"created_by": user, "modified_by": user},
        )
        effective_from = date(1900, 1, 1)
        if not AdministrativeUnitIdentity.objects.filter(
            administrative_unit=admin_unit,
            unit_name=state_str[:255],
            effective_from_date=effective_from,
        ).exists():
            AdministrativeUnitIdentity.objects.create(
                administrative_unit=admin_unit,
                unit_name=state_str[:255],
                unit_abbreviation=(state_slug.upper()[:10] if state_slug != "unknown" else "CONTRIB"),
                unit_type="STATE",
                hierarchy_level=2,
                change_reason="INITIAL",
                effective_from_date=effective_from,
                effective_to_date=None,
                created_by=user,
                modified_by=user,
            )

        # Facility: get or create PostalFacility + Identity for town
        town_slug = slugify(town_str)[:30] or "unknown"
        facility_ref = f"CONTRIB-{town_slug}-{state_slug}"[:50]
        facility, _ = PostalFacility.objects.get_or_create(
            reference_code=facility_ref,
            defaults={"created_by": user, "modified_by": user},
        )
        identity, _ = PostalFacilityIdentity.objects.get_or_create(
            postal_facility=facility,
            effective_from_date=effective_from,
            defaults={
                "facility_name": town_str[:255],
                "facility_type": "POST_OFFICE",
                "is_operational": True,
                "created_by": user,
                "modified_by": user,
            },
        )

        # Link facility to state (jurisdiction)
        if not JurisdictionalAffiliation.objects.filter(
            postal_facility_identity=identity,
            administrative_unit=admin_unit,
            effective_from_date=effective_from,
        ).exists():
            JurisdictionalAffiliation.objects.create(
                postal_facility_identity=identity,
                administrative_unit=admin_unit,
                effective_from_date=effective_from,
                effective_to_date=None,
                affiliation_source="Contribution",
                created_by=user,
                modified_by=user,
            )

        # Shape by type name; fallback to first
        shape = PostmarkShape.objects.filter(shape_name=type_str).first()
        if not shape:
            shape = PostmarkShape.objects.first()
        if not shape:
            return None

        lettering = LetteringStyle.objects.first()
        framing = FramingStyle.objects.first()
        date_fmt = DateFormat.objects.first()
        if not lettering or not framing or not date_fmt:
            return None

        # Unique key
        postmark_key = f"CONTRIB-{uuid.uuid4().hex[:12]}"
        is_manuscript = manuscript_str.lower() == "yes"

        # Build other_characteristics from contributor fields (description, references, rarity, submitter)
        other_parts = []
        if description_str:
            other_parts.append(f"Description: {description_str}")
        if references_str:
            other_parts.append(f"Citation references: {references_str}")
        if rarity_str:
            other_parts.append(f"Rarity: {rarity_str}")
        submitter_str = (payload.get("submitter_name") or "").strip()
        if submitter_str:
            other_parts.append(f"Submitted by: {submitter_str}")
        other_characteristics = "\n".join(other_parts) if other_parts else ""

        postmark = Postmark.objects.create(
            site_id=1,
            postal_facility_identity=identity,
            state=admin_unit,
            postmark_shape=shape,
            lettering_style=lettering,
            framing_style=framing,
            date_format=date_fmt,
            postmark_key=postmark_key,
            rate_location="NONE",
            rate_value="",
            is_manuscript=is_manuscript,
            source_catalog="User contribution",
            other_characteristics=other_characteristics[:10000] if other_characteristics else "",
            created_by=user,
            modified_by=user,
        )

        # Dimensions: store in PostmarkSize (size_notes) when provided
        if dimensions_str:
            PostmarkSize.objects.create(
                postmark=postmark,
                width=0,
                height=0,
                size_notes=dimensions_str[:255],
                created_by=user,
                modified_by=user,
            )

        # Color
        color_name = color_str or "Black"
        color, _ = Color.objects.get_or_create(
            color_name=color_name[:50],
            defaults={"created_by": user, "modified_by": user},
        )
        PostmarkColor.objects.create(
            postmark=postmark,
            color=color,
            created_by=user,
            modified_by=user,
        )

        # Dates seen: parse "YYYY" or "YYYY-YYYY"
        parts = re.split(r"[-–—]", date_range_str)
        try:
            y1 = int(parts[0].strip()[:4]) if parts else 1900
            y2 = int(parts[1].strip()[:4]) if len(parts) > 1 else y1
        except (ValueError, IndexError):
            y1 = y2 = 1900
        earliest = date(max(1, min(y1, 9999)), 1, 1)
        latest = date(max(1, min(y2, 9999)), 12, 31)
        PostmarkDatesSeen.objects.create(
            postmark=postmark,
            earliest_date_seen=earliest,
            latest_date_seen=latest,
            created_by=user,
            modified_by=user,
        )

        # Optional: attach uploaded image
        image_meta = payload.get("image_meta")
        if image_meta and isinstance(image_meta, dict):
            PostmarkImage.objects.create(
                postmark=postmark,
                original_filename=image_meta.get("original_filename", "image")[:255],
                storage_filename=image_meta["storage_filename"],
                file_checksum=image_meta.get("file_checksum", "")[:64],
                mime_type=image_meta.get("mime_type", "image/jpeg")[:50],
                image_width=image_meta.get("image_width", 0),
                image_height=image_meta.get("image_height", 0),
                file_size_bytes=image_meta.get("file_size_bytes", 0),
                image_view="FULL",
                display_order=0,
                uploaded_by=user,
                created_by=user,
                modified_by=user,
            )
        return postmark
    except Exception:
        return None


def update_postmark_from_contribution(postmark_id, payload, submitter_name):
    """
    Update an existing user-contribution Postmark in place.
    Verifies the submitter matches. Returns the updated Postmark or None.
    """
    try:
        postmark = Postmark.objects.filter(postmark_id=postmark_id).first()
        if not postmark or postmark.source_catalog != "User contribution":
            return None

        oc = postmark.other_characteristics or ""
        needle = (submitter_name or "").strip().lower()
        if not needle:
            return None
        if f"submitted by: {needle}" not in oc.lower():
            return None

        user = get_contribution_user()
        if not user:
            return None

        state_str = (payload.get("state") or "").strip()
        town_str = (payload.get("town") or "").strip()
        date_range_str = (payload.get("date_range") or "").strip()
        type_str = (payload.get("type") or "").strip()
        color_str = (payload.get("color") or "").strip()
        manuscript_str = (payload.get("manuscript") or "").strip()
        dimensions_str = (payload.get("dimensions") or "").strip()
        description_str = (payload.get("description") or "").strip()
        references_str = (payload.get("references") or "").strip()
        rarity_str = (payload.get("rarity") or "").strip()

        # State / facility / identity (same as create)
        state_slug = slugify(state_str)[:40] or "unknown"
        ref_code = f"CONTRIB-{state_slug}"
        admin_unit, _ = AdministrativeUnit.objects.get_or_create(
            reference_code=ref_code,
            defaults={"created_by": user, "modified_by": user},
        )
        effective_from = date(1900, 1, 1)
        if not AdministrativeUnitIdentity.objects.filter(
            administrative_unit=admin_unit,
            unit_name=state_str[:255],
            effective_from_date=effective_from,
        ).exists():
            AdministrativeUnitIdentity.objects.create(
                administrative_unit=admin_unit,
                unit_name=state_str[:255],
                unit_abbreviation=(state_slug.upper()[:10] if state_slug != "unknown" else "CONTRIB"),
                unit_type="STATE",
                hierarchy_level=2,
                change_reason="INITIAL",
                effective_from_date=effective_from,
                effective_to_date=None,
                created_by=user,
                modified_by=user,
            )

        town_slug = slugify(town_str)[:30] or "unknown"
        facility_ref = f"CONTRIB-{town_slug}-{state_slug}"[:50]
        facility, _ = PostalFacility.objects.get_or_create(
            reference_code=facility_ref,
            defaults={"created_by": user, "modified_by": user},
        )
        identity, _ = PostalFacilityIdentity.objects.get_or_create(
            postal_facility=facility,
            effective_from_date=effective_from,
            defaults={
                "facility_name": town_str[:255],
                "facility_type": "POST_OFFICE",
                "is_operational": True,
                "created_by": user,
                "modified_by": user,
            },
        )

        if not JurisdictionalAffiliation.objects.filter(
            postal_facility_identity=identity,
            administrative_unit=admin_unit,
            effective_from_date=effective_from,
        ).exists():
            JurisdictionalAffiliation.objects.create(
                postal_facility_identity=identity,
                administrative_unit=admin_unit,
                effective_from_date=effective_from,
                effective_to_date=None,
                affiliation_source="Contribution",
                created_by=user,
                modified_by=user,
            )

        shape = PostmarkShape.objects.filter(shape_name=type_str).first() or PostmarkShape.objects.first()
        if not shape:
            return None
        is_manuscript = manuscript_str.lower() == "yes"

        other_parts = []
        if description_str:
            other_parts.append(f"Description: {description_str}")
        if references_str:
            other_parts.append(f"Citation references: {references_str}")
        if rarity_str:
            other_parts.append(f"Rarity: {rarity_str}")
        if submitter_name.strip():
            other_parts.append(f"Submitted by: {submitter_name.strip()}")
        other_characteristics = "\n".join(other_parts) if other_parts else ""

        # Update Postmark
        postmark.postal_facility_identity = identity
        postmark.state = admin_unit
        postmark.postmark_shape = shape
        postmark.is_manuscript = is_manuscript
        postmark.other_characteristics = other_characteristics[:10000] if other_characteristics else ""
        postmark.modified_by = user
        postmark.save(
            update_fields=[
                "postal_facility_identity",
                "state",
                "postmark_shape",
                "is_manuscript",
                "other_characteristics",
                "modified_by",
            ]
        )

        # Replace dimensions
        PostmarkSize.objects.filter(postmark=postmark).delete()
        if dimensions_str:
            PostmarkSize.objects.create(
                postmark=postmark,
                width=0,
                height=0,
                size_notes=dimensions_str[:255],
                created_by=user,
                modified_by=user,
            )

        # Replace color
        PostmarkColor.objects.filter(postmark=postmark).delete()
        color_name = color_str or "Black"
        color, _ = Color.objects.get_or_create(
            color_name=color_name[:50],
            defaults={"created_by": user, "modified_by": user},
        )
        PostmarkColor.objects.create(postmark=postmark, color=color, created_by=user, modified_by=user)

        # Replace dates seen
        PostmarkDatesSeen.objects.filter(postmark=postmark).delete()
        parts = re.split(r"[-–—]", date_range_str)
        try:
            y1 = int(parts[0].strip()[:4]) if parts else 1900
            y2 = int(parts[1].strip()[:4]) if len(parts) > 1 else y1
        except (ValueError, IndexError):
            y1 = y2 = 1900
        earliest = date(max(1, min(y1, 9999)), 1, 1)
        latest = date(max(1, min(y2, 9999)), 12, 31)
        PostmarkDatesSeen.objects.create(
            postmark=postmark,
            earliest_date_seen=earliest,
            latest_date_seen=latest,
            created_by=user,
            modified_by=user,
        )

        # Replace image if new one provided
        image_meta = payload.get("image_meta")
        if image_meta and isinstance(image_meta, dict):
            PostmarkImage.objects.filter(postmark=postmark).delete()
            PostmarkImage.objects.create(
                postmark=postmark,
                original_filename=image_meta.get("original_filename", "image")[:255],
                storage_filename=image_meta["storage_filename"],
                file_checksum=image_meta.get("file_checksum", "")[:64],
                mime_type=image_meta.get("mime_type", "image/jpeg")[:50],
                image_width=image_meta.get("image_width", 0),
                image_height=image_meta.get("image_height", 0),
                file_size_bytes=image_meta.get("file_size_bytes", 0),
                image_view="FULL",
                display_order=0,
                uploaded_by=user,
                created_by=user,
                modified_by=user,
            )
        return postmark
    except Exception:
        return None


###################################################################################################

