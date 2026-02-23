/**
 * Auth utilities using localStorage for session storage.
 * Replaces Supabase session for Django API login.
 */

const AUTH_STORAGE_KEY = "worldcovers_user";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
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
