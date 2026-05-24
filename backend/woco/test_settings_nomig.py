"""
Throwaway test settings: build the test schema directly from current models
instead of replaying migration history.

Why: the v1 `postmarks` app's migration history (postmarks/migrations/0001_initial
creates proxy models with bases like common.postmark) points at base models that
later common migrations deleted, so rendering the full migration graph raises
InvalidBasesError. That breaks the normal test-DB build. The CURRENT model state
is clean (postmarks has no models; common is v2), so creating tables via
run_syncdb from models works and lets the common.tests suite run.

Usage (from backend repo root, project venv active):
    python manage.py test common.tests -v 2 \
        --settings=woco.test_settings_nomig --noinput

This file is a verification aid only; it does not change normal app behavior and
is safe to delete. It does NOT modify the postmarks app or any migration.
"""
from woco.settings import *  # noqa: F401,F403


class _DisableMigrations:
    """Make every app look migration-less so Django uses run_syncdb to create
    tables from current models, skipping the broken historical graph."""

    def __contains__(self, item):
        return True

    def __getitem__(self, item):
        return None


MIGRATION_MODULES = _DisableMigrations()

# Separate test DB name so the existing test_worldcovers is never touched.
DATABASES["default"]["TEST"] = {"NAME": "test_worldcovers_nomig"}  # noqa: F405
