# Importing legacy CSV data into the database

The data model is described in [data_model-v1.erd](data_model-v1.erd). Your CSVs in `frontend/public/Old Data/` map to it as follows.

## Option 1: Import all 13 ERD CSVs in one go (recommended)

From the **project root** or `backend/`:

```bash
cd backend
python manage.py import_all_legacy_csv --dir "../frontend/public/Old Data"
```

This runs, in order:

1. **Reference tables:** tblStates, tblTownmarkLettering, tblTownmarkFraming, tblTownmarkDateFormat → catalog tables (AdministrativeUnit, LetteringStyle, FramingStyle, DateFormat).
2. **Legacy tables:** tblAbbreviations, tblTownmarkRateLocation, tblTownmarkRateValue, tblParseSteps, ctUserStates, tblRawStateData_pendingUpdate, tblCovers → `Legacy*` models.
3. **Raw data + images:** `import_ascc` reads tblStates, tblRawStateData, tblTownmarkImages → Postmark, PostmarkImage, etc.

Options:

- `--dir "/path/to/csvs"` — directory with the 13 CSV files (default: `frontend/public/Old Data`).
- `--user admin` — username for created_by (default: first superuser).
- `--skip-ascc` — only run the 11 CSV importers; do not run import_ascc (raw state data + images).

After a successful run, apply migrations if you have not yet: `python manage.py migrate`.

---

## Option 2: Management commands (step-by-step)

Run from the **project root** (`worldcovers/`) so the default path `frontend/public/Old Data` resolves correctly, or pass `--dir` with an absolute or relative path.

### Step 2a: Reference tables (states, lettering, framing, date formats)

Imports into: `AdministrativeUnit` / `AdministrativeUnitIdentity`, `LetteringStyle`, `FramingStyle`, `DateFormat`.

```bash
cd backend
python manage.py import_reference_csv
```

Optional:

- `--dir "/path/to/csvs"` — directory containing the CSVs (default: `frontend/public/Old Data`)
- `--user admin` — username for `created_by` / `modified_by` (default: first superuser)
- `--only states --only lettering` — run only those import types

**CSV → import type mapping:**

| ERD table              | CSV file                   | Import type   |
|------------------------|----------------------------|---------------|
| TBLSTATES              | tblStates.csv              | states        |
| TBLTOWNMARKLETTERING   | tblTownmarkLettering.csv   | lettering     |
| TBLTOWNMARKFRAMING     | tblTownmarkFraming.csv     | framing       |
| TBLTOWNMARKDATEFORMAT  | tblTownmarkDateFormat.csv | date_format   |

You can also import the other 7 legacy CSVs via Admin CSV Upload (see Option 3) using `import_type`: `abbreviations`, `rate_location`, `rate_value`, `parse_steps`, `user_states`, `pending_updates`, `legacy_covers`.

### Step 2b: Raw state data and images (postmarks)

Imports into: `Postmark`, `PostmarkColor`, `PostmarkDatesSeen`, `PostmarkSize`, `PostmarkImage` (and creates lookup rows for shapes/lettering/framing/date format/color as needed).

```bash
cd backend
python manage.py import_ascc --dir "../frontend/public/Old Data" --user your_admin_username
```

If you run from project root:

```bash
cd backend
python manage.py import_ascc --dir "frontend/public/Old Data"
```

- `--dir` — directory containing `tblStates.csv`, `tblRawStateData.csv`, `tblTownmarkImages.csv` (default: `frontend/public/Old Data`)
- `--user` — username for `created_by` (default: first superuser, or user id 2)

**Order:** Run `import_reference_csv` first so lettering/framing/date format (and states) exist; then run `import_ascc` for raw data and images.

---

## Option 3: Django Admin (upload then import)

1. Log in as a **staff** user.
2. Open **Admin CSV Uploads** and add a new upload: choose the CSV file (e.g. `tblStates.csv`), save.
3. Select that upload, then use the action dropdown:
   - **Import selected into States (Admin Units)** for states
   - **Import selected into Lettering Styles** for lettering
   - **Import selected into Framing Styles** for framing
   - **Import selected into Date Formats** for date formats
   - **Import selected into Colors** for a colors CSV (if you have one)

Repeat for each reference CSV. For the 7 legacy types (abbreviations, rate_location, rate_value, parse_steps, user_states, pending_updates, legacy_covers), use the API (Option 4) with the corresponding `import_type`; admin actions can be extended to include these. This does **not** import raw state data or images; use `import_ascc` for that.

---

## Option 4: API (SPA / scripts)

1. **POST** the CSV file to the admin CSV uploads endpoint (multipart form, key `file`).
2. **POST** to that upload’s `import-to-catalog` action with JSON body:  
   `{ "import_type": "states" | "lettering" | "framing" | "date_format" | "colors" | "abbreviations" | "rate_location" | "rate_value" | "parse_steps" | "user_states" | "pending_updates" | "legacy_covers" }`.

Requires an authenticated **staff** user.

---

## All 13 ERD CSVs → database mapping

| ERD table                       | CSV file                         | Destination / import_type   |
|---------------------------------|-----------------------------------|-----------------------------|
| TBLSTATES                       | tblStates.csv                     | states → AdministrativeUnit, Identity |
| TBLABBREVIATIONS                | tblAbbreviations.csv              | abbreviations → LegacyAbbreviation |
| TBLTOWNMARKLETTERING            | tblTownmarkLettering.csv          | lettering → LetteringStyle  |
| TBLTOWNMARKFRAMING              | tblTownmarkFraming.csv            | framing → FramingStyle      |
| TBLTOWNMARKDATEFORMAT           | tblTownmarkDateFormat.csv         | date_format → DateFormat    |
| TBLTOWNMARKRATELOCATION         | tblTownmarkRateLocation.csv       | rate_location → LegacyRateLocation |
| TBLTOWNMARKRATEVALUE            | tblTownmarkRateValue.csv          | rate_value → LegacyRateValue |
| TBLRAWSTATEDATA                 | tblRawStateData.csv               | import_ascc → Postmark, etc. |
| TBLRAWSTATEDATA_PENDINGUPDATE   | tblRawStateData_pendingUpdate.csv  | pending_updates → LegacyRawStateDataPendingUpdate |
| TBLTOWNMARKIMAGES               | tblTownmarkImages.csv             | import_ascc → PostmarkImage |
| TBLPARSESTEPS                   | tblParseSteps.csv                 | parse_steps → LegacyParseStep |
| CTUSERSTATES                    | ctUserStates.csv                  | user_states → LegacyUserState |
| TBLCOVERS                       | tblCovers.csv                     | legacy_covers → LegacyCover |
