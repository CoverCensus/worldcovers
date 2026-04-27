import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Pencil, MessageSquare, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { SubmitImageDialog } from "@/components/SubmitImageDialog";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import {
  getPostmarkById,
  getPostmarkChangelog,
  restorePostmarkVersion,
  normalizeImageUrl,
  formatPostmarkDimensionsDisplay,
  getPostmarkCovers,
  type AssociatedCover,
  type PostmarkVersionRow,
} from "@/services/postmarks";
import { formatCatalogDate } from "@/lib/catalogRecordDisplay";
import { useAuth } from "@/hooks/useAuth";
import type { AuthUser } from "@/lib/auth";

function parseOtherCharacteristics(raw: string | null | undefined) {
  const result = {
    submitterName: "",
    description: "",
    citationReferences: "",
    /** Editor feedback stored as `Comment:` in other_characteristics (e.g. on approve). */
    editorComment: "",
  };

  if (!raw) return result;

  const lines = String(raw).split(/\r?\n/);
  const extraDescriptionLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("Submitted by:")) {
      result.submitterName = trimmed.slice("Submitted by:".length).trim();
    } else if (trimmed.startsWith("Description:")) {
      result.description = trimmed.slice("Description:".length).trim();
    } else if (trimmed.startsWith("Citation references:")) {
      result.citationReferences = trimmed
        .slice("Citation references:".length)
        .trim();
    } else if (trimmed.startsWith("Comment:")) {
      const commentText = trimmed.slice("Comment:".length).trim();
      if (commentText) {
        result.editorComment = result.editorComment
          ? `${result.editorComment}\n${commentText}`
          : commentText;
      }
    } else {
      extraDescriptionLines.push(trimmed);
    }
  }

  const extra = extraDescriptionLines.join("\n");
  result.description = [result.description, extra].filter(Boolean).join("\n");

  return result;
}

/** Who may see editor `Comment:` on the record page (hidden from anonymous visitors). */
function shouldShowEditorCommentOnRecord(params: {
  user: AuthUser | null;
  editorComment: string;
  sourceCatalog: string;
}): boolean {
  const text = params.editorComment.trim();
  if (!text) return false;
  const isUserContribution = /user\s*contribution/i.test((params.sourceCatalog || "").trim());
  const isEditor =
    !!params.user &&
    (params.user.role === "editor" ||
      params.user.role === "administrator" ||
      params.user.is_superuser);
  if (isEditor) return true;
  if (!params.user) return false;
  if (isUserContribution) return true;
  return false;
}

type GalleryImage = {
  imageUrl: string | null;
  originalFilename?: string;
  category: "Postmark" | "Ratemark" | "Auxmark";
  description?: string;
};

function displayField(v: unknown): string {
  const s = v == null ? "" : String(v).trim();
  return s !== "" && s.toLowerCase() !== "unknown" ? s : "—";
}

function displayDimensions(width: unknown, height: unknown): string {
  const fmt = (n: unknown) => {
    if (n == null || n === "") return null;
    const num = typeof n === "number" ? n : parseFloat(String(n));
    if (!Number.isFinite(num) || num <= 0) return null;
    return num.toFixed(2).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  };
  const w = fmt(width);
  const h = fmt(height);
  if (w && h) return `${w} × ${h} mm`;
  if (w) return `${w} mm`;
  if (h) return `${h} mm`;
  return "—";
}

