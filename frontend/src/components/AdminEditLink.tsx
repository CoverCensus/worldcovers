import { WandSparkles } from "lucide-react";
import type { AuthUser } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button-variants";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  user: AuthUser | null;
  kind: "marking" | "cover";
  recordId: number | null | undefined;
  className?: string;
};

export function AdminEditLink({ user, kind, recordId, className }: Props) {
  if (
    user?.is_superuser !== true ||
    !Number.isSafeInteger(recordId) ||
    (recordId ?? 0) <= 0
  ) {
    return null;
  }

  const label = `Edit ${kind === "marking" ? "Marking" : "Cover"} in Django admin`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={`/admin/common/${kind}/${recordId}/change/`}
          className={buttonVariants({ variant: "outline", size: "icon", className })}
          aria-label={label}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <WandSparkles aria-hidden="true" />
        </a>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
