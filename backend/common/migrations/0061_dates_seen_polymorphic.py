# Convert the per-Cover `cover_date` table into a polymorphic `dates_seen`
# table that can be attached to either a Cover or a Marking, mirroring the
# (subject_type, subject_id) shape used by Image and Citation.
#
# Migration steps:
#   1. Create the new DateSeen model (table `dates_seen`) with subject_type /
#      subject_id columns plus the existing date / granularity / audit fields.
#   2. Copy every CoverDate row into DateSeen with subject_type='COVER' and
#      subject_id=cover_id, preserving date, granularity, and audit columns.
#   3. Delete the old CoverDate model (drops table `cover_date`).
#
# Marking-attached DateSeen rows are not produced here; they are created by
# editorial action after this migration.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def copy_cover_dates_to_dates_seen(apps, schema_editor):
    CoverDate = apps.get_model('common', 'CoverDate')
    DateSeen = apps.get_model('common', 'DateSeen')

    rows = []
    for cd in CoverDate.objects.all().iterator():
        rows.append(DateSeen(
            subject_type='COVER',
            subject_id=cd.cover_id,
            date=cd.date,
            granularity=cd.granularity,
            created_date=cd.created_date,
            modified_date=cd.modified_date,
            created_by_id=cd.created_by_id,
            modified_by_id=cd.modified_by_id,
        ))
    DateSeen.objects.bulk_create(rows, batch_size=1000)


def copy_dates_seen_back_to_cover_dates(apps, schema_editor):
    # Reverse path: drop every MARKING-scoped DateSeen row (those have no
    # equivalent in the old per-Cover table) and project COVER-scoped rows
    # back into CoverDate. This is best-effort and only supports going back
    # before any marking-scoped dates have been authored.
    CoverDate = apps.get_model('common', 'CoverDate')
    DateSeen = apps.get_model('common', 'DateSeen')

    rows = []
    for ds in DateSeen.objects.filter(subject_type='COVER').iterator():
        rows.append(CoverDate(
            cover_id=ds.subject_id,
            date=ds.date,
            granularity=ds.granularity,
            created_date=ds.created_date,
            modified_date=ds.modified_date,
            created_by_id=ds.created_by_id,
            modified_by_id=ds.modified_by_id,
        ))
    CoverDate.objects.bulk_create(rows, batch_size=1000)


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0060_delete_admincsvupload'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='DateSeen',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_date', models.DateTimeField(auto_now_add=True)),
                ('modified_date', models.DateTimeField(auto_now=True)),
                ('subject_type', models.CharField(choices=[('COVER', 'Cover'), ('MARKING', 'Marking')], max_length=8)),
                ('subject_id', models.PositiveIntegerField(help_text='PK of the dated Cover or Marking')),
                ('date', models.DateField(help_text='Calendar date of the observed use')),
                ('granularity', models.CharField(choices=[('DAY', 'Day'), ('MONTH', 'Month'), ('YEAR', 'Year')], max_length=5)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_created', to=settings.AUTH_USER_MODEL)),
                ('modified_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_modified', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Date Seen',
                'verbose_name_plural': 'Dates Seen',
                'db_table': 'dates_seen',
                'ordering': ['subject_type', 'subject_id', 'date'],
            },
        ),
        migrations.AddIndex(
            model_name='dateseen',
            index=models.Index(fields=['subject_type', 'subject_id', 'date'], name='dates_seen_subject_date_idx'),
        ),
        migrations.AddConstraint(
            model_name='dateseen',
            constraint=models.CheckConstraint(
                check=models.Q(subject_type__in=['COVER', 'MARKING']),
                name='dates_seen_subject_type_valid',
            ),
        ),
        migrations.RunPython(
            copy_cover_dates_to_dates_seen,
            reverse_code=copy_dates_seen_back_to_cover_dates,
        ),
        migrations.DeleteModel(name='CoverDate'),
    ]
