# Tools Reference

Every command an operator or developer can run, grouped by task.

To find a command, use the [Command Index](#command-index). Each row links
to its section. Run `./woco help` from the repo root to list the commands
in your checkout.

## Two Repositories, Two Jobs

Catalog data work is split across two repositories. Know which one you
need before you start.

| Repository | Job | Access |
|---|---|---|
| WorldCovers (this repo) | Import a prepared bundle. Review, repair, back up, and remove catalog data. Run the site. | Open source, GPL-3.0 |
| [bodger](https://github.com/CoverCensus/bodger) | Turn a source catalog (scans, PDFs, workbooks, legacy exports) into a prepared bundle. | Private to the CoverCensus GitHub organization |

The rule: **bodger builds a bundle; WorldCovers imports it.**

What lives in bodger, not here:

- ASCC legacy-export conversion and the munger (`ascc_data_munger.py`).
- ASCC scanned-PDF page splitting, OCR text extraction, and image
  extraction (`ascc_page_processor.py`, `ascc_page_extract.py`,
  `ascc_image_extract.py`).
- FPHC native-PDF extraction and FPHC2 bundle building (`fphc_extract.py`).
- VPHC workbook extraction, cross-examination, and ledger building
  (`vphc_extract.py`, `vphc_crossexam.py`, `vphc_manuscript_ledger.py`).
- The tests and rules for all of the above.

WorldCovers keeps only thin wrappers for those tools (`./woco ascc`,
`./woco fphc`, `./woco bodger`). A wrapper finds the bodger checkout and
runs the tool in bodger's own Python environment. Without bodger, a
wrapper stops with a setup error and a non-zero exit code.

Bodger's own command reference is `docs/devel/TOOLS.md` inside the bodger
checkout. The bodger sections below cover only how WorldCovers calls it.

## Getting Bodger Access

Bodger is a private repository. Only members of the CoverCensus GitHub
organization who have been granted access can clone it. A 404 page at
`https://github.com/CoverCensus/bodger` means you do not have access; it
does not mean the repository is gone.

To get access:

1. Open a GitHub issue on the WorldCovers repository:
   <https://github.com/CoverCensus/worldcovers/issues/new>.
   You cannot open one on bodger itself, because you cannot see it yet.
2. Title it `Bodger access request`. In the body, give your GitHub
   username and the source catalog you need to work on.
3. A CoverCensus organization owner adds you to the bodger repository and
   closes the issue.
4. Follow [Optional Bodger Setup](PIPELINE.md#optional-bodger-setup).

You do not need bodger to:

- set up, run, or develop WorldCovers;
- submit, review, and approve Entries;
- import a bundle that someone else prepared;
- run any command in Parts 2 through 7 below.

You need bodger only to build a new bundle from a source catalog (Part 1).

## How To Run A Command

- Run every command from the repo root.
- `./woco <command>` runs a Django management command with the repo's
  `.venv/bin/python`. It does not sync or rebuild the environment.
- A database command needs `.env` and `mysql.cnf` in place; see
  [BUILD.md](BUILD.md).
- A successful command exits with code 0.
- A command that changes data commits by default. Add `--dry-run` to
  preview. `repair_vphc_rate` is the exception: it needs `--commit`.
- Put inputs in `tools/wip/in/`, outputs in `tools/wip/out/`, and caches in
  `tools/wip/cache/`. Git ignores all three.

These shortcuts do not load Django:

| Shortcut | Runs |
|---|---|
| `./woco setup dev`, `./woco setup prod` | `tools/setup.sh`; see [BUILD.md](BUILD.md) and [DEPLOY.md](DEPLOY.md) |
| `./woco secretkey` | Prints a fresh `DJANGO_SECRET_KEY`. Works before `.env` exists. |
| `./woco push [args]` | `tools/push_data.sh` |
| `./woco refresh [args]` | `tools/refresh_data.sh` |
| `./woco reload [args]` | `tools/reload_data.sh` |
| `./woco ascc <subcommand>` | `tools/ascc_cli.py` |
| `./woco bodger <script>` | `tools/bodger_tools.py` |

`./woco dev` starts the local dev servers; see [BUILD.md](BUILD.md#launcher).

## Command Index

**Part 1: Build A Bundle (needs bodger)**

| Command | What it does |
|---|---|
| [`./woco ascc doctor`, `munge`, `run`, `ocr`, `clean`](#ascc-bundle-building) | Build an ASCC bundle from legacy exports or scanned PDFs |
| [`./woco bodger fphc_extract`](#fphc-source-extraction) | Dump text, tables, and images from the FPHC PDF |
| [`./woco fphc extract`, `./woco fphc munge`](#build-and-import-the-fphc2-bundle) | Build the FPHC2 bundle |
| [`./woco bodger vphc_extract`, `vphc_crossexam`, `vphc_manuscript_ledger`](#vphc-extraction) | Extract and compare the VPHC workbook |
| [`./woco bodger <script>`](#running-any-bodger-script) | Run any bodger tool by name |

**Part 2: Import A Prepared Bundle**

| Command | What it does |
|---|---|
| [`./woco ascc import`](#ascc-import) | Queue an ASCC bundle for Editor review |
| [`./woco fphc import`](#build-and-import-the-fphc2-bundle) | Import the FPHC2 bundle |
| [`import_vphc_reference`](#import_vphc_reference) | Load VPHC counties, Post Offices, and Postmaster events |
| [`apply_vphc_ledger`](#apply_vphc_ledger) | Apply reviewed VPHC actions and queue Marking Submissions |
| [`import_apmc_bundle`](#import_apmc_bundle) | Umbrella importer; delegates to the ASCC importer |

**Part 3: Move Data Between Hosts**

| Command | What it does |
|---|---|
| [`tools/push_data.sh`](#toolspush_datash) | Sync local bundles and media to a host |
| [`tools/refresh_data.sh`](#toolsrefresh_datash) | Import a bundle on a host and keep existing catalog data |
| [`tools/reload_data.sh`](#toolsreload_datash) | Truncate and reload catalog data on staging |
| [`tools/rebuild_staging_db.sh`](#toolsrebuild_staging_dbsh) | Ensure the database exists, migrate, create the admin user, import |

**Part 4: Repair And Report**

| Command | What it does |
|---|---|
| [`repair_vphc_rate`](#repair_vphc_rate) | Fix rates that took a VPHC drawing number |
| [`repair_ascc_child_inscriptions`](#repair_ascc_child_inscriptions) | Remove added Townmark prefixes from Ratemarks and Auxmarks |
| [`repair_catalog_colors`, `tools/check_catalog_colors.py`](#color-repair) | Apply and verify a reviewed Color correction map |
| [`report_duplicate_markings`](#report_duplicate_markings) | Read-only report of candidate duplicate Markings |
| [`consolidate_superseded_contributions`](#consolidate_superseded_contributions) | Delete superseded non-draft Submissions |

**Part 5: Remove Data**

| Command | What it does |
|---|---|
| [`./woco ascc drop`](#ascc-drop) | Delete one Region's imported catalog data |
| [`wipe_user_data`, `tools/wipe_user_data.sh`](#wipe_user_data) | Clear Submissions, versions, and recycle bins |
| [`purge_recycle_bin`](#purge_recycle_bin) | Archive, verify, then permanently delete recycle-bin rows |

**Part 6: Back Up, Restore, And Check**

| Command | What it does |
|---|---|
| [`backup_collection`, `restore_collection`, `verify_collection`](#collection-backup-and-restore) | Move a whole Collection between instances |
| [`backup_marking`, `restore_marking`](#backup_marking-and-restore_marking) | Export and restore one Marking graph as JSON |
| [`backup_auth`, `restore_auth`](#backup_auth-and-restore_auth) | Export and restore users, groups, and assignments |
| [`verify_media_integrity`](#verify_media_integrity) | Check Image rows against files; report orphans |
| [`prune_revisions`](#prune_revisions) | Prune django-reversion history |

Full-server backups are separate; see [BACKUP.md](BACKUP.md).

**Part 7: Accounts**

| Command | What it does |
|---|---|
| [`set_user_password`](#set_user_password) | Set a user's password from the command line |

### Commands Without A Section Yet

These exist in `backend/common/management/commands/` but are not described
below. Run `./woco <command> --help` before using one.

| Command | One-line purpose (from its help text) |
|---|---|
| `backup_user_markings` | Batch-export every Marking that carries user-origin content, through `backup_marking` |
| `restore_user_markings` | Batch-restore those backups and write `restore_report.json` |
| `recompute_marking_date_ranges` | Recompute or verify the cached earliest and latest dates on Markings |
| `set_color_display_hex` | Fill placeholder Color hex values with approximate screen colors |
| `load_legacy_bundle` | Load a legacy id-based bundle directly. Volume-test databases only. |
| `seed_volume_test` | Clone-amplify the catalog to a target Marking count. Volume testing only. |

---

## Part 1: Build A Bundle (Needs Bodger)

Everything in this part fails without a bodger checkout. See
[Getting Bodger Access](#getting-bodger-access). The end-to-end ASCC flow
is in [PIPELINE.md](PIPELINE.md).

### ASCC Bundle Building

The canonical ASCC v1-export-to-bundle workflow is documented in [PIPELINE.md](PIPELINE.md).
Use the state-centered wrapper for demos and normal runs:

```sh
./woco ascc doctor VA
./woco ascc munge VA
./woco ascc run VA --dry-run
./woco ascc run VA
```

These commands need bodger; see [Getting Bodger Access](#getting-bodger-access)
and [setup and paths](PIPELINE.md#optional-bodger-setup). Source files and caches
are in bodger. Final ASCC bundles and served media stay in WorldCovers. In the
paths below, `bodger/` means the selected checkout:

```text
bodger/tools/wip/cache/v1/VA/catalog_rows.csv
bodger/tools/wip/cache/v1/VA/image_refs.csv
tools/wip/out/v1_va/
tools/wip/out/v1_va/source_marking_map.csv
tools/wip/out/v1_va/v1_pipeline_warnings.csv
bodger/tools/wip/cache/v1/VA/run.json
```

`./woco ascc munge VA` builds the bundle without importing it.
`./woco ascc run VA` runs the same munge step and then imports the generated
bundle. Pass `--dry-run` to validate through the importer and roll back.
Missing v1 image files are skipped by default and reported in
`v1_pipeline_warnings.csv`; pass `--strict-v1-images` to fail instead.
`./woco ascc ocr VA --pdf ~/Downloads/va-catalog.pdf` runs the legacy scanned
PDF OCR pipeline.

Clean generated cache/output files without touching source PDFs or seed CSVs:

```sh
./woco ascc clean VA
./woco ascc clean
```

With a state, `clean` removes generated cache files for that state plus
`tools/wip/out/<state>/` and `tools/wip/out/v1_<state>/`. Without a state, it
clears generated contents under bodger's `tools/wip/cache/` and WorldCovers'
`tools/wip/out/` for all states while preserving placeholder files.

Expected exit code for each successful command: `0`.

The API-dependent OCR command, `./woco ascc ocr`, defaults to OpenRouter:

```sh
OPENROUTER_API_KEY=<key> ./woco ascc ocr VA --pdf ~/Downloads/va-catalog.pdf
```

Use the direct Anthropic Claude API with `--provider anthropic`:

```sh
ANTHROPIC_API_KEY=<key> ./woco ascc ocr VA --pdf ~/Downloads/va-catalog.pdf --provider anthropic
```

Or select the provider through environment variables:

```sh
PIPELINE_LLM_PROVIDER=anthropic \
PIPELINE_LLM_MODEL=claude-sonnet-4-6 \
ANTHROPIC_API_KEY=<key> \
./woco ascc ocr VA --pdf ~/Downloads/va-catalog.pdf
```

OpenRouter's default model is `anthropic/claude-sonnet-4.6`. Anthropic's
direct default model is `claude-sonnet-4-6`.

### FPHC Source Extraction

Extract the 457-page 2021 second edition of *Florida Postal History
1763-1861* from the local PDF:

```sh
./woco bodger fphc_extract
```

Install Poppler (`brew install poppler` on macOS) for `pdfimages`.
Run `uv sync --locked` in bodger to install its extraction libraries.
WorldCovers does not install them. Expected exit code: `0`.

FPHC default paths are relative to the bodger checkout. Explicit relative
path arguments are relative to the directory where you run the command.
The source stays at `tools/wip/in/Florida Postal History Catalog.pdf`.
Intermediates go under `tools/wip/cache/fphc/`, separated by source checksum,
extraction version, and pdfplumber version. The completed dump goes under
`tools/wip/out/fphc/`:

| File | Contents |
|------|----------|
| `manifest.json` | Publication, checksum, settings, counts, full printed index, and reference text from pages 6 and 53 |
| `pages.jsonl` | Native characters, words, text lines, vector rules, raw table cells, images, captions, and office spans |
| `offices.jsonl` | Printed headings and their page/coordinate spans |
| `assets/` | Native images and masks, plus rendered page crops for each image placement |
| `exceptions.jsonl` | Unusual table geometry, index differences, missing extraction, and unresolved placement |

Each JSONL line is one record. Text uses ASCII JSON escapes, so decoding the
JSON restores the original characters. `raw_text` retains PDF character
order. `layout_text`, words, lines, and table cell strings are extraction
views; the positioned `chars` remain available to check their spacing.

`pdf_page` is one-based; `pdf_page_index` is zero-based. `printed_page` is
read from the printed header. Bounds are `[left, top, right, bottom]` in
PDF points from the top left. Image matrices retain the PDF transform.
The 300 dpi placement crops reproduce page clipping and rotation; the
native assets retain their original pixel dimensions. A crop can include
other PDF elements that overlap its region.

Office spans follow the alphabetical section on pages 53-452, including
changes within a page. County lists stay on their original pages as a
separate cross-reference. Index spelling and page differences are recorded
without changing either source string.

Table rows stay separate. Blank strings are blank cells; `null` indicates
no cell at that grid position, including a merged cell. `cell_columns`
records the zero-based column index and span for each physical cell.
`cell_raw_text` keeps native character order before whitespace cleanup;
`cells` provides the table extractor's reading order. Differences beyond
whitespace produce a `table_reading_order_difference` exception. Detected
tables include ruled regions in front matter; inspect them before treating
them as data tables.
Continuation candidates point to preceding tables without filling cells
or merging rows. Review unusual geometry before using the tables for
normalization. A six-column grid can reflect a real division in only some
rows, as on page 318.

Caption detection uses the book's 11-point italic figure text. A clear
caption below one image gets a printed placement link. In the office
catalog, both must have the same office span. Ambiguous captions keep
candidate image IDs and an exception.
Other nearby text remains available by its page coordinates. These links
describe layout and do not identify Markings or create Cover associations.

For a sample, use a separate output directory:

```sh
./woco bodger fphc_extract \
  --pages 53-57,60,72-73,100,201,229,277,302,308,314-315,318,409-410,452 \
  --out-dir ../bodger/tools/wip/out/fphc_sample
```

This sample assumes the default sibling checkout. For a custom `BODGER_ROOT`,
substitute that checkout's path in `--out-dir`.

All pages are still read to establish office boundaries. A sample dump
keeps complete office spans and the full index for context. `--pdf`,
`--out-dir`, and `--cache-dir` override the paths. Repeat runs reuse native
page data and placement crops; `--force` rebuilds them. The tool rejects a
different page selection in an existing dump directory.

This tool does not run OCR, create WoCo records, infer historical identities,
or import a database bundle. Native text failures appear as exceptions;
handwriting inside images remains in the image assets for later work.

### VPHC Extraction

The VPHC workbook is extracted and compared in bodger. WorldCovers only
forwards the call:

```sh
./woco bodger vphc_extract --help
./woco bodger vphc_crossexam --help
./woco bodger vphc_manuscript_ledger --help
```

Expected exit code: `0`. Inputs, outputs, and rules are documented in
bodger: `docs/devel/TOOLS.md` ("VPHC Source Extraction") and
`docs/devel/VPHC-RULES.md`. These tools refuse to run where a database
driver is installed, which is why they use bodger's environment.

The files they produce feed the [VPHC Commands](#vphc-commands) in Part 2.

### Running Any Bodger Script

```sh
./woco bodger --help
./woco bodger <script-name> [arguments]
```

Use the script's lowercase file name without `.py`. Arguments and the exit
code pass straight through. Relative path arguments are relative to the
directory you run from; a script's default paths are relative to the bodger
checkout. A script added to bodger's `tools/` works here with no change to
WorldCovers.

---

## Part 2: Import A Prepared Bundle

No bodger needed. A bundle can come from any compatible source.

### `ascc import`

Preview a prepared ASCC bundle, then submit it to the Editors for the
Collections named by its Post Office Region links.

```sh
./woco ascc import tools/wip/out/v1_fl --dry-run --review-report /tmp/ascc-fl.csv
./woco ascc import tools/wip/out/v1_fl --actor 1
```

ASCC and FPHC use the same match and approval rules. The importer resolves
Post Offices and loads lookup records immediately. Each new Marking or Cover
source listing gets one Submission. Approval fills blanks on a unique,
corroborated match or creates a separately cited Entry. Approve linked
Markings before Covers. The source mapping keeps the edition, source code,
and original evidence even when the target keeps another catalog's code.
A repeat run skips pending, approved, and rejected listings. Previously
loaded ASCC records with verified codes and source evidence keep their IDs.

The default report is `ascc_review.csv` inside the bundle directory.
Use `--refresh-pending --dry-run` to preview stale proposals before
refreshing them with `--refresh-pending`. A changed, applied source
listing requires an editorial decision. Omitted optional Cover files are
supported. With `--allow-missing`, every included Entry still needs enough
information to identify its source, Post Office, and linked Markings.

For maintenance, `--direct` uses the older exact-code loader. It bypasses
Editor review. Partial loads of Entries or their evidence require this
flag. Explicit `--truncate` still clears the catalog tables and performs a
direct reload. In direct mode, `--skip-report PATH` writes skipped-row
diagnostics. In reviewed mode it is an alias for `--review-report PATH`.

Canonical load order:

```text
colors
letterings
shapes
regions
reference_works
post_offices
post_office_regions
markings
covers (optional)
cover_valuations (optional)
dates_seen
cover_markings (optional)
citations
images
```

The only stems that may be absent without `--allow-missing` are:

```text
covers
cover_markings
cover_valuations
```

### Build and import the FPHC2 bundle

`./woco fphc extract` and `./woco fphc munge` need bodger.
`./woco fphc import` does not; it runs entirely in WorldCovers.

Run `./woco fphc extract` to save the native PDF extract in bodger. Build
into a fresh package directory using the saved decisions and region seeds:

```sh
./woco fphc munge --input /path/to/extract/manifest.json --review-decisions /path/to/decisions.json --out-dir /path/to/package/bundle
```

Transfer the whole package directory, including `bundle/` and `media/fl/`.
Apply the WorldCovers code and migrations before importing. Use the original
ASCC Florida catalog as the baseline when reproducing the local build.

```sh
./woco fphc import /path/to/package/bundle --main-catalog --dry-run --review-report /tmp/fphc-preview.csv
./woco fphc import /path/to/package/bundle --main-catalog --actor 1 --review-report /tmp/fphc-applied.csv
```

Rule version 3 publishes by default. Covers with strikes identified in the
review decisions as English or Spanish go to the Florida Editor queue. The
foreign inscription, office, image, page and date stay with the submission.
The importer takes each foreign strike's Marking code (`FPHC2-M-####`) from
`deferred_marking_codes` in the bundle's `figure_review.jsonl`; it never
rebuilds a code from the source id. A bundle without those codes is refused
and must be rebuilt.
An Editor can approve the Cover with a verified existing catalog Marking.
FPHC Markings filed under Unidentified office and their linked Covers also
go to the Florida Editor queue. Inspect the Cover scan, supply the catalog
code of the identified Post Office and approve the Marking before its Cover.
Repeat imports preserve pending and completed decisions. For earlier loads,
source-owned foreign Entries are withdrawn through the recycle bin. The importer checks the decisions,
CSV and media checksums and source accounting. It stages media and applies
offices, Markings and Covers in order within a database transaction. Dry runs
roll back the database and skip media writes. In a repeat import report,
`skip` means the importer took no new action for that source row on this
run. A Submission already awaiting Editor review can still be pending.
Use `--queue` only when pending Editor Submissions are intended.
Older reviewed bundles keep their previous queue behavior. Rebuild incomplete
older bundles for main catalog use.

A unique Florida office name can resolve a Post Office. A Marking reuse
proposal requires a matching office, kind, and inscription, compatible
known fields, and either a full Townmark date or matching size and ink.
A Cover reuse proposal requires an identical front or back image and a
shared linked Marking. Ambiguous or conflicting evidence gives a separate
listing with its FPHC Citation. The report identifies candidates and fields
proposed for filling. Source rows held by the munger remain in its warning
file and do not enter the Editor queue.

Approval fills blanks, adds source observations and Citations, and keeps
existing catalog text and codes. WorldCovers stores the source wording and
each decision under the Reference Work, kind, and bundle code. Reimporting
the same bundle skips recorded items, including pending and rejected ones.
If a pending proposal goes stale, preview again with `--refresh-pending
--dry-run`, then use `--refresh-pending` to refresh pending Submissions for
review. A changed, already applied source item requires a separate editorial
decision. Import runs entirely in WorldCovers.
The same subcommands work with `python backend/manage.py fphc`.

### VPHC Commands

These commands consume prepared VPHC artifacts. They do not extract the source
workbook. Extraction and cross-examination run in bodger; see
[VPHC extraction](#vphc-extraction).
`import_apmc_bundle` currently delegates to ASCC; use the commands below for
VPHC.

Run from the repo root with the intended database in `mysql.cnf`. Replace
`/path/to/vphc` with the prepared artifact directory and `ACTOR_ID` with an
existing user's numeric ID. All three commands default to user ID 1 if
`--actor` is omitted; choose the account that should receive audit credit.
Expected exit code for each successful command is `0`.

Before a write run against edited data, follow [BACKUP.md](BACKUP.md) to
preserve the database and media together. A ledger log or `backup_auth` export
does not contain a full copy of user contributions and catalog edits.

#### `import_vphc_reference`

Load counties, post offices, postmasters, and appointment events before
applying marking actions. Existing offices can receive population and county
updates. The target needs the `USA-VA1` and `USA-WV1` regions.

Required files below `--vphc-dir`:

- `extract/t1_markings.csv`
- `extract/t3_postmasters.csv`
- `crossexam/post_offices_to_create.csv`

```sh
./woco import_vphc_reference --vphc-dir /path/to/vphc --actor ACTOR_ID --dry-run
./woco import_vphc_reference --vphc-dir /path/to/vphc --actor ACTOR_ID
```

The dry run executes the database work in one transaction and rolls it back
after reporting counts. Omitting `--dry-run` commits the reference load.

#### `apply_vphc_ledger`

Apply a reviewed action ledger after the reference load. The target needs a
`VPHC1` reference work and active collections for the states being processed.
The default inputs are `crossexam/ledger/proposed.jsonl`,
`crossexam/crosswalk.csv`, and scans under `extract/media/`.

```sh
./woco apply_vphc_ledger --vphc-dir /path/to/vphc --actor ACTOR_ID --dry-run
./woco apply_vphc_ledger --vphc-dir /path/to/vphc --actor ACTOR_ID
```

Create and update actions normally produce pending contributions for editor
review. The command can also attach scans and archive duplicate markings.
It is not safe to replay a committed ledger as a general refresh: create
actions can produce duplicate contributions. Check the applied log and current
records before another run.

Options:

- `--only create,update,images,archive`: run a comma-separated subset of the
  action groups. Omitting it runs all four.
- `--ledger`, `--crosswalk`, `--applied-log`: paths relative to `--vphc-dir`.
  The applied log defaults to `LEDGER.jsonl`. Use separate paths for a separate
  data pass so its records do not mix with an earlier run.
- `--auto-approve`: comma-separated verdict buckets to approve immediately.
  The default is empty. Set it only when those buckets are approved for direct
  publication.

`--dry-run` rolls back database changes, skips scan copies, and does not
append to the applied log. It can still write `crossexam/skipped.csv` with
listings that could not be emitted. Review skip counts and that file. A write
run copies media and appends applied actions to the log; those filesystem
operations are not part of the database transaction.

### `import_apmc_bundle`

Umbrella importer for the American Postal Markings Catalog. It delegates to
`import_ascc_bundle` in the current codebase.

```sh
./woco import_apmc_bundle tools/wip/out --dry-run
./woco import_apmc_bundle tools/wip/out --truncate
```

It accepts the same `--only`, `--allow-missing`, `--dry-run`, and `--truncate`
flags as `import_ascc_bundle`.

---

## Part 3: Move Data Between Hosts

Shell scripts under `tools/`. Read [RUNBOOK.md](RUNBOOK.md#data-refresh)
before running one against a server.

### `tools/push_data.sh`

Run from a local checkout:

```sh
WOCO_HOST=woco.dev ./tools/push_data.sh
WOCO_HOST=woco.dev ./tools/push_data.sh --dry-run
WOCO_HOST=woco.dev ./tools/push_data.sh --state VA
WOCO_HOST=woco.dev ./tools/push_data.sh --import --state VA
WOCO_HOST=woco.dev ./tools/push_data.sh --import --bundle-dir tools/wip/out/v1_va
```

Expected exit code: `0`.

Syncs local `tools/wip/` and `backend/media/` to the staging host. With
`--import`, it runs `/srv/woco/tools/refresh_data.sh` remotely as `wocod` for
the selected bundle. `--state VA` resolves to `tools/wip/out/v1_va`.

With `--state`, only that state's bundle and media directory are uploaded.
Set `WOCO_HOST=woco.dev` for staging; the default host is `hellowoco.app`.

### `tools/refresh_data.sh`

Run on the selected host as `wocod`:

```sh
sudo -u wocod /srv/woco/tools/refresh_data.sh tools/wip/out/v1_va
```

Calls the reviewed ASCC import. It resolves Post Offices and queues Entry
Submissions in the relevant Collections. Expected exit code: `0`.

<a id="toolsreload_datash"></a>

### `tools/reload_data.sh`

Run on the staging host as `wocod`:

```sh
sudo -u wocod /srv/woco/tools/reload_data.sh tools/wip/out/v1_va
```

Expected exit code: `0`.

Current sequence:

```sh
./woco ascc import tools/wip/out/v1_va --truncate
```

This reload does not call `wipe_user_data`. It does pass `--truncate`, which
deletes all 14 catalog import tables, including covers, before reloading the
bundle. Run `wipe_user_data` first when submission, version, and recycle-bin
history must also be cleared.

### `tools/rebuild_staging_db.sh`

Run from repo root, with `mysql.cnf` present:

```sh
WOCO_ADMIN_PASSWORD=<password> ./tools/rebuild_staging_db.sh
WOCO_ADMIN_PASSWORD=<password> ./tools/rebuild_staging_db.sh --no-import
```

Expected exit code: `0`.

Ensures the `worldcovers` database exists, runs migrations, creates the
Django admin user, and imports CSVs from `backend/imports/` (skipped with
`--no-import`). It does not drop the database. One-time prerequisite: run
`tools/setup_worldcovers_db.sql` as MariaDB root to create the database and
app user.

---

## Part 4: Repair And Report

### `repair_vphc_rate`

Repair VPHC RATEMARK contribution rates that came from a drawing number
instead of the inscription. This edits payloads in place; do not rerun the
ledger to perform this repair. Contributions without a `vphc` provenance key
are excluded. Already-approved payloads are skipped by default.

```sh
./woco repair_vphc_rate --actor ACTOR_ID --dry-run --report /tmp/vphc-rates.csv
./woco repair_vphc_rate --actor ACTOR_ID --expect COUNT --commit
```

Replace `COUNT` with the number of unapproved contribution rows reported by
the dry run. `--expect` aborts if that count has changed; it does not count live
catalog markings. Dry run is the default, and `--dry-run` overrides `--commit`.
`--report` writes a CSV even in a dry run. A report-file error prints a warning
but does not stop the repair.

`--audit-live` also examines VPHC-cited RATEMARKs in the catalog. With
`--commit`, it repairs those live rates too, so it is not a read-only option
when combined with that flag. `--sync-approved` also updates already-approved
contribution payloads; it requires `--audit-live` and a clean live-rate audit.
Live marking repairs and contribution repairs use separate transactions.

### `repair_ascc_child_inscriptions`

`repair_ascc_child_inscriptions` removes the Townmark text that the munger
prepended to Ratemark and Auxmark inscriptions. It matches Townmarks by
Post Office and non-empty Catalog Text, then removes one exact inscription
prefix plus its separating space. It skips missing or conflicting matches
and cases with no remaining child text, printing their IDs.

Running without switches commits changes. Previewing is optional:

```sh
./woco repair_ascc_child_inscriptions --dry-run
./woco repair_ascc_child_inscriptions
```

The command prints up to five before/after examples and totals. Writes use
one transaction and record system audit entries and new Marking versions.
Submissions and recycle-bin records are outside this repair.

Run it on `woco.dev` first, spot-check the corrected records, and repeat
the dry run to confirm the prefixes are gone. Then repeat on
`hellowoco.app`. Do not rerun it on a site where it has already run unless
a new finding calls for it (Trello T50).

### Color Repair

`repair_catalog_colors` applies an operator-reviewed Color correction map.
`tools/check_catalog_colors.py` verifies the before, dry-run, and after
states. The full procedure for staging and production is in
[COLOR-REPAIR.md](COLOR-REPAIR.md). Tool code is tracked; maps and run
output belong in `tools/wip/`.

### `report_duplicate_markings`

Report candidate duplicate Markings for human review (Trello T47). Read-only:
it never merges, archives, or deletes, and a match is evidence, not an
authorisation. Recycle-binned Markings are not scanned.

```sh
./woco report_duplicate_markings
./woco report_duplicate_markings --state VA --state WV --require-date-overlap
./woco report_duplicate_markings --state VA --out tools/wip/out/dupes_va.csv
```

The default output is `tools/wip/out/duplicate_markings_<YYYYMMDD>.csv`, one
row per group member. Expected exit code: `0`. The same groups are printed to
the console, so a CSV that cannot be written is a warning, not a failure.

Two tiers, in one report:

- `EXACT`: every attribute equal except `code`, `catalog_txt`, and the audit
  columns. This is the pipeline's own merge rule applied to database rows.
- `NEAR`: same primary state, same town key (case, spacing, and punctuation
  ignored, so the fragmented spellings of issue #129 meet), same type, same
  inscription key (same normalisation, so ornament characters such as `*` are
  ignored; the raw inscription is in the row), same shape, same colour family
  (word order ignored, GRAY and GREY equal), and width and height within
  0.5 mm where both are known. An unknown size never separates two rows.

Every EXACT twin is also a NEAR twin, so no Marking appears twice. A group is
`EXACT` only when all of its members are identical; `exact_match_ids` lists a
row's identical twins inside a `NEAR` group. Markings under different primary
states never group, so Martinsburg VA and Martinsburg WV stay apart, and one
Marking cross-listed under two Regions is not a duplicate.

`earliest_seen` and `latest_seen` are each row's cached date range.
`dates_overlap` is `yes` or `no` for the group's known ranges and `unknown`
with fewer than two dated members. `--require-date-overlap` drops the `no`
groups; the default keeps them, because a date typo is itself a finding.

Options:

- `--state TERM`: a state name or abbreviation, repeatable. Abbreviations
  resolve to the primary jurisdiction, never a county (issue #103).
- `--require-date-overlap`: keep only groups whose known dates overlap.
- `--min-group-size N`: smallest group to report (default `2`).
- `--out PATH`: the CSV path.

### `consolidate_superseded_contributions`

Delete superseded non-draft Contribution rows per contributor and target.

```sh
./woco consolidate_superseded_contributions --dry-run
./woco consolidate_superseded_contributions --no-input
```

Expected exit code: `0`. The dry run reports what would be deleted, then
rolls back.

---

## Part 5: Remove Data

Every command here deletes data. Take a backup first; see
[BACKUP.md](BACKUP.md).

### `ascc drop`

Delete imported catalog data using an exact `Region.code`.

```sh
./woco ascc drop USA-VA1 --dry-run
./woco ascc drop USA-VA1
```

If the Region has a Collection, removal follows its relationships and
includes pending and archived Contributions. Shared Covers and Post Offices
are retained. Without a Collection, the existing Post Office code-prefix
selection applies. Neither path removes image files or account data.

For source cleanup after a Collection transfer, pass both `--bundle` and
`--verification-report`; see the runbook. The report must be a passing
comparison from another instance, and the source must still match the
bundle. Another Collection's Contributions or crop dependencies can block
removal. A passing report is evidence from the operator, not a signature or
an automatic authorization to delete data.

Expected exit code: `0`. The region code is positional. The dry run reports
delete counts and rolls back. The legacy top-level command remains available
as `./woco drop_ascc_state`.

### `wipe_user_data`

Clear user-generated submissions, versions, and recycle bins while preserving
catalog tables, auth users, groups, collections, and collection assignments.

```sh
./woco wipe_user_data --dry-run
./woco wipe_user_data --no-input
```

Use this only when you intentionally need to clear submission, version, and
recycle-bin data before a separate destructive catalog refresh.

#### `tools/wipe_user_data.sh`

Shell wrapper around the `wipe_user_data` management command (below), with
an optional one-step catalog reload:

```sh
./tools/wipe_user_data.sh              # wipe (prompts for confirmation)
./tools/wipe_user_data.sh --dry-run    # report counts, change nothing
./tools/wipe_user_data.sh --reload tools/wip/out/v1_va
```

Expected exit code: `0`.

`--reload` wipes without prompting and then imports the given bundle, so
you end up with a fresh catalog-only system in one step.

### `purge_recycle_bin`

Permanently hard-delete catalog markings and covers that are currently hidden
by recycle-bin rows, after writing and verifying an archive of them (T51).
The command deletes the polymorphic image, date, and citation rows for those
subjects, and the ORM cascades to approved Contributions and their archive
sidecars, version snapshots, valuations, and cover links. Transactions and
crop Images that point at the deleted rows keep their rows and lose the link.
It does not remove image files from disk and does not prune django-reversion
history.

```sh
./woco purge_recycle_bin --dry-run
./woco purge_recycle_bin --dry-run --archive-dir tools/wip/out/purge-rehearsal
./woco purge_recycle_bin --no-input
./woco purge_recycle_bin --no-input --archive-dir tools/wip/out/purge-2026-10-22
```

Every real purge writes a new archive directory first, by default
`tools/wip/out/recycle-bin-purge-<UTC stamp>`, and refuses to delete anything
the archive does not cover. The archive holds `records.json` (a Django JSON
fixture of every deleted row, primary keys included), `relinked.json` (the
transactions and crop Images that survive the purge and only lose a link),
`media/` (the image files of the deleted Image rows), and `manifest.json`
(source instance, code revision, migrations, per-model counts, file
checksums, and the restore commands). Before the delete the command asks
Django's deletion collector whether its scope still matches the model's
cascade rules, re-reads the archive, and re-hashes every file; inside the
delete transaction it locks the recycle-bin rows, checks that the bin and
the scope are unchanged, and compares the rows actually deleted per model
with the manifest, rolling back on any difference. A damaged archive, a
changed bin, or a mismatch stops the purge with nothing deleted. After the
delete commits the command writes a `PURGED` marker into the archive; an
archive without one was a rehearsal or an aborted purge.

A binned Image row with no file on disk, or with a storage name the archive
cannot use, also stops the purge; `--allow-missing-media` records those
names in the manifest instead. A file whose bytes differ from its row's
checksum stops it too: run `verify_media_integrity --check-checksums` and
repair the row first. An interrupted run can leave a hidden `.purge-*`
directory beside the destination; it holds private data and can be deleted.

The dry run reports the scope (rows per model, files and bytes, files shared
with other Image rows) and rolls back. It hashes every binned image file to
report sizes, so it takes as long as the archive step. With `--archive-dir`
it also writes and verifies the archive as a rehearsal. Without it, nothing
is written.

Restore on the same instance only (the manifest names the instance, and
`loaddata` cannot check it), for example after a purge that should not have
happened:

```sh
./woco loaddata tools/wip/out/recycle-bin-purge-<stamp>/records.json
cp -rn tools/wip/out/recycle-bin-purge-<stamp>/media/. backend/media/
./woco loaddata tools/wip/out/recycle-bin-purge-<stamp>/relinked.json
```

Rows return with their original primary keys and are still in the recycle
bin. `loaddata` overwrites a row that has the same primary key, so load
`relinked.json` only when those transactions and crop Images have not
changed since the purge; otherwise restore their links by hand. This is an
operator recovery, separate from the editor recycle-bin restore, version
restore, and the S25/S26 application backup. The archive contains
Contribution review notes; it is created readable by its owner only, lives
under `tools/wip/out/`, which is not committed, and must be treated as
private. Expected exit code: `0`.

---

## Part 6: Back Up, Restore, And Check

### Collection Backup And Restore

Use a Collection ID, not a Region code. The command resolves the Collection's
Region internally. Apply migrations on the destination before restore.

```sh
./woco backup_collection <collection-id> tools/wip/out/collection-backup
./woco restore_collection tools/wip/in/collection-backup --dry-run
./woco restore_collection tools/wip/in/collection-backup
./woco verify_collection tools/wip/in/collection-backup --report tools/wip/out/collection-verification.json
```

The bundle directory must not exist. It contains `manifest.json`,
`records.json`, and `media/`. The manifest records the source instance,
Collection, Region, code revision, migrations, counts, and file checksums.
Keep the completed directory together when copying it between instances.

Scope includes recycled Entries, all Collection Contribution statuses,
archived Contributions, Cover links, Citations, dates, valuations, images,
crop sources, Post Office and Postmaster data, lookup records, transactions,
versions, and relevant django-reversion history. Files referenced by pending
submissions and history are included. A missing file fails the backup.
Storage paths must be relative ASCII paths without symlinks. Text values
are preserved through JSON escaping.

Users must already exist on the destination with matching usernames. The
bundle preserves credit and audit actors but copies no passwords, account
permissions, or Editor assignments. It contains private submissions, review
notes, and usernames; keep it private and transfer it over SSH.

Restore adds missing records and reuses identical records. Differences,
ambiguous identities, absent users, missing external Entries, and filename
conflicts stop the restore. There is no overwrite option. Shared Covers keep
all their links; Markings outside the Collection must already match on the
destination. Transfer mappings retain identities for uncoded Entries and
pending Contributions. Repeating the same restore creates no duplicates.

Foreign keys and known submission/history IDs are remapped. References to
records already deleted in the source's history are kept as explicit
`source_reference` objects, with source instance, model, and ID. They are
historical evidence, not pointers to live destination records. Required live
references must resolve. Original history remains in the retained bundle.

Dry-run rolls back database work and leaves live media unchanged. Image
files are staged and checked before publication. A failed restore rolls
back database changes and removes files it installed. An interrupted restore
can leave complete unreferenced files or temporary files; retry reuses
complete files by checksum. It never overwrites a differing live file.

Verification checks record values, relationships, history, and referenced
file bytes. Extra destination Entries or related records also fail the
comparison. Write its report outside the bundle. See the
[transfer procedure](RUNBOOK.md#collection-transfer-between-instances).

### `backup_marking` And `restore_marking`

Export one marking by `Marking.code` to a single JSON file, then restore the
same marking graph elsewhere. The JSON includes the marking, directly linked
covers, lookup rows, contribution rows, submission transactions, snapshot
versions, recycle-bin sidecars, dates, citations, and image metadata. It does
not copy image files; restored Image rows still point at
`MEDIA_ROOT/<storage_filename>`.

Run from repo root, with `backend/.env` and `mysql.cnf` present:

```sh
./woco backup_marking ASCC6-VA-M0001 backups/ASCC6-VA-M0001.json
./woco restore_marking backups/ASCC6-VA-M0001.json --dry-run
./woco restore_marking backups/ASCC6-VA-M0001.json
```

Matching auth users must already exist locally. `restore_marking` fails before
import when a contribution contributor username is missing. Expected exit
code: `0`.

### `backup_auth` And `restore_auth`

Export and restore users, groups, email addresses, collections, and collection
assignments. Both take a single path: a JSON file by default, or a directory
of per-table CSVs with `--emit-csv`.

```sh
./woco backup_auth /tmp/woco-auth.json
./woco restore_auth /tmp/woco-auth.json --dry-run
./woco restore_auth /tmp/woco-auth.json
./woco backup_auth /tmp/woco-auth/ --emit-csv
```

The exported data contains email addresses and password hashes. Store it as
a sensitive artifact. For the full host-to-host sync procedure, see
[RUNBOOK.md](RUNBOOK.md#auth-sync-between-hosts).

### `verify_media_integrity`

Check that every Image row resolves to a file under `MEDIA_ROOT`, optionally
with matching sha256, and report files with no Image row (orphan files) and
Image, Citation, or DateSeen rows whose Marking or Cover no longer exists
(orphan rows, T51). A row on a recycle-binned subject is not an orphan.

```sh
./woco verify_media_integrity
./woco verify_media_integrity --check-checksums --json tools/wip/out/media-integrity.json
./woco verify_media_integrity --fail-on-orphans
```

Missing or corrupt files fail the check. Orphan files and orphan rows are
reported and fail only with `--fail-on-orphans`. The JSON report lists orphan
rows per table with their subject and row IDs. The command deletes nothing;
what to do with orphans is a separate decision. `--media-root` checks a
restored snapshot instead of the live tree (see [BACKUP.md](BACKUP.md)).
Expected exit code: `0`.

### `prune_revisions`

Prune django-reversion storage while preserving the newest configured number
of Version rows per object. This command also purges legacy Version rows for
the custom audit/snapshot tables that are excluded from reversion tracking.

```sh
./woco prune_revisions --dry-run
./woco prune_revisions
```

The dry run reports what would be deleted and rolls back. Expected exit code:
`0`. Retention defaults live in `backend/woco/settings.py` as
`REVERSION_PRUNE_RETENTION_DAYS` and `REVERSION_PRUNE_KEEP_PER_OBJECT`.

---

## Part 7: Accounts

### `set_user_password`

Set a password without opening the Django shell. Password characters are
preserved and strength rules apply. This command does not activate an
account. An Administrator must make that separate decision in Django admin.

```sh
./woco set_user_password <username> <new_password>
```

Expected exit code: `0`.

---

## Files In `tools/` That Are Not Entry Points

Listed so nobody mistakes their absence above for missing documentation.

| Path | What it is |
|---|---|
| `ascc_cli.py` | Implements `./woco ascc`. Do not run it directly. |
| `bodger_tools.py` | Finds the bodger checkout and runs its scripts. Implements `./woco bodger`. |
| `ascc_pipeline/` | WorldCovers-side orchestration helpers for `./woco ascc` (checks, paths, run manifest). |
| `setup.sh`, `setup_worldcovers_db.sql` | Environment and database setup; see [BUILD.md](BUILD.md). |
| `pre_change_backup.sh` | Takes a tagged backup before a destructive change. Sourced by `reload_data.sh` and `wipe_user_data.sh`; not run directly. |
| `pull_backups.sh`, `rehearse_restore.sh` | Workstation side of server backups; see [BACKUP.md](BACKUP.md). |
| `run_ascc_pipeline.sh` | Legacy wrapper that delegates to `./woco ascc ocr`. |
| `fingerprint.sh` | Malware fingerprint scan. The first step of [verification](BUILD.md#verification). |
| `audit_image_subjects.py` | One-off report of images filed under the wrong subject by the v1 import. |
| `schema_diff.py`, `export_azure_sql_to_csv.py` | One-off v1 data-migration utilities. |
| `loadtest/` | Locust load-test scripts and saved results. |
| `apmc_data_explorer.ipynb` | Jupyter notebook with the v1 source-data analysis behind [v1/v1-legacy-summary.md](v1/v1-legacy-summary.md). |
| `tests/` | The tools test suite. Run with pytest; see [BUILD.md](BUILD.md#verification). |
| `wip/` | Local inputs, outputs, and caches. Ignored by Git. |
