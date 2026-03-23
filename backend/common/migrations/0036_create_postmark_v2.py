from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0035_alter_cover_code_alter_framing_code_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PostmarkV2",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_date", models.DateTimeField(auto_now_add=True, db_column="CreatedDate")),
                ("modified_date", models.DateTimeField(auto_now=True, db_column="ModifiedDate")),
                ("code", models.CharField(blank=True, max_length=30, null=True, unique=True)),
                ("catalog_txt", models.TextField(blank=True)),
                ("inscription_txt", models.TextField(blank=True)),
                ("is_manuscript", models.BooleanField(default=False)),
                ("impression", models.CharField(blank=True, choices=[("Normal", "Normal"), ("Stencil", "Stencil"), ("Negative", "Negative")], max_length=10, null=True)),
                ("is_irreg", models.BooleanField(blank=True, null=True)),
                ("width", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("height", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("date_type", models.CharField(blank=True, choices=[("BISHOP MARK", "Bishop Mark"), ("FRANKLIN MARK", "Franklin Mark"), ("QUAKER DATE", "Quaker Date")], max_length=20, null=True)),
                ("date_fmt", models.CharField(blank=True, choices=[("MD", "MD"), ("MDD", "MDD"), ("YD", "YD"), ("YMD", "YMD"), ("YMDD", "YMDD")], max_length=10, null=True)),
                ("color", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="postmark_v2_entries", to="common.color")),
                ("created_by", models.ForeignKey(db_column="CreatedByUserID", on_delete=django.db.models.deletion.PROTECT, related_name="%(class)s_created", to=settings.AUTH_USER_MODEL)),
                ("date_format", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="postmark_v2_entries", to="common.dateformat")),
                ("lettering", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="postmark_v2_entries", to="common.lettering")),
                ("modified_by", models.ForeignKey(db_column="ModifiedByUserID", on_delete=django.db.models.deletion.PROTECT, related_name="%(class)s_modified", to=settings.AUTH_USER_MODEL)),
                ("post_office", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="postmark_v2_entries", to="common.postoffice")),
                ("postmark", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="v2_data", to="common.postmark")),
                ("shape", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="postmark_v2_entries", to="common.shape")),
            ],
            options={
                "verbose_name": "Postmark V2",
                "verbose_name_plural": "Postmark V2",
                "db_table": "PostmarkV2",
            },
        ),
    ]
