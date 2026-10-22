/**
 * Review-page card for the Cover a contributor submitted together with a new
 * Marking (Trello T37). Before approval it shows what will become a Cover
 * submission; after approval it links to the Cover submission that was created.
 */
import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { coverTypeLabel } from "@/lib/coverTypes";
import { formatPartialDateInput } from "@/lib/partialDate";
import { type PendingCoverSummary } from "@/lib/contributionDisplay";
import { normalizeImageUrl } from "@/services/markings";

// Same root the review page uses for saved uploads (VITE_IMAGE_URL, else /media).
const MEDIA_BASE = (import.meta.env.VITE_IMAGE_URL ?? "").replace(/\/+$/, "") || "/media";

interface PendingCoverCardProps {
  summary: PendingCoverSummary;
  createdContributionId: number | null;
  approved: boolean;
}

export function PendingCoverCard({ summary, createdContributionId, approved }: PendingCoverCardProps) {
  const date = summary.date.unknown ? "Unknown" : formatPartialDateInput(summary.date) || "Not given";
  return (
    <Card className="shadow-archival-md border-primary/10" data-testid="pending-cover-card">
      <CardHeader>
        <CardTitle className="font-heading text-lg">Cover submitted with this marking</CardTitle>
        <p className="text-sm text-muted-foreground">
          {createdContributionId != null ? (
            <>
              Approving the marking created{" "}
              <Link to={`/contribution/${createdContributionId}`} className="text-primary underline">
                Cover submission #{createdContributionId}
              </Link>
              , which is reviewed separately.
            </>
          ) : approved ? (
            "The marking was approved; no Cover submission is recorded for it."
          ) : (
            "When this marking is approved, these details become a Cover submission for it, reviewed separately."
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Type</dt>
          <dd>{summary.type ? coverTypeLabel(summary.type) : "Not given"}</dd>
          <dt className="text-muted-foreground">Date</dt>
          <dd>{date}</dd>
          <dt className="text-muted-foreground">Institutional</dt>
          <dd>{summary.isInstitutional ? "Yes" : "No"}</dd>
          <dt className="text-muted-foreground">Backstamp</dt>
          <dd>{summary.isBackstamp ? "Yes" : "No"}</dd>
          {summary.description && (
            <>
              <dt className="text-muted-foreground">Description</dt>
              <dd className="whitespace-pre-wrap">{summary.description}</dd>
            </>
          )}
        </dl>
        {summary.imageStorageFilenames.length > 0 ? (
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Cover images">
            {summary.imageStorageFilenames.map((sf) => (
              <li key={sf}>
                <img
                  src={normalizeImageUrl(`${MEDIA_BASE}/${sf}`) ?? ""}
                  alt="Cover image submitted with the marking"
                  className="h-24 w-full object-contain bg-muted rounded"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {summary.noImage ? "The contributor confirmed no cover image is available." : "No cover image."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default PendingCoverCard;
