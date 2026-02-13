# Catalog vs Submissions Mismatch Analysis

**Rule:** The catalog only shows entries that came from an **approved** submission. Every entry goes to submissions first; when approved it is synced to `catalog_records`. So the public catalog (Search) only lists records that have a matching approved submission.

Based on the exports:
- **catalog_records**: 18 rows (in DB)
- **submissions**: 16 rows

After migration `20260204120000_catalog_only_approved_submissions.sql`, the **catalog (Search) only shows** records that have a matching row in `submissions` with `status = 'approved'`. Legacy catalog rows with no submission are hidden from the public (admins can still see all for management).

## Why the counts differ

### 1. Catalog records with **no** submission (5 records)

These 5 catalog rows were created as **legacy/seed data** (Nov 2025). They were never submitted via the app and have no `submitted_by`:

| Name              | State    | Town      | Date Range | Type                |
|-------------------|----------|-----------|------------|---------------------|
| Norfolk, Va.      | Virginia | Norfolk   | 1823-1843  | Circular Date Stamp |
| Wilmington, Del. | Delaware | Wilmington| 1818-1838  | Straight Line       |
| Mobile, Ala.      | Alabama  | Mobile    | 1821-1841  | Circular Date Stamp |
| Newport, R.I.     | Rhode Island | Newport | 1817-1837 | Manuscript          |
| Louisville, Ky.   | Kentucky | Louisville| 1826-1846  | Circular Date Stamp |

So: **18 catalog − 5 legacy = 13** catalog records that correspond to submissions.

### 2. Submissions that correctly have **no** catalog record (3)

- **Atlanta Cotton Exchange** – status `revision` (not approved)
- **Chicago World Fair** – status `revision` (not approved)
- **Seattle Space Needle** – status `rejected`

Only **approved** submissions are synced to the catalog, so these 3 are expected to be missing from catalog.

### 3. Summary

- **12** submissions are **approved** → all 12 have a matching catalog record.
- **1** submission is **pending** (Boston, New York Manuscript) → it already has a catalog record (added manually or pre-approval).
- **5** catalog records are **legacy only** (no submission).
- **3** submissions are **revision/rejected** (no catalog record by design).

So the “mismatch” is: **5 catalog rows are legacy data with no submission**, and **16 submissions** (12 approved + 1 pending + 2 revision + 1 rejected) are correct; the 3 non-approved ones are not supposed to be in the catalog.

## What you can do

1. **Keep as-is**  
   Leave the 5 legacy catalog records; they stay in search and don’t need a submission.

2. **Find mismatches in the live DB**  
   Run `supabase/catalog_submissions_mismatch_report.sql` in the Supabase SQL Editor. It lists:
   - Catalog records with no matching submission (any status)
   - Approved submissions with no catalog record (should be 0 if sync is working)

3. **Backfill catalog from approved submissions**  
   Use `sync_approved_submissions.sql` to insert any approved submissions that are still missing from the catalog (and optionally update it to set `submitted_by` if your schema supports it).
