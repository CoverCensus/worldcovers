# Deployment (e.g. https://hellowoco.app)

For data import commands and ETL tools, see [TOOLS.md](TOOLS.md). For day-to-day operator tasks, see [RUNBOOK.md](RUNBOOK.md).

## Current setup (staging)

- **Host:** `hellowoco.app` (Ubuntu LTS)
- **Branch:** `staging`
- **Repo path:** `/srv/woco`
- **App user:** `wocod` (owns the repo, runs gunicorn)
- **Frontend build:** `frontend/dist/` (built during deploy, not committed)

### Host layout

```
/srv/woco/
  backend/        # Django source; gunicorn's working directory
  frontend/       # React source + built dist/
  tools/          # deploy.sh, worldcovers.service, notebooks
  mysql.cnf       # DB user/password — gitignored, must be created on host
  backend/.env    # SECRET_KEY, DEBUG, ALLOWED_HOSTS — gitignored, must be created on host
  .venv/          # uv virtual environment (created by 'uv sync')
  backups/        # database backups
```

### Service

The app runs under the `worldcovers` systemd service. The canonical unit file lives at [tools/worldcovers.service](../tools/worldcovers.service) and is kept authoritative by `deploy.sh` (which installs it if it has changed).

The unit file sets `PYTHONPATH`, `DJANGO_SETTINGS_MODULE`, and `DB_NAME` via `Environment=` directives. The remaining config is read from two gitignored files that must exist on the host:

- `/srv/woco/mysql.cnf` — database user and password (Django reads via `read_default_file`; same format as the dev `mysql.cnf`, see [BUILD.md](BUILD.md))
- `/srv/woco/backend/.env` — `DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS` (read by python-decouple)

This is the intended home for the deferred production-mode config (see §10 of the remediation plan).

### `wocod` sudoers

`wocod` needs a narrow entry in `/etc/sudoers.d/wocod-deploy` so `deploy.sh` can update the unit file and restart the service without a password:

```
wocod ALL=(ALL) NOPASSWD: /usr/bin/systemctl daemon-reload
wocod ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart worldcovers
wocod ALL=(ALL) NOPASSWD: /usr/bin/install -m 644 * /etc/systemd/system/worldcovers.service
```

See [RUNBOOK.md](RUNBOOK.md) for full first-time host bootstrap instructions.

## Pushing catalog data to staging

Fresh CSV exports in `tools/wip/out/` and catalog images under `backend/media/` are kept out of git and pushed straight to the server with [tools/push_data.sh](../tools/push_data.sh).

```sh
./tools/push_data.sh            # rsync tools/wip/ and backend/media/ only
./tools/push_data.sh --import   # rsync, then run import_v2_data + import_catalog_images as wocod
./tools/push_data.sh --dry-run  # show what rsync would change
```

How it works:

- Two `rsync` passes: `tools/wip/` → `/srv/woco/tools/wip/` and `backend/media/` → `/srv/woco/backend/media/`.
- Remote rsync runs via `sudo -n rsync` so `--chown=wocod:wocod` takes effect — files land owned by the app user, no manual `chown` dance.
- `--delete` mirrors source to destination (previous `rm -rf` step is unnecessary).
- `--import` SSHes back in and runs [tools/reload_data.sh](../tools/reload_data.sh) as `wocod`, which does `import_v2_data --truncate` (from `tools/wip/out/`) then `import_catalog_images` (auto-discovers `*_image_mapping.csv` under `MEDIA_ROOT`).

Prerequisites on the host:

- The SSH user (env `WOCO_HOST`, default `mpc@hellowoco.app`) can run `sudo` without a password. Blanket passwordless sudo is fine; a minimal drop-in is documented at the top of `push_data.sh` if you want to narrow it later.
- One-time `setgid` on the target trees so any stray `scp` also lands group=`wocod` (safety net, not required by `push_data.sh`):
  ```sh
  sudo chown -R wocod:wocod /srv/woco/tools/wip /srv/woco/backend/media
  sudo chmod -R g+s         /srv/woco/tools/wip /srv/woco/backend/media
  ```

## After you push to GitHub – what to do

### Option A: Deploy on the server (VPS)

1. **Push** to `staging`.
2. **On the server** (where hellowoco.app runs):
   ```bash
   cd /srv/woco
   git pull
   ./tools/deploy.sh         # installs deps, migrates, builds frontend
   # Then restart your app (gunicorn/systemd or the current runserver process)
   ```
