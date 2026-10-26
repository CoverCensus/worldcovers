from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("common", "0021_image_caption_changed_action")]

    operations = [
        migrations.CreateModel(
            name="CollectionTransferMap",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_instance", models.CharField(max_length=255)),
                ("source_model", models.CharField(max_length=100)),
                ("source_id", models.CharField(max_length=64)),
                ("target_id", models.CharField(max_length=64)),
                ("record_digest", models.CharField(max_length=64)),
            ],
            options={
                "constraints": [models.UniqueConstraint(
                    fields=("source_instance", "source_model", "source_id"),
                    name="collection_transfer_source_unique",
                )],
            },
        ),
    ]
