import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Loader2, Pencil } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type CarouselApi } from "@/components/ui/carousel";
import { formatCatalogDate } from "@/lib/catalogRecordDisplay";
import { EntryDetailLayout } from "@/components/entry-detail/EntryDetailLayout";
import { EntryImageGalleryCard } from "@/components/entry-detail/EntryImageGalleryCard";
import { EntryAssociatedThumbnailsCard } from "@/components/entry-detail/EntryAssociatedThumbnailsCard";
import { EntryRecordHistoryCard } from "@/components/entry-detail/EntryRecordHistoryCard";
import { EntryCitationsCard, type EntryCitationItem } from "@/components/entry-detail/EntryCitationsCard";
import { CoverRecordDetailFields } from "@/components/entry-detail/CoverRecordDetailFields";
import { AssociatedMarkingPreviewCard } from "@/components/entry-detail/AssociatedMarkingPreviewCard";
import type { EntryGalleryImage } from "@/components/entry-detail/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  getImagesForSubject,
  getMarkingChangelog,
  getCoverMarkingsByCover,
  loadAssociatedMarkingsForCover,
  normalizeImageUrl,
  postCoverMarkingReview,
  reorderImages,
  type AssociatedMarkingOnCover,
  type CoverMarkingLink,
  type CoverMarkingReviewActionApi,
  type CoverMarkingReviewStatus,
  type MarkingChangelogEvent,
  type MarkingImage,
} from "@/services/markings";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getCoverById, type CoverDetail, type CoverDateSeenItem } from "@/services/covers";
import { listCitationsForSubject } from "@/services/citations";
import { getReferenceWorks, type ReferenceWorkRecord } from "@/services/referenceWorks";
import { SUBMISSION_LABELS } from "@/labels/submission";

const EMPTY = "-";

type CoverDetailLocationState = {
  from?: string;
  markingId?: number;
  coverMarkingId?: number;
};

function buildCoverGalleryImages(images: MarkingImage[]): EntryGalleryImage[] {
  return images.map((img) => ({
    imageUrl: normalizeImageUrl(img.imageUrl),
    originalFilename: img.originalFilename || undefined,
    isDefault: img.displayOrder === 0,
    isTracing: img.isTracing,
    imageId: img.imageId > 0 ? img.imageId : null,
  }));
}

function coverTypeLabel(t: string | null): string {
  if (t === "FC") return "Folded Cover";
  if (t === "FL") return "Folded Letter";
  return EMPTY;
}

function formatCoverDate(d: CoverDateSeenItem): string {
  const raw = d.date || "";
  const truncated =
    d.granularity === "YEAR"
      ? raw.slice(0, 4)
      : d.granularity === "MONTH"
        ? raw.slice(0, 7)
        : raw.slice(0, 10);
  return formatCatalogDate(truncated) || truncated;
}




function coverLinkReviewBadgeLabel(status: CoverMarkingReviewStatus): string {
  switch (status) {
    case "pending":
      return "Pending review";
    case "needs_revision":
      return "Needs revision";
    case "rejected":
      return "Rejected";
    default:
      return "Approved";
  }
}