3. The server must have **uv** (which manages Python) and **Node.js + npm** (for the build step). One-time install on the server (as the `wocod` user):
   ```bash
   sudo -u wocod bash -lc "curl -LsSf https://astral.sh/uv/0.11.2/install.sh | sh"
   sudo -u wocod bash -lc "uv --version"   # expect 0.11.2
   ```
   After uv is installed, `tools/deploy.sh` calls `uv sync --no-dev --frozen` to recreate `/srv/woco/.venv/` from `uv.lock`. The systemd unit's `ExecStart=/srv/woco/.venv/bin/gunicorn` works unchanged.

### Option B: GitHub Actions (CI) + your host

1. **Push** to `staging`.
2. The workflow **`.github/workflows/build-and-deploy.yml`** runs on every push to `staging`:
   - Installs Python and Node
   - Builds the frontend (`frontend/dist/`)
   - Saves the build as an artifact
3. To **deploy**, add a deploy job in that workflow (SSH/rsync or a PaaS deploy action).

### Option C: Host that auto-deploys on git push (e.g. Railway, Render)

1. **Push** to `staging`.
2. In your host’s dashboard, set the **build command** to:
   ```bash
   uv sync --no-dev --frozen && cd frontend && npm ci && npm run build && cd ..
   ```
3. Set the **start command** to your Django command (e.g. `cd backend && gunicorn woco.wsgi:application`).

---

## Why build the frontend on deploy?

The built frontend (`frontend/dist/`) is **not** in the repo (it’s in `.gitignore`).
So after a fresh deploy, the server has the Python/Django code and the React **source** in `frontend/`, but **no** `frontend/dist/` unless you build it.

## What you need on deploy

The **deploy process** must:

1. **Install Python deps** and run Django migrations (e.g. `uv sync --no-dev --frozen`, `woco migrate`).
2. **Build the frontend** so `frontend/dist/` exists **before** Django serves the site:
   ```bash
   cd frontend
   npm ci          # or: npm install
   npm run build
   cd ..
   ```
3. **Start Django** (e.g. `gunicorn` via systemd, or `woco runserver` for ad-hoc).

So the **deploy environment** needs:

- **uv** (which manages Python and the venv from `uv.lock`)
- **Node.js and npm** (only for the build step)

## Example: one-off deploy script

From the **project root** (worldcovers/):

```bash
# 1. Python
uv sync --no-dev --frozen
woco migrate --noinput
woco collectstatic --noinput

# 2. Frontend (creates frontend/dist/)
cd frontend && npm ci && npm run build && cd ..

# 3. Run the app (example; use gunicorn/uwsgi in production)
woco runserver 0.0.0.0:8000
```

## Example: GitHub Actions (CI)

```yaml
- name: Build frontend
  run: |
    cd frontend
    npm ci
    npm run build
```

If you deploy from a **different** server (e.g. pull from git on the server), that server must run the same `cd frontend && npm ci && npm run build` as part of its deploy.

## Troubleshooting: 502 on admin (e.g. Listings changelist)

If the admin returns **502 Bad Gateway** for a heavy page (e.g. `/admin/postmarks/listing/`):

1. **Check app server logs** (where gunicorn runs) for the real error or timeout:
   - `journalctl -u <your-gunicorn-service>` (systemd), or
   - Gunicorn’s `--access-logfile` / `--error-logfile`, or
   - Stderr of the process.
   Look for `Worker timeout`, `SIGKILL`, or a Python traceback.

2. **Increase Gunicorn worker timeout** if the page is slow but valid:
   ```bash
   gunicorn woco.wsgi:application --timeout 120 ...
   ```
   (Default is 30s; the Listings changelist uses a non-counting paginator and `select_related` to stay fast.)

3. **Increase proxy timeout** if the reverse proxy (nginx, Caddy, etc.) returns 502 before gunicorn:
   - nginx: `proxy_read_timeout 120s;` (in the `location` that proxies to Django).
   - Caddy: `timeout 120s` on the reverse_proxy.

## Quick reference

| After you push… | Do this |
|-----------------|--------|
| **Deploy on your own server** | On server: `git pull` → `./tools/deploy.sh` → restart app |
| **GitHub Actions only** | Workflow runs on push to `staging`; add a deploy job in `.github/workflows/build-and-deploy.yml` |
| **PaaS (Railway, Render, etc.)** | Build command installs Python deps + builds frontend; start command = Django/gunicorn |
