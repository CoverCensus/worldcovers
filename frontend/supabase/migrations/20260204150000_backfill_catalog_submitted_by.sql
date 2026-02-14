-- Backfill submitted_by on catalog_records for approved submissions that match
-- by name, state, town, date_range, type. Legacy records had null submitted_by.
UPDATE public.catalog_records cr
SET submitted_by = s.user_id
FROM public.submissions s
WHERE s.status = 'approved'
  AND cr.submitted_by IS NULL
  AND cr.name = s.name
  AND cr.state = s.state
  AND cr.town = s.town
  AND cr.date_range = s.date_range
  AND cr.type = s.type;
