# Building WorldCovers

This is the complete from-scratch setup for a local development environment.
Every command runs from the repo root unless stated otherwise, and every
successful command exits with code 0.

## One-command setup

`./woco setup dev` runs the whole sequence below for you. On a fresh clone it
installs dependencies, writes `.env` with a generated secret key, prompts for
local database settings, creates the MariaDB database and app user, writes
`mysql.cnf`, builds the frontend, runs migrations, and collects static files.
It is idempotent, so re-running never clobbers an existing secret key or a
valid `mysql.cnf`.

Interactive defaults:

- Database name: `DB_NAME` from `.env`, then `worldcovers`.
- App database user: `wocod`.
- App database password: prompt; leave blank to generate a random password.
- MariaDB root access: passwordless `sudo mariadb` when available; otherwise it
  prompts for the MariaDB root password. Leave that prompt blank to use
  interactive `sudo mariadb`.

For unattended setup:

```sh
WOCO_DB_PASSWORD=<app-db-password> \
WOCO_MYSQL_ROOT_PASSWORD=<mariadb-root-password> \
./woco setup dev
```

Omit `WOCO_MYSQL_ROOT_PASSWORD` when `sudo mariadb` works locally.

Optional variables:

```text
WOCO_DB_NAME=worldcovers
WOCO_DB_USER=wocod
WOCO_SETUP_DB=1
```

Set `WOCO_SETUP_DB=1` only when you want setup to re-run the database/user
grants even though `mysql.cnf` already exists.

The rest of this document is the same sequence done by hand, with the
reasoning behind each step. Read it when `./woco setup dev` reports a problem,
or when you want to understand what it did.

The counterpart command for servers is `./woco setup prod`, which runs the
production build steps (`deploy/deploy.sh`); see [DEPLOY.md](DEPLOY.md).

## Prerequisites

- Local development has been tested on macOS. Linux should work with the same
  commands when the prerequisites below are installed.
- `woco.bat` is included as a convenience wrapper for Windows cmd.exe and
  PowerShell, but the primary documented setup path is macOS/Linux shell.
