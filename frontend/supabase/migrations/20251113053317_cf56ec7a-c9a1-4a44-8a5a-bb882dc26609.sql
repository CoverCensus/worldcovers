-- Drop trigger first, then recreate function with proper search_path
DROP TRIGGER IF EXISTS update_catalog_records_updated_at ON public.catalog_records;
DROP FUNCTION IF EXISTS public.update_catalog_records_updated_at() CASCADE;

-- Recreate function with SECURITY DEFINER and proper search_path
CREATE OR REPLACE FUNCTION public.update_catalog_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

-- Recreate trigger
CREATE TRIGGER update_catalog_records_updated_at
BEFORE UPDATE ON public.catalog_records
FOR EACH ROW
EXECUTE FUNCTION public.update_catalog_records_updated_at();