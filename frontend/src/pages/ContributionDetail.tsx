import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, CheckCircle, XCircle, MessageSquare, ExternalLink } from "lucide-react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { normalizeImageUrl } from "@/services/postmarks";

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : null;
}

/** Parse date_range (e.g. "1920", "1920-1925") into first/last seen for Record-style display */
function parseDateRange(dateRange: string): { firstSeen: string; lastSeen: string } {
  const s = (dateRange || "").trim();
  if (!s) return { firstSeen: "", lastSeen: "" };
  const dash = s.indexOf("-");
  if (dash > 0) {
    const a = s.slice(0, dash).trim();
    const b = s.slice(dash + 1).trim();
    const yearA = (a.match(/\d{4}/) || [])[0] || "";
    const yearB = (b.match(/\d{4}/) || [])[0] || "";
    return { firstSeen: yearA || a, lastSeen: yearB || b };
  }
  const year = (s.match(/\d{4}/) || [])[0] || s;
  return { firstSeen: year, lastSeen: year };
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
  };
  /** Contributor-provided; used when editor approves (editor only fills value + comment). */
  lettering_style_id?: number;
  framing_style_id?: number;
  date_format_id?: number;
}

interface Contribution {
  id: number;
  status: string;
  contributor_username: string;
  review_notes: string | null;
  created_at: string;
  submitted_data: SubmittedData;
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

  // Editor form state (only Value and Comment; lettering/framing/date format come from contributor's submitted_data)
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Contributor-provided IDs, set from submitted_data when contribution loads (used when approving)
  const [letteringId, setLetteringId] = useState("");
  const [framingId, setFramingId] = useState("");
  const [dateFormatId, setDateFormatId] = useState("");

