import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  fullScreen?: boolean;
}

export function Spinner({ className, fullScreen = false }: SpinnerProps) {
  const icon = (
    <Loader2
      className={cn("h-8 w-8 animate-spin text-muted-foreground", className)}
      aria-label="Loading"
    />
  );
  if (!fullScreen) return icon;
  return <div className="flex h-screen items-center justify-center">{icon}</div>;
}
