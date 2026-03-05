from django.conf import settings
from django.db import migrations


def ensure_userlocationassignments_table(apps, schema_editor):
    """
    Ensure the UserLocationAssignments table exists on databases where
    migration 0016 registered the model in Django, but the physical table
    was never created (e.g. production/staging before we fixed 0016).

    Safe to run multiple times:
    - If the table already exists, we do nothing.
    - If it does not, we create it from the historical model definition.
    """
    connection = schema_editor.connection
    existing_tables = set(connection.introspection.table_names())

    if "UserLocationAssignments" in existing_tables:
        # Table already exists; nothing to do.
        return

    UserLocationAssignment = apps.get_model("common", "UserLocationAssignment")
    schema_editor.create_model(UserLocationAssignment)


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0019_add_test_locations"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(
            ensure_userlocationassignments_table,
            migrations.RunPython.noop,
        ),
    ]

from django.conf import settings
from django.db import migrations


def ensure_userlocationassignments_table(apps, schema_editor):
    """
    Ensure the UserLocationAssignments table exists on databases where
    migration 0016 registered the model in Django, but the physical table
    was never created (e.g. production/staging before we fixed 0016).

    Safe to run multiple times:
    - If the table already exists, we do nothing.
    - If it does not, we create it from the historical model definition.
    """
    connection = schema_editor.connection
    existing_tables = set(connection.introspection.table_names())

    if "UserLocationAssignments" in existing_tables:
        # Table already exists; nothing to do.
        return

    UserLocationAssignment = apps.get_model("common", "UserLocationAssignment")
    schema_editor.create_model(UserLocationAssignment)


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0019_add_test_locations"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(
            ensure_userlocationassignments_table,
            migrations.RunPython.noop,
        ),
    ]

