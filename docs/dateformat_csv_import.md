# Date Format CSV import (admin)

The admin import at `/admin/postmarks/dateformat/import/` expects a CSV with **exact** headers and values that match the Django model and `DateFormatResource`.

## Required CSV headers

Your CSV **must** have these column names (no extras needed for import):

| Header            | Meaning                    | Example / notes                          |
|-------------------|----------------------------|------------------------------------------|
| `date_format_id`  | Primary key (import id)     | `1`, `2`, … (from legacy `nTownmarkDateFormatID`) |
| `format_name`     | Name of the format         | From legacy `txtTownmarkDateFormat`      |
| `format_description` | Optional description     | From legacy `memTownmarkDateFormat` (use empty or text) |
| `created_by`      | **User ID** (required)      | e.g. `1` (your admin user’s id)          |
| `modified_by`     | **User ID** (required)      | e.g. `1`                                 |

## Fixing the two errors you saw

### 1. “date_format_id not present in the file headers”

- The importer expects a column named **`date_format_id`**, not `nTownmarkDateFormatID`.
- **Change:** Rename the column `nTownmarkDateFormatID` → `date_format_id` (or add a column `date_format_id` with the same values).

### 2. “Column 'CreatedByUserID' cannot be null”

- The model has non-nullable `created_by` and `modified_by` (stored as `CreatedByUserID` / `ModifiedByUserID` in the DB).
- **Change:** Add two columns to the CSV:
  - **`created_by`** – integer = user id (e.g. `1` for your admin user).
  - **`modified_by`** – integer = user id (same, e.g. `1`).
- Use the same user id in every row (e.g. your admin account’s id from the Django `User` table).

## Column mapping from legacy export

| Legacy header           | Use in import as     |
|-------------------------|----------------------|
| `nTownmarkDateFormatID` | `date_format_id`     |
| `txtTownmarkDateFormat` | `format_name`        |
| `memTownmarkDateFormat` | `format_description` |
| (none)                  | `created_by` (add)   |
| (none)                  | `modified_by` (add)  |

You can drop or ignore: `nOrder`, `ynActive`, `ynDeleted`, `dtEntered`, `dtUpdated` for this import.

## Example header row

```text
date_format_id,format_name,format_description,created_by,modified_by
```

Example data row (user id = 1):

```text
1,n/a,,1,1
2,Month,,1,1
3,MDD,MDD,1,1
```

## Quick conversion script

From the project root you can generate an import-ready CSV from the legacy file:

```bash
python backend/common/management/commands/convert_dateformat_csv.py \
  "frontend/public/Old Data/tblTownmarkDateFormat.csv" \
  --output dateformat_import.csv \
  --user-id 1
```

Then upload `dateformat_import.csv` at  
https://hellowoco.app/admin/postmarks/dateformat/import/
