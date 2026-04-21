from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0042_auxmark_code_ratemark_code"),
    ]

    operations = [
        # Historical: two overlapping unique keys exist on (user_id, administrative_unit_id).
        # Drop the duplicate so Django's AlterUniqueTogether can identify the one it owns.
        migrations.RunSQL(
            sql=(
                "ALTER TABLE `UserLocationAssignments` DROP KEY "
                "`UserLocationAssignments_UserID_AdministrativeUni_1dc12fb7_uniq`"
            ),
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.AlterUniqueTogether(
            name="userlocationassignment",
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name="userlocationassignment",
            name="administrative_unit",
        ),
        migrations.AddField(
            model_name="userlocationassignment",
            name="region",
            field=models.ForeignKey(
                help_text="Region this user is associated with",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="user_location_assignments",
                to="common.region",
            ),
            preserve_default=False,
        ),
        migrations.AlterUniqueTogether(
            name="userlocationassignment",
            unique_together={("user", "region")},
        ),
    ]
