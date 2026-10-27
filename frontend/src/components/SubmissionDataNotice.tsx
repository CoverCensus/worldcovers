/** Keep readable evidence visible, but do not approve unrecognized changes. */
export function SubmissionDataNotice({ fields }: { fields: string[] }) {
  if (fields.length === 0) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
      Some submitted information cannot be displayed. Approval is unavailable.
      Please report this problem so the full Submission can be reviewed.
    </p>
  );
}
