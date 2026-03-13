# Align Contribution model with existing table: add ReviewerUserID, make PostmarkID nullable

from django.conf import settings
from django.db import migrations


def alter_contributions_table(apps, schema_editor):
    from django.db import connection
    if connection.vendor != "sqlite":
        schema_editor.execute(
            "ALTER TABLE Contributions ADD COLUMN ReviewerUserID integer NULL REFERENCES auth_user(id)"
        )
        schema_editor.execute(
            "ALTER TABLE Contributions ALTER COLUMN PostmarkID DROP NOT NULL"
        )
        return
    # SQLite: recreate table to add column and change PostmarkID to nullable
    with connection.cursor() as cursor:
        cursor.execute("""
            CREATE TABLE Contributions_new (
                ContributionID integer NOT NULL PRIMARY KEY AUTOINCREMENT,
                SubmitterUserID integer NOT NULL REFERENCES auth_user(id),
                PostmarkID integer NULL UNIQUE REFERENCES Postmarks(PostmarkID),
                Status varchar(20) NOT NULL,
                ReviewerNotes text NOT NULL,
                SubmissionData text NOT NULL,
                CreatedDate datetime NOT NULL,
                ModifiedDate datetime NOT NULL,
                ReviewerUserID integer NULL REFERENCES auth_user(id)
            )
        """)
        cursor.execute("""
            INSERT INTO Contributions_new
            (ContributionID, SubmitterUserID, PostmarkID, Status, ReviewerNotes, SubmissionData, CreatedDate, ModifiedDate)
            SELECT ContributionID, SubmitterUserID, PostmarkID, Status, ReviewerNotes, SubmissionData, CreatedDate, ModifiedDate
            FROM Contributions
        """)
        cursor.execute("DROP TABLE Contributions")
        cursor.execute("ALTER TABLE Contributions_new RENAME TO Contributions")
        cursor.execute("CREATE INDEX IF NOT EXISTS Contributions_SubmitterUserID_idx ON Contributions(SubmitterUserID)")


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0027_contribution_moderation_model"),
    ]

    operations = [
        migrations.RunPython(alter_contributions_table, noop_reverse),
    ]
