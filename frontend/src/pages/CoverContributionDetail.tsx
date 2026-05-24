import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, ExternalLink, Loader2, MessageSquare, XCircle } from "lucide-react";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { CoverRecordDetailFields } from "@/components/entry-detail/CoverRecordDetailFields";
import { formatCatalogDate } from "@/lib/catalogRecordDisplay";
import {
  contributionImageMetasFromSubmittedData,
  contributionMetaImageUrl,
} from "@/lib/contributionImages";
import {
  coverContributionDisplayName,
  isCoverContributionData,
  parentMarkingIdFromContribution,
} from "@/lib/contributionDisplay";
import { type Contribution, getContribution, decideContribution } from "@/services/contributions";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const COVER_TYPE_LABELS: Record<string, string> = {
  FC: "Folded Cover",
  FL: "Folded Letter",
};

function boolLabel(raw: unknown): string {
  if (raw === true || raw === "true" || raw === "1" || raw === 1) return "Yes";
  if (raw === false || raw === "false" || raw === "0" || raw === 0) return "No";
  return "—";
}

function coverTypeLabel(typeCode: string): string {
  const code = typeCode.trim().toUpperCase();
  return COVER_TYPE_LABELS[code] || code || "—";
}

function formatCoverDate(sd: Record<string, unknown>): string {
  const raw = String(sd.cover_date ?? sd.coverDate ?? "").trim();
  if (!raw) return "—";
  return formatCatalogDate(raw) || raw;
}

function tracingFlagsFromSubmittedData(sd: Record<string, unknown>, imageCount: number): boolean[] {
  const raw = sd.cover_image_tags ?? sd.coverImageTags;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((tag) => String(tag).toLowerCase() === "tracing");
      }
    } catch {
      /* ignore */
    }
  }
  if (Array.isArray(raw)) {
    return raw.map((tag) => String(tag).toLowerCase() === "tracing");
  }
  return Array.from({ length: imageCount }, () => false);
}

interface CoverContributionDetailProps {
  /** When ContributionDetail already loaded the row, skip a duplicate fetch. */
  initialContribution?: Contribution | null;
}

