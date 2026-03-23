import { useState, useEffect } from "react";
import { getStoredUser, setStoredUser, fetchCurrentUser, type AuthUser } from "@/lib/auth";

export function useAuth(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());

  // Sync with server on load so role and assigned_locations are correct (e.g. State Editor with locations)
  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) return;
    let cancelled = false;
    fetchCurrentUser().then((serverUser) => {
      if (cancelled || !serverUser) return;
      setStoredUser(serverUser);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleChange = (e: CustomEvent<AuthUser | null>) => {
      setUser(e.detail);
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "worldcovers_user") {
        setUser(getStoredUser());
      }
    };

    window.addEventListener("auth-change", handleChange as EventListener);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("auth-change", handleChange as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return user;
}
