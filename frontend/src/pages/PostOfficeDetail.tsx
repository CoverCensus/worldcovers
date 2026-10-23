/**
 * One town: which state it sat in, and who ran its post office.
 *
 * Towns previously appeared only as a search filter and as an unlinked line on
 * a marking record. The postmaster data has no other home, so this page is it.
 * Editors add and correct appointment events here (Trello T71); the API
 * enforces the Editor and region rules, the page only shows the controls to
 * users the SPA already treats as editors.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PostmasterEventForm } from "@/components/PostmasterEventForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import apiClient from "@/lib/api";
import { isEditorUser } from "@/lib/editorRole";
import {
  PostmasterTenure,
  getTenuresForPostOffice,
  tenureDateLabel,
  tenureEventLabel,
} from "@/services/postmasters";

interface PostOfficeDetailData {
  id: number;
  name: string;
  code: string | null;
  population: number | null;
  regionName: string;
  regionAbbrev: string;
}

const tenuresKey = (postOfficeId: number) => ["postmaster-tenures", postOfficeId];

const PostOfficeDetail = () => {
  const { id } = useParams<{ id: string }>();
  const postOfficeId = Number(id);
  const validId = Number.isFinite(postOfficeId) && postOfficeId > 0;
  const user = useAuth();
  const canEdit = isEditorUser(user);
  const queryClient = useQueryClient();

  const [office, setOffice] = useState<PostOfficeDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null = closed, "new" = adding, a row = correcting it.
  const [editing, setEditing] = useState<"new" | PostmasterTenure | null>(null);

  useEffect(() => {
    if (!validId) {
      setError("That is not a valid post office.");
      setLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get(`/post-offices/${postOfficeId}/`);
        const raw = res.data ?? {};
        const detail: PostOfficeDetailData = {
          id: raw.id,
          name: raw.name ?? "",
          code: raw.code ?? null,
          population: raw.population ?? null,
          regionName: raw.region_name ?? raw.regionName ?? "",
          regionAbbrev: raw.region_abbrev ?? raw.regionAbbrev ?? "",
        };
        if (cancelled) return;
        setOffice(detail);
      } catch {
        if (!cancelled) setError("That post office could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [postOfficeId, validId]);

  const tenuresQuery = useQuery({
    queryKey: tenuresKey(postOfficeId),
    queryFn: () => getTenuresForPostOffice(postOfficeId),
    enabled: validId,
  });
  const tenures = useMemo(() => tenuresQuery.data ?? [], [tenuresQuery.data]);

  // Appointments read as a succession; undated events sort to the end rather
  // than heading the list.
  const ordered = useMemo(
    () =>
      [...tenures].sort((a, b) => {
        if (a.dateAppointed && b.dateAppointed) {
          return a.dateAppointed.localeCompare(b.dateAppointed);
        }
        if (a.dateAppointed) return -1;
        if (b.dateAppointed) return 1;
        return 0;
      }),
    [tenures]
  );

  // Refetch first, then close: the list changes once, not twice.
  const onSaved = async () => {
    await queryClient.invalidateQueries({ queryKey: tenuresKey(postOfficeId) });
    setEditing(null);
  };

  const title = office?.name ? office.name : "Post office";

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        {loading && <p className="text-muted-foreground">Loading…</p>}
        {error && !loading && <p className="text-destructive">{error}</p>}

        {!loading && !error && office && (
          <>
            <h1 className="text-3xl font-semibold mb-6">{title}</h1>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Post office</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {office.regionName && (
                    <p>
                      <span className="text-muted-foreground">State: </span>
                      <Link
                        className="underline"
                        to={`/search?state=${encodeURIComponent(office.regionAbbrev || office.regionName)}`}
                      >
                        {office.regionName}
                      </Link>
                    </p>
                  )}
                  {office.population != null && (
                    <p>
                      <span className="text-muted-foreground">
                        Population recorded:{" "}
                      </span>
                      {office.population.toLocaleString()}
                    </p>
                  )}
                  {office.code && (
                    <p>
                      <span className="text-muted-foreground">Reference: </span>
                      {office.code}
                    </p>
                  )}
                  <p>
                    <Link
                      className="underline"
                      to={`/search?town=${encodeURIComponent(office.name)}`}
                    >
                      Markings from this town
                    </Link>
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                  <CardTitle>Postmasters</CardTitle>
                  {canEdit && editing === null && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing("new")}>
                      Add postmaster event
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {canEdit && editing !== null && (
                    <PostmasterEventForm
                      postOfficeId={postOfficeId}
                      existing={editing === "new" ? null : editing}
                      onSaved={onSaved}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                  {tenuresQuery.isError && (
                    <p role="alert" className="text-sm text-destructive">
                      The postmaster records could not be loaded.
                    </p>
                  )}
                  {!tenuresQuery.isError && !tenuresQuery.isLoading && ordered.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No postmaster records for this town yet.
                    </p>
                  )}
                  {ordered.length > 0 && (
                    <ol className="space-y-2 text-sm">
                      {ordered.map((tenure) => (
                        <li key={tenure.id} className="flex gap-3 items-start">
                          <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                            {tenureDateLabel(tenure)}
                          </span>
                          <span className="flex-1">
                            {tenure.postmasterName || tenureEventLabel(tenure.event)}
                            {tenure.postmasterName &&
                              tenure.event !== "appointment" && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  — {tenureEventLabel(tenure.event)}
                                </span>
                              )}
                            {tenure.origin === "MANUAL" && (
                              <>
                                {" "}
                                <Badge variant="secondary" title="Entered by an Editor, not imported from a source workbook">
                                  manual
                                </Badge>
                                {tenure.sourceNote && (
                                  <span className="block text-xs text-muted-foreground">
                                    Source: {tenure.sourceNote}
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                          {canEdit && editing === null && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditing(tenure)}
                              aria-label={`Edit ${tenure.postmasterName || tenureEventLabel(tenure.event)} ${tenureDateLabel(tenure)}`}
                            >
                              Edit
                            </Button>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default PostOfficeDetail;
