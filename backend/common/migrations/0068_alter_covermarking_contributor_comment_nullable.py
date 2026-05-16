from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0067_covermarking_contributor_comment"),
    ]

    operations = [
        migrations.AlterField(
            model_name="covermarking",
            name="contributor_comment",
            field=models.TextField(
                blank=True,
                null=True,
                help_text="Optional note from the contributor for reviewers when this link was submitted.",
            ),
        ),
    ]
