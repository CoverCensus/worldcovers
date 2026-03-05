import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0016_userlocationassignment_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='userlocationassignment',
            name='administrative_unit',
            field=models.ForeignKey(
                db_column='AdministrativeUnitID',
                help_text='Location this user is associated with',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='user_location_assignments',
                to='common.administrativeunit',
            ),
        ),
        migrations.AddField(
            model_name='userlocationassignment',
            name='user',
            field=models.ForeignKey(
                db_column='UserID',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='location_assignments',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterUniqueTogether(
            name='userlocationassignment',
            unique_together={('user', 'administrative_unit')},
        ),
    ]

