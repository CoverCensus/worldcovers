-- Fix: anonymous users see 0 catalog results because they cannot read submissions.
-- Use a SECURITY DEFINER function so the "approved submission" check runs with
-- enough privileges to read submissions; anon still never reads submissions directly.

CREATE OR REPLACE FUNCTION public.catalog_record_has_approved_submission(
  p_name text,
  p_state text,
  p_town text,
  p_date_range text,
  p_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.submissions s
    WHERE s.name = p_name
      AND s.state = p_state
      AND s.town = p_town
      AND s.date_range = p_date_range
      AND s.type = p_type
      AND s.status = 'approved'
  );
$$;

COMMENT ON FUNCTION public.catalog_record_has_approved_submission IS 'Used by catalog_records RLS so anon can see rows that have an approved submission without granting anon read on submissions.';

-- Update catalog RLS to use the function instead of inline EXISTS (so anon works)
DROP POLICY IF EXISTS "Catalog records visible when submission is approved" ON public.catalog_records;

CREATE POLICY "Catalog records visible when submission is approved"
ON public.catalog_records
FOR SELECT
USING (
  public.catalog_record_has_approved_submission(name, state, town, date_range, type)
);
