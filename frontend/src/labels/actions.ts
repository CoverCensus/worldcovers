/**
 * Canonical action verbs per docs/devel/vocab.md.
 * Submission lifecycle: Create -> Edit -> Save (draft) -> Submit -> Approve/Reject/Return.
 *   Create  - bring a new item into existence in the application state
 *   Edit    - open an existing item for modification
 *   Save    - persist a draft or non-reviewed change
 *   Submit  - Contributor sends content into review
 *   Approve - Editor accepts a Submission
 *   Reject  - Editor refuses a Submission
 *   Return  - Editor sends a Submission back to the Contributor for changes
 *   Remove  - take published data out of the catalog
 *   Cancel  - close a modal without committing
 *   Discard - throw away unsaved in-progress input
 *
 * Use these constants directly when the button or menu item is the verb alone.
 * For compound labels (e.g. "Submit Marking", "Approve Submission"), prefer the
 * feature-specific label module (entry.ts, submission.ts) that composes the verb.
 */

export const ACTIONS = {
  CREATE: "Create",
  EDIT: "Edit",
  SAVE: "Save",
  SUBMIT: "Submit",
  APPROVE: "Approve",
  REJECT: "Reject",
  RETURN: "Return",
  REMOVE: "Remove",
  CANCEL: "Cancel",
  DISCARD: "Discard",
} as const;
