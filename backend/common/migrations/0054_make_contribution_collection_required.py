"""
Flip Contribution.collection to NOT NULL. Will fail loudly if 0053 left any
rows with collection=NULL — that's the safety net the plan calls for.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0053_backfill_collections_and_assignments"),
    ]

    operations = [
        migrations.AlterField(
            model_name="contribution",
            name="collection",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="contributions",
                to="common.collection",
            ),
        ),
    ]
