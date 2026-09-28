/**
 * State editors roster, visible to editors and administrators only
 * (issues.md 177, Trello T46). Ian, 2026-09-23: "a listing of the editors
 * that is viewable only by the editors."
 *
 * Rows come straight from the server's current Collection assignments, so the
 * list is always up to date and can never show a proposed appointment.
 * Dwayne's spreadsheet remains the private roster for anything beyond a name,
 * an email and the states someone edits.
 */
import { useEffect, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { getEditorRoster, type RosterState } from "@/services/editorRoster";

export default function EditorRoster() {
  const [states, setStates] = useState<RosterState[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEditorRoster()
      .then((rows) => {
        if (!cancelled) setStates(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
        setError(
          typeof detail === "string"
            ? detail
            : err instanceof Error
              ? err.message
              : "Could not load the editor roster.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <div className="flex-1 bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-2">
            State editors
          </h1>
          <p className="text-muted-foreground mb-6">
            Who reviews each state, with the address to send covers to. Visible to editors and
            administrators only, and always reflects the current assignments.
          </p>

          {error && (
            <p role="alert" className="text-sm text-destructive mb-6">
              {error}
            </p>
          )}
          {!error && states === null && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner /> Loading…
            </div>
          )}
          {!error && states !== null && states.length === 0 && (
            <p className="text-muted-foreground">No state editors are assigned yet.</p>
          )}

          {states && states.length > 0 && (
            <div className="space-y-4">
              {states.map((state) => (
                <Card key={state.abbrev} className="shadow-archival-md">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">
                      {state.name} <span className="text-muted-foreground font-normal">({state.abbrev})</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y divide-border">
                      {state.editors.map((editor) => (
                        <li
                          key={`${state.abbrev}-${editor.email || editor.displayName}`}
                          className="py-2 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1"
                        >
                          <span className="text-foreground">{editor.displayName}</span>
                          <span className="text-sm text-muted-foreground">
                            {editor.email ? (
                              <a className="underline hover:text-foreground" href={`mailto:${editor.email}`}>
                                {editor.email}
                              </a>
                            ) : (
                              "no email on file"
                            )}
                            {editor.states.length > 1 && (
                              <span className="ml-3">also edits {editor.states.filter((s) => s !== state.abbrev).join(", ")}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
