# T65 Color repair

Michael runs these commands on the servers. The assistant must not connect
to either server. Use account 1. No staging backup is required.

## Files and release

- `tools/wip/t65/staging.csv`: woco.dev IDs, checked on 2026-09-24.
- `tools/wip/t65/production.csv`: hellowoco.app IDs, checked on 2026-09-24.
- `tools/check_catalog_colors.py`: tracked read-only database checks. Its output file holds hashes and
  affected IDs, not a database backup.
- The revised `backend/common/management/commands/repair_catalog_colors.py`
  must be deployed before running either map.

Both maps remove 20 Color rows: eight merges and twelve clear operations.
Both sites had 73 Colors; the expected result is 53. All target Colors exist.
Names with non-ASCII punctuation use ASCII escapes and an exact source ID.
The command checks that the ID matches the name. Do not use the other site's
map, accept the report's suggestions, or replace a failed map with one of them.

The repair command, checker, tests, and these instructions are tracked code
and documentation. Deploy them through `staging` first. The CSV maps and run
output are operator data under ignored `tools/wip`; they are not deployed by
GitHub Actions and tests must not read them. Copy only the appropriate CSV to
`/srv/woco/tools/wip/t65/` yourself before running the server commands.
Record the deployed revision from `git rev-parse HEAD` as the wocod user.

After staging passes and Michael accepts its result, bring the repair command,
checker, tests, and documentation onto `main` through a focused PR. Include
the full repair command if main does not have it yet. Run the tests against
that main-based change before deployment. Copy the production CSV separately.
Do not promote unrelated staging work.

Local test command (requires the local MariaDB test database):

```sh
DEBUG=True .venv/bin/python backend/manage.py test common.tests.test_repair_catalog_colors --keepdb --noinput
```

## Staging: prepare and pause writes

After deploying the files above, run these commands in your woco.dev terminal.
Keep imports and other writers stopped until verification finishes. This
briefly stops the web application; it does not wipe staging.

```sh
sudo systemctl stop worldcovers
sudo -u wocod -H bash
cd /srv/woco
git rev-parse HEAD
export T65_MAPPING=/srv/woco/tools/wip/t65/staging.csv
mkdir -p tools/wip/t65
export T65_RUN_DIR=$(mktemp -d /srv/woco/tools/wip/t65/staging-run.XXXXXX)
export T65_STATE="$T65_RUN_DIR/check.json"
printf '%s\n' "$T65_RUN_DIR"
```

Keep that directory path. Continue with the shared steps below. Do not take
a staging backup. If staging fails, leave production alone; staging can be
repaired or rebuilt.

## Shared steps: inventory, dry run, apply, check

Run each block separately. Stop on any error; do not continue to `--commit`
after a failed check. All steps run from `/srv/woco` in the wocod shell.

Check the actor, inventory, and current state:

```sh
.venv/bin/python backend/manage.py shell -c 'from django.contrib.auth import get_user_model; u = get_user_model().objects.get(pk=1); assert u.is_active and u.is_superuser; print("Actor 1 is an active administrator")'
.venv/bin/python backend/manage.py repair_catalog_colors --report "$T65_RUN_DIR/before.csv" --no-color > "$T65_RUN_DIR/report.log"
test -s "$T65_RUN_DIR/before.csv"
T65_PHASE=before .venv/bin/python backend/manage.py shell -c 'import runpy; runpy.run_path("tools/check_catalog_colors.py", run_name="__main__")'
```

The last command must print `PASS: before`. It records expected database
hashes for this exact map, including Color references and unrelated Entry
fields, images, Citations, dates, links, and recycle-bin records.

Run the dry run and prove that it changed nothing:

```sh
.venv/bin/python backend/manage.py repair_catalog_colors --mapping "$T65_MAPPING" --expect 20 --actor 1 --no-color > "$T65_RUN_DIR/dry-run.log"
cat "$T65_RUN_DIR/dry-run.log"
T65_PHASE=dry .venv/bin/python backend/manage.py shell -c 'import runpy; runpy.run_path("tools/check_catalog_colors.py", run_name="__main__")'
```

