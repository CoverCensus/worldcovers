-- Ensure admins can UPDATE submissions (approve/reject/revision).
-- The previous policy allowed any authenticated user; this makes admin update explicit.
DROP POLICY IF EXISTS "Authenticated users can update submissions for review" ON public.submissions;

CREATE POLICY "Admins can update submissions"
ON public.submissions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
