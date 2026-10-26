# Operator Runbook

Day-to-day commands for running WorldCovers on staging and production.

Source of truth:

- Staging deployment flow: `.github/workflows/build-and-deploy.yml`
- Production deployment flow: `.github/workflows/deploy-prod.yml`
- App build steps: `deploy/deploy.sh`
- Data refresh: `tools/reload_data.sh`
- Service definition: `deploy/worldcovers.service`

## Service Management

WorldCovers runs as the `worldcovers` systemd service backed by gunicorn.

```sh
sudo systemctl status worldcovers
sudo systemctl stop worldcovers
sudo systemctl start worldcovers
sudo systemctl restart worldcovers
sudo journalctl -u worldcovers -f
```

Expected exit code for successful commands: `0`.

## Manual Deploy

This is the canonical manual deploy sequence. From the host as `wocod`, use
`origin/staging` on staging and `origin/main` on production:

```sh
cd /srv/woco
git fetch origin
git reset --hard origin/staging
sudo -n /bin/systemctl stop worldcovers
./deploy/deploy.sh
sudo -n /bin/systemctl start worldcovers
```

`deploy/deploy.sh` syncs Python dependencies, runs migrations, builds the
frontend, and collects static files. It does not start or stop the service.

For key rotation, unit-file updates, and sudoers requirements, see
[DEPLOY.md](DEPLOY.md).

## Data Refresh

From a local checkout with prepared `tools/wip/` and `backend/media/` data:

```sh
./tools/push_data.sh --dry-run
./tools/push_data.sh --import --state VA
```

