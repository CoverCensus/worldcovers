# Developer And Operator Docs

Start here. New developers: read [New Developer Orientation](#new-developer-orientation)
below first. It is one screen per topic and takes about ten minutes.
Everyone else: pick the row that matches what you are trying to do.

| I want to... | Read |
|---|---|
| Set up a local dev environment from scratch | [BUILD.md](BUILD.md) |
| Run the tests and the checks required before a deploy | [BUILD.md](BUILD.md#verification) |
| Understand what the product does and why | [../vision.md](../vision.md), [design.md](design.md) |
| Preserve design choices when changing code | [../../DECISIONS.md](../../DECISIONS.md) |
| Learn the domain terms (markings, covers, regions) | [../glossary.md](../glossary.md) |
| See which features live in the SPA vs Django admin | [../../ISSUE.md](../../ISSUE.md#feature-implementation-surfaces) |
| Find open work | [../../ISSUE.md](../../ISSUE.md) |
| Understand the database schema | [model.md](model.md) |
| Name UI elements and actions consistently | [vocab.md](vocab.md) |
| Digitize an ASCC state (build and import a bundle) | [PIPELINE.md](PIPELINE.md) |
| Understand decisions made during VPHC ingestion | [VPHC-DECISIONS.md](VPHC-DECISIONS.md) |
| Look up a management command or data script | [TOOLS.md](TOOLS.md#command-index) |
| Get access to the private bodger extraction repo | [TOOLS.md](TOOLS.md#getting-bodger-access) |
| Run day-to-day server operations | [RUNBOOK.md](RUNBOOK.md) |
| Understand or change the deploy flow | [DEPLOY.md](DEPLOY.md) |
| Provision a staging or production host | [DEPLOY.md](DEPLOY.md#provisioning-a-fresh-host) |
| Check database versions and upgrade plans | [DEPLOY.md](DEPLOY.md#database-versions) |
| Make sense of legacy v1 data (tblRawStateData etc.) | [v1/v1-legacy-summary.md](v1/v1-legacy-summary.md) |
| Understand or restore the nightly server backups | [BACKUP.md](BACKUP.md) |
| Re-import a state without losing user-submitted data | [USER_SAFE_REFRESH.md](USER_SAFE_REFRESH.md) |
| Run the T65 Color repair on a server | [COLOR-REPAIR.md](COLOR-REPAIR.md) |
| Retake the screenshots in the public Getting Started guide | [getting-started-screenshots.md](getting-started-screenshots.md) |

## New Developer Orientation

This section is the single orientation page for a developer who has never
seen the repo. Decision recorded 2026-11-15: it lives in this file, not in
a separate document, because this file is already the docs entry point.

### Reading Order

1. [../vision.md](../vision.md): what the product is for. 5 minutes.
2. [../glossary.md](../glossary.md): the domain terms. 10 minutes.
3. This section.
4. [BUILD.md](BUILD.md): get the app running locally.
5. [design.md](design.md): roles, stories, and features.
6. Everything else only when a task needs it.

You do not need to read ISSUE.md, DECISIONS.md, or TOOLS.md end to end.
See [How To Read The Large Documents](#how-to-read-the-large-documents).

### System At A Glance

```text
Browser
   |
   v
React SPA            frontend/src/      Vite dev server on :8080
   |  JSON over /api/v2/
   v
Django server        backend/woco/      settings and URL routing, :8000
   |
   v
Common app           backend/common/    models, API, admin, commands
   |
   v
MariaDB

bodger (separate private repo): builds a bundle from a source catalog
   |  prepared CSV bundle
   v
./woco ascc import <bundle-dir>   ->   MariaDB
```

URL prefixes served by Django:

- `/api/v2/`: the REST API used by the SPA.
- `/api/docs/`: Swagger UI for the API. `/api/schema/` is the raw schema.
- `/admin/`: Django admin.
- `/accounts/`: account email flows (django-allauth).
- Everything else: the built SPA.

How a Submission moves through the system:

1. A Contributor fills in a form on the `/contribute` Page.
2. The SPA sends it to `/api/v2/`. It is stored as a `Contribution` row.
3. An Editor for that Collection opens it from `/dashboard` or
   `/contribution/:id`.
4. The Editor chooses Approve, Reject, or Return.
5. On Approve, the backend writes the Marking or Cover into the catalog.

Naming trap: the docs and the UI say Submission. The code says
`Contribution` (`backend/common/models.py`, `frontend/src/services/contributions.ts`).
They are the same thing.

### Directory Map

| Path | What is there |
|---|---|
| `woco`, `woco_cli.py` | The `./woco` command. Run everything through it. |
| `backend/woco/` | Django settings (`settings.py`) and URL routing (`urls.py`). |
| `backend/common/models.py` | All domain and workflow models. |
| `backend/common/api/v2/` | REST API: `urls.py`, `views.py`, `serializers.py`, `permissions.py`. |
| `backend/common/api/help.py` | Public Help allowlist and view. |
| `backend/common/management/commands/` | Django management commands. Listed in [TOOLS.md](TOOLS.md). |
| `backend/common/tests/` | Backend tests. |
| `frontend/src/App.tsx` | Every SPA route is registered here. |
| `frontend/src/pages/` | One file per Page (route). |
| `frontend/src/components/` | Shared UI components. |
| `frontend/src/services/` | API client functions. |
| `tools/` | Host scripts, thin wrappers that call bodger, and the tools test suite. The extraction tools themselves are in bodger. |
| `deploy/` | Server provisioning, deploy, and backup scripts. |
| `docs/` | Public Help articles (only allowlisted files are published). |
| `docs/devel/` | Internal developer and operator docs. |
| `VERSION` | The one place the app version is set. |

### Identifier And Acronym Legend

Identifiers:

| Form | Meaning | Defined in |
|---|---|---|
| R1-R4 | User roles | [design.md](design.md#roles) |
| S1-S49 | User stories | [design.md](design.md#stories) |
| F1-F13 | Features (groups of stories) | [design.md](design.md#features) |
| T1, T93, ... | Trello card numbers | The Trello board linked at the top of [ISSUE.md](../../ISSUE.md) |
| Issue N | An original beta-feedback issue | [ISSUE.md](../../ISSUE.md) |
| Batch #N | An item from the MD/MI Editor review batch | [ISSUE.md](../../ISSUE.md) |
| PR #N | A GitHub pull request | GitHub |

Acronyms not in the public glossary:

- WoCo: short name for the WorldCovers software.
- USPCS: U.S. Philatelic Classics Society, the sponsor.
- FPHC: *Florida Postal History 1763-1861*, a source catalog. See
  [TOOLS.md](TOOLS.md#fphc-source-extraction).
- v1: the legacy ColdFusion system behind worldcovers.org.
- bodger: the repository that holds the catalog extraction tools (OCR,
  munging, bundle building). It is private to the CoverCensus GitHub
  organization; request access with a GitHub issue on WorldCovers. Base development
  does not need it. See [Getting Bodger Access](TOOLS.md#getting-bodger-access).

APMC, ASCC, and VPHC are defined in [../glossary.md](../glossary.md).

### Getting Catalog Data Locally

A freshly migrated database is empty. Regions, Collections, Post Offices,
and Markings all arrive through a bundle import.

- No sample bundle is checked in to this repo.
- Prepared bundles are written to `tools/wip/out/`, which Git ignores.
  Get a bundle directory for one state from a developer who has one.
- From the repo root, with the local database set up, run
  `./woco ascc import <bundle-dir> --dry-run`; expected exit code 0.
- Then run `./woco ascc import <bundle-dir>`; expected exit code 0.

Importing a prepared bundle does not need bodger, private GitHub access, or
OCR keys. Details: [TOOLS.md](TOOLS.md#ascc-import).

To create a local login, see
[../../frontend/CREATE_TEST_USER.md](../../frontend/CREATE_TEST_USER.md).

### How Work Moves

1. Work is tracked on the Trello board. ISSUE.md is the detailed reference.
   Board access is by invitation from an existing board member.
2. Changes merge to the `staging` branch first.
3. The person who merges runs the [verification checks](BUILD.md#verification)
   locally. There is no CI service.
4. A maintainer deploys `staging` to `woco.dev` by hand.
5. A promotion pull request moves `staging` to `main`.
6. A maintainer deploys `main` to `hellowoco.app` (production) by hand.

Deploy steps: [DEPLOY.md](DEPLOY.md#deploy-flow). A written contribution
policy does not exist yet; agree changes with the other developer before
merging.

### How To Read The Large Documents

- [ISSUE.md](../../ISSUE.md): open work only, grouped by feature. Read
  "Rules For This File" and "Terms Used In The Tables" once, then go to
  the feature you are working on.
- [DECISIONS.md](../../DECISIONS.md) (about 1,350 lines): each `##` heading
  is one rule. Read only the rules for the area you are changing. Read
  these three before your first change:
  [Keep Entry Types And Relationships Clear](../../DECISIONS.md#keep-entry-types-and-relationships-clear),
  [Enforce Permissions In The Backend](../../DECISIONS.md#enforce-permissions-in-the-backend),
  [Keep Submissions Separate From Publication](../../DECISIONS.md#keep-submissions-separate-from-publication).
- [TOOLS.md](TOOLS.md) (about 1,050 lines): read "Two Repositories, Two
  Jobs", then use the Command Index to find one command and jump to it.
- [model.md](model.md) (about 700 lines): jump to the
  [ER diagram](model.md#er-diagram) first, then read the table you need.

Files under `docs/devel/` are internal. Public Help publishes only document
names on the allowlist in `backend/common/api/help.py`; location alone does
not control publication. Keep internal document names off that list. Edits
to an allowlisted document become public when deployed.

## Documentation Conventions

Each kind of content has exactly one home. When writing or reviewing docs,
route content accordingly instead of duplicating it:

- **Specification** (what the system should do): [design.md](design.md)
  and [model.md](model.md). These are pure spec -- never add current
  implementation status, route lists, or progress notes to them.
- **Open work** (what is not finished, and when it counts as done):
  `ISSUE.md` at the repo root. It also holds the feature
  implementation-surfaces table. It is not a changelog: delete a row when
  its work is accepted. Dated logs, commit hashes, and test counts belong
  in Git history and on the Trello card.
- **Rules for code changes**: [../../DECISIONS.md](../../DECISIONS.md) links
  design choices to code, tests, and open work. A lasting rule that comes
  out of finished work goes here.
- **No developer names**: write "a maintainer", "an Editor", or "the
  requester". Trello holds who is assigned. The public
  [acknowledgements](../acknowledgements.md) page is the one exception.
- **Historical explanations**: none are kept in the repo. Git history is
  the record. Do not add dated reports or investigation write-ups under
  `docs/`. VPHC ingestion rules are in [VPHC-DECISIONS.md](VPHC-DECISIONS.md).
- **Procedures** (how to do a task): BUILD.md, PIPELINE.md, TOOLS.md,
  RUNBOOK.md, DEPLOY.md. Each procedure is written once in its home doc;
  other docs link to it rather than restating it.
- **Terminology**: user-facing terms in [../glossary.md](../glossary.md),
  developer-only UI/action vocabulary in [vocab.md](vocab.md).
- All repo text is 7-bit ASCII only (see the review checklist in
  [DEPLOY.md](DEPLOY.md)).
