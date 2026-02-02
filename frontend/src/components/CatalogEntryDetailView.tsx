import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import postmarkSample from "@/assets/postmark-sample.jpg";

/** Unified shape for catalog entry (from catalog_records or submissions). */
export type CatalogEntry = {
  name: string;
  town: string;
  state: string;
  date_range: string;
  type: string;
  color: string;
  image_url: string | null;
  description?: string | null;
  citation_references?: string | null;
  /** Optional; when missing, detail row shows "—" */
  dimensions?: string | null;
  manuscript?: string | null;
  rarity?: string | null;
  /** Catalog record only */
  valuation?: string | null;
  /** Submission only */
  status?: string;
  submitter_name?: string | null;
  created_at?: string;
  reviewed_at?: string | null;
};

/** Parses date_range (e.g. "1825-1845" or "1825") into First Seen / Last Seen for display. */
function parseDateRange(dateRange: string): { firstSeen: string; lastSeen: string } {
  const s = (dateRange ?? "").trim();
  if (!s) return { firstSeen: "—", lastSeen: "—" };
  const dash = s.indexOf("-");
  if (dash === -1) return { firstSeen: s, lastSeen: "—" };
  const first = s.slice(0, dash).trim();
  const last = s.slice(dash + 1).trim();
  return { firstSeen: first || "—", lastSeen: last || "—" };
}

type CatalogEntryDetailViewProps = {
  entry: CatalogEntry;
  backLabel: string;
  onBack: () => void;
  /** Main details card title: "Submission Details" or "Record Details" */
  detailsCardTitle: string;
  /** Show "Upload Image" (record page); submission page omits */
  showUploadImage?: boolean;
  onUploadImage?: () => void;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-500">Approved</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    case "revision":
      return <Badge variant="secondary">Needs Revision</Badge>;
    default:
      return <Badge variant="outline">Pending</Badge>;
  }
};

export const CatalogEntryDetailView = ({
  entry,
  backLabel,
  onBack,
  detailsCardTitle,
  showUploadImage,
  onUploadImage,
}: CatalogEntryDetailViewProps) => {
  const imageUrl = entry.image_url || postmarkSample;
  const { firstSeen, lastSeen } = parseDateRange(entry.date_range);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Button variant="ghost" onClick={onBack} className="mb-6 -ml-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        {backLabel}
      </Button>

      <div className="grid items-start lg:grid-cols-2 gap-8 mb-8">
        {/* Image */}
        <Card className="shadow-archival-lg">
          <CardContent className="p-6">
            <div className="aspect-square rounded-lg overflow-hidden bg-muted">
              <img
                src={imageUrl}
                alt={entry.name}
                className="w-full h-full object-contain"
              />
            </div>
            {showUploadImage && onUploadImage && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-4"
                onClick={onUploadImage}
              >
                Upload Image
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Metadata - matches Record Detail: title, then badges (type, color, rarity/status) */}
        <div className="space-y-6">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground mb-2">
              {entry.name}
            </h1>
            <div className="flex flex-wrap gap-2">
              {entry.status != null && getStatusBadge(entry.status)}
              <Badge variant="secondary">{entry.type}</Badge>
              <Badge variant="secondary">{entry.color}</Badge>
              {(entry.rarity ?? entry.valuation) != null && (entry.rarity ?? entry.valuation) !== "" && (
                <Badge variant="outline">{entry.rarity ?? entry.valuation}</Badge>
              )}
            </div>
          </div>

          {/* Same rows as Record Detail: State, Town, First Seen, Last Seen, Dimensions, Manuscript, Rarity */}
          <Card className="shadow-archival-md">
            <CardHeader>
              <CardTitle className="font-heading text-lg">{detailsCardTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-border">
                  <dt className="text-muted-foreground font-medium">State</dt>
                  <dd className="text-foreground">{entry.state}</dd>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <dt className="text-muted-foreground font-medium">Town</dt>
                  <dd className="text-foreground">{entry.town}</dd>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <dt className="text-muted-foreground font-medium">First Seen</dt>
                  <dd className="text-foreground">{firstSeen}</dd>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <dt className="text-muted-foreground font-medium">Last Seen</dt>
                  <dd className="text-foreground">{lastSeen}</dd>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <dt className="text-muted-foreground font-medium">Dimensions</dt>
                  <dd className="text-foreground">{entry.dimensions?.trim() || "—"}</dd>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <dt className="text-muted-foreground font-medium">Manuscript</dt>
                  <dd className="text-foreground">{entry.manuscript?.trim() || "—"}</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-muted-foreground font-medium">Rarity</dt>
                  <dd className="text-foreground">{entry.rarity?.trim() || entry.valuation?.trim() || "—"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {entry.description && (
            <Card className="shadow-archival-md">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {entry.description}
                </p>
              </CardContent>
            </Card>
          )}

          {entry.citation_references && (
            <Card className="shadow-archival-md">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Citation References</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {entry.citation_references}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
