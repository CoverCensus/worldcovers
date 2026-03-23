"""
Re-run the data seed from migration 0033_seed_towns_for_states.

Use when 0033 ran before administrative units (states) existed, so affiliations
were skipped. Safe to run multiple times (get_or_create).

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
