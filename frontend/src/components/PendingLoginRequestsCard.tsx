/**
 * Dashboard card for Administrators: login requests nobody has acted on
 * (Trello T84). A login request is an inactive account that has never signed
 * in; nothing used to report new ones, so eight made on woco.dev went
 * unnoticed. Each row opens the account in Django admin, where approval
 * already happens (set a password, tick Active). Shown on both sites, each
 * reporting its own requests; accounts are never moved between sites.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { getPendingLoginRequests, type PendingLoginRequest } from "@/services/loginRequests";

function requestedOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function displayName(row: PendingLoginRequest): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email;
}

export function PendingLoginRequestsCard() {
  const [rows, setRows] = useState<PendingLoginRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPendingLoginRequests()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
        setError(
          typeof detail === "string"
            ? detail
            : err instanceof Error
              ? err.message
              : "Could not load pending login requests.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="shadow-archival-md mb-6" aria-labelledby="pending-login-requests-title">
      <CardHeader>
        <CardTitle id="pending-login-requests-title" className="font-heading text-lg">
          Pending login requests{rows ? ` (${rows.length})` : ""}
        </CardTitle>
        <CardDescription>
          People who asked for an account on this site and are waiting for an Administrator.
          Each row opens the account in the admin, where you set a password and tick Active to
          approve it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!error && rows === null && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading...
          </div>
        )}
        {!error && rows !== null && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No requests are waiting.</p>
        )}
        {rows && rows.length > 0 && (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="py-2 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                <a href={row.adminUrl} className="text-primary underline hover:no-underline">
                  {displayName(row)}
                </a>
                <span className="text-sm text-muted-foreground break-all">
                  {row.email}
                  {requestedOn(row.requestedAt) && ` - requested ${requestedOn(row.requestedAt)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
