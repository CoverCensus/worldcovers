# Data migration: seed towns per state and link them via JurisdictionalAffiliation
# so GET /api/postal-facilities/ returns state_name and the frontend can show
# Town/City dropdown filtered by selected state.
#
# Run: python manage.py migrate common

from django.conf import settings
from django.db import migrations
from datetime import date


# State display name (must match currentName from GET /api/administrative-units/)
# -> list of town names to create for that state
STATE_TOWNS = {
    "Alabama": ["Birmingham", "Montgomery", "Huntsville", "Mobile"],
    "Alaska": ["Anchorage", "Fairbanks", "Juneau"],
    "Arizona": ["Phoenix", "Tucson", "Mesa", "Scottsdale"],
    "Arkansas": ["Little Rock", "Fort Smith", "Fayetteville"],
    "California": ["Los Angeles", "San Francisco", "San Diego", "Sacramento", "San Jose"],
    "Colorado": ["Denver", "Colorado Springs", "Boulder", "Fort Collins"],
    "Connecticut": ["Hartford", "New Haven", "Stamford", "Bridgeport"],
    "Delaware": ["Wilmington", "Dover", "Newark"],
    "District of Columbia": ["Washington"],
    "Florida": ["Miami", "Jacksonville", "Tampa", "Orlando", "St. Petersburg"],
    "Georgia": ["Atlanta", "Augusta", "Savannah", "Columbus"],
    "Hawaii": ["Honolulu", "Hilo", "Kailua"],
    "Idaho": ["Boise", "Idaho Falls", "Pocatello"],
    "Illinois": ["Chicago", "Springfield", "Peoria", "Rockford"],
    "Indiana": ["Indianapolis", "Fort Wayne", "Evansville", "South Bend"],
    "Iowa": ["Des Moines", "Cedar Rapids", "Davenport", "Iowa City"],
    "Kansas": ["Wichita", "Kansas City", "Topeka", "Overland Park"],
    "Kentucky": ["Louisville", "Lexington", "Bowling Green", "Frankfort"],
    "Louisiana": ["New Orleans", "Baton Rouge", "Shreveport", "Lafayette"],
    "Maine": ["Portland", "Lewiston", "Bangor", "Augusta"],
    "Maryland": ["Baltimore", "Annapolis", "Rockville", "Frederick"],
    "Massachusetts": ["Boston", "Worcester", "Cambridge", "Springfield"],
    "Michigan": ["Detroit", "Grand Rapids", "Ann Arbor", "Lansing"],
    "Minnesota": ["Minneapolis", "Saint Paul", "Rochester", "Duluth"],
    "Mississippi": ["Jackson", "Gulfport", "Hattiesburg", "Biloxi"],
    "Missouri": ["Kansas City", "St. Louis", "Springfield", "Columbia"],
    "Montana": ["Billings", "Missoula", "Great Falls", "Helena"],
    "Nebraska": ["Omaha", "Lincoln", "Bellevue", "Grand Island"],
    "Nevada": ["Las Vegas", "Reno", "Henderson", "Carson City"],
    "New Hampshire": ["Manchester", "Nashua", "Concord", "Derry"],
    "New Jersey": ["Newark", "Jersey City", "Paterson", "Elizabeth", "Trenton"],
    "New Mexico": ["Albuquerque", "Santa Fe", "Las Cruces", "Rio Rancho"],
    "New York": ["New York City", "Buffalo", "Rochester", "Albany", "Syracuse"],
    "North Carolina": ["Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem"],
    "North Dakota": ["Fargo", "Bismarck", "Grand Forks", "Minot"],
    "Northwest Territory": ["Chillicothe", "Marietta"],
    "Ohio": ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron"],
    "Oklahoma": ["Oklahoma City", "Tulsa", "Norman", "Edmond"],
    "Oregon": ["Portland", "Salem", "Eugene", "Bend"],
    "Pennsylvania": ["Philadelphia", "Pittsburgh", "Allentown", "Harrisburg", "Scranton"],
    "Puerto Rico": ["San Juan", "Bayamón", "Ponce", "Carolina"],
    "Rhode Island": ["Providence", "Warwick", "Cranston", "Pawtucket"],
    "South Carolina": ["Charleston", "Columbia", "North Charleston", "Greenville"],
    "South Dakota": ["Sioux Falls", "Rapid City", "Aberdeen", "Pierre"],
    "Virginia": ["Richmond", "Virginia Beach", "Norfolk", "Chesapeake", "Arlington", "Alexandria"],
}


