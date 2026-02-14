-- 1) Admins see the same catalog as everyone else (only approved-backed rows).
--    Remove the policy that let admins see all 18 rows including legacy.
DROP POLICY IF EXISTS "Admins can view all catalog records" ON public.catalog_records;

-- 2) Remove legacy catalog rows that have no submission (restore consistency).
--    catalog_records should only contain rows that came from a submission;
--    after this, catalog count will be <= submission count.
DELETE FROM public.catalog_records cr
WHERE NOT EXISTS (
  SELECT 1
  FROM public.submissions s
  WHERE s.name = cr.name
    AND s.state = cr.state
    AND s.town = cr.town
    AND s.date_range = cr.date_range
    AND s.type = cr.type
);
