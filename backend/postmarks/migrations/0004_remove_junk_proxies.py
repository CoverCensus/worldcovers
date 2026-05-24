from django.db import migrations


class Migration(migrations.Migration):
    """
    Remove proxy models for junk v1 models being deleted from common in migration 0038.
    Must run before common.0038 deletes the base models.
    """

    dependencies = [
        ('postmarks', '0003_catalogrequest'),
        ('common', '0037_delete_postal_facility_models'),
    ]

    operations = [
        migrations.DeleteModel(name='PostmarkShape'),
        migrations.DeleteModel(name='LetteringStyle'),
        migrations.DeleteModel(name='FramingStyle'),
        migrations.DeleteModel(name='DateFormat'),
        migrations.DeleteModel(name='PostmarkPublication'),
        migrations.DeleteModel(name='PostmarkPublicationReference'),
        migrations.DeleteModel(name='PostmarkColor'),
        migrations.DeleteModel(name='PostmarkDatesSeen'),
        migrations.DeleteModel(name='PostmarkSize'),
    ]
