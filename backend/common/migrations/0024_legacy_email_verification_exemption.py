from django.conf import settings
from django.db import migrations


def exempt_existing_accounts(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    User = apps.get_model(settings.AUTH_USER_MODEL)
    alias = schema_editor.connection.alias
    group, created = Group.objects.using(alias).get_or_create(
        name="Legacy email verification exemption"
    )
    # Do not exempt later signups if this operation is called again.
    if not created:
        return
    through = User.groups.through
    through.objects.using(alias).bulk_create([
        through(user_id=user_id, group_id=group.pk)
        for user_id in User.objects.using(alias).values_list("pk", flat=True)
    ])


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0023_postmaster_manual_entry"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    # Keep exemptions on reverse: rollback must not change existing access.
    operations = [migrations.RunPython(exempt_existing_accounts, migrations.RunPython.noop)]
