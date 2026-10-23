/**
 * The same editor test every gate in the SPA uses (Navigation, Dashboard,
 * RecordDetail, RequireEditor). The backend enforces the real permission; this
 * only decides whether to show editor controls.
 */
import type { AuthUser } from "@/lib/auth";

export function isEditorUser(user: AuthUser | null): boolean {
  return Boolean(
    user && (user.role === "editor" || user.role === "administrator" || user.is_superuser),
  );
}
