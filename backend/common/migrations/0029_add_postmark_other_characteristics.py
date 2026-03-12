# Add OtherCharacteristics column to Postmarks if missing (legacy schema compatibility)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0028_contribution_align_schema"),
    ]

    operations = [
        migrations.AddField(
            model_name="postmark",
            name="other_characteristics",
            field=models.TextField(blank=True, db_column="OtherCharacteristics", default=""),
        ),
    ]
