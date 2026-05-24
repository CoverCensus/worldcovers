from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0041_date_observed_postmark_date_idx"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CommentSubmission",
            fields=[
                ("id", models.AutoField(primary_key=True, serialize=False)),
                (
                    "target_type",
                    models.CharField(
                        choices=[("postmark", "Record"), ("collection", "Collection")],
                        default="postmark",
                        max_length=20,
                    ),
                ),
                (
                    "collection_name",
                    models.CharField(
                        blank=True,
                        help_text="Required for collection comments when no collection model exists.",
                        max_length=255,
                    ),
                ),
                ("comment_text", models.TextField(help_text="Contributor observation/correction note.")),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "Pending"), ("approved", "Approved"), ("denied", "Denied")],
                        default="pending",
                        max_length=20,
                    ),
                ),
                (
                    "review_reason",
                    models.TextField(blank=True, help_text="Editor feedback; required when denied."),
                ),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "contributor",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="comment_submissions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "postmark",
                    models.ForeignKey(
                        blank=True,
                        help_text="Required for record comments.",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="comment_submissions",
                        to="common.postmark",
                    ),
                ),
                (
                    "reviewer",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="reviewed_comment_submissions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Comment submission",
                "verbose_name_plural": "Comment submissions",
                "db_table": "CommentSubmissions",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="commentsubmission",
            index=models.Index(fields=["status", "target_type"], name="CommentSubm_status_2700c1_idx"),
        ),
        migrations.AddIndex(
            model_name="commentsubmission",
            index=models.Index(fields=["postmark", "status"], name="CommentSubm_postmar_d6f330_idx"),
        ),
        migrations.AddIndex(
            model_name="commentsubmission",
            index=models.Index(fields=["contributor", "status"], name="CommentSubm_contrib_4b0380_idx"),
        ),
    ]
