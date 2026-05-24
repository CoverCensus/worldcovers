from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0066_covermarking_review_workflow"),
    ]

    operations = [
        migrations.AddField(
            model_name="covermarking",
            name="contributor_comment",
            field=models.TextField(
                blank=True,
                help_text="Optional note from the contributor for reviewers when this link was submitted.",
            ),
        ),
    ]
