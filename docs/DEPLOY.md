# Deployment (e.g. https://hellowoco.app)

## After you push to GitHub – what to do

Choose **one** of these, depending on how you host hellowoco.app.

### Option A: You deploy on your own server (VPS, etc.)

1. **Push** your code to GitHub as usual.
2. **On the server** (where hellowoco.app runs):
   ```bash
   cd /path/to/worldcovers   # your app directory on the server
   git pull
   ./scripts/deploy.sh       # installs deps, migrates, builds frontend
   # Then restart your app (e.g. sudo systemctl restart worldcovers, or restart gunicorn)
   ```
3. The server must have **Python 3.11+** and **Node.js + npm** (for the build step).

### Option B: GitHub Actions (CI) + your host

1. **Push** your code to GitHub.
2. The workflow **`.github/workflows/build-and-deploy.yml`** runs on every push to `main`:
   - Installs Python and Node
   - Builds the frontend (`frontend/dist/`)
   - Saves the build as an artifact
3. **To actually deploy** (e.g. to Railway, Render, or a VPS), add a **deploy** job in that workflow and point it at your host. See the commented “deploy” section in the workflow file and [Example: GitHub Actions](#example-github-actions-ci) below.

### Option C: Host that auto-deploys on git push (e.g. Railway, Render)

1. **Push** to GitHub.
2. In your host’s dashboard, set the **build command** to:
   ```bash
   pip install -r requirements.txt && cd frontend && npm ci && npm run build && cd ..
   ```
   (or run `./scripts/deploy.sh` if the host supports it and you have Node + Python).
3. Set the **start command** to your Django command (e.g. `gunicorn woco.wsgi:application`).

---

## Will it work when I push to git?

**Pushing the code is not enough by itself.** The built frontend (`frontend/dist/`) is **not** in the repo (it’s in `.gitignore`). So after a fresh deploy, the server has the Python/Django code and the React **source** in `frontend/`, but **no** `frontend/dist/`. Django will then show “Frontend not built” or 404 for the home page.

## What you need on deploy

The **deploy process** (server or CI/CD) must:

1. **Install Python deps** and run Django as you do now (e.g. `pip install -r requirements.txt`, `python manage.py migrate`, etc.).
2. **Build the frontend** so `frontend/dist/` exists **before** Django serves the site:
   ```bash
   cd frontend
   npm ci          # or: npm install
   npm run build
   cd ..
   ```
3. **Start Django** (e.g. `gunicorn`, `python manage.py runserver`, or your usual command).

So the **deploy environment** needs:

- **Python 3.11+** (and your Python deps)
- **Node.js and npm** (or bun), only to run `npm run build`; the app at runtime is still Python + static files from `frontend/dist/`.

## Example: one-off deploy script

From the **project root** (worldcovers/):

```bash
# 1. Python
pip install -r requirements.txt
python manage.py migrate --noinput
python manage.py collectstatic --noinput   # if you use Django static files

# 2. Frontend (creates frontend/dist/)
cd frontend && npm ci && npm run build && cd ..

# 3. Run the app (example; use gunicorn/uwsgi in production)
python manage.py runserver 0.0.0.0:8000
```

## Example: GitHub Actions (CI)

If you use GitHub Actions or similar, add a step before “start app”:

```yaml
- name: Build frontend
  run: |
    cd frontend
    npm ci
    npm run build
```

Then your deploy step uses the repo **after** this has run, so `frontend/dist/` is present on the runner. If you deploy from the same runner (e.g. push to a PaaS), the built files are there. If you deploy from a **different** server (e.g. pull from git on the server), that server must run the same `cd frontend && npm ci && npm run build` as part of its deploy.

## Summary

| Question | Answer |
|----------|--------|
| Will https://hellowoco.app work if I only push code? | Only if the **server** (or your CI) runs `cd frontend && npm ci && npm run build` as part of deploy. |
| Do I need Node on the server? | Yes, but only for the build step. At runtime, Django just serves files from `frontend/dist/`. |
| Can I commit `frontend/dist/` to git instead? | You can (remove `frontend/dist/` from `.gitignore` and commit the build), but then you must remember to run `npm run build` and commit before every deploy. Most teams prefer “build on deploy” as above. |

## Quick reference

| After you push… | Do this |
|-----------------|--------|
| **Deploy on your own server** | On server: `git pull` → `./scripts/deploy.sh` → restart app (gunicorn/systemd). |
| **GitHub Actions only** | Workflow runs on push to `main` and builds frontend; add a deploy job in `.github/workflows/build-and-deploy.yml` to push to your host. |
| **PaaS (Railway, Render, etc.)** | Set build command to install Python deps + `cd frontend && npm ci && npm run build`; start command = your Django/gunicorn command. |
Rebuild