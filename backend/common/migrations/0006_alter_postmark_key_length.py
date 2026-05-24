from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0005_make_postmark_facility_nullable'),
    ]

    operations = [
        migrations.AlterField(
            model_name='postmark',
            name='postmark_key',
            field=models.CharField(db_column='PostmarkKey', max_length=255, unique=True),
        ),
    ]
