# Index on Postmarks.CreatedDate for fast ORDER BY -created_date on list/catalog API.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0014_drop_contributions_if_exists'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='postmark',
            index=models.Index(fields=['created_date'], name='Postmarks_Created_idx'),
        ),
    ]
