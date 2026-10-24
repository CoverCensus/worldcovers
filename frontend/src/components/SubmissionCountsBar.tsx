/**
 * Submission counts at the top of the Dashboard (Trello T96).
 *
 * Ian found eight of his own submissions needing revision only by accident:
 * the Dashboard showed no totals and the status filter sat in a select. Each
 * tile is a real link to the matching filtered view, so it works in a new tab
 * and the URL is shareable; on the Dashboard itself the onSelect callback
 * applies the filter in place, because the page reads its URL only on mount.
 */
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { statusColorClass } from "@/lib/statusBadge";

export type SubmissionCountTarget = "needs_revision" | "draft" | "pending" | "editor_pending";

export interface OwnSubmissionCounts {
  needsRevision: number;
  drafts: number;
  pending: number;
}

interface Props {
  counts: OwnSubmissionCounts;
  isEditor: boolean;
  /** Pending rows in the editor's review queue; null while unknown or unavailable. */
  editorPending?: number | null;
  editorLoading?: boolean;
  onSelect: (target: SubmissionCountTarget) => void;
}

interface Tile {
  target: SubmissionCountTarget;
  label: string;
  href: string;
  status: string;
  count: number | null;
  loading: boolean;
  describe: (n: number) => string;
}

const COUNT_TARGET_HREF: Record<SubmissionCountTarget, string> = {
  needs_revision: "/dashboard?status=needs_revision",
  draft: "/dashboard?status=draft",
  pending: "/dashboard?status=pending",
  editor_pending: "/dashboard?tab=editor&e_status=pending",
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function SubmissionCountsBar({
  counts,
  isEditor,
  editorPending = null,
  editorLoading = false,
  onSelect,
}: Props) {
  const tiles: Tile[] = [
    {
      target: "needs_revision",
      label: "Needs revision",
      href: COUNT_TARGET_HREF.needs_revision,
      status: "needs_revision",
      count: counts.needsRevision,
      loading: false,
      describe: (n) => `${plural(n, "submission", "submissions")} needing revision`,
    },
    {
      target: "draft",
      label: "Drafts",
      href: COUNT_TARGET_HREF.draft,
      status: "draft",
      count: counts.drafts,
      loading: false,
      describe: (n) => plural(n, "draft", "drafts"),
    },
    {
      target: "pending",
      label: "Pending",
      href: COUNT_TARGET_HREF.pending,
      status: "pending",
      count: counts.pending,
      loading: false,
      describe: (n) => `${plural(n, "pending submission", "pending submissions")}`,
    },
  ];
  if (isEditor) {
    tiles.push({
      target: "editor_pending",
      label: "To review",
      href: COUNT_TARGET_HREF.editor_pending,
      status: "pending",
      count: editorPending,
      loading: editorLoading,
      describe: (n) => `${plural(n, "submission", "submissions")} to review`,
    });
  }

  return (
    <Card className="shadow-archival-md mb-6" aria-label="Submission counts">
      <CardContent className="pt-6">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 list-none p-0 m-0">
          {tiles.map((tile) => {
            const shown = tile.loading ? null : tile.count;
            const ariaLabel =
              shown === null ? `${tile.label}: loading` : tile.describe(shown);
            return (
              <li key={tile.target}>
                <Link
                  to={tile.href}
                  aria-label={ariaLabel}
                  onClick={() => onSelect(tile.target)}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg border px-3 py-3 text-center",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    statusColorClass(tile.status),
                  )}
                >
                  <span className="text-3xl font-bold leading-none" aria-hidden="true">
                    {shown === null ? <Spinner className="h-7 w-7 text-current" /> : shown}
                  </span>
                  <span className="mt-1 text-xs font-semibold uppercase tracking-wide" aria-hidden="true">
                    {tile.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
