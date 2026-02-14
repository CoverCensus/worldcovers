-- Submissions: only admins can see all rows (Catalog / All Submissions tabs).
-- Regular users keep "Users can view their own submissions" only.

DROP POLICY IF EXISTS "Authenticated users can view all submissions for review" ON public.submissions;

CREATE POLICY "Admins can view all submissions"
ON public.submissions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
