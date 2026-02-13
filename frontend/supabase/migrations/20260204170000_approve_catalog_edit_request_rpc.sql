-- RPC to approve a catalog edit request: updates catalog_records and the backing submission(s)
-- so the record stays visible (catalog visibility requires matching approved submission).
-- Runs as SECURITY DEFINER so it can perform updates regardless of RLS.

CREATE OR REPLACE FUNCTION public.approve_catalog_edit_request(
  p_request_id uuid,
  p_admin_uid uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_catalog record;
  v_updated int;
BEGIN
  -- Require admin
  IF NOT public.has_role(p_admin_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not admin');
  END IF;

  -- Get the pending edit request
  SELECT * INTO v_req
  FROM public.catalog_edit_requests
  WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found or not pending');
  END IF;

  -- Get current catalog record (BEFORE update - need old values to find submission)
  SELECT * INTO v_catalog
  FROM public.catalog_records
  WHERE id = v_req.catalog_record_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Catalog record not found');
  END IF;

  -- 1. Update the catalog record with the requested values
  UPDATE public.catalog_records
  SET
    name = v_req.name,
    state = v_req.state,
    town = v_req.town,
    date_range = v_req.date_range,
    type = v_req.type,
    color = v_req.color,
    image_url = v_req.image_url,
    valuation = COALESCE(v_req.valuation, valuation),
    description = v_req.description,
    citation_references = v_req.citation_references,
    dimensions = v_req.dimensions,
    manuscript = v_req.manuscript,
    rarity = v_req.rarity
  WHERE id = v_req.catalog_record_id;

  -- 2. Update the matching submission(s) so catalog record stays visible
  -- (catalog_record_has_approved_submission checks submission matches catalog)
  UPDATE public.submissions
  SET
    name = v_req.name,
    state = v_req.state,
    town = v_req.town,
    date_range = v_req.date_range,
    type = v_req.type,
    color = v_req.color,
    image_url = v_req.image_url,
    description = v_req.description,
    citation_references = v_req.citation_references,
    dimensions = v_req.dimensions,
    manuscript = v_req.manuscript,
    rarity = v_req.rarity
  WHERE name = v_catalog.name
    AND state = v_catalog.state
    AND town = v_catalog.town
    AND date_range = v_catalog.date_range
    AND type = v_catalog.type
    AND status = 'approved';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- 3. Mark the edit request as approved
  UPDATE public.catalog_edit_requests
  SET status = 'approved', reviewed_by = p_admin_uid, reviewed_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'submissions_updated', v_updated);
END;
$$;

COMMENT ON FUNCTION public.approve_catalog_edit_request IS 'Admin-only: approves an edit request, updates catalog_records and backing submission(s) atomically';
