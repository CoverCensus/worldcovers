-- Revert the catalog edit requests feature (run this in Supabase SQL Editor if you already ran those migrations).
-- This undoes: catalog_edit_requests table + submitted_by on catalog_records.

-- 1. Drop the catalog_edit_requests table (drops all its policies and indexes)
DROP TABLE IF EXISTS public.catalog_edit_requests;

-- 2. Remove submitted_by from catalog_records (column and index)
DROP INDEX IF EXISTS public.idx_catalog_records_submitted_by;
ALTER TABLE public.catalog_records
  DROP COLUMN IF EXISTS submitted_by;
