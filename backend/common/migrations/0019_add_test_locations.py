from django.conf import settings
from django.db import migrations


def create_test_locations(apps, schema_editor):
    """
    Previously attempted to create dummy Location records for local testing.
    This caused integrity issues against the existing MySQL schema, so the
    data-migration body has been intentionally turned into a no-op.

    Keeping this function (and migration) ensures the migration history stays
    consistent without modifying production data.
    """
    # No-op on purpose – do not create or modify any rows.
    return


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0018_remove_postmark_postmarks_created_idx"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(create_test_locations, migrations.RunPython.noop),
    ]
