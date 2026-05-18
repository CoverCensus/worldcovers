# Cover–marking moderation: approve / reject / request revision (editor workflow).

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0065_alter_postofficeregion_created_by_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="covermarking",
            name="review_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending review"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                    ("needs_revision", "Needs revision"),
                ],
                default="approved",
                help_text="Editor moderation state for this cover–marking association.",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="covermarking",
            name="review_notes",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="covermarking",
            name="reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="covermarking",
            name="reviewer",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="reviewed_cover_markings",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
