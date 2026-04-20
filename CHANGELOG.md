# WorldCovers — Changelog

## Round 1 — v1 cleanup & infra hygiene (landed)

- Fixed `Ratemark.__str__` crash (`inscription_text` → `inscription_txt`).
- Pruned v1 junk fields across all models; conformed kept fields to docs/model.md; snake_cased `db_column` overrides.
- Retired `help-docs/`; `HelpDocsView` moved to v2 and serves from `docs/` with a `devel/` skip filter; deleted stale "Design and Implementation" doc.
- README pass (case fix, run-command cleanup, dropped `npm run dev` guidance).
- New docs: `docs/BUILD.md`, `docs/RUNBOOK.md`, `docs/scope.md`, `docs/TOOLS.md`.
- Consolidated tool docs into `docs/TOOLS.md`; removed empty `scripts/` folder; fixed stale `./scripts/deploy.sh` references.
- Cleaned v2 router stale comments; removed `postal-facilities` route.
- Purged `PostalFacility` / `PostalFacilityIdentity` (models, serializers, viewsets, admin, tables).
- Collapsed `PostmarkV2` → `Postmark` (wholesale replacement, no v1 data preservation).
- Removed `collectstatic` error suppression in `tools/deploy.sh`.
- Moved `_apply_contribution_to_catalog` onto the `Contribution` model; broke `admin.py`'s dependency on v1 views.
- Added `Pipfile` `[scripts]` entry `manage = "python backend/manage.py"`; swept docs to use `pipenv run manage <cmd>` exclusively.
- Committed `tools/worldcovers.service`; `tools/deploy.sh` now installs/restarts it; `docs/RUNBOOK.md` documents the service.
- Parked: `SubmitImageDialog` completion (stub with TODO comment).

## Round 2 — admin panel reorg (landed)

1. Moved `Colors` from the Postmarks admin section to Common (dropped proxy, registered `common.models.Color` directly).
2. Moved `FAQ Entries` from Common to Postmarks (new proxy in `postmarks/models.py`; reused `FAQEntryAdmin`).
3. Moved `Contributions` from Common to Postmarks (new proxy; reused `ContributionAdmin`). Contributions are a catalog-moderation concern, not domain.
4. Inlined `allauth.EmailAddress` on `CustomUserAdmin`; unregistered the standalone top-level "Email addresses" section.
5. Marked the three `Postcover` proxies as `(Deprecated)` via `verbose_name`: `Example Cover`, `Example Cover Marking`, `Example Image`.

## Round 3 — CI deploy fix (landed)

- Removed privileged `sudo` calls (`install`, `daemon-reload`, `systemctl restart`) from `tools/deploy.sh` — those were running as `wocod` inside the CI workflow, which has no passwordless sudo, breaking every deploy.
- Moved the systemd unit file sync (`diff` → `install` → `daemon-reload`) into the CI workflow under `jlogan`'s sudo context, before the `wocod` block.
- Pulled the `git fetch` + `git reset --hard` out of the `wocod` shell invocation and into the privileged section too (since the unit file diff needs the updated `tools/worldcovers.service` on disk first).
- `deploy.sh` is now unprivileged and self-contained: deps → migrate → build frontend → collectstatic. Service lifecycle (stop/start/unit sync) is the caller's responsibility.

## Round 4 — catalog search & display improvements (landed)

- **Search listing header**: changed from town/state/shape to `catalog_txt` (`buildCatalogSearchRow` in `frontend/src/lib/catalogRecordDisplay.ts`).
- **Detail page title**: same change — `RecordDetail.tsx` now builds `displayName` from `catalog_txt` first, falling back to town/state then postmark key.
- **Detail page tag badges**: removed the shape/irregular badges below the title (redundant with fields below); left a `TODO` comment reserving the slot for future record tags once backend tagging is implemented.
- **"Exclude manuscripts" filter fix**: `PostmarkListFilter.filter_is_manuscript` in `backend/common/filters.py` changed from `filter(is_manuscript=False)` to `exclude(is_manuscript=True)` so records with a `NULL` value (possible from pre-default-era imports) are correctly included in non-manuscript results. Frontend service (`postmarks.ts`) corrected to send `is_manuscript=false` instead of `is_manuscript=true`.
- **Default catalog sort**: catalog search now sorts by region name → town name → earliest observed date → postmark_id (stable tiebreaker). Implemented via `Min`/`Max` annotations on `_postmark_list_queryset()` in `backend/common/api/v2/views.py`; `ordering` updated on `PostmarkViewSet`.
- **Serializer date optimization**: both `PostmarkSerializer` and `PostmarkListSerializer` `get_earliest_use`/`get_latest_use` now read the queryset-level `earliest_date_observed`/`latest_date_observed` annotations instead of doing Python `min()`/`max()` over prefetched `dates_observed` rows.
- **DB index**: added composite index `(postmark, date)` on `DateObserved` (migration `0041`) to keep the `MIN` GROUP BY efficient at scale.

## Round 5 — data pipeline repairs (landed)

Symptom: `import_v2_data` against freshly-munged CSVs produced 6191 errors, and once the schema was fixed, state filtering returned zero hits.

