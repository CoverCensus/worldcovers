from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('common', '0006_alter_postmark_key_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='AdminCsvUpload',
            fields=[
                ('id', models.AutoField(db_column='AdminCsvUploadID', primary_key=True, serialize=False)),
                ('name', models.CharField(db_column='Name', help_text='Display name for this upload (e.g. from filename or user input)', max_length=255)),
                ('file_name', models.CharField(db_column='FileName', help_text='Original filename of the CSV', max_length=255)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True, db_column='UploadedAt')),
                ('data', models.JSONField(db_column='Data', default=dict, help_text='Parsed CSV: headers and rows')),
                ('uploaded_by', models.ForeignKey(blank=True, db_column='UploadedByUserID', null=True, on_delete=models.SET_NULL, related_name='admin_csv_uploads', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Admin CSV Upload',
                'verbose_name_plural': 'Admin CSV Uploads',
                'db_table': 'AdminCsvUploads',
                'ordering': ['-uploaded_at'],
            },
        ),
    ]
