# Contribution data is written directly into catalog (Postmark) tables; no separate Contributions table.

from django.db import migrations


def drop_contributions_table(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("DROP TABLE IF EXISTS Contributions;")


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0013_fk_to_location_proxy'),
    ]

    operations = [
        migrations.RunPython(drop_contributions_table, noop),
    ]
