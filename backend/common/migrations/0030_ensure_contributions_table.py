"""
Ensure the Contributions table exists in all environments.

Safe to run multiple times and on mixed-case MySQL/MariaDB setups.
Creates the table from the historical Contribution model definition
only if it is currently missing.
"""

from django.conf import settings
from django.db import migrations


def ensure_contributions_table(apps, schema_editor):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        if connection.vendor == "mysql":
            cursor.execute(
                """
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND LOWER(table_name) = 'contributions'
                LIMIT 1
                """
            )
            if cursor.fetchone():
                return
        else:
            existing = {t.lower() for t in connection.introspection.table_names()}
            if "contributions" in existing:
                return

    Contribution = apps.get_model("common", "Contribution")
    schema_editor.create_model(Contribution)


class Migration(migrations.Migration):
    # Do not wrap in a transaction; MySQL/MariaDB cannot roll back DDL safely.
    atomic = False

    dependencies = [
        ("common", "0029_add_postmark_other_characteristics"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(
            ensure_contributions_table,
            migrations.RunPython.noop,
        ),
    ]