export default function CoverContributionDetail({ initialContribution = null }: CoverContributionDetailProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const user = useAuth();

  const [contribution, setContribution] = useState<Contribution | null>(initialContribution);
  const [loading, setLoading] = useState(!initialContribution);
  const [error, setError] = useState<string | null>(null);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [carouselCurrent, setCarouselCurrent] = useState(0);
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fromDashboard = (location.state as { fromDashboard?: boolean } | null)?.fromDashboard === true;
  const isStateEditor =
    user?.role === "editor" || user?.role === "administrator" || user?.is_superuser === true;

  useEffect(() => {
    if (initialContribution) {
      setContribution(initialContribution);
      setLoading(false);
      return;
    }
    const contributionId = id ? parseInt(String(id), 10) : null;
    if (!contributionId || Number.isNaN(contributionId)) {
      setError("Invalid contribution");
      setLoading(false);
      return;
    }

    let cancelled = false;
    getContribution(contributionId)
      .then((normalized) => {
        if (cancelled) return;
        if (!isCoverContributionData(normalized.submittedData)) {
          throw new Error("Not a cover submission");
        }
        setContribution(normalized);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, initialContribution]);

  useEffect(() => {
    if (!carouselApi) return;
    setCarouselCurrent(carouselApi.selectedScrollSnap());
    const onSelect = () => setCarouselCurrent(carouselApi.selectedScrollSnap());
    carouselApi.on("select", onSelect);
    return () => {
      carouselApi.off("select", onSelect);
    };
  }, [carouselApi]);

  const sd = contribution?.submittedData ?? {};
  const parentMarkingId = parentMarkingIdFromContribution(sd);
  const displayName =
    contribution?.displayName?.trim() ||
    coverContributionDisplayName(sd, contribution?.id ?? 0, contribution?.status);

  const images = useMemo(() => {
    const metas = contributionImageMetasFromSubmittedData(sd);
    const tracingFlags = tracingFlagsFromSubmittedData(sd, metas.length);
    return metas
      .map((meta, index) => {
        const imageUrl = contributionMetaImageUrl(meta);
        if (!imageUrl) return null;
        const obj = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
        const originalFilename =
          typeof obj.original_filename === "string"
            ? obj.original_filename
            : typeof obj.originalFilename === "string"
              ? obj.originalFilename
              : undefined;
        return {
          imageUrl,
          originalFilename,
          isTracing: tracingFlags[index] === true,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }, [sd, contribution?.id]);

  const isContributor =
    !!user &&
    !!contribution &&
    (contribution.contributorId === user.id ||
      contribution.contributorUsername === user.username ||
      contribution.contributorUsername === user.email);

  const handleBack = () => {
    if (fromDashboard) {
      navigate("/dashboard", { state: { tab: isStateEditor ? "editor" : "submissions" } });
      return;
    }
    navigate("/dashboard");
  };

  const submitDecision = async (kind: "approve" | "reject" | "revision") => {
    if (!contribution) return;
    if (kind !== "approve" && !comment.trim()) {
      setCommentError("A comment is required to reject or request revision.");
      return;
    }
    setCommentError(null);

    setSubmitting(true);
    try {
      await decideContribution(contribution.id, kind, {
        reviewNotes: comment.trim() || undefined,
      });
      const actionLabel = kind === "approve" ? "Approved" : kind === "reject" ? "Rejected" : "Revision requested";
      toast({ title: actionLabel, description: "Your comment was saved for the contributor." });
      if (kind === "approve" && parentMarkingId != null) {
        navigate(`/record/${parentMarkingId}`, { state: { fromDashboard: true } });
        return;
      }
      navigate("/dashboard", { state: { tab: "editor" } });
    } catch (err) {
      toast({
        title: "Could not submit",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
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

  if (error || !contribution) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">{error || "Contribution not found"}</p>
          <Button variant="outline" onClick={handleBack}>
            Back to Dashboard
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const normalizedStatus = String(contribution.status || "").toLowerCase();
  const statusLabel =
    normalizedStatus === "approved"
      ? "Approved"
      : normalizedStatus === "rejected"
        ? "Rejected"
        : normalizedStatus === "needs_revision"
          ? "Needs Revision"
          : normalizedStatus === "draft"
            ? "Draft"
            : "Pending";
  const statusBadgeClassName =
    normalizedStatus === "approved"
      ? "rounded-full border border-green-700 bg-green-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-green-600"
      : normalizedStatus === "rejected"
        ? "rounded-full border border-red-700 bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-red-600"
        : normalizedStatus === "needs_revision"
          ? "rounded-full border border-orange-600 bg-orange-500 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-orange-500"
          : normalizedStatus === "draft"
            ? "rounded-full border border-amber-900 bg-amber-800 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-amber-800"
            : "rounded-full border border-yellow-600 bg-yellow-500 px-3 py-1 text-xs font-semibold text-black shadow-sm hover:bg-yellow-500";

  const isPending = normalizedStatus === "pending";
  const canReview = isStateEditor && isPending && !!user && !isContributor;
  const showEditorFeedbackCard =
    contribution.status !== "pending" || !!(contribution.reviewNotes && contribution.reviewNotes.trim());
  const canContributorResubmit =
    isContributor && (contribution.status === "rejected" || contribution.status === "needs_revision");
  const contributorComment = String(
    sd.contributor_comment ??
      sd.contributorComment ??
      sd.comment_for_editor ??
      sd.commentForEditor ??
      "",
  ).trim();
  const typeCode = String(sd.type ?? "").trim().toUpperCase();

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <Button variant="ghost" onClick={handleBack} className="sm:-ml-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge className={statusBadgeClassName}>{statusLabel}</Badge>
              {parentMarkingId != null && (
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/record/${parentMarkingId}`} state={{ fromDashboard: true }}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View parent marking
                  </Link>
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-8 mb-8 min-w-0 lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
            <div className="contents lg:flex lg:flex-col lg:gap-8 lg:min-w-0">
              <div className="order-1 min-w-0 lg:order-none">
                <Card className="shadow-archival-lg">
                  <CardContent className="p-6">
                    <Carousel setApi={setCarouselApi} className="w-full">
                      <CarouselContent>
                        {images.length > 0 ? (
                          images.map((img, index) => (
                            <CarouselItem key={index}>
                              <div className="relative flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                                <img
                                  src={img.imageUrl}
                                  alt={img.originalFilename || `Cover image ${index + 1}`}
                                  className="w-full h-full object-contain"
                                />
                                {img.isTracing ? (
                                  <Badge className="absolute top-2 left-2 bg-background/90 text-foreground">
                                    Tracing
                                  </Badge>
                                ) : null}
                              </div>
                            </CarouselItem>
                          ))
                        ) : (
                          <CarouselItem>
                            <div className="flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                              <img
                                src={imageNotAvailable}
                                alt="No image available"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </CarouselItem>
                        )}
                      </CarouselContent>
                      {images.length > 1 && (
                        <>
                          <CarouselPrevious className="left-2" />
                          <CarouselNext className="right-2" />
                        </>
                      )}
                    </Carousel>
                    {images.length > 1 && (
                      <div className="flex justify-center gap-2 mt-4 mb-4">
                        {images.map((_, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => carouselApi?.scrollTo(index)}
                            className={`h-2 rounded-full transition-all ${
                              index === carouselCurrent
                                ? "w-6 bg-primary"
                                : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                            }`}
                            aria-label={`Go to image ${index + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {canReview && (
                <div className="order-4 min-w-0 lg:order-none">
                  <Card className="shadow-archival-lg border-primary/20">
                    <CardHeader>
                      <CardTitle className="font-heading text-lg">Review this cover</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Choose Approve, Reject, or Request revision.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="cover-contribution-comment">Comment</Label>
                        <Textarea
                          id="cover-contribution-comment"
                          placeholder="Optional for approvals, required for rejection/revision."
                          rows={4}
                          value={comment}
                          onChange={(e) => {
                            setComment(e.target.value);
                            if (commentError && e.target.value.trim()) setCommentError(null);
                          }}
                          disabled={submitting}
                          className={`resize-none ${commentError ? "border-destructive" : ""}`}
                        />
                        {commentError ? <p className="text-sm text-destructive">{commentError}</p> : null}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                          type="button"
                          onClick={() => submitDecision("approve")}
                          disabled={submitting}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          {submitting ? "Submitting..." : "Approve"}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => submitDecision("reject")}
                          disabled={submitting}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Reject
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => submitDecision("revision")}
                          disabled={submitting}
                        >
                          <MessageSquare className="mr-2 h-4 w-4" />
                          Request revision
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {showEditorFeedbackCard ? (
                <div className="order-5 min-w-0 lg:order-none">
                  <Card className="shadow-archival-md border-amber-500/20 bg-amber-500/5">
                    <CardHeader>
                      <CardTitle className="font-heading text-lg flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-amber-600" />
                        Editor feedback
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {contribution.status !== "pending" && (
                        <p className="text-sm font-medium text-foreground">
                          Outcome: <Badge className={statusBadgeClassName}>{statusLabel}</Badge>
                        </p>
                      )}
                      {contribution.reviewNotes?.trim() ? (
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                          {contribution.reviewNotes.trim()}
                        </p>
                      ) : null}
                      {canContributorResubmit && parentMarkingId != null ? (
                        <div className="flex flex-wrap gap-2 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              navigate(`/record/${parentMarkingId}/cover/new?edit=${contribution.id}`)
                            }
                            disabled={submitting}
                          >
                            Edit before resubmitting
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              ) : null}
            </div>

            <div className="order-2 min-w-0 space-y-6 lg:order-none lg:col-start-2 lg:row-start-1">
              <div>
                <h1 className="font-heading text-3xl font-bold text-foreground mb-2">{displayName}</h1>
                <div className="flex flex-wrap gap-2">
                  {typeCode ? <Badge variant="secondary">{coverTypeLabel(typeCode)}</Badge> : null}
                  <Badge variant="outline">Cover submission</Badge>
                </div>
              </div>

              {contributorComment && (
                <Card className="shadow-archival-md border-primary/15">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Contributor comment
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                      {contributorComment}
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card className="shadow-archival-md border-primary/10">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Submitted data</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {canReview
                      ? "Contributor submission (read-only). Use Review this cover to decide."
                      : "Snapshot of fields stored on this contribution."}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CoverRecordDetailFields
                    type={coverTypeLabel(typeCode)}
                    date={formatCoverDate(sd)}
                    institutionallyOwned={boolLabel(sd.is_institutional ?? sd.isInstitutional)}
                    backstamp={boolLabel(sd.is_backstamp ?? sd.isBackstamp)}
                  />
                  {parentMarkingId != null ? (
                    <p className="text-sm text-muted-foreground">
                      Parent marking:{" "}
                      <Link
                        to={`/record/${parentMarkingId}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        #{parentMarkingId}
                      </Link>
                    </p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    Submitted {new Date(contribution.createdAt).toLocaleString()}
                    {contribution.contributorUsername ? ` by ${contribution.contributorUsername}` : ""}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
