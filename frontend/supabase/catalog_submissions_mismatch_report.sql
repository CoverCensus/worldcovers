-- ============================================
-- CATALOG vs SUBMISSIONS MISMATCH REPORT
-- ============================================
-- Run in Supabase SQL Editor to see:
-- 1. Catalog records that have NO matching submission (e.g. legacy/seed data)
-- 2. Approved submissions that have NO catalog record (should be synced)
-- ============================================

-- 1) Catalog records with no matching submission (by name, state, town, date_range, type)
SELECT
  'Catalog records with no submission' AS report_section,
  cr.id AS catalog_id,
  cr.name,
  cr.state,
  cr.town,
  cr.date_range,
  cr.type,
  cr.submitted_by,
  cr.created_at
FROM public.catalog_records cr
WHERE NOT EXISTS (
  SELECT 1
  FROM public.submissions s
  WHERE s.name = cr.name
    AND s.state = cr.state
    AND s.town = cr.town
    AND s.date_range = cr.date_range
    AND s.type = cr.type
)
ORDER BY cr.created_at;

-- 2) Approved submissions with no catalog record (missing from catalog)
SELECT
  'Approved submissions not in catalog' AS report_section,
  s.id AS submission_id,
  s.name,
  s.state,
  s.town,
  s.date_range,
  s.type,
  s.status,
  s.created_at
FROM public.submissions s
WHERE s.status = 'approved'
  AND NOT EXISTS (
    SELECT 1
    FROM public.catalog_records cr
    WHERE cr.name = s.name
      AND cr.state = s.state
      AND cr.town = s.town
      AND cr.date_range = s.date_range
      AND cr.type = s.type
  )
ORDER BY s.created_at;

-- Optional: counts only
SELECT
  (SELECT COUNT(*) FROM public.catalog_records) AS total_catalog_records,
  (SELECT COUNT(*) FROM public.submissions) AS total_submissions,
  (SELECT COUNT(*) FROM public.catalog_records cr
   WHERE NOT EXISTS (
     SELECT 1 FROM public.submissions s
     WHERE s.name = cr.name AND s.state = cr.state AND s.town = cr.town
       AND s.date_range = cr.date_range AND s.type = cr.type
   )) AS catalog_with_no_submission,
  (SELECT COUNT(*) FROM public.submissions s
   WHERE s.status = 'approved'
     AND NOT EXISTS (
       SELECT 1 FROM public.catalog_records cr
       WHERE cr.name = s.name AND cr.state = s.state AND cr.town = s.town
         AND cr.date_range = s.date_range AND cr.type = s.type
     )) AS approved_not_in_catalog;
