from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0036_create_postmark_v2"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="postmarkvaluation",
            name="appraisal_date",
            field=models.DateField(blank=True, db_column="AppraisalDate", null=True),
        ),
        migrations.AddField(
            model_name="postmarkvaluation",
            name="appraisal_pos",
            field=models.PositiveSmallIntegerField(default=0, help_text="Ordinal position within the postmark valuation sequence"),
        ),
        migrations.AddField(
            model_name="postmarkvaluation",
            name="amt",
            field=models.DecimalField(blank=True, decimal_places=2, help_text="Non-negative USD; null = unpriced entry", max_digits=10, null=True),
        ),
        migrations.AlterField(
            model_name="postmarkvaluation",
            name="estimated_value",
            field=models.DecimalField(blank=True, db_column="EstimatedValue", decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AlterField(
            model_name="postmarkvaluation",
            name="valuation_date",
            field=models.DateField(blank=True, db_column="ValuationDate", null=True),
        ),
        migrations.AlterField(
            model_name="postmarkvaluation",
            name="valued_by_user",
            field=models.ForeignKey(blank=True, db_column="ValuedByUserID", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="postmark_valuations_made", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterUniqueTogether(
            name="postmarkvaluation",
            unique_together={("postmark", "appraisal_pos")},
        ),
        migrations.AlterModelOptions(
            name="postmarkvaluation",
            options={"ordering": ["-appraisal_date", "-valuation_date"], "verbose_name": "Postmark Valuation", "verbose_name_plural": "Postmark Valuations"},
        ),
    ]