- Python 3.13 (installed automatically by `uv` from `.python-version`)
- `uv` (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Node.js and npm (for the frontend build)
- MariaDB, running locally, with the `mariadb` client on PATH

Use MariaDB for local development, CI, staging, and production. Setup checks
the connected server before database bootstrap or migrations and rejects MySQL.
The Django backend name `django.db.backends.mysql`, the `mysqlclient` Python
package, `mysql.cnf`, and `WOCO_MYSQL_ROOT_PASSWORD` remain compatibility names;
they do not select a MySQL server.

CI tests MariaDB 12.3 LTS for staging and 10.11 for production. Setup checks
the server family, not a fixed release series. See
[database versions](DEPLOY.md#database-versions) for the current configuration
and planned changes.

## Steps

### 1. Install Python dependencies

```sh
uv sync
```

This creates `.venv/` at the repo root with both runtime and dev dependencies
installed. On a server, use `uv sync --no-dev --frozen` to skip the dev group.

### 2. Create the database and app user

`./woco setup dev` does this step automatically. If you are doing the setup
by hand, edit `tools/setup_worldcovers_db.sql` first and replace the
placeholder password on the `CREATE USER` line with one you choose. Then run
it as MariaDB root:

```sh
sudo mariadb < tools/setup_worldcovers_db.sql
# or, if root has a password:
mariadb -u root -p < tools/setup_worldcovers_db.sql
```

This creates the `worldcovers` database and the `wocod` MariaDB user with
access to it (and to `test_worldcovers`, which Django uses for tests).

### 3. Configure database credentials

`./woco setup dev` writes this file automatically after the MariaDB bootstrap
succeeds. For a manual setup, copy the example credentials file and fill in
the user and password from step 2:

```sh
cp mysql.cnf.example mysql.cnf
```

```ini
[client]
user = wocod
password = the_password_you_chose
default-character-set = utf8mb4
```

Django reads this file at startup via `read_default_file`. `mysql.cnf` is
gitignored; never commit it.

### 4. Create the environment file

Django refuses to start without `DJANGO_SECRET_KEY`, so this step is
mandatory:

```sh
cp .env.example .env
./woco secretkey
```

Paste the printed value into the `DJANGO_SECRET_KEY=` line of `.env`. The
`secretkey` helper runs before Django settings load, so it works even
though `.env` is not filled in yet. The
other defaults in `.env.example` are fine for local development. `.env` is
gitignored; never commit it.

See [Environment files](#environment-files) below for where each `.env`
lives and who reads it.

### 5. Build the frontend

The React SPA must be built once before Django can serve it:

```sh
cd frontend && npm ci && npm run build && cd ..
```

This creates `frontend/dist/`, which Django serves via the catch-all route
at the site root.

### 6. Run migrations

```sh
./woco migrate
```

If this fails with a connection error, recheck steps 2 and 3. If it fails
with "DJANGO_SECRET_KEY not found", recheck step 4.

### 7. Collect static files

```sh
./woco collectstatic --noinput
```

### 8. Start the dev server

For day-to-day development with frontend hot-reload, use `./woco dev` (see
[the launcher section](#launcher) below). To run just Django manually:

```sh
./woco runserver
```

The built SPA is served at `/`. The API lives under `/api/` and the admin at
`/admin/`.

## Launcher

`./woco` is the repo-local CLI shim for Django management commands and
project tooling on macOS/Linux. It wraps `uv run woco`, which calls
`woco_cli.py` and then Django's `execute_from_command_line`, so shells
without the virtualenv activated still work. `woco.bat` provides the same
convenience entrypoint for Windows cmd.exe and PowerShell:

- macOS and Linux: `./woco <command>`
- Windows cmd.exe and PowerShell: `.\woco.bat <command>`

`./woco dev` is the one-command dev launcher. It reads Django's `DEBUG`
setting and picks the right mode:

- `DEBUG=True` (the default): starts the Vite dev server on :8080 (with hot
  module reload) and Django on :8000 in the same terminal. Open
  `http://localhost:8080` -- API, admin, media, and static requests are
  proxied to Django. Edit any frontend or backend file and the change shows
  up immediately. Ctrl+C kills both processes.
- `DEBUG=False`: runs `npm run build` then `./woco runserver`. Open
  `http://127.0.0.1:8000`. Use this to sanity-check the production bundle
  before pushing.

## Environment Files

Three separate env files exist. This section is the single reference for
them; other docs link here.

- Repo-root `.env` (from `.env.example`): read by Django via python-decouple
  and by the ASCC pipeline CLI (`tools/ascc_cli.py`). Holds
  `DJANGO_SECRET_KEY`, `DEBUG`, `DJANGO_APP_HOSTNAME`, email settings, DB
  name, and pipeline LLM keys. This is the one you create in step 4.
- `backend/.env`: same format and purpose as repo-root `.env`. On deployed
  hosts, `deploy/provision.sh` writes the env file here rather than at the
  repo root. python-decouple searches upward from `backend/woco/`, so it
  finds `backend/.env` first when present, falling back to the repo-root
  `.env`. Local development does not need this file.
- `frontend/.env`: optional; sourced by `deploy/deploy.sh` before the
  frontend build to inject Vite build-time variables on servers. Local
  development does not need this file.

## Verification

Run these commands from the repo root after local setup:

```sh
uv sync --frozen
bash tools/fingerprint.sh
(cd tools && uv run python -m pytest tests)
uv run python backend/manage.py check
uv run python backend/manage.py test common
(
  cd frontend
  npm ci
  npm audit --audit-level=moderate
  npm run lint
  npm run typecheck
  npm test -- --runInBand
  npm run build
)
```

Backend tests need a running MariaDB server and credentials in `mysql.cnf`.
The database user needs permission to create and drop `test_worldcovers` (or
`test_<DB_NAME>` for a custom database name). Local setup grants access to
the test database. Run the tools suite with pytest; unittest does not collect
all of its tests.

[verify.yml](../../.github/workflows/verify.yml) defines the shared CI checks.
Pull requests and both deploy workflows call it. CI uses Node 22, the pinned
Python version, and a MariaDB service: 12.3 LTS for staging deploys and PRs
targeting `staging`, and 10.11 for production deploys and other PRs. Deployment
starts only after both the frontend and backend jobs pass. The frontend build
is also uploaded as an artifact; the server deploy builds the frontend again.

## Seeding and ETL

A freshly migrated database has no catalog data. To import catalog data and
run ETL pipelines, see [TOOLS.md](TOOLS.md) and [PIPELINE.md](PIPELINE.md).

## Deployment

For deploying to staging or production, see [DEPLOY.md](DEPLOY.md).
