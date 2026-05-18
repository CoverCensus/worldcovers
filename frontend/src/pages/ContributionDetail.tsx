import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, CheckCircle, XCircle, MessageSquare, ExternalLink } from "lucide-react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { normalizeImageUrl } from "@/services/markings";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { getLetterings, type LetteringOption } from "@/services/letterings";
import { getFramings, type FramingOption } from "@/services/framings";
import { getDateFormats, type DateFormatOption } from "@/constants/postmarkEnums";
import { isCoverContributionData } from "@/lib/contributionDisplay";
import CoverContributionDetail from "@/pages/CoverContributionDetail";
import { buildMarkingFields } from "@/lib/markingFields";
import { submittedDataToFieldInput } from "@/lib/contributionToFields";
import { MarkingFieldsDisplay } from "@/components/MarkingFieldsDisplay";


function getCsrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : null;
}

interface SubmittedData {
  state?: string;
  town?: string;
  date_range?: string;
  dateRange?: string;
  first_seen?: string;
  last_seen?: string;
  firstSeen?: string;
  lastSeen?: string;
  shape?: string;
  type?: string;
  color?: string;
  manuscript?: string;
  dimensions?: string;
  width_mm?: string | number;
  height_mm?: string | number;
  widthMm?: string | number;
  heightMm?: string | number;
  description?: string;
  references?: string;
  is_irreg?: boolean;
  isIrreg?: boolean;
  submitter_name?: string;
  original_postmark_id?: string;
  image_meta?: {
    storage_filename?: string;
    original_filename?: string;
    /** API may return camelCase */
    storageFilename?: string;
    originalFilename?: string;
  };
  /** Multiple images; API may return as image_metas or imageMetas */
  image_metas?: Array<{
    storage_filename?: string;
    original_filename?: string;
    storageFilename?: string;
    originalFilename?: string;
  }>;
  /** API may return camelCase */
  imageMetas?: SubmittedData["image_metas"];
  /** Categorized public image URLs returned by backend sanitization */
  postmark_images?: string[];
  ratemark_images?: string[];
  auxmark_images?: string[];
  /** API may return camelCase or PascalCase */
  postmarkImages?: string[];
  ratemarkImages?: string[];
  auxmarkImages?: string[];
  PostmarkImages?: string[];
  RatemarkImages?: string[];
  AuxmarkImages?: string[];
  /** Contributor-provided; used when editor approves (editor only fills value + comment). */
  lettering_style_id?: number;
  framing_style_id?: number;
  date_format_id?: number;
  framing_style_ids?: number[];
  date_format_ids?: number[];
  /** API may return camelCase */
  letteringStyleId?: number;
  framingStyleId?: number;
  dateFormatId?: number;
  framingStyleIds?: number[];
  dateFormatIds?: number[];
  dates_observed?: string;
  datesObserved?: string;
}

interface Contribution {
  id: number;
  /** Submitter user id (from API `contributor` FK) */
  contributor_id?: number | null;
  status: string;
  contributor_username: string;
  review_notes: string | null;
  created_at: string;
  submitted_data: SubmittedData;
  /** Postmaker-style title from API: "Town, State — Type" or "Submission #id" */
  display_name?: string;
  postmark_id?: number | null;
  /** When approved, FK to catalog postmark (API may return as postmark or postmark_id) */
  postmark?: number | null;
}

const ContributionDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuth();
  const { toast } = useToast();
  const { id } = useParams();
  const [contribution, setContribution] = useState<Contribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor form state (only Value and Comment; lettering/framing/date format come from contribution's submitted_data when approving)
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  // Options to display names for lettering/framing/date format in Submitted data
  const [letteringOptions, setLetteringOptions] = useState<LetteringOption[]>([]);
  const [framingOptions, setFramingOptions] = useState<FramingOption[]>([]);
  const [dateFormatOptions, setDateFormatOptions] = useState<DateFormatOption[]>([]);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [carouselCurrent, setCarouselCurrent] = useState(0);
  const [carouselCount, setCarouselCount] = useState(0);
  const fromDashboard = location.state?.fromDashboard === true;
  const isStateEditor =
    user?.role === "editor" || user?.role === "administrator" || user?.is_superuser;
  /** True if the logged-in user is the person who submitted this contribution (edit/review UI is for other editors only). */
  const isContributor =
    !!user &&
    !!contribution &&
    (contribution.contributor_id === user.id ||
      contribution.contributor_username === user.username ||
      contribution.contributor_username === user.email);

  useEffect(() => {
    const contributionId = id ? parseInt(String(id), 10) : null;
    if (!contributionId || isNaN(contributionId)) {
      setError("Invalid contribution");
      setLoading(false);
      return;
    }

    const apiBase = import.meta.env.VITE_API_URL?.trim?.()?.replace(/\/+$/, "");
    if (!apiBase) {
      setError("VITE_API_URL is not set.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetch(`${apiBase}/contributions/${contributionId}/`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Contribution not found" : res.statusText);
        return res.json();
      })
      .then((data: Record<string, unknown>) => {
        if (cancelled) return;
        // API returns camelCase (CamelCaseJSONRenderer); normalize so component can use snake_case
        const normalized: Contribution = {
          id: data.id as number,
          contributor_id:
            typeof data.contributor === "number"
              ? data.contributor
              : typeof (data as { contributorId?: number }).contributorId === "number"
                ? (data as { contributorId: number }).contributorId
                : null,
          status: (data.status as string) ?? "pending",
          contributor_username: (data.contributor_username ?? data.contributorUsername) as string,
          review_notes: (data.review_notes ?? data.reviewNotes) as string | null,
          created_at: (data.created_at ?? data.createdAt) as string,
          submitted_data: (data.submitted_data ?? data.submittedData) as SubmittedData,
          display_name: (data.display_name ?? data.displayName) as string | undefined,
          postmark_id: (data.postmark_id ?? data.postmarkId ?? data.postmark) as number | null | undefined,
          postmark: (data.postmark ?? data.postmark_id ?? data.postmarkId) as number | null | undefined,
        };
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
  }, [id]);

  // Carousel pagination
  useEffect(() => {
    if (!carouselApi) return;
    setCarouselCount(carouselApi.scrollSnapList().length);
    setCarouselCurrent(carouselApi.selectedScrollSnap());
    const onSelect = () => setCarouselCurrent(carouselApi.selectedScrollSnap());
    carouselApi.on("select", onSelect);
    return () => {
      carouselApi.off("select", onSelect);
    };
  }, [carouselApi]);

  // Lettering / framing / date format lookups -- needed to resolve numeric
  // ids stored on a contribution's submitted_data to human-readable names.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getLetterings(), getFramings(), getDateFormats()])
      .then(([lettering, framing, dateFormat]) => {
        if (!cancelled) {
          setLetteringOptions(lettering);
          setFramingOptions(framing);
          setDateFormatOptions(dateFormat);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLetteringOptions([]);
          setFramingOptions([]);
          setDateFormatOptions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);


  const submitDecision = async (kind: "approve" | "reject" | "revision") => {
    if (!contribution) return;
    if (kind !== "approve" && !comment.trim()) {
      setCommentError("A comment is required to reject or request revision.");
      return;
    }
    setCommentError(null);

    const apiBase = import.meta.env.VITE_API_URL?.trim?.()?.replace(/\/+$/, "");
    if (!apiBase) {
      toast({ title: "Configuration error", description: "VITE_API_URL is not set.", variant: "destructive" });
      return;
    }

    const actionPath = kind === "approve" ? "approve" : kind === "reject" ? "reject" : "request-revision";
    const body: Record<string, unknown> = {};
    if (comment.trim()) {
      body.review_notes = comment.trim();
    }

    setSubmitting(true);
    const csrfToken = getCsrfTokenFromCookie();
    const headers: HeadersInit = { "Content-Type": "application/json", Accept: "application/json" };
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;

    try {
      const res = await fetch(`${apiBase}/contributions/${contribution.id}/${actionPath}/`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const resBody = await res.json().catch(() => ({}));
        const msg = resBody?.review_notes?.[0] ?? resBody?.detail ?? res.statusText;
        throw new Error(typeof msg === "string" ? msg : "Request failed");
      }
      const actionLabel = kind === "approve" ? "Approved" : kind === "reject" ? "Rejected" : "Submission returned";
      toast({ title: actionLabel, description: "Your comment was saved for the contributor." });
      if (kind === "approve") {
        const data = await res.json();
        const postmarkId = data?.postmark_id ?? data?.postmarkId;
        if (postmarkId != null) {
          navigate(`/record/${postmarkId}`, { state: { fromDashboard: true } });
          return;
        }
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


  const handleBack = () => {
    if (fromDashboard) navigate("/dashboard", { state: { tab: "editor" } });
    else navigate("/dashboard");
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

  const rawSubmitted =
    contribution.submitted_data ??
    (contribution as unknown as Record<string, unknown>).submittedData ??
    {};
  const sd: Record<string, unknown> =
    typeof rawSubmitted === "object" && rawSubmitted !== null
      ? (rawSubmitted as Record<string, unknown>)
      : {};
  if (isCoverContributionData(sd)) {
    return (
      <CoverContributionDetail
        initialContribution={{
          id: contribution.id,
          contributor_id: contribution.contributor_id ?? null,
          status: contribution.status,
          contributor_username: contribution.contributor_username,
          review_notes: contribution.review_notes,
          created_at: contribution.created_at,
          submitted_data: sd,
          display_name: contribution.display_name,
        }}
      />
    );
  }

  const state = String(sd.state ?? "").trim();
  const town = String(sd.town ?? "").trim();
  const shape = String(sd.shape ?? sd.type ?? "").trim();
  const color = String(sd.color ?? "").trim();
  const contributorComment = String(
    sd.contributor_comment ??
      sd.contributorComment ??
      sd.comment_for_editor ??
      sd.commentForEditor ??
      sd.review_notes ??
      sd.reviewNotes ??
      sd.comment ??
      ""
  ).trim();
  const manuscript = String(sd.manuscript ?? "").trim();
  const isIrregular = Boolean(sd.is_irreg ?? sd.isIrreg);
  const title = [town, state].filter(Boolean).join(", ") || `Submission #${contribution.id}`;
  const displayName = [title, shape].filter((x) => x && String(x).trim().toLowerCase() !== "unknown").join(" — ") || title;
  const baseImageUrl = (import.meta.env.VITE_IMAGE_URL ?? "").replace(/\/+$/, "");
  const imageRoot = baseImageUrl || "/media";
  const resolveStorageImageUrl = (storageFilename: string) =>
    normalizeImageUrl(`${imageRoot}/${storageFilename.replace(/^\/+/, "")}`);
  const imageMetasRaw = (sd.image_metas ?? sd.imageMetas) as SubmittedData["image_metas"] | undefined;
  const imageMetaSingle = sd.image_meta as SubmittedData["image_meta"] | undefined;
  const imageMetaList: Array<{ imageUrl: string; originalFilename?: string }> = [];
  const asImageUrlArray = (raw: unknown): string[] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (!item || typeof item !== "object") return "";
        const obj = item as Record<string, unknown>;
        const fromUrl =
          obj.url ?? obj.image_url ?? obj.imageUrl ?? obj.public_url ?? obj.publicUrl;
        return typeof fromUrl === "string" ? fromUrl.trim() : "";
      })
      .filter((url) => url.length > 0);
  };
  const categorizedImageUrls = [
    ...asImageUrlArray(sd.postmark_images ?? sd.postmarkImages ?? sd.PostmarkImages),
    ...asImageUrlArray(sd.ratemark_images ?? sd.ratemarkImages ?? sd.RatemarkImages),
    ...asImageUrlArray(sd.auxmark_images ?? sd.auxmarkImages ?? sd.AuxmarkImages),
  ];
  const seenImageUrls = new Set<string>();
  categorizedImageUrls.forEach((url) => {
    const normalized = normalizeImageUrl(url);
    if (!normalized || seenImageUrls.has(normalized)) return;
    seenImageUrls.add(normalized);
    imageMetaList.push({ imageUrl: normalized });
  });
  if (imageMetasRaw && Array.isArray(imageMetasRaw) && imageMetasRaw.length > 0) {
    for (const meta of imageMetasRaw) {
      if (meta && typeof meta === "object") {
        const sf = meta.storage_filename ?? meta.storageFilename;
        if (sf) {
          const imageUrl = resolveStorageImageUrl(sf);
          if (!imageUrl || seenImageUrls.has(imageUrl)) continue;
          seenImageUrls.add(imageUrl);
          imageMetaList.push({
            imageUrl,
            originalFilename: meta.original_filename ?? meta.originalFilename,
          });
        }
      }
    }
  }
  if (imageMetaList.length === 0 && imageMetaSingle) {
    const sf = imageMetaSingle.storage_filename ?? imageMetaSingle.storageFilename;
    if (sf) {
      const imageUrl = resolveStorageImageUrl(sf);
      if (imageUrl) {
        imageMetaList.push({
          imageUrl,
          originalFilename: imageMetaSingle.original_filename ?? imageMetaSingle.originalFilename,
        });
      }
    }
  }
  const images = imageMetaList;

  const isPending = contribution.status === "pending";
  const normalizedStatus = String(contribution.status || "").toLowerCase();
  const statusLabel =
    normalizedStatus === "approved"
      ? "Approved"
      : normalizedStatus === "rejected"
        ? "Rejected"
        : normalizedStatus === "needs_revision"
          ? "Needs Revision"
          : "Pending";
  const statusBadgeClassName =
    normalizedStatus === "approved"
      ? "rounded-full border border-green-700 bg-green-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-green-600"
      : normalizedStatus === "rejected"
        ? "rounded-full border border-red-700 bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-red-600"
        : normalizedStatus === "needs_revision"
          ? "rounded-full border border-orange-600 bg-orange-500 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-orange-500"
          : "rounded-full border border-yellow-600 bg-yellow-500 px-3 py-1 text-xs font-semibold text-black shadow-sm hover:bg-yellow-500";
  const canReview = isStateEditor && isPending && !!user;
  const showPeerReviewNotice = false;

  // Build the canonical field-row list from submitted_data. Both editors
  // and contributors now see this read-only view; editors act on it via
  // Approve / Reject / Return rather than inline edits.
  let fieldRows: ReturnType<typeof buildMarkingFields> | null = null;
  let fieldRowsError: string | null = null;
  try {
    const fieldInput = submittedDataToFieldInput(
      sd,
      { letteringOptions, framingOptions, dateFormatOptions },
      { contributionId: contribution.id },
    );
    fieldRows = buildMarkingFields(fieldInput, { isStaff: !!isStateEditor });
  } catch (err) {
    fieldRowsError = err instanceof Error ? err.message : String(err);
  }
  const showEditorFeedbackCard =
    contribution.status !== "pending" || !!(contribution.review_notes && contribution.review_notes.trim());
  const canContributorResubmit =
    isContributor && (contribution.status === "rejected" || contribution.status === "needs_revision");
  const postmarkIdRaw =
    contribution.postmark_id ?? contribution.postmark ?? (contribution as unknown as Record<string, unknown>).postmarkId ?? null;
  const postmarkId =
    typeof postmarkIdRaw === "number"
      ? postmarkIdRaw
      : postmarkIdRaw != null && String(postmarkIdRaw).trim() !== ""
        ? parseInt(String(postmarkIdRaw), 10)
        : null;
  const hasValue = (v: unknown) => {
    const s = v != null ? String(v).trim() : "";
    return s !== "" && s.toLowerCase() !== "unknown";
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Breadcrumb + View record when approved — same as RecordDetail */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <Button variant="ghost" onClick={handleBack} className="sm:-ml-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge className={statusBadgeClassName}>{statusLabel}</Badge>
              {postmarkId != null && (
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/record/${postmarkId}`} state={{ fromDashboard: true }}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View record
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* Main Content — max-lg: flex + order → image → meta → review → feedback. lg: 2 columns, 1 row; left cell is a
              flex stack so Review sits directly under the image (no multi-row grid splitting the form height). */}
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
                            <div className="flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                              <img
                                src={img.imageUrl}
                                alt={img.originalFilename || `Submission image ${index + 1}`}
                                className="w-full h-full object-contain"
                              />
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
                    <CardTitle className="font-heading text-lg">Review this submission</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Choose Approve, Reject, or Return.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="contribution-comment">Comment</Label>
                      <Textarea
                        id="contribution-comment"
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
                      {commentError ? (
                        <p className="text-sm text-destructive">{commentError}</p>
                      ) : null}
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
                        Return
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
                    <p className="text-sm text-muted-foreground">
                      {contribution.status === "approved"
                        ? "Your submission was approved and added to the catalog. If the editor left a comment below, use it as guidance for future submissions."
                        : contribution.status === "rejected"
                          ? "Your submission was not accepted. See the comment below for details."
                          : contribution.status === "needs_revision"
                            ? "The editor requested changes. Please update this submission and resubmit."
                            : "The reviewer left a comment for you. Use this feedback to improve your submission or add a new postmark if requested."}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {contribution.review_notes?.trim() ? (
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                        {contribution.review_notes.trim()}
                      </p>
                    ) : null}
                    {canContributorResubmit ? (
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => navigate(`/contribute?edit=${contribution.id}`)}
                          disabled={resubmitting}
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
              </div>

              <Card className="shadow-archival-md border-primary/10">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Contribution details</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {canReview
                      ? "Read-only view of the contributor's submission. Use Return for revision if changes are needed."
                      : isContributor
                        ? "What you submitted. An editor will review this."
                        : "Snapshot of fields stored on this contribution."}
                  </p>
                </CardHeader>
                <CardContent>
                  {fieldRowsError ? (
                    <p className="text-sm text-destructive rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                      Failed to render submitted data: {fieldRowsError}
                    </p>
                  ) : fieldRows && fieldRows.length > 0 ? (
                    <MarkingFieldsDisplay rows={fieldRows} mode="contribution" />
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">
                      No submitted data returned for this contribution.
                    </p>
                  )}
                  {contributorComment ? (
                    <div className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Comment for editor</p>
                      <p className="text-sm text-foreground whitespace-pre-line">{contributorComment}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

            </div>
          </div>

        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ContributionDetail;
