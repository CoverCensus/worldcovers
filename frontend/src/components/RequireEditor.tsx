import type { ReactNode } from "react";
import { RequireAuth } from "@/components/RequireAuth";

// The backend also enforces Editor access. Wait for its session check here.
export function RequireEditor({ children }: { children: ReactNode }) {
  return <RequireAuth role="editor">{children}</RequireAuth>;
}
