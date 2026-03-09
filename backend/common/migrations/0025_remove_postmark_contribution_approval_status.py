from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0024_postmark_contribution_approval_status"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="postmark",
            name="contribution_approval_status",
        ),
    ]

