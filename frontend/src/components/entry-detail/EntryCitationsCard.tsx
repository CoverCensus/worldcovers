import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type EntryCitationItem = {
  id: number;
  citationDetail: string;
  referenceWork: {
    code: string | null;
    title: string;
    authorship: string;
    publisher: string;
    publicationYear: number | null;
    edition: string;
    volume: string;
    isbn: string;
    url: string;
  } | null;
};

function citationTitle(c: EntryCitationItem): string {
  const rw = c.referenceWork;
  if (!rw) return "Reference work";
  const title = rw.title.trim();
  if (title) return title;
  const code = (rw.code ?? "").trim();
  return code || "Reference work";
}

function citationByline(rw: EntryCitationItem["referenceWork"]): string {
  if (!rw) return "";
  const authorship = rw.authorship.trim();
  const year = rw.publicationYear != null ? String(rw.publicationYear) : "";
  if (authorship && year) return `${authorship} (${year})`;
  if (authorship) return authorship;
  if (year) return `(${year})`;
  return "";
}

export function EntryCitationsCard({
  citations,
  emptyMessage,
}: {
  citations: EntryCitationItem[];
  emptyMessage: string;
}) {
  return (
    <Card className="shadow-archival-md">
      <CardHeader>
        <CardTitle className="font-heading text-lg">Citations ({citations.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {citations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          citations.map((citation, idx) => {
            const rw = citation.referenceWork;
            const code = (rw?.code ?? "").trim();
            const title = citationTitle(citation);
            const byline = citationByline(rw);
            const detail = citation.citationDetail.trim();
            const detailIsUrl = /^https?:\/\//i.test(detail);
            const rwUrl = (rw?.url ?? "").trim();
            const rows: { label: string; value: ReactNode }[] = [];
            if (detail) {
              rows.push({
                label: "Page",
                value: detailIsUrl ? (
                  <a
                    href={detail}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-primary break-all"
                  >
                    {detail}
                  </a>
                ) : (
                  detail
                ),
              });
            }
            if (rw?.publisher.trim()) {
              rows.push({ label: "Publisher", value: rw.publisher.trim() });
            }
            if (rw?.edition.trim()) {
              rows.push({ label: "Edition", value: rw.edition.trim() });
            }
            if (rw?.volume.trim()) {
              rows.push({ label: "Volume", value: rw.volume.trim() });
            }
            if (rw?.isbn.trim()) {
              rows.push({ label: "ISBN", value: rw.isbn.trim() });
            }
            if (rwUrl && !detailIsUrl) {
              rows.push({
                label: "Link",
                value: (
                  <a
                    href={rwUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-primary break-all"
                  >
                    {rwUrl}
                  </a>
                ),
              });
            }
            return (
              <div
                key={citation.id}
                className={idx === 0 ? "" : "border-t-2 border-primary/40 pt-6 mt-6"}
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  {code && (
                    <Badge variant="secondary" className="font-mono">
                      {code}
                    </Badge>
                  )}
                  <div className="font-medium text-foreground">{title}</div>
                </div>
                {byline && (
                  <div className="mt-1 text-xs text-muted-foreground italic">{byline}</div>
                )}
                {rows.length > 0 && (
                  <dl className="mt-3 text-sm">
                    {rows.map((r, i) => (
                      <div
                        key={r.label}
                        className={`flex justify-between gap-4 py-2 ${i === rows.length - 1 ? "" : "border-b border-border"}`}
                      >
                        <dt className="text-muted-foreground font-medium shrink-0">{r.label}</dt>
                        <dd className="text-foreground text-right break-words min-w-0">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