`--import` runs `tools/reload_data.sh` on the server as `wocod` for the
selected bundle. The reload truncates and replaces all catalog import
tables but does not touch submission, version, or recycle-bin history; see
[TOOLS.md](TOOLS.md#toolsreload_datash) for exactly what it runs and when to
pair it with `wipe_user_data`.

## Auth Backups

Run before destructive staging refreshes when you need a portable copy of
users, groups, email addresses, collections, and assignments. Both commands
take a single JSON file path:

```sh
./woco backup_auth /tmp/woco-auth.json
./woco restore_auth /tmp/woco-auth.json --dry-run
./woco restore_auth /tmp/woco-auth.json
```

Pass `--emit-csv` with a directory path instead of a file to export or
import a directory of per-table CSVs, which is easier to inspect by eye.

The backup contains email addresses and password hashes. Treat it like a
secret: move it only over SSH/scp, keep it out of git, and delete it from
every host once the restore is confirmed.

## Auth Sync Between Hosts

Goal: let people log into a secondary host (for example the `woco.dev`
review box) with the same credentials they already use on `hellowoco.app`.
This is the interim mechanism until SSO lands; it is intentionally a plain
export -> import.

`restore_auth` runs inside a single transaction and imports groups, then
users, then emails, then collections, then assignments. Run with no
arguments to see usage.

Export on the source (production) host:

```sh
# On the prod host, as the app user, with uv on PATH:
sudo -u wocod -H bash -lc \
  'export PATH=$HOME/.local/bin:$PATH && cd /srv/woco && ./woco backup_auth /tmp/woco-auth.json'
```

Move the file. Root login should be disabled on both boxes, so connect as
your own user (in the sudo group):

```sh
# Pull prod -> local, then push local -> target (never store it long-term):
scp <prod>:/tmp/woco-auth.json ./woco-auth.json
scp ./woco-auth.json <your-user>@<target-server>:/tmp/woco-auth.json
```

Restore on the target host, dry-run first:

```sh
sudo -u wocod -H bash -lc \
  'export PATH=$HOME/.local/bin:$PATH && cd /srv/woco && ./woco restore_auth /tmp/woco-auth.json --dry-run'

sudo -u wocod -H bash -lc \
  'export PATH=$HOME/.local/bin:$PATH && cd /srv/woco && ./woco restore_auth /tmp/woco-auth.json'
```

Behavior notes:

- Collections whose name conflicts with a Region the target host already
  owns are skipped, along with their assignments; the command prints which
  were skipped. This is expected on a box that only carries a subset of
  states.
- Assignments are mirrored: rows not present in the backup are removed, so
  the target ends up matching the source's assignment set.
- Existing target users with the same natural key are updated in place, so
  the box's own `admin` is preserved unless prod also defines it.

Clean up after the restore is confirmed:

```sh
rm -f ./woco-auth.json                                   # local copy
sudo -u wocod -H bash -lc 'rm -f /tmp/woco-auth.json'    # on the target
# and remove /tmp/woco-auth.json on prod
```

## Collection Transfer Between Instances

Use this operator procedure to copy one complete Collection, including
pending work and image files. This is separate from full-system recovery
and the S25/S26 application interfaces.

1. Identify the source Collection ID. Check the code revisions and migration
   state on both instances. Apply the transfer migration before restore.
   Inventory target differences, missing usernames, shared Covers, and
   external Markings. Resolve conflicts explicitly; restore has no overwrite
   option and does not create accounts or change Editor assignments.
2. Run `backup_collection <collection-id> <new-bundle-directory>` on the
   source. Use `tools/wip/out/` for output. Copy the entire completed bundle
   over SSH to `tools/wip/in/` on the destination.
3. Test with the existing local database and media directory: run
   `restore_collection <bundle> --dry-run`, then `restore_collection <bundle>`
   and `verify_collection <bundle> --report <report.json>`. Keep reports under
   `tools/wip/out/`, outside the bundle. Inspect representative Marking and
   Cover pages, images, review work, history, and credit. Repeat restore and
   verification to check that no records are duplicated. Local conflicts
   stop the test; do not erase or overwrite local records to bypass them.
4. Pause source writes for the final export. If source contents changed,
   export to a new directory and test that final bundle locally. Existing
   local records that differ require review before the final test can pass.
5. Before the live destination restore, take and verify a tagged full
   database/media backup using [BACKUP.md](BACKUP.md). Run the same Collection
   dry-run, restore, verification, and page checks on the destination. Retain
   the exact bundle and its destination verification report off the source.
6. Obtain Michael's acceptance before source removal. Take and verify a
   tagged full source backup. Copy the destination verification report back
   to the source. Resolve the Region code from the backed-up Collection and
   preview the guarded removal:

   ```sh
   ./woco ascc drop <region-code> --bundle tools/wip/out/collection-backup --verification-report tools/wip/in/collection-verification.json --dry-run
   ```

   Review deletion counts and shared records. Run the same command without
   `--dry-run` only after acceptance. The guard refuses a stale bundle,
   mismatched report, wrong source instance, or changed source contents.
7. Confirm the selected contents are gone from the source and unrelated
   Collections remain intact. Collection configuration, accounts, Editor
   assignments, shared records, and image files remain. Do not sweep media
   files as part of this transfer.

For Hawaii, the source is woco.dev and the destination is hellowoco.app.
The actual Collection ID, Region code, counts, deployed revisions, report,
and acceptance must come from that run. A code test or this procedure does
not establish that Hawaii has been transferred.

## Database Restore

Snapshots are taken nightly by `worldcovers-backup.timer` and live under
`/var/backups/woco/snapshots/`. Full detail in [BACKUP.md](BACKUP.md).

```sh
# health, without logging in
ssh reese@<host> 'cat /var/backups/woco/STATUS.json'

# on-demand snapshot before something destructive (no password needed)
sudo -u wocod /usr/local/sbin/worldcovers-backup --tag pre-something

# rehearsal restore into a scratch database (service and media untouched)
sudo -u wocod /usr/local/sbin/worldcovers-restore \
  --snapshot <name> --into worldcovers_rehearsal

# real restore: stops gunicorn, reloads the DB, restores media, restarts
sudo -u wocod /usr/local/sbin/worldcovers-restore \
  --snapshot <name> --into worldcovers \
  --i-understand-this-overwrites $(hostname)
```

Expected exit code: `0`.

**Always restore both halves.** The dump contains the `images` rows but not
the files -- `MEDIA_ROOT` is a directory on disk. A database-only restore gives a
complete-looking catalog with every image link broken.

**Check the snapshot engine and version.** Both hosts now use MariaDB, but
older staging snapshots contain MySQL dumps. The restore tool rejects a
cross-engine restore (`ISSUE-2026-08-10-01`). See [BACKUP.md](BACKUP.md) for
compatibility notes and [database versions](DEPLOY.md#database-versions) for
the current environment status.

## Revision Maintenance

Run the one-time django-reversion baseline after the skip-list code is live.
The order matters because excluded audit/snapshot models should not get
baseline revisions.

```sh
cd /srv/woco
./woco createinitialrevisions --comment "Initial baseline revision."
```

Expected exit code: `0`. The command prints per-model counts.

Run revision pruning manually as needed, for example monthly. No systemd timer
or cron job is installed for *revision pruning* yet (the only timer this project
installs is `worldcovers-backup.timer`; see [BACKUP.md](BACKUP.md)).

```sh
cd /srv/woco
./woco prune_revisions --dry-run
./woco prune_revisions
```

Expected exit code: `0`. The dry run reports counts and rolls back. The
retention policy lives in `backend/woco/settings.py` as
`REVERSION_PRUNE_RETENTION_DAYS` and `REVERSION_PRUNE_KEEP_PER_OBJECT`.

## Admin Checks

Spot-check these paths after deploys and data refreshes:

- `/admin/`
- `/admin/common/contribution/`
- `/search`
- `/help`

For management command details, see [TOOLS.md](TOOLS.md).

## Runtime Environment

Production and staging read:

- `/srv/woco/mysql.cnf`: database credentials.
- `/srv/woco/backend/.env`: `DEBUG`, `DJANGO_SECRET_KEY`, and other
  decouple-backed Django settings. Written by `deploy/provision.sh`.

For the full picture of which env file lives where and who reads it, see
[BUILD.md](BUILD.md#environment-files).
