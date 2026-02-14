import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns whether the current user is an admin (Django is_staff, same as /admin access).
 */
export function useIsAdmin() {
  const { user } = useAuth();
  return user?.is_staff ?? false;
}
