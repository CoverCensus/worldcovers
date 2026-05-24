# Reconcile the server DB to the reset `common` migration history

One-time procedure to bring the server database into line with the `common`
migration-history reset that removed the v1 `postmarks` app and collapsed
`common`'s 77-migration history into a single fresh `0001_initial`. These are the
exact commands run on the dev DB; the server environment is identical, so run
them verbatim.

## What this does and does NOT do

It rewrites only Django's migration BOOKKEEPING so the database agrees with the
new migration files. It is schema-neutral and data-preserving.

- DOES delete rows from `django_migrations` (Django's history table only).
- DOES record the new `common/0001_initial` as applied via `--fake-initial`,
  which writes a history row WITHOUT running any SQL (it detects the tables
  already exist). It creates / alters / drops NO data table.
- DOES drop the dead v1 orphan tables (`AdministrativeUnit*`) that are not in the
  v2 models and hold no live data.

It does NOT touch any live data table (markings, covers, colors, users, auth,
sessions), does NOT require a data re-import (the import pipeline is independent
and the schema is identical before/after), and does NOT clobber users or roles.

No backup is strictly required (the reconcile is fake-only). Take one if policy
wants it; there is nothing to roll back in the data.

## Ordering: DEPLOY THE CODE FIRST, then run this

Run this AFTER the new code is deployed, not before.

- `migrate common --fake-initial` needs the new
  `backend/common/migrations/0001_initial.py` present on the server.
- Deploying first is safe: with the new code, `tools/deploy.sh` step 2
  (`migrate --noinput`) is a harmless no-op against the old history (see
  Appendix B).
- Do NOT run the `DELETE` before deploying. While the OLD code is still live, the
  old 85 migration files would all look unapplied, and any `migrate` on the old
  code would try to re-CREATE existing tables and fail.

So: `git push` / deploy as usual, THEN run the steps below.

## Prerequisites

- cwd: repo root (the directory containing `backend/`, `tools/`, and
  `mysql.cnf`). All commands below assume you are there.
- Runner: `uv run python backend/manage.py ...` (same as `tools/deploy.sh`).
- DB client: `mysql --defaults-extra-file=mysql.cnf worldcovers ...`. The
  `mysql.cnf` at repo root holds the user/password/host; `worldcovers` is the DB.
- Scratch DB (Step 2) must be named `test_scratch`: the DB user `wocod` only has
  full privileges on `worldcovers` and `test_*` databases.

## Step 1 -- Confirm the new code is present

    uv run python backend/manage.py showmigrations common

Expect `common` to list exactly `0001_initial` (already marked [X], because the
old history still records a same-named `0001_initial` -- expected; it is why a
plain deploy does not fail).

## Step 2 -- Confirm this DB's orphan tables (schema-diff gate)

The only legitimate structural difference vs a clean build should be dead v1
orphan tables. On dev those were exactly three: `AdministrativeUnits`,
`AdministrativeUnitIdentities`, `AdministrativeUnitResponsibilities`.

Quick check -- list any present:

    mysql --defaults-extra-file=mysql.cnf worldcovers -e \
      "SELECT table_name FROM information_schema.tables \
       WHERE table_schema='worldcovers' AND table_name LIKE 'AdministrativeUnit%';"

Rigorous check (recommended) -- build a scratch DB from the new migrations and
diff it against the live DB. Anything OTHER than the orphan tables is real drift
to resolve before proceeding.

    # 2a. dump live structure
    mysqldump --defaults-extra-file=mysql.cnf --no-data --skip-comments worldcovers > /tmp/schema_staging.sql

    # 2b. build a scratch DB from the new migrations (must finish with NO InvalidBasesError)
    mysql --defaults-extra-file=mysql.cnf -e "DROP DATABASE IF EXISTS test_scratch; CREATE DATABASE test_scratch CHARACTER SET utf8mb4;"
    DB_NAME=test_scratch uv run python backend/manage.py migrate
    mysqldump --defaults-extra-file=mysql.cnf --no-data --skip-comments test_scratch > /tmp/schema_scratch.sql

    # 2c. diff
    uv run python tools/schema_diff.py /tmp/schema_staging.sql /tmp/schema_scratch.sql

    # 2d. drop the scratch DB when satisfied
    mysql --defaults-extra-file=mysql.cnf -e "DROP DATABASE IF EXISTS test_scratch;"

Expected diff: the live DB has the orphan `AdministrativeUnit*` tables that
scratch lacks, plus cosmetic legacy constraint/index NAME differences (same
columns, FKs, and hashes -- benign, see Appendix B). Anything else is drift.

## Step 3 -- Delete the stale history for the reset apps

    mysql --defaults-extra-file=mysql.cnf worldcovers -e \
      "DELETE FROM django_migrations WHERE app IN ('common','postmarks');"

## Step 4 -- Record the new initial without running SQL

    uv run python backend/manage.py migrate common --fake-initial

Expect the output to end with `Applying common.0001_initial... FAKED`.

## Step 5 -- Confirm the history is clean

    uv run python backend/manage.py showmigrations common
    mysql --defaults-extra-file=mysql.cnf worldcovers -N -e \
      "SELECT COUNT(*) FROM django_migrations WHERE app IN ('common','postmarks');"

Expect `[X] 0001_initial` and a count of `1` (only `common/0001_initial`; zero
`postmarks` rows).

## Step 6 -- Drop the confirmed orphan tables

Use the set confirmed in Step 2. `IF EXISTS` makes it a safe no-op if any are
already absent:

    mysql --defaults-extra-file=mysql.cnf worldcovers -e \
      "DROP TABLE IF EXISTS \`AdministrativeUnitIdentities\`,\`AdministrativeUnitResponsibilities\`,\`AdministrativeUnits\`;"

## Step 7 -- Verify end state

    uv run python backend/manage.py check                              # 0 issues
    uv run python backend/manage.py makemigrations --check --dry-run   # "No changes detected", exit 0
    uv run python backend/manage.py migrate                            # "No migrations to apply."

Done. The server matches the reset history with no data import and no user data
touched.

---

## Appendix A -- Alternative: drop + rebuild + re-import

Because the import pipeline is independent, an equivalent clean end state is to
drop the DB, migrate from scratch, and re-import -- no `--fake-initial` needed:

    mysql --defaults-extra-file=mysql.cnf -e "DROP DATABASE IF EXISTS worldcovers; CREATE DATABASE worldcovers CHARACTER SET utf8mb4;"
    uv run python backend/manage.py migrate
    # then run the normal import pipeline to repopulate

Use this only if you intend to re-import anyway; otherwise Steps 1-7 preserve the
existing data in place.

## Appendix B -- Why a plain deploy does not FAIL (but still needs this)

Verified by replaying the un-reconciled state on a scratch DB (new code +
leftover old `common`/`postmarks` history rows): `migrate`, `migrate --check`,
`makemigrations --check`, `manage.py check`, and `showmigrations` all pass,
exit 0. The new `0001_initial` shares its `(app, name)` key with the old applied
row, so Django treats it as applied; the other 84 `common` + 8 `postmarks` rows
have no files, so they are ignored.

So a deploy will not crash. Run this reconcile anyway because those stale ghost
rows stay in `django_migrations`: the next time someone adds a real
`common/migrations/0002_*`, Django sees `common.0002` already "applied" (a ghost)
and silently SKIPS the new file -> schema drift. And `postmarks` stays recorded
as applied despite being deleted. This removes that landmine.

The cosmetic constraint/index NAME differences in the schema diff are benign:
legacy auto-generated identifier names from v1 (created when target PKs were named
e.g. `marking_id`/`color_id`, later renamed to `id`; MySQL kept the old constraint
names). Same columns, same FKs, same deterministic hash segment. `--fake-initial`
does not touch the live schema, so these names are preserved and do not matter.

## Appendix C -- Diff helper

The schema-diff gate uses `tools/schema_diff.py` (already in the repo). It
normalizes two `mysqldump --no-data` files (strips AUTO_INCREMENT, sorts lines
within each table) and reports tables only in A, tables only in B, and per-table
body differences.
