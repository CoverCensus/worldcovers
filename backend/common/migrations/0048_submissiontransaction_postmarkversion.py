from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("common", "0047_merge_0045_0046"),
    ]

    operations = [
        migrations.CreateModel(
            name="SubmissionTransaction",
            fields=[
                ("id", models.AutoField(primary_key=True, serialize=False)),
                ("transaction_uuid", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("submit", "Submit"),
                            ("edit_submission", "Edit submission"),
                            ("editor_edit", "Editor edit"),
                            ("approve", "Approve"),
                            ("reject", "Reject"),
                            ("catalog_direct_edit", "Catalog direct edit"),
                            ("restore_version", "Restore version"),
                            ("record_create", "Record create"),
                            ("record_update", "Record update"),
                            ("record_delete", "Record delete"),
                        ],
                        max_length=40,
                    ),
                ),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("contributor_portal", "Contributor portal"),
                            ("editor_portal", "Editor portal"),
                            ("system", "System"),
                        ],
                        default="system",
                        max_length=30,
                    ),
                ),
                ("before_payload", models.JSONField(blank=True, default=dict)),
                ("after_payload", models.JSONField(blank=True, default=dict)),
                ("diff_payload", models.JSONField(blank=True, default=list)),
                ("extra_payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="submission_transactions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "contribution",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="transactions",
                        to="common.contribution",
                    ),
                ),
                (
                    "postmark",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="transactions",
                        to="common.postmark",
                    ),
                ),
            ],
            options={
                "verbose_name": "Submission Transaction",
                "verbose_name_plural": "Submission Transactions",
                "db_table": "SubmissionTransactions",
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.CreateModel(
            name="PostmarkVersion",
            fields=[
                ("id", models.AutoField(primary_key=True, serialize=False)),
                ("version_no", models.PositiveIntegerField()),
                ("snapshot", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="postmark_versions_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "postmark",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="versions",
                        to="common.postmark",
                    ),
                ),
                (
                    "transaction",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="versions",
                        to="common.submissiontransaction",
                    ),
                ),
            ],
            options={
                "verbose_name": "Postmark Version",
                "verbose_name_plural": "Postmark Versions",
                "db_table": "PostmarkVersions",
                "ordering": ["-version_no", "-id"],
                "unique_together": {("postmark", "version_no")},
            },
        ),
        migrations.AddIndex(
            model_name="submissiontransaction",
            index=models.Index(fields=["postmark", "created_at"], name="subtxn_postmark_created_idx"),
        ),
        migrations.AddIndex(
            model_name="submissiontransaction",
            index=models.Index(fields=["contribution", "created_at"], name="subtxn_contrib_created_idx"),
        ),
        migrations.AddIndex(
            model_name="submissiontransaction",
            index=models.Index(fields=["actor", "created_at"], name="subtxn_actor_created_idx"),
        ),
        migrations.AddIndex(
            model_name="submissiontransaction",
            index=models.Index(fields=["action", "created_at"], name="subtxn_action_created_idx"),
        ),
        migrations.AddIndex(
            model_name="postmarkversion",
            index=models.Index(fields=["postmark", "version_no"], name="pmversion_postmark_no_idx"),
        ),
        migrations.AddIndex(
            model_name="postmarkversion",
            index=models.Index(fields=["created_at"], name="pmversion_created_idx"),
        ),
    ]
