import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, CheckCircle, XCircle, MessageSquare, ExternalLink, RefreshCw } from "lucide-react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { normalizeImageUrl } from "@/services/postmarks";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { getLetteringStyles, type LetteringStyleOption } from "@/services/letteringStyles";
import { getFramingStyles, type FramingStyleOption } from "@/services/framingStyles";
import { getDateFormats, type DateFormatOption } from "@/services/dateFormats";

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : null;
}

interface SubmittedData {
  state?: string;
  town?: string;
  date_range?: string;
  type?: string;
  color?: string;
  manuscript?: string;
  dimensions?: string;
  description?: string;
  references?: string;
  rarity?: string;
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
  /** Contributor-provided; used when editor approves (editor only fills value + comment). */
  lettering_style_id?: number;
  framing_style_id?: number;
  date_format_id?: number;
  /** API may return camelCase */
  letteringStyleId?: number;
  framingStyleId?: number;
  dateFormatId?: number;
}

interface Contribution {
  id: number;
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
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Options to display names for lettering/framing/date format in Submitted data
  const [letteringOptions, setLetteringOptions] = useState<LetteringStyleOption[]>([]);
  const [framingOptions, setFramingOptions] = useState<FramingStyleOption[]>([]);
  const [dateFormatOptions, setDateFormatOptions] = useState<DateFormatOption[]>([]);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [carouselCurrent, setCarouselCurrent] = useState(0);
  const [carouselCount, setCarouselCount] = useState(0);

