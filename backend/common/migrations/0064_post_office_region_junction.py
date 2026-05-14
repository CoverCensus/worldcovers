# Replace PostOffice.region (direct FK) with a post_office_regions junction
# table, matching docs/model.md. PostOffice rows no longer name a single
# region; jurisdiction over time is recorded as zero-or-more associations.
#
# This is a destructive schema change: the FK column post_office.region_id is
# dropped without backfilling junction rows. Callers must re-run
# `python manage.py import_ascc_bundle <dir> --truncate` to repopulate
# PostOffice and the new post_office_regions table from a munger bundle.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0063_image_is_tracing'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='postoffice',
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name='postoffice',
            name='region',
        ),
        migrations.CreateModel(
            name='PostOfficeRegion',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_date', models.DateTimeField(auto_now_add=True)),
                ('modified_date', models.DateTimeField(auto_now=True)),
                (
                    'created_by',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='postofficeregion_created',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    'modified_by',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='postofficeregion_modified',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    'post_office',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='post_office_regions',
                        to='common.postoffice',
                    ),
                ),
                (
                    'region',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='post_office_regions',
                        to='common.region',
                    ),
                ),
            ],
            options={
                'verbose_name': 'Post Office Region',
                'verbose_name_plural': 'Post Office Regions',
                'db_table': 'post_office_region',
                'ordering': ['post_office__name', 'region__name'],
                'unique_together': {('post_office', 'region')},
            },
        ),
    ]
