/**
 * Submission status colours, shared by the Dashboard lists and the counts bar
 * (Trello T96). Lifted unchanged from Dashboard.tsx so the two render the same
 * status the same way; the pill class strings are the single source of truth.
 */
import { Badge } from "@/components/ui/badge";

export type SubmissionStatusKey = "draft" | "approved" | "rejected" | "needs_revision" | "pending";

const PILL_BASE = "rounded-full border px-3 py-1 text-xs font-semibold shadow-sm";

const STATUS_CLASS: Record<SubmissionStatusKey, string> = {
  draft: "border-amber-900 bg-amber-800 text-white hover:bg-amber-800",
  approved: "border-green-700 bg-green-600 text-white hover:bg-green-600",
  rejected: "border-red-700 bg-red-600 text-white hover:bg-red-600",
  needs_revision: "border-orange-600 bg-orange-500 text-white hover:bg-orange-500",
  pending: "border-yellow-600 bg-yellow-500 text-black hover:bg-yellow-500",
};

const STATUS_LABEL: Record<SubmissionStatusKey, string> = {
  draft: "Draft",
  approved: "Approved",
  rejected: "Rejected",
  needs_revision: "Needs Revision",
  pending: "Pending",
};

/** Normalise a raw API/UI status to the key the colour table knows. Unknown values read as pending. */
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

/** The colour classes (no shape) for a status, for callers that are not a pill. */
export function statusColorClass(status: string): string {
  return STATUS_CLASS[submissionStatusKey(status)];
}

export function getStatusBadge(status: string) {
  const key = submissionStatusKey(status);
  return <Badge className={`${PILL_BASE} ${STATUS_CLASS[key]}`}>{STATUS_LABEL[key]}</Badge>;
}
