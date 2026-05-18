from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("common", "0048_submissiontransaction_postmarkversion"),
    ]

    operations = [
        migrations.CreateModel(
            name="Collection",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_date", models.DateTimeField(auto_now_add=True)),
                ("modified_date", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(help_text='Display name for this Collection (e.g. "Virginia").', max_length=200)),
                ("description", models.TextField(blank=True)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="%(class)s_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "modified_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="%(class)s_modified",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "region",
                    models.OneToOneField(
                        help_text="The Region this Collection covers. One Collection per Region.",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="collection",
                        to="common.region",
                    ),
                ),
            ],
            options={
                "verbose_name": "Collection",
                "verbose_name_plural": "Collections",
                "db_table": "Collections",
                "ordering": ["name"],
            },
        ),
    ]
