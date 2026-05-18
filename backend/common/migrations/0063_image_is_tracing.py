# Replace the implicit "tracing" hack (image_view='COMPARISON' OR a "tracing"
# substring in image_description / original_filename) with an explicit
# is_tracing boolean column on images. After backfill, COMPARISON is no
# longer a valid image_view -- legacy COMPARISON rows are rewritten to FULL
# and the CHECK constraint is rebuilt to allow only FULL/DETAIL for
# subject_type=MARKING.

from django.db import migrations, models


def backfill_is_tracing(apps, schema_editor):
    Image = apps.get_model('common', 'Image')
    qs = Image.objects.all()
    for img in qs.iterator():
        view = (img.image_view or '').upper()
        desc = (img.image_description or '').lower()
        fname = (img.original_filename or '').lower()
        is_tracing = (
            view == 'COMPARISON'
            or 'tracing' in desc
            or 'tracing' in fname
        )
        new_view = 'FULL' if view == 'COMPARISON' else img.image_view
        if is_tracing != img.is_tracing or new_view != img.image_view:
            img.is_tracing = is_tracing
            img.image_view = new_view
            img.save(update_fields=['is_tracing', 'image_view'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0062_alter_contribution_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='image',
            name='is_tracing',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(backfill_is_tracing, noop_reverse),
        migrations.RemoveConstraint(
            model_name='image',
            name='image_view_matches_subject_type',
        ),
        migrations.AlterField(
            model_name='image',
            name='image_view',
            field=models.CharField(
                choices=[
                    ('BACK', 'Back'),
                    ('DETAIL', 'Detail'),
                    ('FRONT', 'Front'),
                    ('FULL', 'Full'),
                    ('INTERIOR', 'Interior'),
                ],
                max_length=16,
            ),
        ),
        migrations.AddConstraint(
            model_name='image',
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(
                        ('image_view__in', ['FULL', 'DETAIL']),
                        ('subject_type', 'MARKING'),
                    ),
                    models.Q(
                        ('image_view__in', ['FRONT', 'BACK', 'INTERIOR', 'DETAIL']),
                        ('subject_type', 'COVER'),
                    ),
                    _connector='OR',
                ),
                name='image_view_matches_subject_type',
            ),
        ),
    ]
