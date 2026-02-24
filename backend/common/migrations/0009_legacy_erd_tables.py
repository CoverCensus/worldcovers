# Legacy ERD tables (all 13 CSV sources from data_model-v1.erd)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0008_admincsvupload_row_count'),
    ]

    operations = [
        migrations.CreateModel(
            name='LegacyAbbreviation',
            fields=[
                ('id', models.AutoField(db_column='ID', primary_key=True, serialize=False)),
                ('txt_abbreviation', models.CharField(db_column='txtAbbreviation', max_length=100)),
                ('txt_meaning', models.CharField(blank=True, db_column='txtMeaning', max_length=255)),
                ('n_order', models.IntegerField(db_column='nOrder', default=0)),
                ('yn_active', models.BooleanField(db_column='ynActive', default=True)),
            ],
            options={
                'db_table': 'LegacyAbbreviations',
                'ordering': ['n_order', 'txt_abbreviation'],
                'verbose_name': 'Legacy Abbreviation',
            },
        ),
        migrations.CreateModel(
            name='LegacyRateLocation',
            fields=[
                ('id', models.AutoField(db_column='nTownmarkRateLocationID', primary_key=True, serialize=False)),
                ('txt_townmark_rate_location', models.CharField(db_column='txtTownmarkRateLocation', max_length=100)),
                ('mem_townmark_rate_location', models.CharField(blank=True, db_column='memTownmarkRateLocation', max_length=255)),
                ('n_order', models.IntegerField(db_column='nOrder', default=0)),
                ('yn_active', models.BooleanField(db_column='ynActive', default=True)),
            ],
            options={
                'db_table': 'LegacyTownmarkRateLocations',
                'ordering': ['n_order'],
                'verbose_name': 'Legacy Rate Location',
            },
        ),
        migrations.CreateModel(
            name='LegacyRateValue',
            fields=[
                ('id', models.AutoField(db_column='nTownmarkRateValueID', primary_key=True, serialize=False)),
                ('txt_townmark_rate_value', models.CharField(db_column='txtTownmarkRateValue', max_length=50)),
                ('n_order', models.IntegerField(db_column='nOrder', default=0)),
                ('yn_active', models.BooleanField(db_column='ynActive', default=True)),
            ],
            options={
                'db_table': 'LegacyTownmarkRateValues',
                'ordering': ['n_order'],
                'verbose_name': 'Legacy Rate Value',
            },
        ),
        migrations.CreateModel(
            name='LegacyParseStep',
            fields=[
                ('id', models.AutoField(db_column='nParseStepID', primary_key=True, serialize=False)),
                ('txt_parse_step', models.CharField(db_column='txtParseStep', max_length=255)),
                ('n_state_id', models.IntegerField(db_column='nStateID')),
                ('yn_completed', models.BooleanField(db_column='ynCompleted', default=False)),
                ('n_order', models.IntegerField(db_column='nOrder', default=0)),
                ('yn_active', models.BooleanField(db_column='ynActive', default=True)),
            ],
            options={
                'db_table': 'LegacyParseSteps',
                'ordering': ['n_state_id', 'n_order'],
                'verbose_name': 'Legacy Parse Step',
            },
        ),
        migrations.CreateModel(
            name='LegacyUserState',
            fields=[
                ('id', models.AutoField(db_column='ID', primary_key=True, serialize=False)),
                ('n_user_id', models.IntegerField(db_column='nUserID')),
                ('n_state_id', models.IntegerField(db_column='nStateID')),
                ('mem_roles', models.TextField(blank=True, db_column='memRoles')),
            ],
            options={
                'db_table': 'LegacyUserStates',
                'ordering': ['n_user_id', 'n_state_id'],
                'verbose_name': 'Legacy User State',
                'unique_together': {('n_user_id', 'n_state_id')},
            },
        ),
        migrations.CreateModel(
            name='LegacyRawStateDataPendingUpdate',
            fields=[
                ('id', models.AutoField(db_column='id', primary_key=True, serialize=False)),
                ('n_raw_state_data_id', models.IntegerField(blank=True, db_column='nRawStateDataID', null=True)),
                ('n_state_id', models.IntegerField(blank=True, db_column='nStateID', null=True)),
                ('payload', models.JSONField(db_column='Payload', default=dict)),
            ],
            options={
                'db_table': 'LegacyRawStateDataPendingUpdates',
                'ordering': ['-id'],
                'verbose_name': 'Legacy Pending Update',
            },
        ),
        migrations.CreateModel(
            name='LegacyCover',
            fields=[
                ('id', models.AutoField(db_column='nCoverID', primary_key=True, serialize=False)),
                ('n_user_id', models.IntegerField(db_column='nUserID')),
                ('txt_cover_key_id', models.CharField(blank=True, db_column='txtCoverKeyID', max_length=100)),
                ('txt_state_abv', models.CharField(blank=True, db_column='txtStateAbv', max_length=20)),
                ('txt_territory', models.CharField(blank=True, db_column='txtTerritory', max_length=255)),
                ('txt_town', models.CharField(blank=True, db_column='txtTown', max_length=255)),
                ('txt_townmark_shape', models.CharField(blank=True, db_column='txtTownmarkShape', max_length=100)),
                ('txt_lettering', models.CharField(blank=True, db_column='txtLettering', max_length=100)),
                ('txt_townmark_framing', models.CharField(blank=True, db_column='txtTownmarkFraming', max_length=100)),
                ('txt_date_format', models.CharField(blank=True, db_column='txtDateFormat', max_length=100)),
                ('txt_rate', models.CharField(blank=True, db_column='txtRate', max_length=50)),
                ('txt_rate_text', models.CharField(blank=True, db_column='txtRateText', max_length=255)),
                ('txt_second_rate', models.CharField(blank=True, db_column='txtSecondRate', max_length=255)),
                ('n_width', models.FloatField(blank=True, db_column='nWidth', null=True)),
                ('n_height', models.FloatField(blank=True, db_column='nHeight', null=True)),
                ('txt_color', models.CharField(blank=True, db_column='txtColor', max_length=100)),
                ('n_earliest_use_day', models.IntegerField(blank=True, db_column='nEarliestUseDay', null=True)),
                ('n_earliest_use_month', models.IntegerField(blank=True, db_column='nEarliestUseMonth', null=True)),
                ('n_earliest_use_year', models.IntegerField(blank=True, db_column='nEarliestUseYear', null=True)),
                ('n_latest_use_day', models.IntegerField(blank=True, db_column='nLatestUseDay', null=True)),
                ('n_latest_use_month', models.IntegerField(blank=True, db_column='nLatestUseMonth', null=True)),
                ('n_latest_use_year', models.IntegerField(blank=True, db_column='nLatestUseYear', null=True)),
                ('mem_ascc_text', models.TextField(blank=True, db_column='memASCCText')),
                ('mem_notes', models.TextField(blank=True, db_column='memNotes')),
                ('mem_other_char', models.TextField(blank=True, db_column='memOtherChar')),
                ('n_estimated_value', models.FloatField(blank=True, db_column='nEstimatedValue', null=True)),
                ('txt_published_id', models.CharField(blank=True, db_column='txtPublishedID', max_length=100)),
                ('txt_image1', models.CharField(blank=True, db_column='txtImage1', max_length=255)),
                ('txt_image2', models.CharField(blank=True, db_column='txtImage2', max_length=255)),
            ],
            options={
                'db_table': 'LegacyCovers',
                'ordering': ['n_user_id', 'id'],
                'verbose_name': 'Legacy Cover',
            },
        ),
    ]