### Munger (tools/apmc_data_munger.ipynb)
- **Canonicalized export format**. The notebook was emitting plural filenames (`postmarks.csv`, `colors.csv`) and its own column conventions (`catalog_text`, `amount`, `appraisal_position`, `postmark_id` as FK); the admin `ModelResource` classes expect singular filenames and model-attribute column names. Rewrote the final write cell as an `EXPORT_SPEC`-driven loop: per-table filename, rename map, and keep-cols list. Pipeline-only columns (`source_page`, `s8_warnings`, `parent_postmark_id`, `color_name`, `state_code`, etc.) stay in the in-memory dataframes for debugging but are stripped on write. Spec raises `KeyError` up-front if a column is missing, so drift gets caught at the munger instead of 6000 rows into the importer.
- **Float-encoded integer fix**. `INT_SUFFIXES` expanded to `('_id', '_pos', '_position')` and the int-coerce pass moved *before* the column rename so FK columns (`color_id` → `color`, `shape_id` → `shape`, …) are still `_id`-suffixed when matched. `framing_pos` and other small-int columns now write as `Int64`, not `2.0`.
- **MarkFraming dedup**. The DB unique key is `(parent_mark_type, parent_mark_id, framing)`. Primary construction loop (cell 96) now skips duplicate `framing_id` within a single postmark via a `seen_fids` set; safety `drop_duplicates` after the Step 9 concat (cell 113) catches anything the rate/aux emission might add. Eliminates the 4 duplicate-key errors on import.
- **Continuation-parser bracket tolerance**. `RELATIONSHIP_PATTERN` (cell 7) and `REL_INDICATOR_RE` (cell 47) now accept `(L)`, `[L]`, `{L}`, and mixed variants like `(L}` — the malformed brace is a recurring PDF-extraction typo that was causing `(L}` continuation rows to be classified as independent entries with no town.
- **UNKNOWN post office fallback** (cell 98). For any row that still has no `post_office_id` after normalization, assign one `UNKNOWN` PO per state and bucket unresolved postmarks there. Keeps them visible in state-scoped filters rather than orphaning them.

### Import command (backend/common/management/commands/import_v2_data.py)
- Added `--truncate` flag: deletes rows through the ORM in reverse `MODEL_FILES` order before the import pass (respects FK `on_delete`), ignored under `--dry-run`.
- Extended error reporting to also sample `result.rows[].errors` (per-row save errors) in addition to `base_errors` / `invalid_rows`, so dry-run output shows the actual FK/unique failures — not just a count.

### Backend filter (backend/common/filters.py)
- `PostmarkListFilter.filter_by_state_name` and `PostmarkFilter.filter_by_state` rewritten to match `Region.name` / `Region.abbrev` via `post_office__region__...` directly. They had been querying `AdministrativeUnitIdentity` and then joining `post_office__region__administrative_unit_id` — but `Region` has no FK to `AdministrativeUnit`, and `import_v2_data` never touches the AdministrativeUnit tables anyway, so the filter was guaranteed to return empty. Switching to Region uses the data path the pipeline actually populates.

## Round 6 — record detail color fix (landed)

- **Record detail color display**: `RecordDetail.tsx` now falls back to `colors_display` (the flat string `"MAGENTA"`) when the nested `color.name` lookup fails. The v2 detail endpoint (`PostmarkSerializer`) returns `color` as a raw FK integer while the list endpoint (`PostmarkListSerializer`) returns it as `{id, name}` — the detail page was only handling the nested shape, so color rendered blank on `/record/api-87` despite showing correctly on catalog search. Mirrors the fallback pattern already used in `postmarks.ts`'s `mapApiResultToRecord`.

## Round 8 — image upload improvements (landed)

- **Raised upload size limit to 100 MB**: `MAX_IMAGE_SIZE_MB` bumped from 10 → 100 in `Contribute.tsx` and `EditCatalogEntry.tsx`; backend validation (`api/v1/views.py`, `api/v2/views.py`) updated to match. Django's `DATA_UPLOAD_MAX_MEMORY_SIZE` was already set to 100 MB. Note: nginx `client_max_body_size` must also be set to `100M` in the server config or uploads will be rejected at the proxy layer.
- **Drag-and-drop support**: image drop zones in `Contribute.tsx` and `EditCatalogEntry.tsx` now handle `onDragOver` / `onDrop` events. Dropped files go through the same type and size validation pipeline as picker-selected files. The UI already advertised "drag and drop" but the handlers were missing.

## Round 7 — catalog OCR pre-processing utility (landed)

- **New `tools/split_catalog_pdf.py`**: renders a catalog PDF to per-page PNGs via `pdftoppm` (default 300 DPI) and splits each page at the horizontal midpoint into left/right halves, since the catalog's two-column layout smooshes two logical pages into one. Output lands in a sibling folder named after the PDF basename (overridable with `--out`). `--start-page N` offsets the filename numbering so PDF page 1 can be tagged with its actual catalog page number (e.g. `page-0419-L.png`).
- **`.gitignore`**: added `tools/wip/**/*.{pdf,png,jpg,jpeg}` so sample catalog PDFs and their rendered/split images stay local.