def _find_administrative_unit_by_state_name(apps, state_name):
    """Return an AdministrativeUnit whose current identity has unit_name equal to state_name (case-insensitive)."""
    AdministrativeUnitIdentity = apps.get_model("common", "AdministrativeUnitIdentity")
    name_lower = (state_name or "").strip().lower()
    if not name_lower:
        return None
    ident = (
        AdministrativeUnitIdentity.objects.filter(effective_to_date__isnull=True)
        .filter(unit_name__iexact=name_lower)
        .select_related("administrative_unit")
        .first()
    )
    if ident and getattr(ident, "administrative_unit_id", None):
        return ident.administrative_unit
    return None


def seed_towns_for_states(apps, schema_editor):
    if not STATE_TOWNS:
        return

    UserModel = apps.get_model(
        settings.AUTH_USER_MODEL.split(".")[0],
        settings.AUTH_USER_MODEL.split(".")[1],
    )
    PostalFacility = apps.get_model("common", "PostalFacility")
    PostalFacilityIdentity = apps.get_model("common", "PostalFacilityIdentity")
    JurisdictionalAffiliation = apps.get_model("common", "JurisdictionalAffiliation")

    user = (
        UserModel.objects.filter(is_superuser=True).first()
        or UserModel.objects.filter(is_staff=True).first()
        or UserModel.objects.first()
    )
    if not user:
        return

    from django.utils.text import slugify

    effective_from = date(1900, 1, 1)

    for state_name, towns in STATE_TOWNS.items():
        state_clean = (state_name or "").strip()
        if not state_clean or not towns:
            continue

        admin_unit = _find_administrative_unit_by_state_name(apps, state_clean)
        if not admin_unit:
            continue

        state_slug = slugify(state_clean)[:20] or "unknown"
        state_slug = "".join(c for c in state_slug if c.isalnum() or c == "-") or "unknown"

        for town_name in towns:
            town_clean = (town_name or "").strip()[:255]
            if not town_clean:
                continue

            town_slug = slugify(town_clean)[:25] or "unknown"
            town_slug = "".join(c for c in town_slug if c.isalnum() or c == "-") or "unknown"
            reference_code = ("SEED-%s-%s" % (town_slug, state_slug))[:50]

            facility, _ = PostalFacility.objects.get_or_create(
                reference_code=reference_code,
                defaults={
                    "created_by": user,
                    "modified_by": user,
                },
            )

            identity, created = PostalFacilityIdentity.objects.get_or_create(
                postal_facility=facility,
                effective_from_date=effective_from,
                defaults={
                    "effective_to_date": None,
                    "facility_name": town_clean,
                    "facility_type": "POST_OFFICE",
                    "is_operational": True,
                    "discontinuation_reason": "",
                    "created_by": user,
                    "modified_by": user,
                },
            )

            if not created:
                identity.facility_name = town_clean
                identity.save(update_fields=["facility_name"])

            JurisdictionalAffiliation.objects.get_or_create(
                postal_facility_identity=identity,
                administrative_unit=admin_unit,
                effective_from_date=effective_from,
                defaults={
                    "effective_to_date": None,
                    "affiliation_source": "Seed towns migration 0033",
                    "created_by": user,
                    "modified_by": user,
                },
            )


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0032_add_initial_towns_skeleton"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(seed_towns_for_states, migrations.RunPython.noop),
    ]
