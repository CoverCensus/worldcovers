"""
Add Contribution.collection FK as TEMPORARILY nullable to allow the data
backfill in 0053 to populate every row before 0054 flips the column to NOT NULL.

Also installs the custom Meta.permissions on Contribution and PostmarkImage
so that subsequent group-seeding migration (0052) can attach them to groups.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0050_create_collection_assignment"),
    ]

    operations = [
        migrations.AddField(
            model_name="contribution",
            name="collection",
            field=models.ForeignKey(
                null=True,  # temporary; flipped to NOT NULL in 0054
                on_delete=django.db.models.deletion.PROTECT,
                related_name="contributions",
                to="common.collection",
            ),
        ),
        migrations.AlterModelOptions(
            name="contribution",
            options={
                "ordering": ["-created_at"],
                "permissions": [
                    ("review_contribution", "Can review (approve / reject) contributions"),
                ],
                "verbose_name": "Contribution",
                "verbose_name_plural": "Contributions",
            },
        ),
        migrations.AlterModelOptions(
            name="postmarkimage",
            options={
                "ordering": ["postmark", "display_order"],
                "permissions": [
                    ("approve_postmarkimage", "Can approve / reject postmark image submissions"),
                ],
                "verbose_name": "Listing Image",
                "verbose_name_plural": "Listing Images",
            },
        ),
    ]
