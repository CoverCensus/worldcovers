# Add OtherCharacteristics column to Postmarks if missing (legacy schema compatibility)

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0028_contribution_align_schema"),
    ]

    # No-op migration: the OtherCharacteristics column already exists
    # in the current database schema. We keep this migration so that
    # Django can record it as applied without altering the DB.
    operations = []
