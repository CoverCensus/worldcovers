-- Add INSERT policy for catalog_records
-- Allow authenticated users to insert catalog records (for approved submissions)

CREATE POLICY "Authenticated users can insert catalog records"
ON public.catalog_records
FOR INSERT
TO authenticated
WITH CHECK (true);
