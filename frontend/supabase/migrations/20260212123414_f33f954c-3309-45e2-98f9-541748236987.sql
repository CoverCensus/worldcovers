
-- Drop the existing restrictive SELECT policy on catalog_records
DROP POLICY IF EXISTS "Catalog records visible when submission is approved" ON public.catalog_records;

-- Create a new SELECT policy that shows:
-- 1. Records with approved submissions (existing behavior)
-- 2. Legacy imported records (submitted_by IS NULL)
CREATE POLICY "Catalog records visible to authenticated users"
ON public.catalog_records
FOR SELECT
USING (
  catalog_record_has_approved_submission(name, state, town, date_range, type)
  OR submitted_by IS NULL
);
