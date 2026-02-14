/**
 * Django session auth: same credentials as /admin (username + password).
 * Login/logout and current user via Django REST API with cookie-based session.
 * Uses the same API base URL as the rest of the app (VITE_API_BASE_URL).
 */

import { getApiBaseUrl } from "@/lib/api";

/** Base URL for Django admin (origin only, no /api). Uses same host as API so one env var controls both. */
export function getAdminUrl(): string {
  const apiBase = getApiBaseUrl();
  const origin = apiBase.replace(/\/api\/?$/, "") || "http://127.0.0.1:8000";
  return origin.endsWith("/") ? `${origin}admin/` : `${origin}/admin/`;
}

export interface DjangoUser {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
}

const defaultOptions: RequestInit = {
  credentials: "include",
  headers: { "Content-Type": "application/json" },
};

/** API may return camelCase (isStaff) due to Django REST camel_case renderer; normalize to is_staff. */
function normalizeUser(raw: Record<string, unknown>): DjangoUser {
  return {
    id: Number(raw.id),
    username: String(raw.username ?? ""),
    email: String(raw.email ?? ""),
    is_staff: Boolean((raw as { is_staff?: boolean; isStaff?: boolean }).is_staff ?? (raw as { isStaff?: boolean }).isStaff ?? false),
  };
}

export async function login(username: string, password: string): Promise<{ user: DjangoUser }> {
  const res = await fetch(`${getApiBaseUrl()}/login/`, {
    ...defaultOptions,
    method: "POST",
    body: JSON.stringify({ username: username.trim(), password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message = (data as { detail?: string }).detail || "Invalid credentials.";
    throw new Error(message);
  }
  const data = (await res.json()) as { user?: Record<string, unknown> };
  const user = data.user && typeof data.user === "object" ? normalizeUser(data.user) : null;
  if (!user) throw new Error("Invalid login response.");
  return { user };
}

export async function logout(): Promise<void> {
  await fetch(`${getApiBaseUrl()}/logout/`, {
    ...defaultOptions,
    method: "POST",
  });
}

export async function getCurrentUser(): Promise<DjangoUser | null> {
  const res = await fetch(`${getApiBaseUrl()}/me/`, {
    ...defaultOptions,
    method: "GET",
  });
  if (res.status === 401) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { user?: Record<string, unknown> };
  const raw = data.user && typeof data.user === "object" ? data.user : null;
  return raw ? normalizeUser(raw) : null;
}
