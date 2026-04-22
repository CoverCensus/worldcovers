from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0044_merge_0042_commentsubmission_0043_userlocationassignment_to_region"),
    ]

    operations = [
        migrations.DeleteModel(
            name="CommentSubmission",
        ),
    ]
