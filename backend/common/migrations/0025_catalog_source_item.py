import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0024_legacy_email_verification_exemption'),
    ]

    operations = [
        migrations.CreateModel(
            name='CatalogSourceItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(max_length=12)),
                ('source_key', models.CharField(max_length=80)),
                ('evidence', models.JSONField(default=dict)),
                ('decision', models.JSONField(default=dict)),
                ('applied', models.BooleanField(default=False)),
                ('contribution', models.OneToOneField(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='catalog_source', to='common.contribution')),
                ('cover', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='common.cover')),
                ('marking', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='common.marking')),
                ('post_office', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='common.postoffice')),
                ('reference_work', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='common.referencework')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('reference_work', 'kind', 'source_key'), name='catalog_source_item_unique')],
            },
        ),
    ]
