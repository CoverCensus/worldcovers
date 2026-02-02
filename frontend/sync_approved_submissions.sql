-- ============================================
-- SYNC EXISTING APPROVED SUBMISSIONS TO CATALOG
-- ============================================
-- 
-- This script syncs all approved submissions that don't already exist
-- in catalog_records. Run this in Supabase SQL Editor to backfill
-- any approved submissions that were approved before the sync was implemented.
-- ============================================

-- Insert approved submissions that don't already exist in catalog_records
INSERT INTO public.catalog_records (
  name,
  state,
  town,
  date_range,
  color,
  type,
  image_url,
  valuation
)
SELECT DISTINCT ON (s.name, s.state, s.town, s.date_range, s.type)
  s.name,
  s.state,
  s.town,
  s.date_range,
  s.color,
  s.type,
  s.image_url,
  'Common' as valuation
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
  );

-- Show how many records were synced
SELECT 
  COUNT(*) as synced_count,
  'Approved submissions synced to catalog_records' as message
FROM public.submissions
WHERE status = 'approved';
