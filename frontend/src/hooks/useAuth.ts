import { useState, useEffect } from "react";
import { getStoredUser, type AuthUser } from "@/lib/auth";

export function useAuth(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());

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
