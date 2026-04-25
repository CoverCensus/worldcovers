"""
Rename a handful of audit-trail indexes (PostmarkVersion / SubmissionTransaction
on common 0048) to the names Django auto-generates from the model's
Meta.indexes definition. Pre-existing drift unrelated to F7 / RBAC; cleared
here so subsequent makemigrations runs come up empty.

Pure index-name renames — no data, no schema-shape change.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0055_drop_user_location_assignment'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='postmarkversion',
            new_name='PostmarkVer_postmar_c8f7f1_idx',
            old_name='pmversion_postmark_no_idx',
        ),
        migrations.RenameIndex(
            model_name='postmarkversion',
            new_name='PostmarkVer_created_2da50c_idx',
            old_name='pmversion_created_idx',
        ),
        migrations.RenameIndex(
            model_name='submissiontransaction',
            new_name='SubmissionT_postmar_e49a38_idx',
            old_name='subtxn_postmark_created_idx',
        ),
        migrations.RenameIndex(
            model_name='submissiontransaction',
            new_name='SubmissionT_contrib_0a5b82_idx',
            old_name='subtxn_contrib_created_idx',
        ),
        migrations.RenameIndex(
            model_name='submissiontransaction',
            new_name='SubmissionT_actor_i_d9ae55_idx',
            old_name='subtxn_actor_created_idx',
        ),
        migrations.RenameIndex(
            model_name='submissiontransaction',
            new_name='SubmissionT_action_330862_idx',
            old_name='subtxn_action_created_idx',
        ),
    ]
