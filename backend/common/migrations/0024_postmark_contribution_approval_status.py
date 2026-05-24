# Add approval workflow for user-contributed catalog entries.
# New contributions start as 'pending'; only 'approved' appear in /search.

from django.db import migrations, models


def set_pending_for_user_contributions(apps, schema_editor):
    """Set contribution_approval_status='pending' for existing user contributions."""
    Postmark = apps.get_model("common", "Postmark")
    Postmark.objects.filter(
        source_catalog="User contribution",
        contribution_approval_status__isnull=True,
    ).update(contribution_approval_status="pending")


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0023_ensure_userlocationassignments_table_final"),
    ]
    operations = [
        migrations.AddField(
            model_name="postmark",
            name="contribution_approval_status",
            field=models.CharField(
                blank=True,
                choices=[
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                    ("needs_revision", "Need revision"),
                ],
                db_column="ContributionApprovalStatus",
                help_text="Approval status for user-contributed catalog entries. Only 'approved' appear in public search.",
                max_length=20,
                null=True,
            ),
        ),
        migrations.RunPython(set_pending_for_user_contributions, noop_reverse),
    ]
