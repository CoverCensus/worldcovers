import apiClient, { accountError, ensureCsrfToken } from "@/lib/api";
import { beginAuthChange, isCurrentAuthChange, fetchCurrentUser, setStoredUser, syncCurrentUser, type AuthUser } from "@/lib/auth";

interface AccountResponse {
  status: number;
  data?: { flows?: { id: string; is_pending?: boolean }[] };
  meta?: { is_authenticated?: boolean };
  errors?: { message: string }[];
  detail?: string;
}

export async function accountPost(path: string, values: Record<string, string>): Promise<AccountResponse> {
  await ensureCsrfToken();
  const { data, status, headers } = await apiClient.post<AccountResponse>(`/auth/${path}/`, values, {
    validateStatus: (code) => code < 500,
  });
  if (status !== 200 && status !== 401) {
    let message = `The request could not be completed (HTTP ${status}).`;
    if (status === 409 && path === "signup") {
      await syncCurrentUser().catch(() => {});
      message = "You are already signed in. Sign out to create a new account.";
    } else if (status === 403) {
      message = "The server refused this request (HTTP 403). Refresh the page and try again.";
    } else if (status === 429) {
      message = "Please wait before trying again (HTTP 429).";
    }
    throw accountError({ detail: data?.detail || data?.errors?.map((error) => error.message).join(" ") || message }, status, headers?.["x-request-id"]);
  }
  return data;
}

export function needsEmailVerification(response: AccountResponse): boolean {
  return response.data?.flows?.some((flow) => flow.id === "verify_email" && flow.is_pending) ?? false;
}

export async function signIn(identifier: string, password: string): Promise<boolean> {
  const version = beginAuthChange();
  function accept(user: AuthUser): boolean {
    if (!isCurrentAuthChange(version)) throw new Error("Your session changed. Please try again.");
    setStoredUser(user);
    return true;
  }
  let authenticated = false;
  try {
    const response = await accountPost("login", { username: identifier, password });
    if (needsEmailVerification(response)) return false;
    authenticated = response.meta?.is_authenticated === true;
    if (!authenticated) throw new Error("Unable to sign in. Please check your account details.");
    const user = await fetchCurrentUser(true, identifier);
    if (!user) throw new Error("The browser did not retain your session. Allow site cookies and try again.");
    return accept(user);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 409 || status === undefined || status >= 500 || authenticated) {
      const user = await fetchCurrentUser(true, identifier);
      if (user) return accept(user);
    }
    throw error;
  }
}

export async function passwordPost(path: "forgot-password" | "reset-password" | "change-password", values: Record<string, string>): Promise<{ detail: string }> {
  if (path !== "forgot-password") beginAuthChange();
  try {
    await ensureCsrfToken();
    const { data } = await apiClient.post<{ detail: string }>(`/${path}/`, values);
    return data;
  } catch (error) {
    if (path !== "forgot-password") {
      await syncCurrentUser().catch(() => {});
      if ((error as { status?: number }).status === undefined) {
        throw new Error("The response was lost. Your password may have changed. Try signing in with the new password before requesting another reset.");
      }
    }
    throw error;
  }
}
