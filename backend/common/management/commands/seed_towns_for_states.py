"""
Re-run the data seed from migration 0033_seed_towns_for_states.

Creates seed PostalFacility + PostalFacilityIdentity rows per state in
STATE_TOWNS and links them via JurisdictionalAffiliation to the matching
AdministrativeUnit (by current identity unit_name).

Use when 0033 ran before states existed, so affiliations were skipped. Safe to
run multiple times (get_or_create).

See docs/api_versioning_and_migration.md §5 (Seeding postal facilities).

Shell:
  cd backend && python manage.py seed_towns_for_states
"""

import importlib

from django.apps import apps
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Seed postal facilities (towns) per US state and link via JurisdictionalAffiliation "
        "(same logic as migration 0033). Run after states exist."
    )

    def handle(self, *args, **options):
        mod = importlib.import_module("common.migrations.0033_seed_towns_for_states")
        mod.seed_towns_for_states(apps, None)
        self.stdout.write(self.style.SUCCESS("seed_towns_for_states finished."))