  const fromDashboard = location.state?.fromDashboard === true;
  const isStateEditor = user?.role === "state_editor" || user?.is_superuser;

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
      .then((data: Contribution) => {
        if (!cancelled) setContribution(data);
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

  // Pre-fill lettering/framing/date_format from contributor's submitted_data (used when approving)
  useEffect(() => {
    if (!contribution?.submitted_data) return;
    const sd = contribution.submitted_data;
    if (sd.lettering_style_id != null) setLetteringId(String(sd.lettering_style_id));
    if (sd.framing_style_id != null) setFramingId(String(sd.framing_style_id));
    if (sd.date_format_id != null) setDateFormatId(String(sd.date_format_id));
  }, [contribution]);

  const submitDecision = async (kind: "approve" | "reject" | "revision") => {
    if (!contribution || !comment.trim()) return;
    if (kind === "approve") {
      const letteringNum = letteringId ? Number(letteringId) : NaN;
      const framingNum = framingId ? Number(framingId) : NaN;
      const dateFormatNum = dateFormatId ? Number(dateFormatId) : NaN;
      const valueNum = value.trim() === "" ? NaN : parseFloat(value);
      if (!Number.isInteger(letteringNum) || !Number.isInteger(framingNum) || !Number.isInteger(dateFormatNum) || Number.isNaN(valueNum) || valueNum < 0) {
        toast({
          title: "Missing required fields",
          description: "Value is required to approve. Lettering style, Framing style, and Date format must have been provided by the contributor.",
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
      body.lettering_style_id = Number(letteringId);
      body.framing_style_id = Number(framingId);
      body.date_format_id = Number(dateFormatId);
      body.estimated_value = parseFloat(value);
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
  const dateRange = String(sd.date_range ?? "").trim();
  const { firstSeen, lastSeen } = parseDateRange(dateRange);
  const type = String(sd.type ?? "").trim();
  const color = String(sd.color ?? "").trim();
  const dimensions = String(sd.dimensions ?? "").trim();
  const manuscript = String(sd.manuscript ?? "").trim();
  const rarity = String(sd.rarity ?? "").trim();
  const references = String(sd.references ?? "").trim();
  const title = [town, state].filter(Boolean).join(", ") || `Submission #${contribution.id}`;
  const displayName = [title, type].filter((x) => x && String(x).trim().toLowerCase() !== "unknown").join(" — ") || title;
  const baseImageUrl = import.meta.env.VITE_IMAGE_URL ?? "";
  const imageMeta = sd.image_meta as SubmittedData["image_meta"] | undefined;
  const imageUrl =
    imageMeta?.storage_filename && baseImageUrl
      ? normalizeImageUrl(`${baseImageUrl.replace(/\/+$/, "")}/postmarks/${imageMeta.storage_filename}`)
      : null;

  const isPending = contribution.status === "pending";
  const canReview = isStateEditor && isPending;
  const postmarkId = contribution.postmark_id ?? contribution.postmark ?? null;
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
            {/* Image — same card style as RecordDetail */}
            <Card className="shadow-archival-lg">
              <CardContent className="p-6">
                <div className="flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                  <img
                    src={imageUrl || imageNotAvailable}
                    alt={imageMeta?.original_filename || "Submission"}
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  by {contribution.contributor_username} · {contribution.created_at?.slice(0, 10)}
                </p>
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

              <Card className="shadow-archival-md">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Record Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-0 text-sm">
                    {(() => {
                      const details = [
                        { label: "State", value: state },
                        { label: "Town", value: town },
                        { label: "First Seen", value: firstSeen || (dateRange && !lastSeen ? dateRange : "") },
                        { label: "Last Seen", value: lastSeen },
                        { label: "Dimensions", value: dimensions },
                        { label: "Manuscript", value: manuscript },
                        { label: "Rarity", value: rarity },
                      ].filter(({ value }) => hasValue(value));
                      if (details.length === 0) {
                        return (
                          <p className="text-sm text-muted-foreground py-2">No record details available.</p>
                        );
                      }
                      return details.map(({ label, value }, index) => (
                        <div
                          key={label}
                          className={`flex justify-between py-2 ${index < details.length - 1 ? "border-b border-border" : ""}`}
                        >
                          <dt className="text-muted-foreground font-medium">{label}</dt>
                          <dd className="text-foreground">{value}</dd>
                        </div>
                      ));
                    })()}
                  </dl>
                </CardContent>
              </Card>

              {/* Submitted data as received — so editors always see what was submitted even if structured display is empty */}
              <Card className="shadow-archival-md border-primary/10">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Submitted data</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Raw payload from the contributor. Use this to review and approve, reject, or request revision.
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
                        .filter(([k]) => k !== "image_meta" || (sd.image_meta != null && typeof sd.image_meta === "object"))
                        .map(([key, val]) => {
                          let display: React.ReactNode = val == null ? "" : String(val);
                          if (key === "image_meta" && val != null && typeof val === "object") {
                            const meta = val as { storage_filename?: string; original_filename?: string };
                            display = (
                              <span className="text-muted-foreground">
                                {meta.original_filename ?? meta.storage_filename ?? "—"}
                              </span>
                            );
                          }
                          return (
                            <div
                              key={key}
                              className="flex justify-between py-2 border-b border-border last:border-0 gap-4"
                            >
                              <dt className="text-muted-foreground font-medium shrink-0">{key}</dt>
                              <dd className="text-foreground break-all text-right">{display}</dd>
                            </div>
                          );
                        })}
                    </dl>
                  )}
                </CardContent>
              </Card>

              {/* Raw submitted data so editors always see what was submitted */}
              <Card className="shadow-archival-md border-primary/10">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Submitted data</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Payload from the contributor for review. Use this to approve, reject, or request revision.
                  </p>
                </CardHeader>
                <CardContent>
                  {Object.keys(sd).length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No submitted data returned. If you expect data here, the record may have been created before this field was stored, or there may be an API issue.
                    </p>
                  ) : (
                    <dl className="space-y-0 text-sm">
                      {Object.entries(sd).map(([key, val]) => {
                        let display: React.ReactNode = val == null ? "" : String(val);
                        if (key === "image_meta" && val != null && typeof val === "object") {
                          const meta = val as { storage_filename?: string; original_filename?: string };
                          display = meta.original_filename ?? meta.storage_filename ?? "—";
                        }
                        return (
                          <div
                            key={key}
                            className="flex justify-between py-2 border-b border-border last:border-0 gap-4"
                          >
                            <dt className="text-muted-foreground font-medium shrink-0">{key}</dt>
                            <dd className="text-foreground break-all text-right">{display}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-archival-md">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Lettering, framing, date format & value</CardTitle>
                </CardHeader>
                <CardContent>
                  {isPending ? (
                    <p className="text-sm text-muted-foreground py-2">
                      Not set (pending editor review). An editor will add lettering style, framing style, date format, and value when this submission is approved.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">
                      No lettering, framing, date format, value, or comment recorded for this postmark.
                    </p>
                  )}
                </CardContent>
              </Card>

              {String(sd.description ?? "").trim() ? (
                <Card className="shadow-archival-md">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">Description</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {String(sd.description ?? "")}
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>

          {/* Additional Information Tabs — same as RecordDetail */}
          <Card className="shadow-archival-lg">
            <CardContent className="p-6">
              <Tabs defaultValue="physical" className="w-full">
                <TabsList className={`mt-1 grid w-full gap-1 rounded-md bg-muted p-1 ${references ? "grid-cols-3" : "grid-cols-2"}`}>
                  <TabsTrigger value="physical">Physical Characteristics</TabsTrigger>
                  <TabsTrigger value="valuations">Valuations</TabsTrigger>
                  {references ? <TabsTrigger value="citations">Citations</TabsTrigger> : null}
                </TabsList>
                <TabsContent value="physical" className="mt-6">
                  <dl className="space-y-3 text-sm">
                    {hasValue(type) ? (
                      <div className="flex gap-3">
                        <dt className="font-medium text-muted-foreground min-w-[8rem]">Type (shape)</dt>
                        <dd className="text-foreground">{type}</dd>
                      </div>
                    ) : null}
                    {hasValue(color) ? (
                      <div className="flex gap-3">
                        <dt className="font-medium text-muted-foreground min-w-[8rem]">Color</dt>
                        <dd className="text-foreground">{color}</dd>
                      </div>
                    ) : null}
                    {hasValue(dimensions) ? (
                      <div className="flex gap-3">
                        <dt className="font-medium text-muted-foreground min-w-[8rem]">Dimensions</dt>
                        <dd className="text-foreground">{dimensions}</dd>
                      </div>
                    ) : null}
                    {hasValue(manuscript) ? (
                      <div className="flex gap-3">
                        <dt className="font-medium text-muted-foreground min-w-[8rem]">Manuscript</dt>
                        <dd className="text-foreground">{manuscript}</dd>
                      </div>
                    ) : null}
                    {!hasValue(type) && !hasValue(color) && !hasValue(dimensions) && !hasValue(manuscript) ? (
                      <p className="text-muted-foreground py-2">No additional physical characteristics recorded for this postmark.</p>
                    ) : null}
                  </dl>
                </TabsContent>
                <TabsContent value="valuations" className="mt-6">
                  <p className="text-sm text-muted-foreground py-2">
                    No valuations yet. Value will be set by an editor when this submission is approved.
                  </p>
                </TabsContent>
                {references ? (
                  <TabsContent value="citations" className="mt-6">
                    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {references}
                    </div>
                  </TabsContent>
                ) : null}
              </Tabs>
            </CardContent>
          </Card>

          {/* Editor: only Value and Comment (lettering/framing/date format come from contributor) */}
          {canReview && (
            <Card className="shadow-archival-lg border-primary/20">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Review this submission</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Add value and a comment, then choose Approve, Reject, or Request revision. Lettering style, framing style, and date format are taken from the contributor&apos;s submission.
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
                {(!letteringId || !framingId || !dateFormatId) && (
                  <p className="text-sm text-amber-600 dark:text-amber-500">
                    This submission is missing lettering style, framing style, or date format from the contributor. Approve is disabled until the contributor resubmits with those fields.
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    onClick={() => submitDecision("approve")}
                    disabled={
                      submitting ||
                      !comment.trim() ||
                      !letteringId ||
                      !framingId ||
                      !dateFormatId ||
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
                    variant="destructive"
                    onClick={() => submitDecision("reject")}
                    disabled={submitting || !comment.trim()}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                  <Button
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
