"""
Seed the two role-bearing Django groups: Contributors and Editors.

Administrator is intentionally NOT a group — it is conflated with `is_superuser`,
so there is a single Administrator account managed via the standard Django
superuser flag. See docs/design.md F1 and the plan in
.claude/plans/currently-the-system-has-prancy-wilkinson.md.
"""
from django.db import migrations


CONTRIBUTOR_PERMS = [
    # (app_label, codename)
    ("common", "add_contribution"),
    ("common", "view_contribution"),
    ("common", "view_postmark"),
    ("common", "view_referencework"),
    ("common", "add_postmarkimage"),
    ("common", "view_postmarkimage"),
    ("common", "view_collection"),
]

EDITOR_PERMS = CONTRIBUTOR_PERMS + [
    ("common", "review_contribution"),
    ("common", "change_contribution"),
    ("common", "change_postmark"),
    ("common", "add_referencework"),
    ("common", "change_referencework"),
    ("common", "approve_postmarkimage"),
    ("common", "change_postmarkimage"),
]


def _set_group_perms(apps, group_name, perm_specs):
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    group, _ = Group.objects.get_or_create(name=group_name)
    perms = []
    for app_label, codename in perm_specs:
        try:
            perms.append(Permission.objects.get(content_type__app_label=app_label, codename=codename))
        except Permission.DoesNotExist:
            # Custom permissions are created by the ContentTypes/AuthConfig
            # post_migrate signals which run AFTER all migrations apply. So
            # Permission rows for review_contribution / approve_postmarkimage
            # may not exist yet when this migration runs. Tolerate that — the
            # post_migrate signal will create them, and an admin can re-run
            # this group seeding (it's idempotent) if anything is missing.
            continue
    group.permissions.set(perms)


def seed_groups(apps, schema_editor):
    _set_group_perms(apps, "Contributors", CONTRIBUTOR_PERMS)
    _set_group_perms(apps, "Editors", EDITOR_PERMS)


def reverse_seed_groups(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name__in=["Contributors", "Editors"]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0051_add_contribution_collection_fk_nullable"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunPython(seed_groups, reverse_seed_groups),
    ]
