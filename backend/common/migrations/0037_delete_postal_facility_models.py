from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0036_alter_color_options_alter_postmarkvaluation_options_and_more'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='postmark',
            name='postal_facility_identity',
        ),
        migrations.RemoveField(
            model_name='postmarkv2',
            name='postal_facility_identity',
        ),
        migrations.DeleteModel(
            name='JurisdictionalAffiliation',
        ),
        migrations.DeleteModel(
            name='PostalFacilityIdentity',
        ),
        migrations.DeleteModel(
            name='PostalFacility',
        ),
    ]
