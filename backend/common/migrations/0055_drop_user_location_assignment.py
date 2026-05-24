"""
Final cleanup: drop the legacy UserLocationAssignment model and the
"State Editors" group. CollectionAssignment + the Editors group take their
place and have already been backfilled in 0053.
"""
from django.db import migrations


def drop_state_editors_group(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name__iexact="State Editors").delete()


def restore_state_editors_group(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.get_or_create(name="State Editors")


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0054_make_contribution_collection_required"),
    ]

    operations = [
        migrations.RunPython(drop_state_editors_group, restore_state_editors_group),
        migrations.DeleteModel(name="UserLocationAssignment"),
    ]
