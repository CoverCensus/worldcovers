"""Rename Contribution to Submission everywhere it is stored.

Why: the docs, the UI, and the glossary say Submission. The code said
Contribution. This migration makes the database match the renamed code.

What it changes, in order:

1. Model names: Contribution -> Submission,
   ContributionRecycleBin -> SubmissionRecycleBin. Django renames the two
   content types automatically right after each RenameModel.
2. Table names: Contributions -> Submissions,
   contribution_recycle_bin -> submission_recycle_bin.
3. Foreign-key fields named `contribution` -> `submission` on
   SubmissionRecycleBin, SubmissionTransaction, and CatalogSourceItem.
   The column `contribution_id` becomes `submission_id`.
4. Two auto-named indexes (one renamed, one dropped and re-added).
5. Stored values (the RunPython step, `convert_stored_names`):
   - auth Permission codenames and names (`review_contribution` ->
     `review_submission`, plus the default add/change/delete/view rows).
     Rows are updated in place so group assignments survive.
   - SubmissionTransaction.action values (`contribution_superseded` ->
     `submission_superseded`, and the archived / restored pair).
   - CollectionTransferMap.source_model labels
     (`common.contribution` -> `common.submission`).
   - Keys inside every JSONField of the `common` app, at any depth
     (`pending_cover_contribution_id` -> `pending_cover_submission_id`).
   - django-reversion Version.serialized_data (model labels and keys).

Decision recorded here: the data step has NO reverse. A reverse cannot tell
a key that was renamed from a key that always said "submission" (for
example `submission_kind`). To roll back, restore the database backup taken
before the deploy.

Decision recorded here: JSON string VALUES are renamed only when they look
like an identifier, meaning they match IDENTIFIER_VALUE below (letters,
digits, underscore, dot, and at least one underscore or dot). Example:
"common.contribution" and "contribution_superseded" are renamed. Free text
such as "my contribution" and a bare word such as "Contribution" are left
exactly as the user typed them.

Run (cwd = repo root, `.env` and `mysql.cnf` present):
    ./woco migrate common 0026
Expected exit code: 0.
"""

import json
import re

from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


OLD_NAME = re.compile(r"contribution", re.IGNORECASE)
IDENTIFIER_VALUE = re.compile(r"^(?=[A-Za-z0-9_.]*[_.])[A-Za-z0-9_.]+$")


def _replacement(match):
    """Return the new name in the same letter case as the matched old name."""
    text = match.group(0)
    if text.isupper():
        return "SUBMISSION"
    if text[0].isupper():
        return "Submission"
    return "submission"


def rename_text(text):
    """'pending_cover_contribution_id' -> 'pending_cover_submission_id'."""
    return OLD_NAME.sub(_replacement, text)


