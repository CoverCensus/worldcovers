-- Catalog should only show records that came from an approved submission.
-- All entries go to submissions first; when approved they are synced to catalog_records.
-- Legacy/seed rows (no matching submission) are hidden from the public catalog.
-- Idempotent: safe to run more than once.

-- Remove old and new policies so we can recreate (handles re-run)
DROP POLICY IF EXISTS "Catalog records are viewable by everyone" ON public.catalog_records;
DROP POLICY IF EXISTS "Catalog records visible when submission is approved" ON public.catalog_records;
DROP POLICY IF EXISTS "Admins can view all catalog records" ON public.catalog_records;

-- Only show catalog rows that have a matching approved submission (same name, state, town, date_range, type)
CREATE POLICY "Catalog records visible when submission is approved"
ON public.catalog_records
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.submissions s
    WHERE s.name = catalog_records.name
      AND s.state = catalog_records.state
      AND s.town = catalog_records.town
      AND s.date_range = catalog_records.date_range
      AND s.type = catalog_records.type
      AND s.status = 'approved'
  )
);

-- Admins can still see all catalog records (including legacy) for management
CREATE POLICY "Admins can view all catalog records"
ON public.catalog_records
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
