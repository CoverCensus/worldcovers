"""
Collapse v1 Postmark / PostmarkV2 dual-model into a single clean Postmark.

Operations:
1. Remove junk FK fields from PostmarkV2 (so those models can be deleted).
2. Delete PostmarkV2.
3. Remove FK fields from Postmark that point to junk models.
4. Delete the junk value-table models.
5. Delete the junk join models (PostmarkColor, PostmarkDatesSeen, PostmarkSize,
   PostmarkPublication, PostmarkPublicationReference).
6. Remove remaining v1 admin/legacy fields from Postmark.
7. Enforce unique constraint on Postmark.code and fix ordering meta.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0037_delete_postal_facility_models'),
        ('postmarks', '0004_remove_junk_proxies'),
    ]

    operations = [
        # ── Step 1: Strip junk FK fields off PostmarkV2 ──────────────────────
        migrations.RemoveField(model_name='postmarkv2', name='framing_style'),
        migrations.RemoveField(model_name='postmarkv2', name='lettering_style'),
        migrations.RemoveField(model_name='postmarkv2', name='postmark_shape'),
        migrations.RemoveField(model_name='postmarkv2', name='date_format'),
        migrations.RemoveField(model_name='postmarkv2', name='legacy_date_format'),
        migrations.RemoveField(model_name='postmarkv2', name='postmark'),
        migrations.RemoveField(model_name='postmarkv2', name='state'),
        migrations.RemoveField(model_name='postmarkv2', name='site'),

        # ── Step 2: Delete PostmarkV2 ────────────────────────────────────────
        migrations.DeleteModel(name='PostmarkV2'),

        # ── Step 3: Remove Postmark's FK fields that point to junk models ────
        # Must happen before deleting those junk models.
        migrations.RemoveField(model_name='postmark', name='postmark_shape'),
        migrations.RemoveField(model_name='postmark', name='lettering_style'),
        migrations.RemoveField(model_name='postmark', name='framing_style'),
        migrations.RemoveField(model_name='postmark', name='date_format'),
        migrations.RemoveField(model_name='postmark', name='state'),
        migrations.RemoveField(model_name='postmark', name='site'),

        # ── Step 4: Delete junk value-table models ───────────────────────────
        migrations.DeleteModel(name='PostmarkShape'),
        migrations.DeleteModel(name='LetteringStyle'),
        migrations.DeleteModel(name='FramingStyle'),
        migrations.DeleteModel(name='DateFormat'),

        # ── Step 5: Delete junk join models ──────────────────────────────────
        # PostmarkPublicationReference before PostmarkPublication (FK dependency)
        migrations.DeleteModel(name='PostmarkPublicationReference'),
        migrations.DeleteModel(name='PostmarkPublication'),
        migrations.DeleteModel(name='PostmarkColor'),
        migrations.DeleteModel(name='PostmarkDatesSeen'),
        migrations.DeleteModel(name='PostmarkSize'),

        # ── Step 6: Remove remaining v1 admin/legacy fields from Postmark ────
        migrations.RemoveField(model_name='postmark', name='postmark_key'),
        migrations.RemoveField(model_name='postmark', name='raw_state_data_id'),
        migrations.RemoveField(model_name='postmark', name='public_slug'),
        migrations.RemoveField(model_name='postmark', name='visibility'),
        migrations.RemoveField(model_name='postmark', name='source_catalog'),
        migrations.RemoveField(model_name='postmark', name='source_page'),
        migrations.RemoveField(model_name='postmark', name='last_public_update_at'),
        migrations.RemoveField(model_name='postmark', name='raw_import_payload'),
        migrations.RemoveField(model_name='postmark', name='rate_location'),
        migrations.RemoveField(model_name='postmark', name='rate_value'),
        migrations.RemoveField(model_name='postmark', name='other_characteristics'),
        migrations.RemoveField(model_name='postmark', name='contribution_approval_status'),

        # ── Step 7: Enforce unique on Postmark.code, update model options ────
        migrations.AlterField(
            model_name='postmark',
            name='code',
            field=models.CharField(
                max_length=30, unique=True, null=True, blank=True,
                help_text='Editor-assigned reference identifier',
            ),
        ),
        migrations.AlterModelOptions(
            name='postmark',
            options={
                'ordering': ['postmark_id'],
                'verbose_name': 'Postmark',
                'verbose_name_plural': 'Postmarks',
            },
        ),
    ]
