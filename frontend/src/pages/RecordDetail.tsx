import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, MessageSquare, Pencil } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { formatCatalogDate } from "@/lib/catalogRecordDisplay";
import {
  formatPostmarkDimensionsDisplay,
  getAuxmarkById,
  getPostmarkById,
  getRatemarkById,
  normalizeImageUrl,
} from "@/services/postmarks";
import { useAuth } from "@/hooks/useAuth";
import type { AuthUser } from "@/lib/auth";

type GalleryImage = {
  imageUrl: string | null;
  originalFilename?: string;
  category: "Postmark" | "Ratemark" | "Auxmark";
};

type RecordState = {
  id: number;
  name: string;
  postmarkKey: string;
  state: string;
  town: string;
  earliestUse: string;
  latestUse: string;
  datesObserved: string[];
  color: string;
  shape: string;
  dimensions: string;
  manuscript: string;
  isIrregular: string;
  impression: string;
  dateType: string;
  dateFmt: string;
  rateValue: string;
  inscriptionText: string;
  description: string;
  sourceCatalog: string;
  editorComment: string;
  images: GalleryImage[];
};

function parseOtherCharacteristics(raw: string | null | undefined) {
  const out = { description: "", editorComment: "" };
  if (!raw) return out;
  const lines = String(raw).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const descriptionLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("Description:")) descriptionLines.push(line.slice("Description:".length).trim());
    else if (line.startsWith("Comment:")) {
      const c = line.slice("Comment:".length).trim();
      if (c) out.editorComment = out.editorComment ? `${out.editorComment}\n${c}` : c;
    } else if (!line.startsWith("Submitted by:") && !line.startsWith("Citation references:")) {
      descriptionLines.push(line);
    }
  }
  out.description = descriptionLines.join("\n").trim();
  return out;
}

function shouldShowEditorCommentOnRecord(params: {
  user: AuthUser | null;
  editorComment: string;
  sourceCatalog: string;
}): boolean {
  if (!params.editorComment.trim()) return false;
  if (!params.user) return false;
  const isEditor =
    params.user.role === "editor" || params.user.role === "administrator" || params.user.is_superuser;
  if (isEditor) return true;
  return /user\s*contribution/i.test(params.sourceCatalog || "");
}

function hasDisplayValue(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return s !== "" && s !== "—" && s.toLowerCase() !== "unknown";
}

const RecordDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuth();
  const { id } = useParams();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<RecordState | null>(null);

  const selectedType = String(location.state?.markingRow?.type ?? "Townmark").trim();
  console.log(selectedType)
  const searchParams = new URLSearchParams(location.search);
  const queryMarkingId = Number(searchParams.get("markingId") ?? NaN);
  const selectedMarkingId =
    typeof location.state?.markingRow?.markingId === "number"
      ? location.state?.markingRow?.markingId
      : Number.isFinite(queryMarkingId)
      ? queryMarkingId
      : undefined;
  const postmarkId = id ? parseInt(String(id).replace(/^api-/, ""), 10) : null;

  useEffect(() => {
    if (postmarkId == null || Number.isNaN(postmarkId)) {
      setError("Invalid record ID");
      setLoading(false);
      return;
    }
    let cancelled = false;
    const typeNormalized = selectedType.trim().toLowerCase();
    const fetcher =
      typeNormalized === "ratemark" && selectedMarkingId != null
        ? () => getRatemarkById(selectedMarkingId)
        : typeNormalized === "auxmark" && selectedMarkingId != null
        ? () => getAuxmarkById(selectedMarkingId)
        : () => getPostmarkById(postmarkId);

    fetcher()
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setError("Record not found");
          return;
        }
        const parseDate = (row: any) => {
          const iso = String(row?.date ?? "");
          if (!iso) return "";
          const granularity = String(row?.granularity ?? "").toUpperCase();
          const sliced =
            granularity === "YEAR" ? iso.slice(0, 4) : granularity === "MONTH" ? iso.slice(0, 7) : iso.slice(0, 10);
          return formatCatalogDate(sliced);
        };

        const parsed = parseOtherCharacteristics(data.otherCharacteristics ?? data.other_characteristics);
        const images: GalleryImage[] = Array.isArray(data.images)
          ? data.images.map((img: any) => ({
              imageUrl: normalizeImageUrl(img.image_url ?? img.imageUrl ?? null),
              originalFilename: img.original_filename ?? img.originalFilename,
              category:
                typeNormalized === "ratemark"
                  ? "Ratemark"
                  : typeNormalized === "auxmark"
                  ? "Auxmark"
                  : "Postmark",
            }))
          : [];

        setRecord({
          id: data.postmark_id ?? data.postmarkId ?? data.id ?? selectedMarkingId ?? postmarkId,
          name: String(data.postmark_key ?? data.postmarkKey ?? data.code ?? "Record"),
          postmarkKey: String(data.postmark_key ?? data.postmarkKey ?? data.code ?? "").trim(),
          state: String(data.state ?? "").trim(),
          town: String(data.town ?? "").trim(),
          earliestUse: String(data.earliest_use ?? data.earliestUse ?? "").trim(),
          latestUse: String(data.latest_use ?? data.latestUse ?? "").trim(),
          datesObserved: Array.isArray(data.dates_observed ?? data.datesObserved)
            ? (data.dates_observed ?? data.datesObserved).map(parseDate).filter(Boolean)
            : [],
          color: String(
            data.colors_display ??
              data.colorsDisplay ??
              data.colorName ??
              data?.color?.name ??
              data?.color?.color_name ??
              ""
          ).trim(),
          shape: String(data.shape_name ?? data.shapeName ?? data?.shape?.name ?? data?.shapeName ?? "").trim(),
          dimensions:
            String(data.size_display ?? data.sizeDisplay ?? "").trim() ||
            formatPostmarkDimensionsDisplay(data.sizes),
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
          rateValue: String(data.rate_value ?? data.rateValue ?? data.rateVal ?? "").trim(),
          inscriptionText: String(data.inscription_txt ?? data.inscriptionTxt ?? "").trim(),
          description: parsed.description,
          sourceCatalog: String(data.source_catalog ?? data.sourceCatalog ?? "").trim(),
          editorComment: parsed.editorComment,
          images,
        });
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
  }, [postmarkId, selectedType, selectedMarkingId]);

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  const fromDashboard = location.state?.fromDashboard;
  const handleBack = () => {
    if (fromDashboard) {
      navigate("/dashboard");
    } else {
      navigate(-1);
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

  if (error || !record) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">{error || "Record not found"}</p>
          <Button variant="outline" onClick={handleBack}>Back</Button>
        </div>
        <Footer />
      </div>
    );
  }

  const showEditorComment = shouldShowEditorCommentOnRecord({
    user,
    editorComment: record.editorComment,
    sourceCatalog: record.sourceCatalog,
  });

  const common = [
    { label: "Type", value: selectedType || "Townmark" },
    { label: "Manuscript", value: record.manuscript },
    { label: "Dimensions", value: record.dimensions },
    { label: "Color", value: record.color },
    { label: "Date Type", value: record.dateType },
    { label: "Date Format", value: record.dateFmt },
    { label: "Dates observed", value: record.datesObserved.join("\n") },
    { label: "Inscription", value: record.inscriptionText },
    { label: "Catalog key", value: record.postmarkKey },
  ];
  const townmark = [
    { label: "Town", value: record.town },
    { label: "State", value: record.state },
    { label: "Shape", value: record.shape },
    { label: "Impression", value: record.impression },
    { label: "Is Irregular", value: record.isIrregular },
    { label: "Earliest Seen", value: record.earliestUse },
    { label: "Latest Seen", value: record.latestUse },
  ];
  const rateAux = [
    { label: "Shape", value: record.shape },
    { label: "Impression", value: record.impression },
    { label: "Is Irregular", value: record.isIrregular },
  ];
  const details =
    selectedType.toLowerCase() === "townmark"
      ? [...common, ...townmark]
      : selectedType.toLowerCase() === "ratemark"
      ? [...common, { label: "Rate Value", value: record.rateValue }, ...rateAux]
      : [...common, ...rateAux];
  const visibleDetails = details.filter((row) => hasDisplayValue(row.value));

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 flex items-center justify-between">
            <Button variant="ghost" onClick={handleBack} className="-ml-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            {user ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(`/edit/${record.id}?mode=suggestion`, {
                    state: {
                      fromSearch: location.state?.fromSearch,
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

          <div className="grid items-start lg:grid-cols-2 gap-8">
            <Card className="shadow-archival-lg">
              <CardContent className="p-6">
                <Carousel setApi={setApi} className="w-full">
                  <CarouselContent>
                    {(record.images.length ? record.images : [{ imageUrl: imageNotAvailable, category: "Postmark" as const }]).map((img, index) => (
                      <CarouselItem key={index}>
                        <div className="relative flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                          <img src={img.imageUrl || imageNotAvailable} alt={img.originalFilename || `Image ${index + 1}`} className="w-full h-full object-contain" />
                          <Badge className="absolute top-2 left-2" variant="secondary">{img.category}</Badge>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  {record.images.length > 1 && (<><CarouselPrevious className="left-2" /><CarouselNext className="right-2" /></>)}
                </Carousel>
                {record.images.length > 1 && (
                  <div className="flex justify-center gap-2 mt-4">
                    {record.images.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => api?.scrollTo(index)}
                        className={`h-2 rounded-full transition-all ${index === current ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"}`}
                        aria-label={`Go to image ${index + 1}`}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="shadow-archival-md">
                <CardHeader><CardTitle className="font-heading text-lg">Record Details</CardTitle></CardHeader>
                <CardContent>
                  <dl className="space-y-0 text-sm">
                    {visibleDetails.map((row, idx) => (
                      <div key={row.label} className={`flex justify-between py-2 ${idx < visibleDetails.length - 1 ? "border-b border-border" : ""}`}>
                        <dt className="text-muted-foreground font-medium">{row.label}</dt>
                        <dd className="text-foreground whitespace-pre-line text-right">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>

              <Card className="shadow-archival-md">
                <CardHeader><CardTitle className="font-heading text-lg">Associated Thumbnails</CardTitle></CardHeader>
                <CardContent>
                  {record.images.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No approved images linked to this marking.</p>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {record.images.map((img, idx) => (
                        <img
                          key={`${img.originalFilename ?? "img"}-${idx}`}
                          src={img.imageUrl || imageNotAvailable}
                          alt={img.originalFilename || `Thumbnail ${idx + 1}`}
                          className="h-16 w-16 rounded border border-border object-cover shrink-0"
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {record.description.trim() && (
                <Card className="shadow-archival-md">
                  <CardHeader><CardTitle className="font-heading text-lg">Description</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{record.description}</p>
                  </CardContent>
                </Card>
              )}

              {showEditorComment && (
                <Card className="shadow-archival-md border-amber-500/20 bg-amber-500/5">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-amber-600" />
                      Editor feedback
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{record.editorComment}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default RecordDetail;
