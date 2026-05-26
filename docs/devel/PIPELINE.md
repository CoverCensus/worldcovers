# ASCC Catalog Pipeline

How to turn a scanned ASCC catalog PDF into the Django-shape CSV bundle
that `import_ascc_bundle` loads into the catalog tables.

The four `tools/ascc_*` utilities run in a fixed order, with a human
review gate between each. Output of one stage is reviewed and then fed to
the next.

```
  wip/in/<BASE>.pdf
        |  (1) ascc_page_processor.py        -> wip/out/<BASE>/  (chunk PNGs)
        |  [review chunks, move out -> in]
        v
  wip/in/<BASE>/page-*.png
        |  (3) ascc_page_extract.py          -> wip/out/<BASE>.csv
        |  [review/correct CSV]
        v
  wip/out/<BASE>.csv
        |  (5) ascc_image_extract.py  OPT    -> wip/out/<BASE>_images/
        |  [move reviewed CSV out -> in]
        v
  wip/in/<BASE>.csv (+ reference_works.csv, regions.csv)
        |  (7) ascc_data_munger.py           -> wip/out/*.csv  (11-file bundle)
        v
  wip/out/
        |  (8) manage.py import_ascc_bundle  -> catalog DB tables
        v
  database
```

## Conventions

- `<BASE>` is the PDF stem, e.g. `VA_ASCC_CTLG`. Its first two letters are
  the region abbrev the munger keys on (`VA` is matched against
  `regions.csv`).
- Run the four `ascc_*` tools from `cwd = tools/`. Their paths are
  relative (`./wip/...`), so they only resolve from there. Invoke with
  `uv run python <script> <BASE>`.
- The `wip/` working dir splits into `in/` (curated inputs) and `out/`
  (generated artifacts). The namespace deliberately flips between stages:
  a tool writes to `wip/out/...`, you review it, then you move it back to
  `wip/in/...` to feed the next tool. Those moves are the review gates.
- `wip/cache/` holds regenerable intermediates (rendered pages, vision
  responses). Safe to delete; pass `--force` to invalidate selectively.

## Steps

### 1. Render and chunk the PDF -- ascc_page_processor.py

Renders pages, splits two-column pages into halves, and slices each
column into per-listing chunk PNGs. Three stages: render, halves, chunks.

- in:  `wip/in/<BASE>.pdf`
- out: `wip/out/<BASE>/page-NNNN-MMMM.png` (chunk PNGs)
- cache: `wip/cache/<BASE>_full/`, `_halves/`, `_blocks.json`, `_review.json`

```
uv run python ascc_page_processor.py <BASE>
uv run python ascc_page_processor.py <BASE> --stages render,halves,chunks
uv run python ascc_page_processor.py <BASE> --pages 419-425
uv run python ascc_page_processor.py <BASE> --force halves,chunks
```

### 2. Review gate: chunks

Eyeball the chunk PNGs and fix any mis-slices, then move the directory
from `wip/out/<BASE>/` to `wip/in/<BASE>/`. The next two tools read chunks
from `wip/in/<BASE>/`.

### 3. Extract listing text -- ascc_page_extract.py

Sends each chunk to a Claude vision model and writes one CSV row per
detected entry.

- in:  `wip/in/<BASE>/page-*.png` + `wip/in/regions.csv`
- out: `wip/out/<BASE>.csv` (columns: Listing, Page, Images Above, Type)
- cache: `wip/cache/<BASE>_extract.json`

```
uv run python ascc_page_extract.py <BASE>
uv run python ascc_page_extract.py <BASE> --pages 419-420
uv run python ascc_page_extract.py <BASE> --force
uv run python ascc_page_extract.py <BASE> -v
```

### 4. Review gate: CSV

Proofread `wip/out/<BASE>.csv` against the catalog. The "Images Above"
counts drive step 5; the listing text drives step 7. Leave the corrected
file in `wip/out/<BASE>.csv` for now (step 5 reads it there).

### 5. Extract marking images -- ascc_image_extract.py (OPTIONAL)

Only when you want the marking illustrations pulled out as PNGs.
Deterministic and offline (no API calls). Uses the "Images Above" counts
from the reviewed CSV.

- in:  `wip/in/<BASE>/page-*.png` + `wip/out/<BASE>.csv`
- out: `wip/out/<BASE>_images/<state>-<page>-<chunk>-<n>.png`,
       `wip/out/<BASE>_subchunks/`,
       `wip/out/<BASE>_subchunks_report.csv` (per-chunk status)

```
uv run python ascc_image_extract.py <BASE>
uv run python ascc_image_extract.py <BASE> --pages 419-425
uv run python ascc_image_extract.py <BASE> -v
```

Check `<BASE>_subchunks_report.csv` for mismatches (a chunk whose
detected image count does not match the CSV).

### 6. Review gate: move CSV to in/

Move the reviewed CSV from `wip/out/<BASE>.csv` to `wip/in/<BASE>.csv`, so
it sits beside `wip/in/reference_works.csv` and `wip/in/regions.csv`. The
munger derives its input dir from the CSV path and reads both reference
files from there. `reference_works.csv` must contain exactly one row
(it supplies the reference-work id and code).

### 7. Build the import bundle -- ascc_data_munger.py

Parses the reviewed listings and emits the Django-shape CSV bundle.

- in:  `wip/in/<BASE>.csv` + `wip/in/reference_works.csv`
       + `wip/in/regions.csv` + marking images from step 5
- out: 11 CSVs to `wip/out/` (see "Bundle contents" below)

```
uv run python ascc_data_munger.py --input ./wip/in/<BASE>.csv --out-dir ./wip/out/
```

`--input` defaults to `./wip/in/VA_ASCC_CTLG.csv`. `--input-dir` overrides
where the reference CSVs are read from (defaults to the input CSV's dir).
On success the munger prints the exact load command to run next.

### 8. Load the bundle -- import_ascc_bundle

Django management command at
`backend/common/management/commands/import_ascc_bundle.py`. Loads every
CSV in the directory in dependency order via the import-export Resource
classes. Side effect: auto-creates a Collection for any Region that lacks
one.

Run from `backend/` (where `manage.py` lives):

```
python manage.py import_ascc_bundle ../tools/wip/out/ --dry-run
python manage.py import_ascc_bundle ../tools/wip/out/
```

Always do a `--dry-run` first (parses and validates every CSV, then rolls
back). Useful flags:

- `--dry-run`     validate only; commit nothing
- `--truncate`    wipe all 14 catalog tables first (incompatible with --only)
- `--only a,b`    load just these stems (order still forced)
- `--allow-missing`  skip stems whose CSV is absent

## Bundle contents

The munger writes 11 files to `wip/out/`. Load order (parents first):

```
colors            generated   leaf lookup
letterings        generated   leaf lookup
shapes            generated   leaf lookup
regions           passthrough  copied from wip/in/regions.csv
reference_works   passthrough  copied from wip/in/reference_works.csv
post_offices      generated
post_office_regions generated junction (post_office + region)
markings          generated   main table (shape, lettering, color, post_office)
dates_seen        generated   polymorphic (anchored to markings)
citations         generated   reference_work + marking
images            generated   marking tracings (from step 5)
```

The three legacy cover stems (`covers`, `cover_markings`,
`cover_valuations`) are optional and no longer emitted by the munger;
`import_ascc_bundle` loads cleanly without them. Covers are authored by
hand after the bundle is imported.
