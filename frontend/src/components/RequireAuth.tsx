import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthState } from "@/hooks/useAuth";
import { syncCurrentUser } from "@/lib/auth";
import { isEditorUser } from "@/lib/editorRole";
import { Button } from "@/components/ui/button";

export function RequireAuth({ children, role }: {
  children: ReactNode;
  role?: "editor" | "administrator";
}) {
  const { user, status, error } = useAuthState();
  const location = useLocation();
  if (status === "checking") {
    return <p role="status">Checking your session...</p>;
  }
  if (status === "unavailable") {
    return <div role="alert">
      <p>{error || "Your session could not be checked."}</p>
      <Button onClick={() => void syncCurrentUser().catch(() => {})}>Retry</Button>
    </div>;
  }
  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }
  if ((role === "editor" && !isEditorUser(user)) ||
      (role === "administrator" && !user.is_superuser)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
