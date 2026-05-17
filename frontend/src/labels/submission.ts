/**
 * Canonical user-facing labels for the Submission workflow.
 * Authority: docs/glossary.md (Submission) and docs/devel/vocab.md (Action Verbs).
 */

export const SUBMISSION_LABELS = {
  toast: {
    received: "Submission received",
    failed: "Submission failed",
  },
  action: {
    submitMarking: "Submit Marking",
    submitCover: "Submit Cover",
    resubmit: "Resubmit",
    saveDraft: "Save Draft",
  },
} as const;
