-- Allow users to update their own submissions (for editing revision/rejected and resubmitting)
CREATE POLICY "Users can update their own submissions"
ON public.submissions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
