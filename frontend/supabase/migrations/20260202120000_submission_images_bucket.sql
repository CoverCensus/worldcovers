-- Create public bucket for submission images (contributor uploads)
INSERT INTO storage.buckets (id, name, public)
VALUES ('submission-images', 'submission-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to submission-images
CREATE POLICY "Authenticated users can upload submission images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'submission-images');

-- Allow public read for submission-images (public bucket)
CREATE POLICY "Public read for submission images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'submission-images');
