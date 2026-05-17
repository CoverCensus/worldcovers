# Operator Runbook

Day-to-day tasks for running WorldCovers on staging/production.

## Service management

WorldCovers runs as a systemd service (`worldcovers`) backed by gunicorn.

```sh
sudo systemctl restart worldcovers   # restart after a deploy or config change
sudo systemctl status worldcovers    # check current state
sudo systemctl stop worldcovers      # stop the service
sudo journalctl -u worldcovers -f    # tail the live log
```

The canonical unit file lives in the repo at [tools/worldcovers.service](../tools/worldcovers.service).

### First-time install on a fresh host

```sh
sudo install -m 644 tools/worldcovers.service /etc/systemd/system/worldcovers.service
sudo systemctl daemon-reload
sudo systemctl enable --now worldcovers
```

The `wocod` deploy user needs a narrow sudoers entry to allow the deploy script to update the unit and restart the service:

```
# /etc/sudoers.d/wocod-deploy
wocod ALL=(ALL) NOPASSWD: /usr/bin/systemctl daemon-reload
wocod ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart worldcovers
wocod ALL=(ALL) NOPASSWD: /usr/bin/install -m 644 * /etc/systemd/system/worldcovers.service
```

## Deploying

```sh
cd /srv/woco
git pull
tools/deploy.sh
```

`tools/deploy.sh` installs Python deps, runs migrations, builds the frontend, collects static files, and restarts the service. See [docs/DEPLOY.md](DEPLOY.md) for full deploy details, host identity, and CI setup.

## Data imports

For importing postmark data, running the catalog pipeline, and other ETL commands, see [docs/TOOLS.md](TOOLS.md).

## Approving contributions

1. Log in to `/admin/` as a staff user.
2. Navigate to **Contributions**.
3. Select pending contributions and use the **Approve** action.

## Backups

Database backups are stored in `backups/`. To restore:

```sh
mysql -u wocod -p worldcovers < backups/worldcovers_YYYY-MM-DD.sql
woco migrate
```

## Checking the admin

Spot-check admin health at `/admin/`:

- **Postmarks** — verify catalog data looks correct
- **Contributions** — clear the queue of pending contributions
- **Users** — manage staff and editor assignments

## Environment

The production service reads:

- `/srv/woco/mysql.cnf` — database user and password (same format as the dev `mysql.cnf`; see [docs/BUILD.md](BUILD.md) for the format)
- `/srv/woco/backend/.env` — `DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS`
