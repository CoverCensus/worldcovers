# WorldCovers

WorldCovers is a Django and React application for cataloging stampless covers
and postal markings.

The staging/beta host runs at [woco.dev](https://woco.dev/). Production
deployment is currently `hellowoco.app`.

> "Another success is the post-office, with its educating energy augmented by cheapness and guarded by a certain religious sentiment in mankind; so that the power of a wafer or a drop of wax or gluten to guard a letter, as it flies over sea over land and comes to its address as if a battalion of artillery brought it, I look upon as a fine meter of civilization."

&nbsp;&nbsp;&nbsp;&nbsp;-- _Ralph Waldo Emerson_

## Project Overview

The first catalog is the American Postal Markings Catalog (APMC), with
software support for ASCC and VPHC source data. Guests search Markings and
their associated Covers. Contributors submit additions and corrections;
Editors review them for their assigned Collections. Offline tools prepare
catalog data for import. Available data and review progress vary by state
and site.

New developers: run the [Quickstart](#quickstart) below, then read
[New Developer Orientation](./docs/devel/README.md#new-developer-orientation).
It has the system sketch, directory map, identifier legend, and reading
order. Open work is in [ISSUE.md](./ISSUE.md). Rules for code changes are
in [DECISIONS.md](./DECISIONS.md).

New state Editors should read [Getting Started](./docs/getting-started.md).

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

Bodger is optional. It is the catalog extraction toolset, kept in a
separate repository that is private to the CoverCensus GitHub organization.
The setup below installs WorldCovers without it. To request access, open
a GitHub issue on this repository; see
[Getting Bodger Access](./docs/devel/TOOLS.md#getting-bodger-access). Base catalog work, Entry submission and review,
and imports of prepared bundles do not require the extraction tools.

Prerequisites:

- Local development has been tested on macOS & Ubuntu Linux via WSL2. Native Windows should work the same if the dependencies are properly installed.
- Python 3.13, pinned by [.python-version](./.python-version)
- `uv`, installed with `curl -LsSf https://astral.sh/uv/install.sh | sh`
- Node.js and npm for the frontend build
- MariaDB, running locally. Manual verification uses MariaDB 12.3 LTS for
  staging and 10.11 for production.
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

Then start the dev server:

```sh
./woco dev
```

Open `http://localhost:8080`. Expected: the SPA loads with an empty
catalog. To load catalog data and create a login, see
[Getting Catalog Data Locally](./docs/devel/README.md#getting-catalog-data-locally).

`./woco` is the repo-local command for everything: setup, the dev server,
and Django management commands. On Windows cmd.exe and PowerShell, use
`.\woco.bat` in its place.

[docs/devel/BUILD.md](./docs/devel/BUILD.md) is the one home for setup
detail. It covers:

- [unattended setup and custom database names](./docs/devel/BUILD.md#one-command-setup)
- [the same setup done by hand, step by step](./docs/devel/BUILD.md#steps)
- [how `./woco` works](./docs/devel/BUILD.md#launcher)
- [the tests and checks](./docs/devel/BUILD.md#verification)

For a task-oriented index of all developer and operator docs, see
[docs/devel/README.md](./docs/devel/README.md).

## Development

### Local Development

After updating an existing checkout, stop the local servers and apply the
database updates before restarting:

```sh
./woco migrate
./woco createcachetable
```

`./woco dev` starts servers; it does not run these commands. Missing migrations
or the account rate-limit cache table can prevent site and admin login.
`./woco setup dev` and hosted deployment already run both commands.

For day-to-day development, run:

```sh
./woco dev
```

With `DEBUG=True`, this starts Vite on `http://localhost:8080` and Django on
`http://127.0.0.1:8000`. Open the Vite URL for frontend hot reload. API,
admin, media, and static requests are proxied to Django.

With `DEBUG=False`, `./woco dev` builds `frontend/dist/` and serves the built
SPA through Django at `http://127.0.0.1:8000`.

For local test commands and the verification checks that must pass before a
deploy, see [BUILD.md](./docs/devel/BUILD.md#verification).

### Shared Agent Skill

Optional. Skip this section if you do not use an AI coding agent.

The repo maintains one shared reconciliation skill:
[worldcovers-sync-plan](.agents/skills/worldcovers-sync-plan/SKILL.md).
It checks code and tests against design, README.md, ISSUE.md, and DECISIONS.md,
then compares the evidence with live Trello and produces one correction plan.

Invoke `$worldcovers-sync-plan`, or have another agent read the linked
SKILL.md. The repo installation is the source of truth; do not install a
second global copy with the same name.

Invocation produces a plan only. File updates and board updates each need
authorization in the current task. The rule for keeping commits and Trello
cards aligned is in
[DECISIONS.md](DECISIONS.md#keep-commit-work-in-sync-with-trello).

The Trello review needs authenticated access to the WorldCovers board.
Without it, continue the local review and report the board check as pending.

## Deployment And Operations

Hosted deploys target Ubuntu 24.04 LTS servers with systemd, nginx, MariaDB,
Node 22, uv, and Python 3.13. The checked-in provisioning script is written
for that host profile. It installs MariaDB from the host's configured apt
repositories; it does not pin a release series or migrate an existing MySQL
server. See [database versions](./docs/devel/DEPLOY.md#database-versions)
for the current configuration and planned changes.

The deployment source of truth is:

- [docs/devel/DEPLOY.md](./docs/devel/DEPLOY.md#deploy-flow) (manual deploy steps)
- [deploy/provision.sh](./deploy/provision.sh)
- [deploy/deploy.sh](./deploy/deploy.sh)
- [deploy/worldcovers.service](./deploy/worldcovers.service)
- [deploy/worldcovers-apply-unit.sh](./deploy/worldcovers-apply-unit.sh)

Deploys are run by hand by a maintainer since 2026-10-30 (see
[DEPLOY.md](./docs/devel/DEPLOY.md#deploy-flow)); the GitHub Actions
workflows were removed from the repository. The operator stops and starts the
`worldcovers` service around each deploy and runs one deployment at a time.
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

There is no written contribution policy yet. The working flow (branch
`staging` first, then promotion to `main`) is in
[How Work Moves](./docs/devel/README.md#how-work-moves).

Parts of this codebase were generated with AI assistance. Changes still require
human review before acceptance.

---

_**We hope you enjoy WoCo!**_
