# Merge migration: resolves multiple leaf nodes
# (0019_userlocationassignment_add_columns_if_missing, 0021_fix_missing_userlocationassignments_table)

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0019_userlocationassignment_add_columns_if_missing"),
        ("common", "0021_fix_missing_userlocationassignments_table"),
    ]

    operations = []
