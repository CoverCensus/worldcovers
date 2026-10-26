/**
 * Django owns the session; localStorage caches the displayed user only.
 */
import apiClient, { accountError, ensureCsrfToken } from "./api";

const AUTH_STORAGE_KEY = "worldcovers_user";

export interface AssignedCollectionRegion {
  id: number;
  name: string;
  abbrev?: string;
}

export interface AssignedCollection {
  id: number;
  name: string;
  region: AssignedCollectionRegion;
}

export type UserRole = "guest" | "contributor" | "editor" | "administrator";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_superuser?: boolean;
  // Backend-derived role string. Administrator === is_superuser (single person, by design).
  role?: UserRole | string;
  // For editors: the Collections they curate. Empty for non-editors.
  assigned_collections?: AssignedCollection[];
}

/**
 * Normalize the auth payload coming from the backend before we hand it to the
 * rest of the SPA. The Django auth view returns role="state_editor" for users
 * in the Editors group, but every UI gate in the SPA (RecordDetail.tsx,
 * Navigation.tsx, Dashboard.tsx, ContributionDetail.tsx, ...) checks
 * `role === "editor"`. We do the rename in one place here so individual
 * components don't need to know about the legacy string.
 */
function normalizeAuthUser<T extends AuthUser | null | undefined>(user: T): T {
  if (!user || typeof user !== "object") return user;
  const role = (user as AuthUser).role;
  if (role === "state_editor") {
    return { ...(user as AuthUser), role: "editor" } as T;
  }
  return user;
}

export type AuthStatus = "checking" | "authenticated" | "guest" | "unavailable";
export interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
}

function readStorage(): AuthUser | null {
  try {
    const user = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null") as AuthUser | null;
    return user && typeof user.id === "number" ? normalizeAuthUser(user) : null;
  } catch {
    return null;
  }
}

let state: AuthState = { user: readStorage(), status: "checking", error: null };
let authStateVersion = 0;
let currentUserInFlight: Promise<AuthUser | null> | null = null;
let currentUserCache: { user: AuthUser | null; fetchedAt: number } | null = null;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

export const getAuthState = (): AuthState => state;
export const getStoredUser = (): AuthUser | null => state.user;

function publish(next: AuthState): void {
  state = next;
  listeners.forEach(listener => listener());
}

export function beginAuthChange(): number {
  currentUserInFlight = null;
  currentUserCache = null;
  return ++authStateVersion;
}

export const isCurrentAuthChange = (version: number): boolean => version === authStateVersion;

function storeUser(user: AuthUser | null): void {
  beginAuthChange();
  currentUserCache = { user, fetchedAt: Date.now() };
  // Browser storage is a convenience. It must not decide whether login worked.
  try {
    if (user) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch { /* Keep the in-memory state when storage is unavailable. */ }
  publish({ user, status: user ? "authenticated" : "guest", error: null });
  window.dispatchEvent(new CustomEvent("auth-change", { detail: user }));
  try { channel?.postMessage("changed"); } catch { /* Recheck on tab return. */ }
}

export function setStoredUser(user: AuthUser): void {
  storeUser(normalizeAuthUser(user));
}

export function clearStoredUser(): void {
  storeUser(null);
}

export async function fetchCurrentUser(refresh = false, loginIdentifier?: string): Promise<AuthUser | null> {
  if (loginIdentifier === undefined && !refresh && currentUserCache && Date.now() - currentUserCache.fetchedAt < 30_000) {
    return currentUserCache.user;
  }
  if (loginIdentifier === undefined && currentUserInFlight) return currentUserInFlight;
  const version = authStateVersion;
  const request = apiClient.get<{ user?: AuthUser; matches_login_identifier?: boolean }>("/me/", {
    validateStatus: status => status === 200 || status === 401,
    ...(loginIdentifier === undefined ? {} : { params: { login_identifier: loginIdentifier } }),
  }).then(({ data, status, headers }) => {
    if (status === 401) return null;
    if (!data?.user || typeof data.user.id !== "number") throw new Error("Invalid current-session response.");
    if (loginIdentifier !== undefined && data.matches_login_identifier !== true) {
      throw accountError({ detail: "You are already signed in with another account. Sign out before switching accounts." }, 409, headers?.["x-request-id"]);
    }
    return normalizeAuthUser(data.user);
  });
  if (loginIdentifier === undefined) currentUserInFlight = request;
  try {
    const user = await request;
    if (version === authStateVersion) currentUserCache = { user, fetchedAt: Date.now() };
    return user;
  } finally {
    if (currentUserInFlight === request) currentUserInFlight = null;
  }
}

export async function syncCurrentUser(): Promise<void> {
  const version = authStateVersion;
  try {
    const user = await fetchCurrentUser(true);
    if (version !== authStateVersion) return;
    // A session check does not broadcast another change to every other tab.
    try {
      if (user) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      else localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch { /* The session remains authoritative without storage. */ }
    publish({ user, status: user ? "authenticated" : "guest", error: null });
  } catch (error) {
    if (version === authStateVersion) {
      publish({ ...state, status: "unavailable", error: error instanceof Error ? error.message : "Could not check your session." });
    }
    throw error;
  }
}

function recheck(): void {
  void syncCurrentUser().catch(() => {});
}

function accountChangedElsewhere(): void {
  beginAuthChange();
  publish({ user: null, status: "checking", error: null });
  recheck();
}

function storageChanged(event: StorageEvent): void {
  if (event.key === AUTH_STORAGE_KEY || event.key === null) accountChangedElsewhere();
}

function visibilityChanged(): void {
  if (document.visibilityState === "visible") recheck();
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", storageChanged);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("auth-check-required", recheck);
    document.addEventListener("visibilitychange", visibilityChanged);
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel("worldcovers-auth");
        channel.onmessage = accountChangedElsewhere;
      } catch { /* Storage events and tab return still trigger session checks. */ }
    }
    recheck();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    window.removeEventListener("storage", storageChanged);
    window.removeEventListener("pageshow", recheck);
    window.removeEventListener("focus", recheck);
    window.removeEventListener("auth-check-required", recheck);
    document.removeEventListener("visibilitychange", visibilityChanged);
    channel?.close();
    channel = null;
  };
}

export async function signOut(): Promise<void> {
  const version = beginAuthChange();
  try {
    await ensureCsrfToken();
    await apiClient.post("/logout/");
    if (isCurrentAuthChange(version)) clearStoredUser();
  } catch (error) {
    // A response can be lost after Django has ended the session.
    const user = await fetchCurrentUser(true).catch(() => undefined);
    if (user === null && isCurrentAuthChange(version)) {
      clearStoredUser();
      return;
    }
    throw error;
  }
}
