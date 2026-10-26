import { useSyncExternalStore } from "react";
import { getAuthState, subscribeAuth, type AuthState, type AuthUser } from "@/lib/auth";

export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthState);
}

export function useAuth(): AuthUser | null {
  return useAuthState().user;
}
