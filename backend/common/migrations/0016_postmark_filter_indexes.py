# Add indexes for common filter fields to speed up WHERE clauses in catalog search.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0015_postmark_created_date_idx'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='postmark',
            index=models.Index(fields=['postmark_shape'], name='Postmarks_Shape_idx'),
        ),
        migrations.AddIndex(
            model_name='postmark',
            index=models.Index(fields=['is_manuscript'], name='Postmarks_Manuscript_idx'),
        ),
    ]