def rename_json(value):
    """Rename keys at any depth, and identifier-shaped string values.

    Example:
        {"created_from_contribution_id": 7, "note": "my contribution",
         "model": "common.contribution"}
    becomes
        {"created_from_submission_id": 7, "note": "my contribution",
         "model": "common.submission"}
    """
    if isinstance(value, dict):
        return {rename_text(key): rename_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [rename_json(item) for item in value]
    if isinstance(value, str) and IDENTIFIER_VALUE.match(value):
        return rename_text(value)
    return value


def _rename_permissions(apps):
    Permission = apps.get_model("auth", "Permission")
    rows = Permission.objects.filter(
        content_type__app_label="common", codename__icontains="contribution"
    )
    for row in rows:
        row.codename = rename_text(row.codename)
        row.name = rename_text(row.name)
        row.save(update_fields=["codename", "name"])


def _rename_actions(apps):
    SubmissionTransaction = apps.get_model("common", "SubmissionTransaction")
    for old in ("contribution_superseded", "contribution_archived", "contribution_restored"):
        SubmissionTransaction.objects.filter(action=old).update(action=rename_text(old))


def _rename_transfer_labels(apps):
    CollectionTransferMap = apps.get_model("common", "CollectionTransferMap")
    for row in CollectionTransferMap.objects.filter(source_model__icontains="contribution"):
        row.source_model = rename_text(row.source_model)
        row.save(update_fields=["source_model"])


def _rename_json_columns(apps, schema_editor):
    """Rewrite every JSONField in the common app that mentions the old name."""
    quote = schema_editor.connection.ops.quote_name
    for model in apps.get_app_config("common").get_models():
        json_fields = [f for f in model._meta.concrete_fields if isinstance(f, models.JSONField)]
        for field in json_fields:
            where = "LOWER(%s.%s) LIKE %%s" % (quote(model._meta.db_table), quote(field.column))
            rows = model._base_manager.extra(where=[where], params=["%contribution%"])
            for row in rows.only("pk", field.name).iterator():
                before = getattr(row, field.name)
                after = rename_json(before)
                if after != before:
                    model._base_manager.filter(pk=row.pk).update(**{field.name: after})


def _rename_reversion_versions(apps):
    """Version.serialized_data is JSON text: a list of serialized objects."""
    Version = apps.get_model("reversion", "Version")
    rows = Version.objects.filter(format="json", serialized_data__icontains="contribution")
    for row in rows.only("pk", "serialized_data").iterator():
        try:
            before = json.loads(row.serialized_data)
        except ValueError:
            continue
        after = rename_json(before)
        if after != before:
            Version.objects.filter(pk=row.pk).update(serialized_data=json.dumps(after))


def convert_stored_names(apps, schema_editor):
    _rename_permissions(apps)
    _rename_actions(apps)
    _rename_transfer_labels(apps)
    _rename_json_columns(apps, schema_editor)
    _rename_reversion_versions(apps)


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0025_catalog_source_item"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
        ("reversion", "0002_add_index_on_version_for_content_type_and_db"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RenameModel(old_name="Contribution", new_name="Submission"),
        migrations.RenameModel(old_name="ContributionRecycleBin", new_name="SubmissionRecycleBin"),
        migrations.AlterModelTable(name="submission", table="Submissions"),
        migrations.AlterModelTable(name="submissionrecyclebin", table="submission_recycle_bin"),
        # Django's RenameField does not update Meta.indexes, so drop the
        # (contribution, created_at) index before the field rename and add
        # the (submission, created_at) index after it.
        migrations.RemoveIndex(model_name="submissiontransaction", name="SubmissionT_contrib_0a5b82_idx"),
        migrations.RenameField(model_name="submissionrecyclebin", old_name="contribution", new_name="submission"),
        migrations.RenameField(model_name="submissiontransaction", old_name="contribution", new_name="submission"),
        migrations.RenameField(model_name="catalogsourceitem", old_name="contribution", new_name="submission"),
        migrations.RenameIndex(
            model_name="submissionrecyclebin",
            old_name="contributio_archive_4bf550_idx",
            new_name="submission__archive_794e72_idx",
        ),
        migrations.AddIndex(
            model_name="submissiontransaction",
            index=models.Index(fields=["submission", "created_at"], name="SubmissionT_submiss_9a9f11_idx"),
        ),
        # State-only changes below: related names, verbose names, the review
        # permission codename, and the action choice labels.
        migrations.AlterModelOptions(
            name='submission',
            options={'ordering': ['-created_date'], 'permissions': [('review_submission', 'Can review (approve / reject) submissions')], 'verbose_name': 'Submission', 'verbose_name_plural': 'Submissions'},
        ),
        migrations.AlterModelOptions(
            name='submissionrecyclebin',
            options={'ordering': ['-archived_at'], 'verbose_name': 'Archived Submission', 'verbose_name_plural': 'Archived Submissions'},
        ),
        migrations.AlterField(
            model_name='submission',
            name='collection',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='submissions', to='common.collection'),
        ),
        migrations.AlterField(
            model_name='submission',
            name='contributor',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='submissions', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='submission',
            name='marking',
            field=models.OneToOneField(blank=True, help_text='Set when approved; Marking created from submitted_data for new entries', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='submission', to='common.marking'),
        ),
        migrations.AlterField(
            model_name='submission',
            name='reviewer',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_submissions', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='submissionrecyclebin',
            name='archived_by',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='submissions_archived', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='submissiontransaction',
            name='action',
            field=models.CharField(choices=[('submit', 'Record submitted'), ('edit_submission', 'Edited submission'), ('editor_edit', 'Editor edit'), ('approve', 'Approved'), ('reject', 'Rejected'), ('catalog_direct_edit', 'Catalog direct edit'), ('restore_version', 'Restored version'), ('record_create', 'Record created'), ('record_update', 'Record updated'), ('record_delete', 'Record deleted'), ('draft_deleted', 'Draft deleted'), ('submission_superseded', 'Submission superseded'), ('marking_removed', 'Marking removed'), ('marking_restored', 'Marking restored'), ('cover_removed', 'Cover removed'), ('cover_restored', 'Cover restored'), ('submission_archived', 'Submission archived'), ('submission_restored', 'Submission restored'), ('date_seen_added', 'Date added'), ('date_seen_changed', 'Date changed'), ('date_seen_removed', 'Date removed'), ('image_rotated', 'Image rotated'), ('image_caption_changed', 'Image caption changed'), ('postmaster_added', 'Postmaster added'), ('postmaster_changed', 'Postmaster changed'), ('postmaster_event_added', 'Postmaster event added'), ('postmaster_event_changed', 'Postmaster event changed')], max_length=40),
        ),
        migrations.RunPython(convert_stored_names),
    ]
