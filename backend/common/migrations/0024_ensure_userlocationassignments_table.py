# Idempotent: create UserLocationAssignments table if missing (e.g. 0023 was applied but table wasn't created).

from django.conf import settings
from django.db import migrations


def ensure_table(apps, schema_editor):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        if connection.vendor == "mysql":
            cursor.execute(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = DATABASE()
                AND LOWER(table_name) = 'userlocationassignments'
                LIMIT 1
                """
            )
            if cursor.fetchone():
                return
        else:
            existing = {t.lower() for t in connection.introspection.table_names()}
            if "userlocationassignments" in existing:
                return

    UserLocationAssignment = apps.get_model("common", "UserLocationAssignment")
    schema_editor.create_model(UserLocationAssignment)


class Migration(migrations.Migration):
    atomic = False
    dependencies = [
        ("common", "0023_ensure_userlocationassignments_table_final"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.RunPython(ensure_table, migrations.RunPython.noop),
    ]
