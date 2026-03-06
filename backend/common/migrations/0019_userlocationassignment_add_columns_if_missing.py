# Fix for UserLocationAssignments table missing UserID/AdministrativeUnitID (partial 0016 apply)

from django.db import connection, migrations


def add_columns_if_missing(apps, schema_editor):
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT COLUMN_NAME FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = 'UserLocationAssignments'"
        )
        cols = {row[0] for row in cursor.fetchall()}
        if 'UserID' not in cols:
            cursor.execute("ALTER TABLE UserLocationAssignments ADD COLUMN UserID integer NULL")
            cursor.execute(
                "ALTER TABLE UserLocationAssignments ADD CONSTRAINT UserLocationAssignments_UserID_fk "
                "FOREIGN KEY (UserID) REFERENCES auth_user(id)"
            )
        if 'AdministrativeUnitID' not in cols:
            cursor.execute(
                "ALTER TABLE UserLocationAssignments ADD COLUMN AdministrativeUnitID integer NULL"
            )
            cursor.execute(
                "ALTER TABLE UserLocationAssignments ADD CONSTRAINT UserLocationAssignments_AdministrativeUnitID_fk "
                "FOREIGN KEY (AdministrativeUnitID) REFERENCES AdministrativeUnits(AdministrativeUnitID)"
            )
        cursor.execute(
            "SELECT COUNT(*) FROM information_schema.statistics "
            "WHERE table_schema = DATABASE() AND table_name = 'UserLocationAssignments' "
            "AND index_name = 'UserLocationAssignments_user_administrative_unit_uniq'"
        )
        if cursor.fetchone()[0] == 0:
            cursor.execute(
                "ALTER TABLE UserLocationAssignments "
                "ADD UNIQUE KEY UserLocationAssignments_user_administrative_unit_uniq (UserID, AdministrativeUnitID)"
            )


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0018_remove_postmark_postmarks_created_idx'),
    ]

    operations = [
        migrations.RunPython(add_columns_if_missing, migrations.RunPython.noop),
    ]