  const fromDashboard = location.state?.fromDashboard === true;
  const isStateEditor = user?.role === "state_editor" || user?.is_superuser;
  const isContributor =
    !!user &&
    !!contribution &&
    (contribution.contributor_username === user.username || contribution.contributor_username === user.email);

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
    fetch(`${apiBase}/api/contributions/${contributionId}/`, {
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

  // Fetch lettering/framing/date format options to show names instead of IDs in Submitted data
  useEffect(() => {
    let cancelled = false;
    Promise.all([getLetteringStyles(), getFramingStyles(), getDateFormats()])
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
    if (!contribution || !comment.trim()) return;
    if (kind === "approve") {
      const valueNum = value.trim() === "" ? NaN : parseFloat(value);
      if (Number.isNaN(valueNum) || valueNum < 0) {
        toast({
          title: "Missing required fields",
          description: "Value is required to approve. Enter a valid value (number ≥ 0) and a comment.",
          variant: "destructive",
        });
        return;
      }
    }

    const apiBase = import.meta.env.VITE_API_URL?.trim?.()?.replace(/\/+$/, "");
    if (!apiBase) {
      toast({ title: "Configuration error", description: "VITE_API_URL is not set.", variant: "destructive" });
      return;
    }

    const actionPath = kind === "approve" ? "approve" : kind === "reject" ? "reject" : "request-revision";
    const body: Record<string, unknown> = { review_notes: comment.trim() };
    if (kind === "approve") {
      body.estimated_value = parseFloat(value);
      // lettering_style_id, framing_style_id, date_format_id come from contribution's submitted_data (required on form)
    }

    setSubmitting(true);
    const csrfToken = getCsrfTokenFromCookie();
    const headers: HeadersInit = { "Content-Type": "application/json", Accept: "application/json" };
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;

    try {
      const res = await fetch(`${apiBase}/api/contributions/${contribution.id}/${actionPath}/`, {
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
      const actionLabel = kind === "approve" ? "Approved" : kind === "reject" ? "Rejected" : "Revision requested";
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

  const handleEditAndResubmit = () => {
    if (!contribution) return;
    navigate("/contribute", { state: { editContributionId: contribution.id } });
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

  // Support both snake_case (API) and camelCase in case response is transformed
  const rawSubmitted =
    contribution.submitted_data ??
    (contribution as unknown as Record<string, unknown>).submittedData ??
    {};
  const sd: Record<string, unknown> =
    typeof rawSubmitted === "object" && rawSubmitted !== null
      ? (rawSubmitted as Record<string, unknown>)
      : {};
  const state = String(sd.state ?? "").trim();
  const town = String(sd.town ?? "").trim();
  const type = String(sd.type ?? "").trim();
  const color = String(sd.color ?? "").trim();
  const dimensions = String(sd.dimensions ?? "").trim();
  const manuscript = String(sd.manuscript ?? "").trim();
  const rarity = String(sd.rarity ?? "").trim();
  const title = [town, state].filter(Boolean).join(", ") || `Submission #${contribution.id}`;
  const displayName = [title, type].filter((x) => x && String(x).trim().toLowerCase() !== "unknown").join(" — ") || title;
  const baseImageUrl = import.meta.env.VITE_IMAGE_URL ?? "";
  const imageMetasRaw = (sd.image_metas ?? sd.imageMetas) as SubmittedData["image_metas"] | undefined;
  const imageMetaSingle = sd.image_meta as SubmittedData["image_meta"] | undefined;
  const imageMetaList: Array<{ imageUrl: string; originalFilename?: string }> = [];
  if (imageMetasRaw && Array.isArray(imageMetasRaw) && imageMetasRaw.length > 0) {
    for (const meta of imageMetasRaw) {
      if (meta && typeof meta === "object") {
        const sf = meta.storage_filename ?? meta.storageFilename;
        if (sf && baseImageUrl) {
          imageMetaList.push({
            imageUrl: normalizeImageUrl(`${baseImageUrl.replace(/\/+$/, "")}/postmarks/${sf}`),
            originalFilename: meta.original_filename ?? meta.originalFilename,
          });
        }
      }
    }
  }
  if (imageMetaList.length === 0 && imageMetaSingle) {
    const sf = imageMetaSingle.storage_filename ?? imageMetaSingle.storageFilename;
    if (sf && baseImageUrl) {
      imageMetaList.push({
        imageUrl: normalizeImageUrl(`${baseImageUrl.replace(/\/+$/, "")}/postmarks/${sf}`),
        originalFilename: imageMetaSingle.original_filename ?? imageMetaSingle.originalFilename,
      });
    }
  }
  const images = imageMetaList;

  const isPending = contribution.status === "pending";
  const canReview = isStateEditor && isPending;
  const postmarkId =
    contribution.postmark_id ?? contribution.postmark ?? (contribution as unknown as Record<string, unknown>).postmarkId ?? null;
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
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" onClick={handleBack} className="-ml-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
            <div className="flex items-center gap-2">
              <Badge variant={isPending ? "secondary" : contribution.status === "approved" ? "default" : "destructive"}>
                {contribution.status}
              </Badge>
              {postmarkId != null && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/record/${postmarkId}`, { state: { fromDashboard: true } })}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View record
                </Button>
              )}
            </div>
          </div>

          {/* Main Content — same layout as RecordDetail */}
          <div className="grid items-start lg:grid-cols-2 gap-8 mb-8">
            {/* Image(s) carousel — same as RecordDetail */}
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

            {/* Metadata — same structure as RecordDetail */}
            <div className="space-y-6">
              <div>
                <h1 className="font-heading text-3xl font-bold text-foreground mb-2">{displayName}</h1>
                <div className="flex flex-wrap gap-2">
                  {hasValue(type) ? <Badge variant="secondary">{type}</Badge> : null}
                  {hasValue(color) ? <Badge variant="secondary">{color}</Badge> : null}
                  {hasValue(rarity) ? <Badge variant="outline">{rarity}</Badge> : null}
                </div>
              </div>

              {/* Single Submitted data card — all contributor data in one place */}
              <Card className="shadow-archival-md border-primary/10">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Submitted data</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Data from the contributor for review. Use this to approve, reject, or request revision.
                  </p>
                </CardHeader>
                <CardContent>
                  {Object.keys(sd).length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No submitted data returned for this contribution. If you expect to see it, the record may have been created before this field was stored, or there may be an API issue.
                    </p>
                  ) : (
                    <dl className="space-y-0 text-sm">
                      {Object.entries(sd)
                        .filter(([k]) => {
                          if (k === "image_meta") return false;
                          if (k === "image_metas" || k === "imageMetas") return false;
                          return true;
                        })
                        .map(([key, val]) => {
                          const label = key
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase())
                            .replace(/Id\b/, "") // "Lettering Style Id" -> "Lettering Style"
                            .replace(/\s+/g, " ")
                            .trim();
                          let display: React.ReactNode = val == null ? "—" : String(val);
                          if (key === "image_meta" && val != null && typeof val === "object") {
                            const meta = val as { storage_filename?: string; original_filename?: string };
                            display = (
                              <span className="text-muted-foreground">
                                {meta.original_filename ?? meta.storage_filename ?? "—"}
                              </span>
                            );
                          } else if (key === "lettering_style_id" || key === "letteringStyleId") {
                            const numVal = typeof val === "number" ? val : typeof val === "string" ? parseInt(val, 10) : NaN;
                            if (!Number.isNaN(numVal)) {
                              const opt = letteringOptions.find((o) => o.id === numVal);
                              display = opt ? opt.name : String(val);
                            }
                          } else if (key === "framing_style_id" || key === "framingStyleId") {
                            const numVal = typeof val === "number" ? val : typeof val === "string" ? parseInt(val, 10) : NaN;
                            if (!Number.isNaN(numVal)) {
                              const opt = framingOptions.find((o) => o.id === numVal);
                              display = opt ? opt.name : String(val);
                            }
                          } else if (key === "date_format_id" || key === "dateFormatId") {
                            const numVal = typeof val === "number" ? val : typeof val === "string" ? parseInt(val, 10) : NaN;
                            if (!Number.isNaN(numVal)) {
                              const opt = dateFormatOptions.find((o) => o.id === numVal);
                              display = opt ? opt.name : String(val);
                            }
                          } else if (typeof val === "object" && val !== null) {
                            display = JSON.stringify(val);
                          }
                          return (
                            <div
                              key={key}
                              className="flex justify-between py-2 border-b border-border last:border-0 gap-4"
                            >
                              <dt className="text-muted-foreground font-medium shrink-0">{label}</dt>
                              <dd className="text-foreground break-all text-right">{display}</dd>
                            </div>
                          );
                        })}
                    </dl>
                  )}
                </CardContent>
              </Card>

              {/* Editor feedback — show outcome (approved/rejected/revision) and comment so contributor knows the result */}
              {(contribution.status !== "pending" || (contribution.review_notes && contribution.review_notes.trim())) ? (
                <Card className="shadow-archival-md border-amber-500/20 bg-amber-500/5">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-amber-600" />
                      Editor feedback
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {contribution.status === "approved"
                        ? "Your submission was approved and added to the catalog."
                        : contribution.status === "rejected"
                          ? "Your submission was not accepted. See the comment below for details."
                          : contribution.status === "needs_revision"
                            ? "The editor requested changes. Please update and resubmit or submit a new postmark."
                            : "The reviewer left a comment for you. Use this feedback to improve your submission or add a new postmark if requested."}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {contribution.status !== "pending" && (
                      <p className="text-sm font-medium text-foreground">
                        Outcome:{" "}
                        <Badge variant={contribution.status === "approved" ? "default" : contribution.status === "rejected" ? "destructive" : "secondary"}>
                          {contribution.status === "approved" ? "Approved" : contribution.status === "rejected" ? "Rejected" : "Needs revision"}
                        </Badge>
                      </p>
                    )}
                    {contribution.review_notes?.trim() ? (
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                        {contribution.review_notes.trim()}
                      </p>
                    ) : null}
                    {isContributor &&
                      (contribution.status === "rejected" || contribution.status === "needs_revision") && (
                      <div className="pt-3">
                        <Button
                          type="button"
                          onClick={handleEditAndResubmit}
                          variant="default"
                          className="gap-2"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Edit and resubmit
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>

          {/* Editor: only Value and Comment (lettering/framing/date format come from contributor) */}
          {canReview && (
            <Card className="shadow-archival-lg border-primary/20">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Review this submission</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Add value and a comment, then choose Approve, Reject, or Request revision.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="contribution-value">Value (of this postmark) <span className="text-destructive">*</span></Label>
                  <Input
                    id="contribution-value"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="e.g. 25.00"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contribution-comment">Comment (required) <span className="text-destructive">*</span></Label>
                  <Textarea
                    id="contribution-comment"
                    placeholder="Add a comment for the contributor (required for approve, reject, or revision)."
                    rows={4}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    disabled={submitting}
                    className="resize-none"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    onClick={() => submitDecision("approve")}
                    disabled={
                      submitting ||
                      !comment.trim() ||
                      value.trim() === "" ||
                      Number.isNaN(parseFloat(value)) ||
                      parseFloat(value) < 0
                    }
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    {submitting ? "Submitting..." : "Approve"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => submitDecision("reject")}
                    disabled={submitting || !comment.trim()}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => submitDecision("revision")}
                    disabled={submitting || !comment.trim()}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Request revision
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isPending && !isStateEditor && (
            <p className="text-sm text-muted-foreground">This submission is pending review by an editor.</p>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ContributionDetail;