const CoverDetailPage = () => {
  const { id: markingIdParam, coverId: coverIdParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as CoverDetailLocationState | undefined;
  const user = useAuth();
  const { toast } = useToast();

  const markingIdFromRoute = useMemo(() => {
    if (!markingIdParam) return null;
    const n = parseInt(String(markingIdParam).replace(/^api-/, ""), 10);
    return Number.isFinite(n) ? n : null;
  }, [markingIdParam]);

  const markingId = markingIdFromRoute ?? state?.markingId ?? null;

  const coverPk = useMemo(() => {
    const n = coverIdParam ? parseInt(String(coverIdParam), 10) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [coverIdParam]);

  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cover, setCover] = useState<CoverDetail | null>(null);
  const [images, setImages] = useState<MarkingImage[]>([]);
  const [reorderingImages, setReorderingImages] = useState(false);
  const [coverMarkingLink, setCoverMarkingLink] = useState<CoverMarkingLink | null>(null);
  const [associatedMarkings, setAssociatedMarkings] = useState<AssociatedMarkingOnCover[]>([]);
  const [markingsLoadError, setMarkingsLoadError] = useState<string | null>(null);
  const [citations, setCitations] = useState<EntryCitationItem[]>([]);
  const [historyEvents, setHistoryEvents] = useState<MarkingChangelogEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [coverReviewOpen, setCoverReviewOpen] = useState(false);
  const [coverReviewKind, setCoverReviewKind] = useState<CoverMarkingReviewActionApi | null>(null);
  const [coverReviewNotes, setCoverReviewNotes] = useState("");
  const [coverReviewBusy, setCoverReviewBusy] = useState(false);

  const isStaff =
    !!user &&
    (user.role === "editor" ||
      user.role === "administrator" ||
      user.is_superuser === true);

  const canViewHistory = useMemo(() => {
    if (!user) return false;
    return (
      user.role === "editor" ||
      user.role === "administrator" ||
      user.is_superuser === true
    );
  }, [user]);

  const canReviewCover =
    isStaff && coverMarkingLink != null && coverMarkingLink.reviewStatus === "pending";

  const refreshCoverMarkingLink = useCallback(async () => {
    if (coverPk == null) return;
    const { links } = await getCoverMarkingsByCover(coverPk);
    const link =
      markingId != null
        ? links.find((l) => l.markingId === markingId) ?? null
        : links[0] ?? null;
    setCoverMarkingLink(link);
  }, [coverPk, markingId]);

  const openCoverReview = (kind: CoverMarkingReviewActionApi) => {
    setCoverReviewKind(kind);
    setCoverReviewNotes("");
    setCoverReviewOpen(true);
  };

  const submitCoverReview = async () => {
    if (!coverMarkingLink || !coverReviewKind) return;
    if (coverReviewKind === "request-revision" && !coverReviewNotes.trim()) {
      toast({
        title: "Comment required",
        description: "Explain what should change before the contributor resubmits.",
        variant: "destructive",
      });
      return;
    }
    setCoverReviewBusy(true);
    try {
      const res = await postCoverMarkingReview(
        coverMarkingLink.id,
        coverReviewKind,
        coverReviewNotes,
      );
      if (!res.ok) {
        toast({
          title: "Could not update cover",
          description: res.message,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Cover review saved",
        description:
          coverReviewKind === "approve"
            ? "This cover link is now visible to everyone on the catalog record."
            : coverReviewKind === "reject"
              ? "The contributor will see this cover as rejected on the record."
              : "The contributor can edit the cover and resubmit it for review.",
      });
      setCoverReviewOpen(false);
      setCoverReviewKind(null);
      setCoverReviewNotes("");
      await refreshCoverMarkingLink();
    } finally {
      setCoverReviewBusy(false);
    }
  };

  const handleBack = () => {
    if (state?.from) {
      navigate(state.from);
      return;
    }
    if (markingId != null) {
      navigate(`/record/${markingId}`);
      return;
    }
    navigate(-1);
  };

  useEffect(() => {
    if (coverPk == null) {
      setError("Invalid cover ID");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const [detail, imgs, linksResult, refWorks] = await Promise.all([
        getCoverById(coverPk),
        getImagesForSubject({ subjectType: "COVER", subjectId: coverPk }),
        getCoverMarkingsByCover(coverPk),
        getReferenceWorks(),
      ]);
      if (cancelled) return;
      if (!detail) {
        setCover(null);
        setImages([]);
        setAssociatedMarkings([]);
        setCitations([]);
        setCoverMarkingLink(null);
        setError("Cover not found");
        setLoading(false);
        return;
      }
      setCover(detail);
      setImages(imgs);
      setMarkingsLoadError(linksResult.error);

      const linkForMarking =
        markingId != null
          ? linksResult.links.find((l) => l.markingId === markingId) ?? null
          : linksResult.links[0] ?? null;
      setCoverMarkingLink(linkForMarking);

      const markings = await loadAssociatedMarkingsForCover(linksResult.links);
      if (!cancelled) setAssociatedMarkings(markings);

      const citationRows = await listCitationsForSubject({
        subjectType: "COVER",
        subjectId: coverPk,
      });
      const refById = new Map(refWorks.map((w) => [w.id, w]));
      const built: EntryCitationItem[] = citationRows.map((row) => {
        const rw = refById.get(row.referenceWorkId) ?? null;
        return {
          id: row.id,
          citationDetail: row.citationDetail,
          referenceWork: rw
            ? {
                code: rw.code,
                title: rw.title,
                authorship: rw.authorship,
                publisher: rw.publisher,
                publicationYear: rw.publicationYear,
                edition: rw.edition,
                volume: rw.volume,
                isbn: rw.isbn,
                url: rw.url,
              }
            : null,
        };
      });
      if (!cancelled) setCitations(built);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [coverPk, markingId]);

  useEffect(() => {
    if (markingId == null || Number.isNaN(markingId) || !canViewHistory) {
      setHistoryEvents([]);
      setHistoryError(null);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryExpanded(false);
    getMarkingChangelog(markingId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setHistoryEvents([]);
          setHistoryError(
            "Unable to load record history (you may not be assigned to this region).",
          );
          return;
        }
        setHistoryEvents(Array.isArray(data.events) ? data.events : []);
      })
      .catch(() => {
        if (cancelled) return;
        setHistoryEvents([]);
        setHistoryError("Unable to load record history.");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [markingId, canViewHistory]);

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  const applyImageOrder = useCallback(
    async (newImages: MarkingImage[]) => {
      if (coverPk == null || newImages.length === 0) return;
      setReorderingImages(true);
      setImages(
        newImages.map((img, idx) => ({
          ...img,
          displayOrder: idx,
        })),
      );
      try {
        const ok = await reorderImages(
          newImages.map((img) => img.imageId).filter((id) => id > 0),
        );
        if (!ok) {
          toast({
            title: "Reorder failed",
            description:
              "Could not save the new image order. Refreshing from the server.",
            variant: "destructive",
          });
        }
        const refreshed = await getImagesForSubject({
          subjectType: "COVER",
          subjectId: coverPk,
        });
        setImages(refreshed);
      } finally {
        setReorderingImages(false);
      }
    },
    [coverPk, toast],
  );

  const moveImageBy = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= images.length) return;
    const next = images.slice();
    [next[index], next[target]] = [next[target], next[index]];
    void applyImageOrder(next);
  };

  const setImageAsDefault = (index: number) => {
    if (index <= 0 || index >= images.length) return;
    const next = images.slice();
    const [picked] = next.splice(index, 1);
    next.unshift(picked);
    void applyImageOrder(next);
  };

  const requireAuth = (): boolean => {
    if (user) return true;
    navigate("/auth", { state: { from: location } });
    return false;
  };

  const openEditCover = () => {
    if (markingId == null || coverPk == null) return;
    if (!requireAuth()) return;
    navigate(`/record/${markingId}/cover/${coverPk}/edit`, {
      state: { from: location.pathname + location.search },
    });
  };

  const goMarkingView = (markingIdTarget: number) => {
    navigate(`/record/${markingIdTarget}`, {
      state: { from: location.pathname + location.search },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !cover || coverPk == null) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          <p className="text-muted-foreground text-center">
            {error || "Cover not found"}
          </p>
          <Button variant="outline" onClick={handleBack}>
            Back
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const galleryImages = buildCoverGalleryImages(images);
  const canSubmitEdit = user != null && markingId != null && coverPk != null;

  const datesText =
    cover.datesSeen.length > 0
      ? cover.datesSeen.map(formatCoverDate).filter(Boolean).join("\n")
      : EMPTY;

  const institutionalText =
    cover.isInstitutional === true
      ? "Yes"
      : cover.isInstitutional === false
        ? "No"
        : EMPTY;

  const backstampText = coverMarkingLink?.isBackstamp ? "Yes" : "No";

  const ratemarkCount = associatedMarkings.filter(
    (row) => row.marking.type === "RATEMARK",
  ).length;

  return (
    <>
      <EntryDetailLayout
        onBack={handleBack}
        leftColumn={
          <>
            <EntryImageGalleryCard
              images={galleryImages}
              showSubjectBadge={false}
              carouselApi={api}
              setCarouselApi={setApi}
              currentIndex={current}
            />
            <EntryAssociatedThumbnailsCard
              images={galleryImages}
              carouselApi={api}
              currentIndex={current}
              emptyMessage="No images linked to this cover yet."
              canReorder={isStaff}
              reorderingImages={reorderingImages}
              onMoveBy={moveImageBy}
              onSetDefault={setImageAsDefault}
            />
            {canViewHistory && (
              <EntryRecordHistoryCard
                loading={historyLoading}
                error={historyError}
                events={historyEvents}
                expanded={historyExpanded}
                onToggleExpanded={() => setHistoryExpanded((v) => !v)}
                unavailableMessage={
                  markingId == null
                    ? "Open this cover from a marking record to view audit history."
                    : undefined
                }
              />
            )}
          </>
        }
        rightColumn={
          <>
            <Card className="shadow-archival-md">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="font-heading text-lg">Record Details</CardTitle>
                  {canSubmitEdit && (
                    <Button variant="outline" size="sm" onClick={openEditCover}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {SUBMISSION_LABELS.action.submitEditToCover}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {coverMarkingLink && coverMarkingLink.reviewStatus !== "approved" && (
                  <div className="mb-4 space-y-2">
                    <Badge
                      variant={
                        coverMarkingLink.reviewStatus === "pending"
                          ? "secondary"
                          : coverMarkingLink.reviewStatus === "needs_revision"
                            ? "outline"
                            : "destructive"
                      }
                      className="font-normal"
                    >
                      {coverLinkReviewBadgeLabel(coverMarkingLink.reviewStatus)}
                    </Badge>
                    {(coverMarkingLink.reviewStatus === "needs_revision" ||
                      coverMarkingLink.reviewStatus === "rejected") &&
                      (coverMarkingLink.reviewNotes ?? "").trim().length > 0 && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-2">
                          <span className="font-medium text-foreground">Editor note: </span>
                          {coverMarkingLink.reviewNotes}
                        </p>
                      )}
                  </div>
                )}
                <CoverRecordDetailFields
                  type={coverTypeLabel(cover.type)}
                  date={datesText}
                  institutionallyOwned={institutionalText}
                  backstamp={backstampText}
                />
                {canReviewCover && (
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                    <Button type="button" size="sm" variant="default" onClick={() => openCoverReview("approve")}>
                      Approve
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => openCoverReview("request-revision")}>
                      Return for revision
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/50 hover:bg-destructive/10"
                      onClick={() => openCoverReview("reject")}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-archival-md">
              <CardHeader>
                <CardTitle className="font-heading text-lg">
                  Associated Markings ({ratemarkCount})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {markingsLoadError && (
                  <p className="text-sm text-destructive rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                    {markingsLoadError}
                  </p>
                )}
                {associatedMarkings.length === 0 && !markingsLoadError ? (
                  <p className="text-sm text-muted-foreground">No markings linked to this cover yet.</p>
                ) : (
                  <div className="space-y-4">
                    {associatedMarkings.map(({ marking, defaultImageUrl }) => (
                      <AssociatedMarkingPreviewCard
                        key={marking.id}
                        marking={marking}
                        defaultImageUrl={defaultImageUrl}
                        onOpenMarking={() => goMarkingView(marking.id)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <EntryCitationsCard
              citations={citations}
              emptyMessage="No citations linked to this cover yet."
            />
          </>
        }
      />

      <Dialog
        open={coverReviewOpen}
        onOpenChange={(open) => {
          if (coverReviewBusy) return;
          setCoverReviewOpen(open);
          if (!open) {
            setCoverReviewKind(null);
            setCoverReviewNotes("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {coverReviewKind === "approve"
                ? "Approve this cover link"
                : coverReviewKind === "reject"
                  ? "Reject this cover link"
                  : "Return this cover for revision"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="cover-detail-review-notes">
              Note to contributor{" "}
              <span className="text-destructive">
                {coverReviewKind === "request-revision" ? "(required)" : "(optional)"}
              </span>
            </Label>
            <Textarea
              id="cover-detail-review-notes"
              rows={4}
              value={coverReviewNotes}
              onChange={(e) => setCoverReviewNotes(e.target.value)}
              disabled={coverReviewBusy}
              placeholder={
                coverReviewKind === "request-revision"
                  ? "Describe what needs to change before this cover can be approved."
                  : "Optional context for the contributor."
              }
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCoverReviewOpen(false)}
              disabled={coverReviewBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitCoverReview()}
              disabled={coverReviewBusy}
            >
              {coverReviewBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CoverDetailPage;
