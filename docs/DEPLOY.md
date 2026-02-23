# Deployment (e.g. https://hellowoco.app)

## Current setup (staging)

- **Branch:** `staging`
- **Server path:** `/srv/woco`
- **App user:** `wocod`
- **Frontend build:** `frontend/dist/` (built during deploy)

## After you push to GitHub – what to do

### Option A: Deploy on the server (VPS)

1. **Push** to `staging`.
2. **On the server** (where hellowoco.app runs):
   ```bash
   cd /srv/woco
   git pull
   ./scripts/deploy.sh       # installs deps, migrates, builds frontend
   # Then restart your app (gunicorn/systemd or the current runserver process)
   ```
3. The server must have **Python 3.11+** and **Node.js + npm** (for the build step).

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
   pip install -r backend/requirements.txt && cd frontend && npm ci && npm run build && cd ..
   ```
3. Set the **start command** to your Django command (e.g. `cd backend && gunicorn woco.wsgi:application`).

---

## Why build the frontend on deploy?

The built frontend (`frontend/dist/`) is **not** in the repo (it’s in `.gitignore`).
So after a fresh deploy, the server has the Python/Django code and the React **source** in `frontend/`, but **no** `frontend/dist/` unless you build it.

## What you need on deploy

The **deploy process** must:

1. **Install Python deps** and run Django as you do now (e.g. `pip install -r backend/requirements.txt`, `python backend/manage.py migrate`, etc.).
2. **Build the frontend** so `frontend/dist/` exists **before** Django serves the site:
   ```bash
   cd frontend
   npm ci          # or: npm install
   npm run build
   cd ..
   ```
3. **Start Django** (e.g. `gunicorn`, `python backend/manage.py runserver`, or your usual command).

So the **deploy environment** needs:

- **Python 3.11+** (and your Python deps)
- **Node.js and npm** (only for the build step)

## Example: one-off deploy script

From the **project root** (worldcovers/):

```bash
# 1. Python
pip install -r backend/requirements.txt
python backend/manage.py migrate --noinput
python backend/manage.py collectstatic --noinput

# 2. Frontend (creates frontend/dist/)
cd frontend && npm ci && npm run build && cd ..

# 3. Run the app (example; use gunicorn/uwsgi in production)
python backend/manage.py runserver 0.0.0.0:8000
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
| **Deploy on your own server** | On server: `git pull` → `./scripts/deploy.sh` → restart app |
| **GitHub Actions only** | Workflow runs on push to `staging`; add a deploy job in `.github/workflows/build-and-deploy.yml` |
| **PaaS (Railway, Render, etc.)** | Build command installs Python deps + builds frontend; start command = Django/gunicorn |
