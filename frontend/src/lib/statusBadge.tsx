/**
 * Submission status colors shared by the Dashboard lists and counts bar (T96).
 */
import { Badge } from "@/components/ui/badge";

export type SubmissionStatusKey = "draft" | "approved" | "rejected" | "needs_revision" | "pending";

const PILL_BASE = "rounded-full border px-3 py-1 text-xs font-semibold shadow-sm";

const STATUS_CLASS: Record<SubmissionStatusKey, string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
  approved: "border-green-700 bg-green-600 text-white hover:bg-green-600",
  rejected: "border-red-700 bg-red-600 text-white hover:bg-red-600",
  needs_revision: "border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900",
  pending: "border-blue-300 bg-blue-100 text-blue-900 hover:bg-blue-200 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100 dark:hover:bg-blue-900",
};

const STATUS_LABEL: Record<SubmissionStatusKey, string> = {
  draft: "Draft",
  approved: "Approved",
  rejected: "Rejected",
  needs_revision: "Needs Revision",
  pending: "Pending",
};

/** Normalize an API/UI status to a color key. Unknown values read as pending. */
export function submissionStatusKey(status: string): SubmissionStatusKey {
  switch (String(status || "").toLowerCase()) {
    case "draft":
      return "draft";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "needs_revision":
    case "revision":
      return "needs_revision";
    default:
      return "pending";
  }
}

/** Color classes for a status without the badge shape. */
export function statusColorClass(status: string): string {
  return STATUS_CLASS[submissionStatusKey(status)];
}

export function getStatusBadge(status: string) {
  const key = submissionStatusKey(status);
  return <Badge className={`${PILL_BASE} ${STATUS_CLASS[key]}`}>{STATUS_LABEL[key]}</Badge>;
}
