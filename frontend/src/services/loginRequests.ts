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

export async function getPendingLoginRequests(): Promise<PendingLoginRequest[]> {
  const res = await apiClient.get<PendingLoginRequestApi[]>("/login-requests/pending/");
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map((r) => ({
    id: typeof r.id === "number" ? r.id : Number(r.id),
    firstName: text(r.first_name),
    lastName: text(r.last_name),
    email: text(r.email),
    requestedAt: text(r.requested_at),
    adminUrl: text(r.admin_url),
  }));
}