function displayBool(v: unknown): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex justify-between py-2 ${last ? "" : "border-b border-border"}`}>
      <dt className="text-muted-foreground font-medium">{label}</dt>
      <dd className="text-foreground whitespace-pre-line text-right">{value}</dd>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatSnapshotMm(width: unknown, height: unknown): string {
  const fmt = (n: unknown) => {
    if (n == null || n === "") return null;
    const num = typeof n === "number" ? n : parseFloat(String(n));
    if (!Number.isFinite(num) || num <= 0) return null;
    return num.toFixed(2).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  };
  const w = fmt(width);
  const h = fmt(height);
  if (w && h) return `${w} x ${h} mm`;
  if (w) return `${w} mm`;
  if (h) return `${h} mm`;
  return "—";
}

function AssociatedCoversCard({ items }: { items: AssociatedCover[] }) {
  const entries: (AssociatedCover | null)[] = items.length === 0 ? [null] : items;
  const [open, setOpen] = useState(items.length > 0);
  return (
    <Card className="shadow-archival-md">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            <CollapsibleTrigger className="flex w-full items-baseline justify-between gap-3 cursor-pointer">
              <span>Associated Covers</span>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{items.length}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
              </span>
            </CollapsibleTrigger>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 && (
            <p className="text-sm italic text-muted-foreground">No covers recorded.</p>
          )}
          <CollapsibleContent>
            <div className="space-y-0">
              {entries.map((item, idx) => {
                const c = item?.coverDetails ?? null;
                const attrsAllNull =
                  item == null ||
                  (c != null &&
                    (c.colorName == null || c.colorName === "") &&
                    (c.type == null || c.type === "") &&
                    c.width == null &&
                    c.height == null);
                const rows: { label: string; value: string }[] = [
                  { label: "Catalog key", value: displayField(c?.code) },
                  { label: "Color", value: displayField(c?.colorName) },
                  { label: "Type", value: displayField(c?.type) },
                  { label: "Dimensions", value: displayDimensions(c?.width, c?.height) },
                  { label: "Has adhesive", value: item != null ? displayBool(c?.hasAdhesive) : "—" },
                  { label: "Institutional", value: item != null ? displayBool(c?.isInstitutional) : "—" },
                  { label: "Backstamp", value: item != null ? displayBool(item.isBackstamp) : "—" },
                ];
                return (
                  <div
                    key={item?.id ?? `empty-${idx}`}
                    className={idx > 0 ? "border-t-2 border-primary/40 pt-6 mt-6" : ""}
                  >
                    <dl className="text-sm">
                      {rows.map((r, i) => (
                        <DetailRow key={r.label} label={r.label} value={r.value} last={i === rows.length - 1} />
                      ))}
                    </dl>
                    {attrsAllNull && (
                      <p className="text-xs italic text-muted-foreground mt-2">
                        Cover attributes not yet cataloged from source material.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}

const RecordDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuth();
  const { id } = useParams();
  const [submitImageOpen, setSubmitImageOpen] = useState(false);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [historyApi, setHistoryApi] = useState<CarouselApi>();
  const [historyCurrent, setHistoryCurrent] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [record, setRecord] = useState<{
    id: number;
    name: string;
    postmarkKey: string;
    state: string;
    town: string;
    dateFirstSeen: string;
    dateLastSeen: string;
    datesObserved?: string[];
    color: string;
    shape: any;
    dimensions: string;
    manuscript: string;
    isIrregular?: string;
    impression?: string;
    dateType?: string;
    dateFmt?: string;
    inscriptionText?: string;
    description: string;
    submitterName?: string;
    citationReferences?: string;
    images: GalleryImage[];
    valuations?: Array<{
      estimatedValue?: string;
      condition?: string;
      valuationDate?: string;
      valuedBy?: { username?: string; firstName?: string; lastName?: string };
    }>;
    letteringStyle?: string;
    framing?: string;
    /** From API source_catalog — used to decide if editor Comment is visible to logged-in users */
    sourceCatalog?: string;
    /** Parsed from other_characteristics `Comment:` (editor feedback at approval) */
    editorComment?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [associatedCovers, setAssociatedCovers] = useState<AssociatedCover[]>([]);
  const [versionRows, setVersionRows] = useState<PostmarkVersionRow[]>([]);
  const [restoringVersionNo, setRestoringVersionNo] = useState<number | null>(null);
  const [changelogLoadError, setChangelogLoadError] = useState<string | null>(null);
  const canViewChangelog =
    !!user &&
    (user.role === "editor" || user.role === "administrator" || user.is_superuser);

  // Parse id from URL: "api-1" -> 1 (from Search when using API)
  const postmarkId = id ? parseInt(String(id).replace(/^api-/, ""), 10) : null;
  useEffect(() => {
    if (postmarkId == null || isNaN(postmarkId)) {
     
      navigate('/')
    }

    let cancelled = false;
    getPostmarkById(postmarkId)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          const fromNested = (obj: any, path: string[]): string => {
            let cur = obj;
            for (const key of path) {
              if (cur == null || typeof cur !== "object") return "";
              cur = cur[key];
            }
            return cur != null ? String(cur).trim() : "";
          };
          const parsed = parseOtherCharacteristics(
            data.otherCharacteristics ?? data.other_characteristics,
          );
          const postmarkKey = data.postmark_key ?? data.postmarkKey ?? data.code ?? "";
          const town = data.town ?? "";
          const state = data.state ?? "";
          const regionAbbrev = String(
            data.region_abbrev ?? data.regionAbbrev ?? "",
          ).trim();
          const inscriptionForTitle = String(
            data.inscription_txt ?? data.inscriptionTxt ?? "",
          ).trim();
          const earliestUse = data.earliest_use ?? data.earliestUse ?? "";
          const latestUse = data.latest_use ?? data.latestUse ?? "";
          const shapeNameForTitle =
            (data.shape_name ?? data.shapeName ?? "").trim() ||
            fromNested(data, ["postmark_shape", "shape_name"]) ||
            fromNested(data, ["postmarkShape", "shapeName"]) ||
            fromNested(data, ["shape", "name"]);
          const townTrimmed = String(town).trim();
          let titleLocation = "";
          if (townTrimmed && regionAbbrev) titleLocation = `${townTrimmed}, ${regionAbbrev}`;
          else if (townTrimmed) titleLocation = townTrimmed;
          else if (regionAbbrev) titleLocation = regionAbbrev;
          const inscriptionPart = inscriptionForTitle ? `"${inscriptionForTitle}"` : "";
          let displayName: string;
          if (titleLocation && inscriptionPart) {
            displayName = `${titleLocation} - ${inscriptionPart}`;
          } else if (titleLocation) {
            displayName = titleLocation;
          } else if (inscriptionPart) {
            displayName = inscriptionPart;
          } else {
            displayName = String(postmarkKey).trim() || "-";
          }
          const baseImageUrl = (import.meta.env.VITE_IMAGE_URL ?? "").replace(/\/+$/, "");
          const imageRoot = baseImageUrl || "/media";
          const classifyImage = (description: string): GalleryImage["category"] => {
            const d = description.trim().toLowerCase();
            if (d.startsWith("ratemark")) return "Ratemark";
            if (d.startsWith("auxmark")) return "Auxmark";
            return "Postmark";
          };
          const images =
            data.images?.length
              ? data.images.map((img: any) => ({
                  imageUrl: normalizeImageUrl(
                    img.image_url ??
                      img.imageUrl ??
                      `${imageRoot}/postmarks/${String(img.storage_filename ?? img.storageFilename ?? "").replace(/^\/+/, "")}`,
                  ),
                  originalFilename: img.original_filename ?? img.originalFilename,
                  description: String(img.image_description ?? img.imageDescription ?? "").trim(),
                  category: classifyImage(String(img.image_description ?? img.imageDescription ?? "")),
                }))
              : [];
          const sourceCatalog = String(
            data.source_catalog ?? data.sourceCatalog ?? "",
          ).trim();
          const shapeName = shapeNameForTitle;
          const dimensionsDisplay =
            (data.size_display ?? data.sizeDisplay ?? data.dimensionsDisplay ?? "").trim() ||
            formatPostmarkDimensionsDisplay(data.sizes);
          const letteringStyleName =
            (data.lettering_style_name ?? data.letteringStyleName ?? "").trim() ||
            fromNested(data, ["lettering_style", "lettering_style_name"]) ||
            fromNested(data, ["letteringStyle", "letteringStyleName"]) ||
            fromNested(data, ["lettering", "name"]);
          const framingsArr = Array.isArray(data.framings ?? data.framingStyles)
            ? (data.framings ?? data.framingStyles)
            : [];
          const framingNames = framingsArr
            .map((row: any) => String(row?.name ?? "").trim())
            .filter(Boolean);
          const framingFallback =
            String(data.framing ?? "").trim() ||
            (data.framing_style_name ?? data.framingStyleName ?? "").trim() ||
            fromNested(data, ["framing_style", "framing_style_name"]) ||
            fromNested(data, ["framingStyle", "framingStyleName"]) ||
            fromNested(data, ["framing", "name"]);
          const framingDisplay =
            framingNames.length > 0
              ? framingNames.join("\n")
              : framingFallback;
          const colorDisplay =
            fromNested(data, ["color", "color_name"]) ||
            fromNested(data, ["color", "colorName"]) ||
            fromNested(data, ["color", "name"]) ||
            String(data.colors_display ?? data.colorsDisplay ?? "").trim();
          const rawDatesObserved = data.dates_observed ?? data.datesObserved ?? [];
          const datesObserved = Array.isArray(rawDatesObserved)
            ? rawDatesObserved
                .map((row: any) => {
                  const iso = String(row?.date ?? "");
                  if (!iso) return "";
                  const granularity = String(row?.granularity ?? "").toUpperCase();
                  const sliced =
                    granularity === "YEAR"
                      ? iso.slice(0, 4)
                      : granularity === "MONTH"
                        ? iso.slice(0, 7)
                        : iso.slice(0, 10);
                  return formatCatalogDate(sliced);
                })
                .filter(Boolean)
            : [];
          setRecord({
            id: data.postmark_id ?? data.postmarkId,
            name: displayName,
            postmarkKey,
            state,
            town,
            dateFirstSeen: earliestUse,
            dateLastSeen: latestUse,
            datesObserved,
            color: colorDisplay,
            shape: shapeName,
            dimensions: dimensionsDisplay,
            manuscript: (data.is_manuscript ?? data.isManuscript) ? "Yes" : "No",
            isIrregular:
              (data.is_irreg ?? data.isIrreg) === true
                ? "Yes"
                : (data.is_irreg ?? data.isIrreg) === false
                  ? "No"
                  : "",
            impression: String(data.impression ?? "").trim(),
            dateType: String(data.date_type ?? data.dateType ?? "").trim(),
            dateFmt: String(data.date_fmt ?? data.dateFmt ?? "").trim(),
            letteringStyle: letteringStyleName,
            framing: framingDisplay,
            inscriptionText: String(
              data.inscription_txt ??
                data.inscriptionTxt ??
                data.inscription_text ??
                data.inscriptionText ??
                "",
            ).trim(),
            description: parsed.description || "",
            submitterName: parsed.submitterName || "",
            citationReferences: parsed.citationReferences || "",
            sourceCatalog,
            editorComment: parsed.editorComment || "",
            images,
            valuations: data.valuations?.map((v: any) => ({
              estimatedValue: v.estimatedValue ?? v.estimated_value,
            })),
          });
        } else {
          setError("Record not found");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load record");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postmarkId]);

  useEffect(() => {
    if (postmarkId == null || isNaN(postmarkId)) return;
    let cancelled = false;
    setAssociatedCovers([]);
    getPostmarkCovers(postmarkId).then((covers) => {
      if (cancelled) return;
      setAssociatedCovers(covers);
    });
    return () => {
      cancelled = true;
    };
  }, [postmarkId]);

  useEffect(() => {
    if (!canViewChangelog || postmarkId == null || isNaN(postmarkId)) {
      setVersionRows([]);
      setChangelogLoadError(null);
      return;
    }
    let cancelled = false;
    setChangelogLoadError(null);
    getPostmarkChangelog(postmarkId).then((data) => {
      if (cancelled) return;
      if (!data) {
        setChangelogLoadError("Could not load changelog for this record.");
        return;
      }
      const approvedOnly = Array.isArray(data.approved_versions) ? data.approved_versions : [];
      setVersionRows(approvedOnly);
    });
    return () => {
      cancelled = true;
    };
  }, [canViewChangelog, postmarkId]);

  const handleRestoreVersion = async (versionNo: number) => {
    if (!canViewChangelog || postmarkId == null || isNaN(postmarkId)) return;
    const confirmed = window.confirm(`Restore this record from version ${versionNo}?`);
    if (!confirmed) return;
    setRestoringVersionNo(versionNo);
    const result = await restorePostmarkVersion(postmarkId, versionNo);
    setRestoringVersionNo(null);
    if (!result) {
      window.alert("Could not restore this version. Please try again.");
      return;
    }
    navigate(0);
  };

  // Carousel pagination
  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  useEffect(() => {
    if (!historyApi) return;
    setHistoryCount(historyApi.scrollSnapList().length);
    setHistoryCurrent(historyApi.selectedScrollSnap());
    const onSelect = () => setHistoryCurrent(historyApi.selectedScrollSnap());
    historyApi.on("select", onSelect);
    return () => {
      historyApi.off("select", onSelect);
    };
  }, [historyApi]);

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

  const fromDashboard = location.state?.fromDashboard;
  const fromSearch = location.state?.fromSearch;

  const handleBack = () => {
    if (fromDashboard) {
      navigate("/dashboard");
    } else {
      navigate(-1);
    }
  };

  const showEditorComment =
    record &&
    shouldShowEditorCommentOnRecord({
      user,
      editorComment: record.editorComment ?? "",
      sourceCatalog: record.sourceCatalog ?? "",
    });
  const selectedHistoryVersion = versionRows[historyCurrent] ?? null;
  const latestVersionNo = versionRows.reduce((max, row) => (row.version_no > max ? row.version_no : max), 0);

  if (error || !record) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">{error || "Record not found"}</p>
          <Button variant="outline" onClick={handleBack}>
            {fromDashboard ? "Back to Dashboard" : "Back to Search"}
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      
      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Breadcrumb + conditional edit */}
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" onClick={handleBack} className="-ml-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {fromDashboard ? "Back to Dashboard" : "Back to Search"}
            </Button>
            {/* Logged-in contributors and editors suggest corrections; they go to the review queue (see submitForReview API). */}
            {user ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(`/edit/${record.id}?mode=suggestion`, {
                    state: {
                      fromSearch,
                      fromDashboard,
                      fromDashboardViaDetail: !!fromDashboard,
                      mode: "suggestion",
                    },
                  })
                }
              >
                <Pencil className="mr-2 h-4 w-4" />
                Submit Edit/Addition
              </Button>
            ) : null}
          </div>

          {/* Main Content */}
          <div className="grid items-start lg:grid-cols-2 gap-8 mb-8">
            {/* Image Carousel */}
            <div className="space-y-6">
              <Card className="shadow-archival-lg">
                <CardContent className="p-6">
                  <Carousel setApi={setApi} className="w-full">
                  <CarouselContent>
                    {record?.images?.length ? (
                      record.images.map((img, index) => (
                        <CarouselItem key={index}>
                          <div className="relative flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                            <img
                              src={img.imageUrl || imageNotAvailable}
                              alt={`${img.originalFilename || img.category} - Image ${index + 1}`}
                              className="w-full h-full object-contain"
                            />
                            <Badge className="absolute top-2 left-2" variant="secondary">
                              {img.category}
                            </Badge>
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
                  {
                    record?.images.length > 1 && 
                    <>
                    <CarouselPrevious className="left-2" />
                    <CarouselNext className="right-2" />
                    </>
                  }
                  
                </Carousel>
                
                {/* Pagination Dots */}
                {record?.images?.length > 1 && (
                <div className="flex justify-center gap-2 mt-4 mb-4">
                  {record.images.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => api?.scrollTo(index)}
                      className={`h-2 rounded-full transition-all ${
                        index === current 
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

              {record.valuations?.some((v) => v.estimatedValue != null && String(v.estimatedValue).trim() !== "") ? (
                <Card className="shadow-archival-md">
                  <CardHeader>
                    {(() => {
                      const values = (record.valuations ?? [])
                        .map((v) => String(v?.estimatedValue ?? "").trim())
                        .filter(Boolean);
                      const nums = values
                        .map((s) => parseFloat(s.replace(/[^0-9.]/g, "")))
                        .filter((n) => Number.isFinite(n));
                      const title = "Valuations";
                      if (values.length === 0) return <CardTitle className="font-heading text-lg">{title}</CardTitle>;

                      // If values are numeric, show min–max; otherwise show the first value as-is.
                      const label = (() => {
                        if (nums.length === 0) return values[0];
                        const min = Math.min(...nums);
                        const max = Math.max(...nums);
                        const fmt = (n: number) =>
                          n.toLocaleString(undefined, {
                            minimumFractionDigits: n % 1 === 0 ? 0 : 2,
                            maximumFractionDigits: 2,
                          });
                        return nums.length === 1 || min === max ? `$${fmt(max)}` : `$${fmt(min)}–$${fmt(max)}`;
                      })();

                      const normalized = String(label).trim();
                      const display = normalized.startsWith("$") ? normalized : `$${normalized}`;

                      return (
                        <CardTitle className="font-heading text-lg flex items-baseline justify-between gap-3">
                          <span>{title}</span>
                          <span className="text-primary">{display}</span>
                        </CardTitle>
                      );
                    })()}
                  </CardHeader>
                </Card>
              ) : null}

              {canViewChangelog ? (
                <Card className="shadow-archival-md border-primary/15">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">Change History</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Approved versions only. Swipe entries and restore any previous approved state.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {changelogLoadError ? (
                      <p className="text-sm italic text-muted-foreground">{changelogLoadError}</p>
                    ) : versionRows.length === 0 ? (
                      <p className="text-sm italic text-muted-foreground">
                        No approved history entries yet for this record.
                      </p>
                    ) : (
                      <>
                        <Carousel setApi={setHistoryApi} className="w-full">
                          <CarouselContent>
                            {versionRows.map((version) => {
                              const snapshot = version.snapshot ?? {};
                              const details: { label: string; value: string }[] = [
                                { label: "Town", value: displayField(snapshot.town) },
                                { label: "State", value: displayField(snapshot.state) },
                                { label: "Catalog text", value: displayField(snapshot.catalog_txt) },
                                { label: "Catalog key", value: displayField(snapshot.code) },
                                { label: "Inscription text", value: displayField(snapshot.inscription_txt) },
                                {
                                  label: "Manuscript",
                                  value: snapshot.is_manuscript == null ? "—" : snapshot.is_manuscript ? "Yes" : "No",
                                },
                                { label: "Impression", value: displayField(snapshot.impression) },
                                {
                                  label: "Is irregular",
                                  value: snapshot.is_irreg == null ? "—" : snapshot.is_irreg ? "Yes" : "No",
                                },
                                { label: "Shape ID", value: displayField(snapshot.shape_id) },
                                { label: "Lettering ID", value: displayField(snapshot.lettering_id) },
                                { label: "Color ID", value: displayField(snapshot.color_id) },
                                { label: "Date type", value: displayField(snapshot.date_type) },
                                { label: "Date format", value: displayField(snapshot.date_fmt) },
                                {
                                  label: "Dimensions",
                                  value: formatSnapshotMm(snapshot.width, snapshot.height),
                                },
                                {
                                  label: "Dates observed",
                                  value:
                                    Array.isArray(snapshot.dates_observed) && snapshot.dates_observed.length > 0
                                      ? snapshot.dates_observed.join("\n")
                                      : "—",
                                },
                              ];
                              return (
                                <CarouselItem key={version.version_no}>
                                  <div className="rounded-md border border-border p-4">
                                    <div className="mb-3 flex flex-wrap items-center gap-2">
                                      <Badge variant="secondary">Version {version.version_no}</Badge>
                                      {version.action_label ? <Badge variant="outline">{version.action_label}</Badge> : null}
                                      <span className="text-xs text-muted-foreground">
                                        {formatTimestamp(version.created_at)} by {version.created_by || "system"}
                                      </span>
                                    </div>
                                    <dl className="space-y-0 text-sm">
                                      {details.map((row, idx) => (
                                        <div
                                          key={`${version.version_no}-${row.label}`}
                                          className={`flex justify-between py-2 ${
                                            idx < details.length - 1 ? "border-b border-border" : ""
                                          }`}
                                        >
                                          <dt className="text-muted-foreground font-medium">{row.label}</dt>
                                          <dd className="text-foreground whitespace-pre-line text-right">{row.value}</dd>
                                        </div>
                                      ))}
                                    </dl>
                                  </div>
                                </CarouselItem>
                              );
                            })}
                          </CarouselContent>
                          {versionRows.length > 1 ? (
                            <>
                              <CarouselPrevious className="left-2" />
                              <CarouselNext className="right-2" />
                            </>
                          ) : null}
                        </Carousel>

                        {historyCount > 1 ? (
                          <div className="flex justify-center gap-2">
                            {versionRows.map((v, index) => (
                              <button
                                key={`history-dot-${v.version_no}`}
                                onClick={() => historyApi?.scrollTo(index)}
                                className={`h-2 rounded-full transition-all ${
                                  index === historyCurrent
                                    ? "w-6 bg-primary"
                                    : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                                }`}
                                aria-label={`Go to version ${v.version_no}`}
                              />
                            ))}
                          </div>
                        ) : null}

                        {selectedHistoryVersion && selectedHistoryVersion.version_no !== latestVersionNo ? (
                          <div className="pt-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRestoreVersion(selectedHistoryVersion.version_no)}
                              disabled={restoringVersionNo === selectedHistoryVersion.version_no}
                            >
                              {restoringVersionNo === selectedHistoryVersion.version_no ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : null}
                              Restore version {selectedHistoryVersion.version_no}
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : null}
            </div>

            {/* Metadata */}
            <div className="space-y-6">
              <div>
                <h1 className="font-heading text-3xl font-bold text-foreground mb-2">
                  {record.name}
                </h1>
                
                {/* TODO: future record tags go here — shape/irregular badges removed as redundant with fields below; tagging not yet implemented on backend */}
              </div>

              <Card className="shadow-archival-md">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Record Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-0 text-sm">
                    {(() => {
                      const normalize = (v: unknown) => {
                        const s = v != null ? String(v).trim() : "";
                        if (s === "" || s.toLowerCase() === "unknown") return "";
                        return s;
                      };
                      const details = [
                        { label: "Town", value: record.town },
                        { label: "State", value: record.state },
                        { label: "Type", value: "Townmark" },
                        { label: "Manuscript", value: record.manuscript },
                        { label: "Impression", value: record.impression },
                        { label: "Date Format", value: record.dateFmt },
                        { label: "Shape", value: record.shape },
                        { label: "Is Irregular", value: record.isIrregular },
                        { label: "Lettering style", value: record.letteringStyle },
                        { label: "Dimensions", value: record.dimensions },
                        { label: "Color", value: record.color },
                        { label: "Rate Value", value: "5" },
                        { label: "Rate Text", value: "PAID/V." },
                        { label: "Dates observed", value: (record.datesObserved ?? []).join("\n") },
                        { label: "Townmark Text", value: record.inscriptionText },
                        { label: "Catalog key", value: record.postmarkKey },
                      ]
                        .map(({ label, value }) => ({ label, value: normalize(value) }))
                        .filter(({ value }) => value !== "");
                      return details.map(({ label, value }, index) => (
                        <div
                          key={label}
                          className={`flex justify-between py-2 ${index < details.length - 1 ? "border-b border-border" : ""}`}
                        >
                          <dt className="text-muted-foreground font-medium">{label}</dt>
                          <dd className="text-foreground whitespace-pre-line text-right">{value}</dd>
                        </div>
                      ));
                    })()}
                  </dl>
                </CardContent>
              </Card>

              {record.description?.trim() ? (
                <Card className="shadow-archival-md">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">Description</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {record.description}
                    </p>
                  </CardContent>
                </Card>
              ) : null}

              {showEditorComment && record.editorComment?.trim() ? (
                <Card className="shadow-archival-md border-amber-500/20 bg-amber-500/5">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-amber-600" />
                      Editor feedback
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Notes from the reviewer when this listing was approved. Use this for future submissions.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                      {record.editorComment.trim()}
                    </p>
                  </CardContent>
                </Card>
              ) : null}

              <AssociatedCoversCard items={associatedCovers} />

            </div>
          </div>

          {record.citationReferences ? (
            <Card className="shadow-archival-lg">
              <CardContent className="p-6">
                <div className="space-y-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {record.citationReferences}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Footer />
      
      <SubmitImageDialog 
        open={submitImageOpen} 
        onOpenChange={setSubmitImageOpen}
      />
    </div>
  );
};

export default RecordDetail;
