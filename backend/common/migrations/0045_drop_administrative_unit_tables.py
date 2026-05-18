from django.db import migrations


class Migration(migrations.Migration):
    """
    Drop the three AU tables from the database. State cleanup is handled by
    common.0044 (RemoveField + concrete DeleteModel) and postmarks.0007 (proxy DeleteModel).
    RunSQL with IF EXISTS is idempotent in case the tables were already dropped.
    """

    dependencies = [
        ("common", "0044_remove_administrativeunitresponsibility_administrative_unit_and_more"),
        ("postmarks", "0007_delete_location_proxies"),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                "DROP TABLE IF EXISTS `common_administrativeunitidentities`;",
                "DROP TABLE IF EXISTS `common_administrativeunitresponsibilities`;",
                "DROP TABLE IF EXISTS `common_administrativeunits`;",
            ],
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
