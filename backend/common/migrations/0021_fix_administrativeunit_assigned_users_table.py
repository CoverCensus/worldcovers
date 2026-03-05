from django.db import migrations, connection


class Migration(migrations.Migration):

    """
    Safety migration to ensure the implicit M2M join table for
    AdministrativeUnit.assigned_users exists in all environments.

    In some databases, migration 0020 was marked as applied without the
    join table actually being created, which causes MySQL error 1146
    when Django admin tries to access user.assigned_states.
    """

    dependencies = [
        ("common", "0020_administrativeunit_assigned_users"),
    ]

    @staticmethod
    def _ensure_join_table(apps, schema_editor):
        """
        Idempotent fix:
        - If the join table does NOT exist, create it with the expected
          unique constraint and foreign keys.
        - If it already exists, do nothing (avoid duplicate key errors).
        """
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_name = 'AdministrativeUnits_assigned_users'
                """
            )
            (count,) = cursor.fetchone()

            if count:
                # Table already exists; assume constraints are present or were
                # created previously. Do not try to recreate them.
                return

            # Table is missing: create it and its constraints exactly as Django
            # would have done in migration 0020.
            cursor.execute(
                """
                CREATE TABLE `AdministrativeUnits_assigned_users` (
                    `id` bigint AUTO_INCREMENT NOT NULL PRIMARY KEY,
                    `administrativeunit_id` integer NOT NULL,
                    `user_id` integer NOT NULL
                ) ENGINE=InnoDB
                """
            )

            cursor.execute(
                """
                ALTER TABLE `AdministrativeUnits_assigned_users`
                    ADD CONSTRAINT `AdministrativeUnits_assi_administrativeunit_id_us_62e911f8_uniq`
                    UNIQUE (`administrativeunit_id`, `user_id`)
                """
            )

            cursor.execute(
                """
                ALTER TABLE `AdministrativeUnits_assigned_users`
                    ADD CONSTRAINT `AdministrativeUnits__administrativeunit_i_89ab192f_fk_Administr`
                    FOREIGN KEY (`administrativeunit_id`)
                    REFERENCES `AdministrativeUnits` (`AdministrativeUnitID`)
                """
            )

            cursor.execute(
                """
                ALTER TABLE `AdministrativeUnits_assigned_users`
                    ADD CONSTRAINT `AdministrativeUnits__user_id_c1582ca1_fk_auth_user`
                    FOREIGN KEY (`user_id`)
                    REFERENCES `auth_user` (`id`)
                """
            )

    operations = [
        migrations.RunPython(
            code=_ensure_join_table,
            reverse_code=migrations.RunPython.noop,
        ),
    ]

