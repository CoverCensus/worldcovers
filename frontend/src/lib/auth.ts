/**
 * Auth utilities using localStorage for session storage.
 * Replaces Supabase session for Django API login.
 */

const AUTH_STORAGE_KEY = "worldcovers_user";

export interface AssignedLocation {
  name: string;
  reference_code?: string;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_superuser?: boolean;
  // Backend-derived high-level role: "contributor" or "state_editor"
  role?: string;
  // For state_editor: locations assigned in admin (only present when role is state_editor)
  assigned_locations?: AssignedLocation[];
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    return parsed && typeof parsed.id === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent("auth-change", { detail: user }));
}

export function clearStoredUser(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("auth-change", { detail: null }));
}

/** Base URL for API (same as login). No trailing slash. */
function getApiBase(): string {
  const base = import.meta.env.VITE_API_URL || "";
  return base ? String(base).replace(/\/+$/, "") : "";
}

/**
 * Fetch current user from the server (session). Use to sync role and assigned_locations
 * so the UI shows State Editor with correct locations instead of defaulting to Contributor.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const url = getApiBase() ? `${getApiBase()}/api/me/` : "/api/me/";
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user?: AuthUser };
  const user = data?.user;
  if (!user || typeof user.id !== "number") return null;
  return user;
}
