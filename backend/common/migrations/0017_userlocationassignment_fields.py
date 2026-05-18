import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0016_userlocationassignment_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    # This migration originally ALTERed the UserLocationAssignments table to
    # add the user and administrative_unit columns. Those columns (and the
    # unique_together constraint) are now created directly in 0016 for new
    # databases. To avoid duplicate ALTER TABLE statements and failures on
    # fresh databases, we turn this into a no-op.
    operations = []

