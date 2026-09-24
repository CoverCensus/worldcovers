# WorldCovers

WorldCovers is a Django and React application for cataloging stampless covers
and postal markings.

The staging/beta host runs at [woco.dev](https://woco.dev/). Production
deployment is currently `hellowoco.app`.

> "Another success is the post-office, with its educating energy augmented by cheapness and guarded by a certain religious sentiment in mankind; so that the power of a wafer or a drop of wax or gluten to guard a letter, as it flies over sea over land and comes to its address as if a battalion of artillery brought it, I look upon as a fine meter of civilization."

&nbsp;&nbsp;&nbsp;&nbsp;-- _Ralph Waldo Emerson_

## Project Overview

The first catalog is the American Postal Markings Catalog (APMC), with
software support for ASCC and VPHC source data. Visitors search markings and
their associated covers. Contributors submit additions and corrections;
editors review them for their assigned collections. Offline tools prepare
catalog data for import. Available data and review progress vary by state
and site.

Start with the [vision](./docs/vision.md) for scope, the
[model](./docs/devel/model.md) for domain records, and the
[ASCC pipeline](./docs/devel/PIPELINE.md) or
[VPHC commands](./docs/devel/TOOLS.md#vphc-commands) for data preparation.
The [verification guide](./docs/devel/BUILD.md#verification) covers tests.
New state editors should read [Getting Started](./docs/getting-started.md).

WorldCovers has three main code areas:

- [Common model](./backend/common): shared models, admin resources,
  API, and management commands.
- [WoCo server](./backend/woco): Django settings, URL routing, and server
  entry points.
- [Web UI](./frontend): React SPA served by Django in production and by Vite
  during frontend development.

Public Help content is served from explicitly allowlisted Markdown documents
in [docs](./docs) by `backend/common/api/help.py`. Developer and operator
material belongs under `docs/devel/`; adding a document does not publish it.

For design and scope details, see [docs/devel/design.md](./docs/devel/design.md)

## Quickstart

Prerequisites:

- Local development has been tested on macOS & Ubuntu Linux via WSL2. Native Windows should work the same if the dependencies are properly installed.
- Python 3.13, pinned by [.python-version](./.python-version)
- `uv`, installed with `curl -LsSf https://astral.sh/uv/install.sh | sh`
- Node.js and npm for the frontend build
- MariaDB, running locally. CI tests MariaDB 12.3 LTS for staging and 10.11
  for production.
  `./woco setup dev` needs either `sudo mariadb`
  access or the MariaDB root password to create the local database and app user.

From the repo root, run the one-command setup:

```sh
./woco setup dev
```

On a fresh clone this installs dependencies, creates `.env` with a generated
secret key, prompts for local database settings, creates the MariaDB database
and app user, writes `mysql.cnf`, builds the frontend, runs migrations, and
collects static files. Press Enter at the app-password prompt to generate a
random password. The command is idempotent -- safe to re-run any time.

For unattended setup, pass the values as environment variables:

```sh
WOCO_DB_PASSWORD=<app-db-password> \
WOCO_MYSQL_ROOT_PASSWORD=<mariadb-root-password> \
./woco setup dev
```

`WOCO_DB_NAME` and `WOCO_DB_USER` are optional; defaults are `worldcovers`
and `wocod`. Omit `WOCO_MYSQL_ROOT_PASSWORD` when `sudo mariadb` works locally.

Then start the dev server:

```sh
./woco dev
```

The equivalent manual steps, if you prefer to run them yourself:

```sh
uv sync
# Edit the password in tools/setup_worldcovers_db.sql first, then:
sudo mariadb < tools/setup_worldcovers_db.sql
cp mysql.cnf.example mysql.cnf   # then fill in the same user and password
cp .env.example .env             # then set DJANGO_SECRET_KEY (see below)
./woco secretkey                 # prints a fresh secret key
cd frontend && npm ci && npm run build && cd ..
./woco migrate
./woco collectstatic --noinput
./woco dev
```

Paste the generated secret key into the `DJANGO_SECRET_KEY=` line of `.env`
before running `./woco migrate` -- Django refuses to start without it.

`./woco` is the repo-local CLI shim for Django management commands on macOS
and Linux. It wraps `uv run woco`, which calls `woco_cli.py` and then
Django's `execute_from_command_line`. `woco.bat` is included as a convenience
wrapper for Windows cmd.exe and PowerShell; use `.\woco.bat` in place of
`./woco` on Windows systems.

For full setup details and troubleshooting, see
[docs/devel/BUILD.md](./docs/devel/BUILD.md). For a task-oriented index of
all developer and operator docs, see
[docs/devel/README.md](./docs/devel/README.md).

## Development

### Shared Agent Skills

The repo keeps its shared sync skills in `.agents/skills`:

- [worldcovers-sync-plan](.agents/skills/worldcovers-sync-plan/SKILL.md)
  compares repo evidence, README.md, ISSUE.md, and live Trello.
- [worldcovers-code-doc-sync](.agents/skills/worldcovers-code-doc-sync/SKILL.md)
  checks code and tests against design, ISSUE.md, and DECISIONS.md.

In your harness, invoke `$worldcovers-sync-plan` or `$worldcovers-code-doc-sync`.
Other agents can read the linked SKILL.md files and follow their instructions.
Maintain these repo copies as the source of truth for shared use.

For a full sync, review Trello first, review code and docs next, apply approved
local corrections, then check Trello against those changes. Keep each review
limited to the affected work. Invoking a skill produces a plan; file and board
updates need approval for that plan in the current task. Reuse approval already
given for the same plan.

For each commit, assign the relevant Trello cards and move only its work to
Doing. Run a focused sync-plan review, develop and test, then move those cards
to Testing. Run code-doc-sync for affected rules and a focused Trello sync
check before pushing and deploying. Moving cards from Testing to Done is a
separate acceptance step. See the [commit workflow decision](DECISIONS.md#keep-commit-work-in-sync-with-trello).

The Trello review needs authenticated access to the WorldCovers board. Without
it, continue the local review and report the board check as pending. Private
workspace notes and archives are optional and are not part of these skills.

### Local Development

For day-to-day development, run:

```sh
./woco dev
```

With `DEBUG=True`, this starts Vite on `http://localhost:8080` and Django on
`http://127.0.0.1:8000`. Open the Vite URL for frontend hot reload. API,
admin, media, and static requests are proxied to Django.

With `DEBUG=False`, `./woco dev` builds `frontend/dist/` and serves the built
SPA through Django at `http://127.0.0.1:8000`.

For local test commands and the checks required by GitHub Actions, see
[BUILD.md](./docs/devel/BUILD.md#verification).

## Deployment And Operations

Hosted deploys target Ubuntu 24.04 LTS servers with systemd, nginx, MariaDB,
Node 22, uv, and Python 3.13. The checked-in provisioning script is written
for that host profile. It installs MariaDB from the host's configured apt
repositories; it does not pin a release series or migrate an existing MySQL
server. See [database versions](./docs/devel/DEPLOY.md#database-versions)
for the current configuration and planned changes.

The deployment source of truth is:

- [.github/workflows/verify.yml](./.github/workflows/verify.yml)
- [.github/workflows/pr-checks.yml](./.github/workflows/pr-checks.yml)
- [.github/workflows/build-and-deploy.yml](./.github/workflows/build-and-deploy.yml)
- [.github/workflows/deploy-prod.yml](./.github/workflows/deploy-prod.yml)
- [deploy/provision.sh](./deploy/provision.sh)
- [deploy/deploy.sh](./deploy/deploy.sh)
- [deploy/worldcovers.service](./deploy/worldcovers.service)
- [deploy/worldcovers-apply-unit.sh](./deploy/worldcovers-apply-unit.sh)

GitHub Actions stops and starts the `worldcovers` service around each deploy.
Staging can apply a changed systemd unit through the audited helper; production
fails closed until a root operator reviews and applies unit changes manually.
`deploy/deploy.sh` runs dependency sync, migrations, frontend build, and
Django static collection.

For deployment details, see [docs/devel/DEPLOY.md](./docs/devel/DEPLOY.md).
For operator tasks, see [docs/devel/RUNBOOK.md](./docs/devel/RUNBOOK.md).
For ETL and management commands, see [docs/devel/TOOLS.md](./docs/devel/TOOLS.md).
For the ASCC catalog pipeline, see [docs/devel/PIPELINE.md](./docs/devel/PIPELINE.md).

## Versioning

The app version is a single string in [VERSION](./VERSION) at the repo root.
`pyproject.toml` reads it dynamically via `[tool.hatch.version]`, and
`frontend/vite.config.ts` reads the same file to build the `__APP_VERSION__`
constant shown in the site footer. To release a new version, edit `VERSION`
only -- nothing else needs to change.

`frontend/package.json` also carries a `version` field because npm requires
one; it is not read by the app and can drift. Treat `VERSION` as canonical.

## License And Contributions

For licensing details, see [LICENSE](./LICENSE).

Contribution policy and public issue-tracker links are not yet formalized. Coordinate changes through the project team.

Parts of this codebase were generated with AI assistance. Changes still require
human review before acceptance.

---

_**We hope you enjoy WoCo!**_
