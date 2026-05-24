from django.db import migrations


class Migration(migrations.Migration):
    """
    State-only: remove FK fields from AdministrativeUnitIdentity and
    AdministrativeUnitResponsibility (which reference postmarks.Location), then delete
    the three concrete AU models from Django state. Location is still in state here —
    postmarks.0007 deletes it afterwards. No DB ops — tables are dropped by common.0045.
    """

    dependencies = [
        ("common", "0043_userlocationassignment_to_region"),
        ("postmarks", "0006_delete_location_delete_locationidentity_and_more"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RemoveField(
                    model_name="administrativeunitidentity",
                    name="administrative_unit",
                ),
                migrations.RemoveField(
                    model_name="administrativeunitidentity",
                    name="parent_administrative_unit",
                ),
                migrations.RemoveField(
                    model_name="administrativeunitidentity",
                    name="created_by",
                ),
                migrations.RemoveField(
                    model_name="administrativeunitidentity",
                    name="modified_by",
                ),
                migrations.AlterUniqueTogether(
                    name="administrativeunitresponsibility",
                    unique_together=None,
                ),
                migrations.RemoveField(
                    model_name="administrativeunitresponsibility",
                    name="administrative_unit",
                ),
                migrations.RemoveField(
                    model_name="administrativeunitresponsibility",
                    name="created_by",
                ),
                migrations.RemoveField(
                    model_name="administrativeunitresponsibility",
                    name="group",
                ),
                migrations.RemoveField(
                    model_name="administrativeunitresponsibility",
                    name="modified_by",
                ),
                migrations.DeleteModel(name="AdministrativeUnitIdentity"),
                migrations.DeleteModel(name="AdministrativeUnitResponsibility"),
                migrations.DeleteModel(name="AdministrativeUnit"),
            ],
        ),
    ]
