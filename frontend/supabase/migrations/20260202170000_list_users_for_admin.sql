-- Allow admins to list all registered users (id, email, created_at) for the Users tab.
-- Uses auth.users; only callable by users with admin role.

CREATE OR REPLACE FUNCTION public.list_users_for_admin()
RETURNS TABLE (id uuid, email text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, u.email, u.created_at
  FROM auth.users u
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
  ORDER BY u.created_at DESC;
$$;
