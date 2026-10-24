import apiClient, { ensureCsrfToken } from "@/lib/api";
import { setStoredUser, type AuthUser } from "@/lib/auth";

interface AccountResponse {
  status: number;
  data?: { flows?: { id: string; is_pending?: boolean }[] };
  meta?: { is_authenticated?: boolean };
  errors?: { message: string }[];
  detail?: string;
}

export async function accountPost(path: string, values: Record<string, string>): Promise<AccountResponse> {
  await ensureCsrfToken();
  const { data, status } = await apiClient.post<AccountResponse>(`/auth/${path}`, values, {
    validateStatus: (code) => code < 500,
  });
  if (status !== 200 && status !== 401) {
    throw new Error(data.detail || data.errors?.map((error) => error.message).join(" ") ||
      (status === 429 ? "Please wait before trying again." : "The request could not be completed."));
  }
  return data;
}

export function needsEmailVerification(response: AccountResponse): boolean {
  return response.data?.flows?.some((flow) => flow.id === "verify_email" && flow.is_pending) ?? false;
}

export async function signIn(identifier: string, password: string): Promise<boolean> {
  const login = identifier.includes("@") ? { email: identifier } : { username: identifier };
  const response = await accountPost("login", { ...login, password });
  if (needsEmailVerification(response)) return false;
  if (!response.meta?.is_authenticated) throw new Error("Unable to sign in. Please check your account details.");
  const { data } = await apiClient.get<{ user: AuthUser }>("/me/");
  setStoredUser(data.user);
  return true;
}
