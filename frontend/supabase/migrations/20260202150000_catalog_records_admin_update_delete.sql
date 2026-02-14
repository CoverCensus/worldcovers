-- Allow admins to UPDATE and DELETE catalog_records (SELECT and INSERT already covered)

CREATE POLICY "Admins can update catalog records"
ON public.catalog_records
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete catalog records"
ON public.catalog_records
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update login_requests (e.g. set status)
CREATE POLICY "Admins can update login requests"
ON public.login_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
