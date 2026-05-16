import { Card, CardContent } from "@/components/ui/card";
import { ImageOrPlaceholder } from "@/components/ImageOrPlaceholder";
import { CatalogRecordFields } from "@/components/CatalogRecordFields";
import { buildCatalogSearchRow } from "@/lib/catalogRecordDisplay";
import type { MarkingRecord } from "@/services/markings";

export function AssociatedMarkingPreviewCard({
  marking,
  defaultImageUrl,
  onOpenMarking,
}: {
  marking: MarkingRecord;
  defaultImageUrl: string | null;
  onOpenMarking: () => void;
}) {
  const row = buildCatalogSearchRow(marking);
  return (
    <Card className="shadow-archival-md hover:shadow-archival-lg transition-shadow">
      <CardContent className="p-4">
        <div className="flex gap-6 md:flex-row flex-col">
          <button
            type="button"
            className="shrink-0 rounded border border-border overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onOpenMarking}
            aria-label={`Open marking ${row.title}`}
          >
            <ImageOrPlaceholder
              src={defaultImageUrl}
              alt={row.title}
              className="md:w-32 md:h-32 w-full h-48 object-cover block"
            />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="font-heading text-xl font-semibold text-foreground mb-2">{row.title}</h3>
            <CatalogRecordFields row={row} record={marking} variant="detail" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
