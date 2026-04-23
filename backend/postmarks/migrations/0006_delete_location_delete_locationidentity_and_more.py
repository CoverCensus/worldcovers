from django.db import migrations


class Migration(migrations.Migration):
    """
    Placeholder: proxy model removal and AU table cleanup are handled by
    common.0044, postmarks.0007, and common.0045 to ensure correct state-replay order.
    """

    dependencies = [
        ("postmarks", "0005_delete_color_contribution_faqentry_and_more"),
    ]

    operations = []
