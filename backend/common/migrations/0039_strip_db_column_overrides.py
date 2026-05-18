"""
Strip PascalCase db_column= overrides from non-exempt models so DB column names
become snake_case (matching the Python attribute names).

AdministrativeUnit / AdministrativeUnitIdentity / AdministrativeUnitResponsibility
are intentionally excluded — their PascalCase column names are stable by decision.

Each AlterField here removes the db_column= parameter; Django detects the column
rename and emits ALTER TABLE ... CHANGE COLUMN OldName new_name ... on MySQL.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0038_collapse_postmark_v1"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── Postmark ──────────────────────────────────────────────────────────
        migrations.AlterField(
            model_name="postmark",
            name="postmark_id",
            field=models.AutoField(primary_key=True, serialize=False),
        ),

        # ── Contribution ──────────────────────────────────────────────────────
        migrations.AlterField(
            model_name="contribution",
            name="id",
            field=models.AutoField(primary_key=True, serialize=False),
        ),
        migrations.AlterField(
            model_name="contribution",
            name="contributor",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="contributions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="contribution",
            name="postmark",
            field=models.OneToOneField(
                blank=True,
                help_text="Set when approved; Postmark created from submitted_data for new entries",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="contribution",
                to="common.postmark",
            ),
        ),
        migrations.AlterField(
            model_name="contribution",
            name="submitted_data",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Proposed changes (state, town, type, color, description, etc.)",
            ),
        ),
        migrations.AlterField(
            model_name="contribution",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                    ("needs_revision", "Needs revision"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="contribution",
            name="reviewer",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="reviewed_contributions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="contribution",
            name="review_notes",
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name="contribution",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True),
        ),
        migrations.AlterField(
            model_name="contribution",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),

        # ── PostmarkValuation ─────────────────────────────────────────────────
        migrations.AlterField(
            model_name="postmarkvaluation",
            name="postmark",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="valuations",
                to="common.postmark",
            ),
        ),

        # ── PostmarkImage ─────────────────────────────────────────────────────
        migrations.AlterField(
            model_name="postmarkimage",
            name="postmark_image_id",
            field=models.AutoField(primary_key=True, serialize=False),
        ),
        migrations.AlterField(
            model_name="postmarkimage",
            name="postmark",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="images",
                to="common.postmark",
            ),
        ),
        migrations.AlterField(
            model_name="postmarkimage",
            name="original_filename",
            field=models.CharField(max_length=255),
        ),
        migrations.AlterField(
            model_name="postmarkimage",
            name="storage_filename",
            field=models.CharField(max_length=255, unique=True),
        ),
        migrations.AlterField(
            model_name="postmarkimage",
            name="file_checksum",
            field=models.CharField(max_length=64),
        ),
        migrations.AlterField(
            model_name="postmarkimage",
            name="mime_type",
            field=models.CharField(max_length=50),
        ),
        migrations.AlterField(
            model_name="postmarkimage",
            name="image_width",
            field=models.IntegerField(),
        ),
        migrations.AlterField(
            model_name="postmarkimage",
            name="image_height",
            field=models.IntegerField(),
        ),
        migrations.AlterField(
            model_name="postmarkimage",
            name="file_size_bytes",
            field=models.BigIntegerField(),
        ),
        migrations.AlterField(
            model_name="postmarkimage",
            name="image_view",
            field=models.CharField(
                choices=[("FULL", "Full"), ("DETAIL", "Detail"), ("COMPARISON", "Comparison")],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="postmarkimage",
            name="image_description",
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name="postmarkimage",
            name="display_order",
            field=models.IntegerField(default=0),
        ),
        migrations.AlterField(
            model_name="postmarkimage",
            name="uploaded_by",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="postmark_images_uploaded",
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        # ── Postcover ─────────────────────────────────────────────────────────
        migrations.AlterField(
            model_name="postcover",
            name="postcover_id",
            field=models.AutoField(primary_key=True, serialize=False),
        ),
        migrations.AlterField(
            model_name="postcover",
            name="owner_user",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="postcovers_owned",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="postcover",
            name="postcover_key",
            field=models.CharField(max_length=100, unique=True),
        ),
        migrations.AlterField(
            model_name="postcover",
            name="description",
            field=models.TextField(blank=True),
        ),

        # ── PostcoverPostmark ─────────────────────────────────────────────────
        migrations.AlterField(
            model_name="postcoverpostmark",
            name="postcover_postmark_id",
            field=models.AutoField(primary_key=True, serialize=False),
        ),
        migrations.AlterField(
            model_name="postcoverpostmark",
            name="postcover",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="postcover_postmarks",
                to="common.postcover",
            ),
        ),
        migrations.AlterField(
            model_name="postcoverpostmark",
            name="postmark",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="postcover_postmarks",
                to="common.postmark",
            ),
        ),
        migrations.AlterField(
            model_name="postcoverpostmark",
            name="position_order",
            field=models.IntegerField(),
        ),
        migrations.AlterField(
            model_name="postcoverpostmark",
            name="postmark_location",
            field=models.CharField(
                choices=[
                    ("FRONT", "Front"),
                    ("BACK", "Back"),
                    ("FRONT_UPPER_RIGHT", "Front Upper Right"),
                    ("FRONT_UPPER_LEFT", "Front Upper Left"),
                    ("BACK_UPPER_RIGHT", "Back Upper Right"),
                    ("BACK_UPPER_LEFT", "Back Upper Left"),
                    ("BACK_LOWER_LEFT", "Back Lower Left"),
                    ("BACK_LOWER_RIGHT", "Back Lower Right"),
                ],
                max_length=20,
            ),
        ),

        # ── PostcoverImage ────────────────────────────────────────────────────
        migrations.AlterField(
            model_name="postcoverimage",
            name="postcover_image_id",
            field=models.AutoField(primary_key=True, serialize=False),
        ),
        migrations.AlterField(
            model_name="postcoverimage",
            name="postcover",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="images",
                to="common.postcover",
            ),
        ),
        migrations.AlterField(
            model_name="postcoverimage",
            name="uploaded_by",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="postcover_images_uploaded",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="postcoverimage",
            name="original_filename",
            field=models.CharField(max_length=255),
        ),
        migrations.AlterField(
            model_name="postcoverimage",
            name="storage_filename",
            field=models.CharField(max_length=255, unique=True),
        ),
        migrations.AlterField(
            model_name="postcoverimage",
            name="file_checksum",
            field=models.CharField(max_length=64),
        ),
        migrations.AlterField(
            model_name="postcoverimage",
            name="mime_type",
            field=models.CharField(max_length=50),
        ),
        migrations.AlterField(
            model_name="postcoverimage",
            name="image_width",
            field=models.IntegerField(),
        ),
        migrations.AlterField(
            model_name="postcoverimage",
            name="image_height",
            field=models.IntegerField(),
        ),
        migrations.AlterField(
            model_name="postcoverimage",
            name="file_size_bytes",
            field=models.BigIntegerField(),
        ),
        migrations.AlterField(
            model_name="postcoverimage",
            name="image_view",
            field=models.CharField(
                choices=[
                    ("FRONT", "Front"),
                    ("BACK", "Back"),
                    ("INTERIOR", "Interior"),
                    ("DETAIL", "Detail"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="postcoverimage",
            name="image_description",
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name="postcoverimage",
            name="display_order",
            field=models.IntegerField(default=0),
        ),

        # ── AdminCsvUpload ────────────────────────────────────────────────────
        migrations.AlterField(
            model_name="admincsvupload",
            name="id",
            field=models.AutoField(primary_key=True, serialize=False),
        ),
        migrations.AlterField(
            model_name="admincsvupload",
            name="name",
            field=models.CharField(
                help_text="Display name for this upload (e.g. from filename or user input)",
                max_length=255,
            ),
        ),
        migrations.AlterField(
            model_name="admincsvupload",
            name="file_name",
            field=models.CharField(
                help_text="Original filename of the CSV",
                max_length=255,
            ),
        ),
        migrations.AlterField(
            model_name="admincsvupload",
            name="uploaded_at",
            field=models.DateTimeField(auto_now_add=True),
        ),
        migrations.AlterField(
            model_name="admincsvupload",
            name="uploaded_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="admin_csv_uploads",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="admincsvupload",
            name="data",
            field=models.JSONField(
                default=dict,
                help_text="Parsed CSV: headers and rows",
            ),
        ),
        migrations.AlterField(
            model_name="admincsvupload",
            name="row_count",
            field=models.PositiveIntegerField(
                default=0,
                help_text="Number of data rows (denormalized for list views without loading Data).",
            ),
        ),

        # ── UserLocationAssignment ────────────────────────────────────────────
        migrations.AlterField(
            model_name="userlocationassignment",
            name="id",
            field=models.AutoField(primary_key=True, serialize=False),
        ),
        migrations.AlterField(
            model_name="userlocationassignment",
            name="user",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="location_assignments",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="userlocationassignment",
            name="administrative_unit",
            field=models.ForeignKey(
                help_text="Location this user is associated with",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="user_location_assignments",
                to="common.administrativeunit",
            ),
        ),

        # ── FAQEntry ──────────────────────────────────────────────────────────
        migrations.AlterField(
            model_name="faqentry",
            name="faq_entry_id",
            field=models.AutoField(primary_key=True, serialize=False),
        ),
        migrations.AlterField(
            model_name="faqentry",
            name="question",
            field=models.CharField(max_length=500),
        ),
        migrations.AlterField(
            model_name="faqentry",
            name="answer",
            field=models.TextField(),
        ),
        migrations.AlterField(
            model_name="faqentry",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
        migrations.AlterField(
            model_name="faqentry",
            name="display_order",
            field=models.PositiveIntegerField(
                default=0,
                help_text="Lower numbers appear first.",
            ),
        ),
    ]
