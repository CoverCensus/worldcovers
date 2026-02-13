# Daily Update — Saturday, 14 Feb 2025

## What we have done today

- **Supabase optional** — Frontend can run without Supabase: when `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are not set, a no-op stub is used so the app loads and data comes from the Django API. Changes are in `frontend/src/integrations/supabase/client.ts` (not yet committed).
- **Login redirect** — Auth redirect behaviour updated.
- **Admin** — Invalid image filenames skipped; list views optimised and count load reduced; postmarks admin section and longer postmark key; listing labels and site linkage adjusted; listings allowed without facility identity.
- **Imports** — ASCC import added as management command; imports hardened (lookups, `created_by`, missing facility data, AdministrativeUnit/AdministrativeUnitIdentity); listing-related admin labels updated.

---

## Where we are facing problems

- *[Add problem 1 — e.g. Supabase env not set in staging, or build failing]*  
- *[Add problem 2 — e.g. import failing for certain rows]*  
- *[Add problem 3 — e.g. Django server needs restart after changes]*  

*(Replace the lines above with the real issues you are hitting.)*
