-- Add valuation column to catalog_records table
ALTER TABLE public.catalog_records 
ADD COLUMN valuation text DEFAULT 'Common';

-- Add a comment to document the column
COMMENT ON COLUMN public.catalog_records.valuation IS 'Valuation category: Common, Scarce, Rare, or Very Rare';