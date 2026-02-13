-- Catalog edit requests: non-admins submit proposed changes; admins approve or reject
CREATE TABLE public.catalog_edit_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  catalog_record_id uuid NOT NULL REFERENCES public.catalog_records(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  name text NOT NULL,
  state text NOT NULL,
  town text NOT NULL,
  date_range text NOT NULL,
  type text NOT NULL,
  color text NOT NULL,
  image_url text,
  valuation text,
  description text,
  citation_references text,
  dimensions text,
  manuscript text,
  rarity text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamp with time zone
);

CREATE INDEX idx_catalog_edit_requests_catalog_record ON public.catalog_edit_requests(catalog_record_id);
CREATE INDEX idx_catalog_edit_requests_requested_by ON public.catalog_edit_requests(requested_by);
CREATE INDEX idx_catalog_edit_requests_status ON public.catalog_edit_requests(status);

ALTER TABLE public.catalog_edit_requests ENABLE ROW LEVEL SECURITY;

-- Users can create edit requests for their own requested_by
CREATE POLICY "Users can insert own edit requests"
ON public.catalog_edit_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = requested_by);

-- Users can view their own edit requests
CREATE POLICY "Users can view own edit requests"
ON public.catalog_edit_requests
FOR SELECT
TO authenticated
USING (auth.uid() = requested_by);

-- Admins can view all edit requests
CREATE POLICY "Admins can view all edit requests"
ON public.catalog_edit_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update edit requests (approve/reject)
CREATE POLICY "Admins can update edit requests"
ON public.catalog_edit_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
