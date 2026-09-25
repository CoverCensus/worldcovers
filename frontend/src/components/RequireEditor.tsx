import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/** The same editor test every gate in the SPA uses (Navigation, Dashboard, RecordDetail). */
function isEditorUser(user: ReturnType<typeof useAuth>): boolean {
  return Boolean(
    user && (user.role === "editor" || user.role === "administrator" || user.is_superuser),
  );
}

/**
 * Protect routes that are for editors and administrators (issues.md 177).
 * Guests go to login, contributors to their dashboard -- the same shape as
 * RequireSuperuser in App.tsx. The backend enforces the real permission
 * (IsEditor); this only keeps non-editors from seeing an empty, erroring page.
 */
export function RequireEditor({ children }: { children: ReactNode }) {
  const user = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }
  if (!isEditorUser(user)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
