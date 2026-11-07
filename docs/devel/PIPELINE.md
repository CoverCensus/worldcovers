# ASCC Catalog Pipeline

The WorldCovers `./woco ascc` wrapper runs optional extraction tools from
[bodger](https://github.com/CoverCensus/bodger). WorldCovers retains the
wrapper, database import commands, and host operations. Bodger retains the
munger, OCR, legacy conversion, FPHC, and VPHC extraction implementations
and their tests.

Base WoCo setup, catalog work, Entry submission and review, and imports of
prepared bundles do not require bodger, private GitHub access, or OCR keys.
This integration has no subscription check. Service terms and licensing
changes are separate decisions; the existing licenses remain in force.

## Optional Bodger Setup

An operator with access to the private repository can install it separately:

```sh
git clone git@github.com:CoverCensus/bodger.git ../bodger
git -C ../bodger checkout 625575d2733f00f9a442249fbf1704beafd67948
uv sync --project ../bodger --locked
mkdir -p ../bodger/tools/wip/in ../bodger/tools/wip/cache ../bodger/tools/wip/out
```

That revision is the published extraction baseline for this integration.
There is no submodule or private package dependency in WoCo's lockfile.
The commands do not clone, install, or update bodger automatically.

The default checkout is the directory `bodger` beside WorldCovers. For
another location, set `BODGER_ROOT` to its absolute path in the shell or
WorldCovers' root `.env`. An empty value uses the default. Extraction uses
`<BODGER_ROOT>/.venv/bin/python`, not WoCo's Django environment. This also
lets the VPHC comparison tools enforce their no-database-driver rule.

Keep private inputs in bodger's `tools/wip/in/`. Intermediate files and
run manifests use bodger's `tools/wip/cache/`. The ASCC wrapper writes final
bundles to WorldCovers' `tools/wip/out/` and served images to WorldCovers'
`backend/media/`, so the existing push/import commands keep their paths.
For OCR metadata, images are also copied to bodger's ignored
`tools/wip/out/media/<state>/`. Direct stage commands use bodger's own
output defaults unless overridden.

Existing WorldCovers inputs are not moved automatically. Copy the selected
source files into bodger's `tools/wip/in/` before running extraction. Both
repositories ignore their `tools/wip/` directories. Keep source catalogs,
private data, generated output, and API credentials out of Git.

## Command Summary

Run these commands from the WorldCovers root:

```sh
./woco ascc doctor VA
./woco ascc munge VA
./woco ascc run VA --dry-run
./woco ascc run VA
./woco ascc ocr VA --pdf ~/Downloads/va-catalog.pdf
./woco ascc clean VA
```

These commands require bodger. Missing tools or a missing environment produce
a setup error. `./woco ascc --help` works without bodger.

These import and catalog maintenance commands do not require bodger:

```sh
./woco ascc import tools/wip/out/v1_va --dry-run
./woco ascc drop USA-VA1 --dry-run
```

The prepared bundle can come from any compatible source. Import does not
run extraction or require an OCR account.

## Codebase Overview

`woco_cli.py` dispatches `./woco ascc` to `tools/ascc_cli.py`. The wrapper
uses `tools/bodger_tools.py` to locate bodger and its interpreter only for
extraction. `tools/ascc_pipeline/` retains WorldCovers orchestration helpers.
Database checks and imports use WoCo's interpreter and `backend/manage.py`.

The direct extraction wrapper is:

```sh
./woco bodger --help
./woco bodger fphc_extract --help
./woco bodger vphc_extract --help
./woco bodger vphc_crossexam --help
./woco bodger vphc_manuscript_ledger --help
```

It forwards arguments and exit status to the selected bodger script.
New catalog scripts added under bodger's `tools/` can use this wrapper
without a matching change to WorldCovers. Use a lowercase script name
without `.py` or a path.
Relative path arguments are relative to the caller's working directory;
script defaults remain relative to bodger. It does not load Django.

## Canonical v1 Flow

Put the legacy `tblStates.csv`, `tblRawStateData.csv`, and
`tblTownmarkImages.csv` exports and the `regions.csv` and
`reference_works.csv` seeds in bodger's `tools/wip/in/`. The selected
Reference Work must exist in the seed table. The default is `ASCC6`.

`doctor` checks inputs. `munge` builds a fresh bundle without importing it.
`run` builds the same bundle and imports it through WorldCovers. Pass
`--dry-run` to roll back the database import; generated files are still
written. Missing legacy images produce warnings by default. Pass
`--strict-v1-images` to fail on them. `--v1-image-root` selects their directory.

For VA, the final bundle is `tools/wip/out/v1_va/` in WorldCovers. Review
`source_marking_map.csv` and `v1_pipeline_warnings.csv` before importing.
The first maps generated Markings back to source listings. Source rows,
image references, and `run.json` remain under bodger's
`tools/wip/cache/v1/VA/`.

## Scanned PDF OCR Flow

This path is separate from the legacy-export path. It requires Poppler's
`pdftoppm`, the source PDF, and the seed/export files named in bodger's
[stage runbook](https://github.com/CoverCensus/bodger/blob/625575d2733f00f9a442249fbf1704beafd67948/docs/devel/TOOLS.md).

Set `OPENROUTER_API_KEY`, or set `ANTHROPIC_API_KEY` and pass
`--provider anthropic`. Shell variables take precedence over `.env` values.
The wrapper loads WorldCovers' root `.env`, then bodger's root `.env`
without replacing values already set. Vision stages send page images to
the selected provider.

```sh
./woco ascc ocr VA --pdf ~/Downloads/va-catalog.pdf --import-check never
```

OCR writes source/cache files under bodger and the final bundle under
WorldCovers' `tools/wip/out/va/`. Existing verified catalog rows skip OCR;
existing raw OCR rows skip page processing and text extraction. `--force`
rebuilds those stages. Other options include `--pages`, `--model`, and
`--import-check auto|always|never`. Import checks validate through
WorldCovers with a database rollback; they do not publish the bundle.

## Import Notes

The ASCC importer loads bundle CSVs in dependency order. The optional
`covers`, `cover_valuations`, and `cover_markings` tables can be absent.

```sh
./woco ascc import tools/wip/out/v1_va --dry-run
./woco ascc import tools/wip/out/v1_va --only markings,images
./woco ascc import tools/wip/out/v1_va --allow-missing
```

Existing natural-key rows are skipped. `--dry-run` rolls back database
changes. `--truncate` deletes catalog import tables before loading and
requires a target that should be replaced. See [TOOLS.md](TOOLS.md).

## Cleaning Generated Files

`./woco ascc clean VA` removes that state's ASCC cache files in bodger and
its final bundles in WorldCovers. Without a state, `clean` clears bodger's
cache and WorldCovers' output directory. Source input directories are
preserved. Review the generated files before cleaning them.

## Verification

Run the WorldCovers integration and operator tests with:

```sh
PYTHONPATH=.:tools .venv/bin/python -m pytest tools/tests -q
```

Run extraction tests separately in bodger:

```sh
uv run --project ../bodger --locked pytest ../bodger/tools/tests -q
```

After an authorized import, check selected source examples in the target
site. Verify Marking fields, dates, Citations, images, and expected counts.
Passing local tests does not establish source completeness or Editor
acceptance. No catalog data is imported by the test commands above.
