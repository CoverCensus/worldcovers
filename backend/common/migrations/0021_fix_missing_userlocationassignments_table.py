from django.conf import settings
from django.db import migrations


def ensure_userlocationassignments_table_if_missing(apps, schema_editor):
    """
    Safety net for production/staging:

    On some databases, migration 0016 registered the UserLocationAssignment model
    but the physical UserLocationAssignments table was never created (for example,
    if migrations were run before 0020 was introduced, or if the database was
    restored without rerunning 0020).

    This migration re-checks the connection's tables and creates the model table
    if it is still missing. It is safe to run multiple times.
    """
    connection = schema_editor.connection
    existing_tables = set(connection.introspection.table_names())

    if "UserLocationAssignments" in existing_tables:
        # Table already exists; nothing to do.
        return

    UserLocationAssignment = apps.get_model("common", "UserLocationAssignment")
    schema_editor.create_model(UserLocationAssignment)


class Migration(migrations.Migration):
    # Keep consistent with 0020: MySQL/MariaDB cannot safely roll back DDL,
    # so we avoid wrapping this in a transaction.
    atomic = False

    dependencies = [
        ("common", "0020_ensure_userlocationassignments_table"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(
            ensure_userlocationassignments_table_if_missing,
            migrations.RunPython.noop,
        ),
    ]

