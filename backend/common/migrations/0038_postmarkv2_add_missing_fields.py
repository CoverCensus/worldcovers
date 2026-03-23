from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0037_postmarkvaluation_v2_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="postmarkv2",
            name="contribution_approval_status",
            field=models.CharField(blank=True, choices=[("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected"), ("needs_revision", "Needs revision")], db_column="V2ContributionApprovalStatus", max_length=20, null=True),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="framing_style",
            field=models.ForeignKey(blank=True, db_column="V2FramingStyleID", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="postmarks_v2_framing_style", to="common.framingstyle"),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="last_public_update_at",
            field=models.DateTimeField(blank=True, db_column="V2LastPublicUpdateAt", null=True),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="legacy_date_format",
            field=models.ForeignKey(blank=True, db_column="V2LegacyDateFormatID", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="postmarks_v2_legacy_date_format", to="common.dateformat"),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="lettering_style",
            field=models.ForeignKey(blank=True, db_column="V2LetteringStyleID", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="postmarks_v2_lettering_style", to="common.letteringstyle"),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="other_characteristics",
            field=models.TextField(blank=True, db_column="V2OtherCharacteristics"),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="postal_facility_identity",
            field=models.ForeignKey(blank=True, db_column="V2PostalFacilityIdentityID", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="postmarks_v2_facility", to="common.postalfacilityidentity"),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="postmark_key",
            field=models.CharField(blank=True, db_column="V2PostmarkKey", max_length=255, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="postmark_shape",
            field=models.ForeignKey(blank=True, db_column="V2PostmarkShapeID", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="postmarks_v2_shape", to="common.postmarkshape"),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="public_slug",
            field=models.SlugField(blank=True, db_column="V2PublicSlug", max_length=150, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="rate_location",
            field=models.CharField(choices=[("TOP", "Top"), ("BOTTOM", "Bottom"), ("LEFT", "Left"), ("RIGHT", "Right"), ("CENTER", "Center"), ("NONE", "None")], db_column="V2RateLocation", default="NONE", max_length=10),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="rate_value",
            field=models.CharField(blank=True, db_column="V2RateValue", default="", max_length=50),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="raw_import_payload",
            field=models.JSONField(blank=True, db_column="V2RawImportPayload", null=True),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="raw_state_data_id",
            field=models.IntegerField(blank=True, db_column="V2RawStateDataID", null=True, unique=True),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="site",
            field=models.ForeignKey(db_column="V2SiteID", default=1, on_delete=django.db.models.deletion.PROTECT, related_name="postmarks_v2_site", to="sites.site"),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="source_catalog",
            field=models.CharField(blank=True, db_column="V2SourceCatalog", default="ASCC 5th ed. (1997)", max_length=255),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="source_page",
            field=models.CharField(blank=True, db_column="V2SourcePage", max_length=50),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="state",
            field=models.ForeignKey(blank=True, db_column="V2StateID", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="postmarks_v2_state", to="postmarks.location"),
        ),
        migrations.AddField(
            model_name="postmarkv2",
            name="visibility",
            field=models.CharField(choices=[("PUBLIC", "Public"), ("DRAFT", "Draft"), ("ARCHIVED", "Archived")], db_column="V2Visibility", default="PUBLIC", max_length=10),
        ),
    ]
