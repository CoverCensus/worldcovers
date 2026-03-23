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

type CachedCurrentUser = { user: AuthUser | null; fetchedAtMs: number };

// Dedupes /api/me/ across the whole app (Navigation, Dashboard, etc.)
let currentUserInFlight: Promise<AuthUser | null> | null = null;
let currentUserCache: CachedCurrentUser | null = null;
const CURRENT_USER_CACHE_TTL_MS = 30_000;

/**
 * Fetch current user from the server (session). Use to sync role and assigned_locations
 * so the UI shows State Editor with correct locations instead of defaulting to Contributor.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const now = Date.now();
  if (currentUserCache && now - currentUserCache.fetchedAtMs < CURRENT_USER_CACHE_TTL_MS) {
    return currentUserCache.user;
  }

  if (currentUserInFlight) return currentUserInFlight;

  const url = getApiBase() ? `${getApiBase()}/me/` : (import.meta.env.VITE_API_BASE_URL || '/api/v1') + "/me/";
  currentUserInFlight = (async () => {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      const data = (await res.json()) as { user?: AuthUser };
      const user = data?.user;
      if (!user || typeof user.id !== "number") return null;
      return user;
    } finally {
      // Clear inflight no matter what.
      currentUserInFlight = null;
    }
  })();

  const user = await currentUserInFlight;
  currentUserCache = { user, fetchedAtMs: now };
  return user;
}
