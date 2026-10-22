/**
 * Login requests waiting on an Administrator: GET /login-requests/pending/
 * (Trello T84). Superuser only; the rows carry names and email addresses and
 * link to the user's page in Django admin, where approval happens.
 */
import apiClient from "@/lib/api";

export interface PendingLoginRequest {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  /** ISO timestamp of the request (the account's date_joined). */
  requestedAt: string;
  /** Path of the account's Django admin change page. */
  adminUrl: string;
}

interface PendingLoginRequestApi {
  id?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  requested_at?: unknown;
  admin_url?: unknown;
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

interface PendingLoginRequestsApi {
  count?: unknown;
  results?: unknown;
}

export interface PendingLoginRequests {
  /** Every request waiting on this site, even those beyond the server's cap. */
  count: number;
  /** The newest requests, capped by the server. */
  results: PendingLoginRequest[];
}

export async function getPendingLoginRequests(): Promise<PendingLoginRequests> {
  const res = await apiClient.get<PendingLoginRequestsApi>("/login-requests/pending/");
  const raw = Array.isArray(res.data?.results) ? (res.data.results as PendingLoginRequestApi[]) : [];
  // A row without a numeric id has no admin page to open; leave it out rather
  // than render a key of NaN and a broken link.
  const results = raw
    .filter((r) => Number.isFinite(Number(r.id)))
    .map((r) => ({
      id: Number(r.id),
      firstName: text(r.first_name),
      lastName: text(r.last_name),
      email: text(r.email),
      requestedAt: text(r.requested_at),
      adminUrl: text(r.admin_url),
    }));
  const count = Number(res.data?.count);
  return { count: Number.isFinite(count) ? count : results.length, results };
}
