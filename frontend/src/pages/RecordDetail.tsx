import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, ArrowLeft, Loader2, Pencil, MessageSquare, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { SubmitImageDialog } from "@/components/SubmitImageDialog";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import {
  getPostmarkById,
  normalizeImageUrl,
  formatPostmarkDimensionsDisplay,
  getPostmarkRatemarks,
  getPostmarkAuxmarks,
  getPostmarkCovers,
  type AssociatedRatemark,
  type AssociatedAuxmark,
  type AssociatedCover,
} from "@/services/postmarks";
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
  const isEditor = !!params.user && (params.user.role === "state_editor" || params.user.is_superuser);
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

function AssociatedRatemarksCard({ items }: { items: AssociatedRatemark[] }) {
  const entries: (AssociatedRatemark | null)[] = items.length === 0 ? [null] : items;
  const [open, setOpen] = useState(items.length > 0);
  return (
    <Card className="shadow-archival-md">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            <CollapsibleTrigger className="flex w-full items-baseline justify-between gap-3 cursor-pointer">
              <span>Associated Ratemarks</span>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{items.length}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
              </span>
            </CollapsibleTrigger>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 && (
            <p className="text-sm italic text-muted-foreground">No ratemarks recorded.</p>
          )}
          <CollapsibleContent>
            <div className="space-y-0">
              {entries.map((item, idx) => {
            const rm = item?.ratemarkDetails ?? null;
            const rows: { label: string; value: string }[] = [
              { label: "Catalog key", value: displayField(rm?.code) },
              { label: "Inscription", value: displayField(rm?.inscriptionTxt) },
              { label: "Rate value", value: displayField(rm?.rateVal) },
              { label: "Placement", value: displayField(item?.placementType) },
              { label: "Shape", value: displayField(rm?.shapeName) },
              { label: "Lettering", value: displayField(rm?.letteringName) },
              { label: "Impression", value: displayField(rm?.impression) },
              { label: "Color", value: displayField(rm?.colorName) },
              { label: "Dimensions", value: displayDimensions(rm?.width, rm?.height) },
              { label: "Manuscript", value: rm?.isManuscript != null ? displayBool(rm.isManuscript) : "—" },
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
                {item != null && (
                  <div className="flex justify-between py-2 text-sm border-t border-border">
                    <span className="text-muted-foreground font-medium">Associated auxmarks</span>
                    <span className="text-primary cursor-pointer underline-offset-2 hover:underline">
                      {item.auxmarkCount ?? 0}
                    </span>
                  </div>
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

function AssociatedAuxmarksCard({ items }: { items: AssociatedAuxmark[] }) {
  const entries: (AssociatedAuxmark | null)[] = items.length === 0 ? [null] : items;
  const [open, setOpen] = useState(items.length > 0);
  return (
    <Card className="shadow-archival-md">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            <CollapsibleTrigger className="flex w-full items-baseline justify-between gap-3 cursor-pointer">
              <span>Associated Auxmarks</span>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{items.length}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
              </span>
            </CollapsibleTrigger>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 && (
            <p className="text-sm italic text-muted-foreground">No auxmarks recorded.</p>
          )}
          <CollapsibleContent>
            <div className="space-y-0">
              {entries.map((item, idx) => {
                const rows: { label: string; value: string }[] = [
                  { label: "Catalog key", value: displayField(item?.code) },
                  { label: "Inscription", value: displayField(item?.inscriptionTxt) },
                  { label: "Shape", value: displayField(item?.shapeName) },
                  { label: "Lettering", value: displayField(item?.letteringName) },
                  { label: "Impression", value: displayField(item?.impression) },
                  { label: "Color", value: displayField(item?.colorName) },
                  { label: "Dimensions", value: displayDimensions(item?.width, item?.height) },
                  { label: "Manuscript", value: item?.isManuscript != null ? displayBool(item.isManuscript) : "—" },
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
  const [count, setCount] = useState(0);
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
  const [associatedRatemarks, setAssociatedRatemarks] = useState<AssociatedRatemark[]>([]);
  const [associatedAuxmarks, setAssociatedAuxmarks] = useState<AssociatedAuxmark[]>([]);
  const [associatedCovers, setAssociatedCovers] = useState<AssociatedCover[]>([]);

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
          const postmarkKey = data.postmark_key ?? data.postmarkKey ?? "";
          const town = data.town ?? "";
          const state = data.state ?? "";
          const earliestUse = data.earliest_use ?? data.earliestUse ?? "";
          const latestUse = data.latest_use ?? data.latestUse ?? "";
          const shapeNameForTitle =
            (data.shape_name ?? data.shapeName ?? "").trim() ||
            fromNested(data, ["postmark_shape", "shape_name"]) ||
            fromNested(data, ["postmarkShape", "shapeName"]) ||
            fromNested(data, ["shape", "name"]);
          const townState = [town, state].filter(Boolean).join(", ");
          const catalogTxt = (data.catalog_txt ?? data.catalogTxt ?? "").trim();
          const displayName =
            catalogTxt ||
            townState ||
            postmarkKey ||
            "—";
          const baseImageUrl = import.meta.env.VITE_IMAGE_URL ?? "";
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
                      (baseImageUrl
                        ? `${baseImageUrl.replace(/\/+$/, "")}/postmarks/${img.storage_filename ?? img.storageFilename ?? ""}`
                        : null),
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
                  if (granularity === "YEAR") return iso.slice(0, 4);
                  if (granularity === "MONTH") return iso.slice(0, 7);
                  return iso.slice(0, 10);
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

  // Associated items (ratemarks / auxmarks / covers) are fetched in parallel and
  // swallow errors per-section so they never block the main record render.
  useEffect(() => {
    if (postmarkId == null || isNaN(postmarkId)) return;
    let cancelled = false;
    setAssociatedRatemarks([]);
    setAssociatedAuxmarks([]);
    setAssociatedCovers([]);
    Promise.all([
      getPostmarkRatemarks(postmarkId),
      getPostmarkAuxmarks(postmarkId),
      getPostmarkCovers(postmarkId),
    ]).then(([ratemarks, auxmarks, covers]) => {
      if (cancelled) return;
      setAssociatedRatemarks(ratemarks);
      setAssociatedAuxmarks(auxmarks);
      setAssociatedCovers(covers);
    });
    return () => {
      cancelled = true;
    };
  }, [postmarkId]);

  // Carousel pagination
  useEffect(() => {
    if (!api) return;

    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap());

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
    });

    return () => {
      api.off("select", () => {
        setCurrent(api.selectedScrollSnap());
      });
    };
  }, [api]);

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

                {/* <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Download className="mr-2 h-4 w-4" />
                    Download Image
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => setSubmitImageOpen(true)}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Image
                  </Button>
                </div> */}
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
                      const displayValue = (v: unknown) => {
                        const s = v != null ? String(v).trim() : "";
                        return s !== "" && s.toLowerCase() !== "unknown" ? s : "-";
                      };
                      const details = [
                        { label: "Town", value: record.town },
                        { label: "State", value: record.state },
                        { label: "Manuscript", value: record.manuscript },
                        { label: "Impression", value: record.impression },
                        { label: "Date Type", value: record.dateType },
                        { label: "Date Format", value: record.dateFmt },
                        { label: "Shape", value: record.shape },
                        { label: "Is Irregular", value: record.isIrregular },
                        { label: "Lettering style", value: record.letteringStyle },
                        { label: "Framing", value: record.framing },
                        { label: "Dimensions", value: record.dimensions },
                        { label: "Color", value: record.color },
                        { label: "Dates observed", value: (record.datesObserved ?? []).join("\n") },
                        { label: "Inscription text", value: record.inscriptionText },
                        { label: "Catalog key", value: record.postmarkKey },
                      ];
                      return details.map(({ label, value }, index) => (
                        <div
                          key={label}
                          className={`flex justify-between py-2 ${index < details.length - 1 ? "border-b border-border" : ""}`}
                        >
                          <dt className="text-muted-foreground font-medium">{label}</dt>
                          <dd className="text-foreground whitespace-pre-line text-right">{displayValue(value)}</dd>
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

              <AssociatedRatemarksCard items={associatedRatemarks} />
              <AssociatedAuxmarksCard items={associatedAuxmarks} />
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