Expect `would repair 20 colour row(s)` and `PASS: dry`. Compare each change
count with before.csv. Zero references is valid: an unused bad Color still
needs removal. A conflicting Submission stops the operation; report its ID
for review rather than overriding the check.

Apply the map, then check the exact result:

```sh
.venv/bin/python backend/manage.py repair_catalog_colors --mapping "$T65_MAPPING" --expect 20 --actor 1 --commit --no-color > "$T65_RUN_DIR/commit.log"
cat "$T65_RUN_DIR/commit.log"
T65_PHASE=after .venv/bin/python backend/manage.py shell -c 'import runpy; runpy.run_path("tools/check_catalog_colors.py", run_name="__main__")'
.venv/bin/python backend/manage.py repair_catalog_colors --report "$T65_RUN_DIR/after.csv" --no-color > "$T65_RUN_DIR/after.log"
test -s "$T65_RUN_DIR/after.csv"
```

Expect `repaired 20 colour row(s)`, `Color: 53 rows checked`, and `PASS: after`.
The after check includes target IDs and every affected Color reference. It
also checks that all other data in the listed models is unchanged, except
the modification time on records intentionally updated by the repair.
Saved versions and matching Submissions of every status are corrected.
Django reversion history is left intact. The check does not verify image
file bytes, because this operation does not write media files.

Do not rerun a successful commit: the deleted source IDs will no longer
exist. If the commit fails, its database transaction rolls back. If its
outcome is uncertain, run the after check before deciding what to do.

After `PASS: after`, leave the wocod shell and start the site:

```sh
exit
sudo systemctl start worldcovers
sudo systemctl is-active worldcovers
```

In the browser, check that the bad Color names are absent, shades remain,
and affected Markings appear under RED, BLACK, or BLUE. Keep the run directory
and share the dry-run log, commit log, and check results for review. Staging
acceptance is required before the production commit.

## Production: only after staging acceptance

Deploy the tested focused main change first. Run these in your production
terminal, before opening the wocod shell:

```sh
sudo test -x /usr/local/sbin/worldcovers-backup
sudo test -x /usr/local/sbin/worldcovers-restore
```

If either is absent, stop and report that result. Installation has not been
verified; do not install new server infrastructure as part of this repair.

Pause writes and take the existing full database/media backup:

```sh
sudo systemctl stop worldcovers
sudo -u wocod /usr/local/sbin/worldcovers-backup --tag pre-t65-colors
sudo -u wocod cat /var/backups/woco/STATUS.json
sudo -u wocod readlink /var/backups/woco/latest
```

Require a successful backup. Record its snapshot name and verify it with
`worldcovers-backup --verify-only SNAPSHOT_NAME` as wocod. Do not proceed
without that successful verification. On backup failure, restart the site
without applying the repair.

Then open the app user's shell and select the production map:

```sh
sudo -u wocod -H bash
cd /srv/woco
git rev-parse HEAD
export T65_MAPPING=/srv/woco/tools/wip/t65/production.csv
mkdir -p tools/wip/t65
export T65_RUN_DIR=$(mktemp -d /srv/woco/tools/wip/t65/production-run.XXXXXX)
export T65_STATE="$T65_RUN_DIR/check.json"
printf '%s\n' "$T65_RUN_DIR"
```

Repeat the shared steps, including the dry run and actual commit. Do not
reuse staging counts or its check.json. On verification failure after a
committed production repair, keep writes stopped and restore the verified
pre-repair snapshot with the existing restore tool. It restores database
and media together and restarts the service:

```sh
sudo -u wocod /usr/local/sbin/worldcovers-restore --snapshot SNAPSHOT_NAME --into worldcovers --i-understand-this-overwrites "$(hostname)"
```

Run recovery from your operator shell, not the wocod shell. Replace
SNAPSHOT_NAME with the verified pre-repair name. Do not infer old Color
assignments from the merged data. If the after check passes, restart normally
and verify dropdowns and searches, then record the result under T65.
