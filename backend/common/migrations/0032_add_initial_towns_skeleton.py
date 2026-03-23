from django.conf import settings
from django.db import migrations


# NOTE FOR MAINTAINERS:
# ----------------------
# This migration is a SAFE SKELETON to help you bulk-create towns for existing
# states using the new PostalFacility / JurisdictionalAffiliation model.
#
# By default, STATE_TOWNS is EMPTY so the migration is effectively a no-op.
# To use it:
#   1. Fill in STATE_TOWNS below with the towns you want per state.
#      Keys should match AdministrativeUnitIdentity.unit_name (e.g. "Alabama").
#   2. Run migrations (python manage.py migrate).
#
# Example:
#   STATE_TOWNS = {
#       "Alabama": ["Birmingham", "Montgomery"],
#       "Alaska": ["Anchorage"],
#   }
#
# The migration will, for each (state_name, town_name):
#   - Find the AdministrativeUnit whose current identity has unit_name = state_name
#   - Create PostalFacility (if needed)
#   - Create PostalFacilityIdentity (if needed)
#   - Create JurisdictionalAffiliation linking that identity to the state

STATE_TOWNS = {
    # "Alabama": ["Birmingham", "Montgomery"],
    # "Alaska": ["Anchorage"],
    # "Virginia": ["Richmond", "Norfolk"],
}


def create_initial_towns(apps, schema_editor):
    if not STATE_TOWNS:
        # No configuration → explicit no-op
        return

    UserModel = apps.get_model(settings.AUTH_USER_MODEL.split(".")[0], settings.AUTH_USER_MODEL.split(".")[1])
    AdministrativeUnit = apps.get_model("common", "AdministrativeUnit")
    AdministrativeUnitIdentity = apps.get_model("common", "AdministrativeUnitIdentity")
    PostalFacility = apps.get_model("common", "PostalFacility")
    PostalFacilityIdentity = apps.get_model("common", "PostalFacilityIdentity")
    JurisdictionalAffiliation = apps.get_model("common", "JurisdictionalAffiliation")

    # Pick a system user to use for created_by / modified_by.
    # Prefer a staff superuser; fall back to any user; if none, do nothing.
    user = (
        UserModel.objects.filter(is_superuser=True).first()
        or UserModel.objects.filter(is_staff=True).first()
        or UserModel.objects.first()
    )
    if not user:
        return

    from datetime import date
    from django.utils.text import slugify

    for state_name, towns in STATE_TOWNS.items():
        cleaned_state = (state_name or "").strip()
        if not cleaned_state or not towns:
            continue

        # Find the AdministrativeUnit whose current identity name matches this state
        admin_unit = None
        # First, try exact match on current identity
        for au in AdministrativeUnit.objects.all():
            ident = au.get_current_identity()
            if ident and ident.unit_name == cleaned_state:
                admin_unit = au
                break
        if not admin_unit:
            # As a fallback, try case-insensitive match on current identity name
            for au in AdministrativeUnit.objects.all():
                ident = au.get_current_identity()
                if ident and ident.unit_name.lower() == cleaned_state.lower():
                    admin_unit = au
                    break

        if not admin_unit:
            # State name not found; skip silently
            continue

        state_slug = slugify(cleaned_state)[:40] or "unknown"
        effective_from = date(1900, 1, 1)

        for town_name in towns:
            cleaned_town = (town_name or "").strip()
            if not cleaned_town:
                continue

            town_slug = slugify(cleaned_town)[:30] or "unknown"
            facility_ref = f"CONTRIB-{town_slug}-{state_slug}"[:50]

            facility, _ = PostalFacility.objects.get_or_create(
                reference_code=facility_ref,
                defaults={
                    "created_by": user,
                    "modified_by": user,
                },
            )

            identity, _ = PostalFacilityIdentity.objects.get_or_create(
                postal_facility=facility,
                effective_from_date=effective_from,
                defaults={
                    "facility_name": cleaned_town[:255],
                    "facility_type": "POST_OFFICE",
                    "is_operational": True,
                    "created_by": user,
                    "modified_by": user,
                },
            )

            # Link facility identity to state via JurisdictionalAffiliation
            JurisdictionalAffiliation.objects.get_or_create(
                postal_facility_identity=identity,
                administrative_unit=admin_unit,
                effective_from_date=effective_from,
                defaults={
                    "effective_to_date": None,
                    "affiliation_source": "Initial town seed migration",
                    "created_by": user,
                    "modified_by": user,
                },
            )


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0031_faqentry"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(create_initial_towns, migrations.RunPython.noop),
    ]

