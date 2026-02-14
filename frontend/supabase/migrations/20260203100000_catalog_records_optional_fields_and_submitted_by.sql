-- Add optional fields and submitted_by to catalog_records (align with submissions and support "My Catalogs")
ALTER TABLE public.catalog_records
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS citation_references text,
  ADD COLUMN IF NOT EXISTS dimensions text,
  ADD COLUMN IF NOT EXISTS manuscript text,
  ADD COLUMN IF NOT EXISTS rarity text,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_records_submitted_by ON public.catalog_records(submitted_by);

COMMENT ON COLUMN public.catalog_records.submitted_by IS 'User whose approved submission created this record; null for legacy or admin-created records';
