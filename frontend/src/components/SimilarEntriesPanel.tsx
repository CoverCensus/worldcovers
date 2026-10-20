/**
 * Advisory "similar existing Entries" panel for the submission forms (T48).
 *
 * Never blocks: Submit stays enabled, the panel only shows what the catalog
 * already holds so the contributor can check before adding a twin. Rows open
 * in a new tab so unsaved form input survives. `role="status"` (polite), not
 * the Alert default `role="alert"`: this updates while the user types.
 */
import { AlertTriangle } from "lucide-react";

import imageNotAvailable from "@/assets/image-not-available.jpg";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export interface SimilarRow {
  id: number;
  href: string;
  title: string;
  detail: string;
  thumbnailUrl?: string | null;
  tierLabel: string;
}

interface SimilarEntriesPanelProps {
  /** "Markings" or "Covers": the noun in the heading. */
  noun: string;
  rows: SimilarRow[];
  /** Total candidates on the server, when more exist than `rows` shows. */
  totalCount?: number;
  loading?: boolean;
  /** Extra guidance under the list, e.g. "Choose a shape and colour to narrow this list." */
  hint?: string | null;
  /** Whether rows carry thumbnails (Cover rows are text-only). */
  showThumbnails?: boolean;
}

export function SimilarEntriesPanel({
  noun,
  rows,
  totalCount,
  loading = false,
  hint = null,
  showThumbnails = true,
}: SimilarEntriesPanelProps) {
  // Quiet while nothing matches: no "checking…" flash on every settled
  // keystroke. During a refresh the previous rows stay up (the hook keeps
  // them), so the panel never blinks out and back.
  if (rows.length === 0) return null;

  const total = totalCount ?? rows.length;
  const heading =
    total > rows.length
      ? `Similar existing ${noun} (${total}, showing ${rows.length})`
      : `Similar existing ${noun} (${rows.length})`;

  return (
    <Alert variant="warning" role="status" aria-live="polite" data-testid="similar-entries-panel">
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>{heading}</AlertTitle>
      <AlertDescription>
        <ul className="mt-2 space-y-1" aria-busy={loading || undefined}>
          {rows.map((row) => (
            <li key={row.id}>
              <a
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-background/60"
              >
                {showThumbnails && (
                  <img
                    src={row.thumbnailUrl || imageNotAvailable}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-12 w-12 shrink-0 rounded border border-border object-cover"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium">{row.title}</span>
                  {row.detail && (
                    <span className="block break-words text-xs text-muted-foreground">{row.detail}</span>
                  )}
                </span>
                <Badge variant="outline" className="shrink-0 whitespace-nowrap">
                  {row.tierLabel}
                </Badge>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs">
          You can still submit; an Editor compares your submission with these at review.
          {hint ? ` ${hint}` : ""}
        </p>
      </AlertDescription>
    </Alert>
  );
}
