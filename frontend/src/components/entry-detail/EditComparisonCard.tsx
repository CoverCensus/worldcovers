import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ComparisonRow } from "@/lib/editComparison";

const EMPTY = "—";

/**
 * Current vs proposed values for an edit under review (Trello T39). Changed
 * rows carry a "Changed" badge as well as a tint, so the difference does not
 * rest on colour alone; unchanged rows stay listed so the Editor can confirm
 * what the edit leaves alone.
 */
export function EditComparisonCard({ entryLabel, rows }: { entryLabel: string; rows: ComparisonRow[] }) {
  const changedCount = rows.filter((row) => row.changed).length;
  return (
    <Card className="shadow-archival-md">
      <CardHeader>
        <CardTitle className="font-heading text-lg">Proposed changes</CardTitle>
        <p className="text-sm text-muted-foreground">
          {changedCount === 0
            ? `This edit changes none of the ${rows.length} fields compared.`
            : `${changedCount} of ${rows.length} fields change. Current values are the ${entryLabel} as it stands now.`}
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Current and proposed values for this {entryLabel} edit
          </caption>
          <thead>
            <tr className="text-left border-b">
              <th scope="col" className="py-2 pr-4">Field</th>
              <th scope="col" className="py-2 pr-4">Current</th>
              <th scope="col" className="py-2">Proposed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={`border-b align-top ${row.changed ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}>
                <th scope="row" className="py-2 pr-4 text-left font-medium whitespace-nowrap">
                  {row.label}
                  {row.changed && (
                    <Badge variant="secondary" className="ml-2">Changed</Badge>
                  )}
                </th>
                <td className="py-2 pr-4 break-words">{row.current || EMPTY}</td>
                <td className="py-2 break-words">
                  {row.proposed || EMPTY}
                  {row.note && <p className="mt-1 text-xs text-muted-foreground">{row.note}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
