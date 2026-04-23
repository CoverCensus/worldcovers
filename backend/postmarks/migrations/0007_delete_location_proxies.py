from django.db import migrations


class Migration(migrations.Migration):
    """
    Remove AU proxy models (Location/LocationIdentity/LocationResponsibility) from Django
    state. Runs after common.0044 which has already removed the FK fields that referenced
    postmarks.Location, so DeleteModel is safe. No DB ops — proxies share the AU tables
    dropped by common.0045.
    """

    dependencies = [
        ("postmarks", "0006_delete_location_delete_locationidentity_and_more"),
        ("common", "0044_remove_administrativeunitresponsibility_administrative_unit_and_more"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.DeleteModel(name="Location"),
                migrations.DeleteModel(name="LocationIdentity"),
                migrations.DeleteModel(name="LocationResponsibility"),
            ],
        ),
    ]
