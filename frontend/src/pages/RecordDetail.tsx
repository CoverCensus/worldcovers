import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Loader2, MessageSquare, Pencil } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { formatCatalogDate, markingTypeLabel } from "@/lib/catalogRecordDisplay";
import {
  getMarkingById,
  getMarkingCovers,
  normalizeImageUrl,
  type AssociatedCover,
  type AssociatedCoverDate,
  type MarkingImage,
  type MarkingRecord,
  type MarkingTypeValue,
} from "@/services/markings";
import { useAuth } from "@/hooks/useAuth";
import type { AuthUser } from "@/lib/auth";

type GalleryImage = {
  imageUrl: string | null;
  originalFilename?: string;
  category: string;
};

const EMPTY = "-";

function dimensionsDisplay(record: MarkingRecord): string {
  if (record.sizeDisplay && record.sizeDisplay.trim()) {
    return record.sizeDisplay.trim().includes("mm")
      ? record.sizeDisplay.trim()
      : `${record.sizeDisplay.trim()} mm`;
  }
  const w = record.width?.trim() ?? "";
  const h = record.height?.trim() ?? "";
  if (w && h) return `${w}x${h} mm`;
  if (w) return `${w} mm`;
  if (h) return `${h} mm`;
  return "";
}

function coverDimensionsDisplay(width: string | null, height: string | null): string {
  const w = (width ?? "").trim();
  const h = (height ?? "").trim();
  if (w && h) return `${w}x${h} mm`;
  if (w) return `${w} mm`;
  if (h) return `${h} mm`;
  return EMPTY;
}

function coverTypeLabel(t: string | null): string {
  if (t === "FC") return "Folded Cover";
  if (t === "FL") return "Folded Letter";
  return EMPTY;
}

function formatCoverDate(d: AssociatedCoverDate): string {
  const iso = (d.date || "").slice(0, 10);
  return formatCatalogDate(iso) || iso;
}

function yearOnly(value: string | null | undefined): string {
  const s = value != null ? String(value).trim() : "";
  if (!s) return "";
  const m = /^(\d{4})/.exec(s);
  return m ? m[1] : s;
}

function formatRateValue(cents: string | null | undefined): string {
  if (cents == null || String(cents).trim() === "") return "";
  const n = parseFloat(String(cents));
  if (!Number.isFinite(n)) return "";
  return (n / 100).toFixed(2);
}

function inscriptionLabel(type: MarkingTypeValue): string {
  if (type === "RATEMARK") return "Ratemark Text";
  if (type === "AUXMARK") return "Auxiliary/Instructional Text";
  return "Townmark Text";
}

function shouldShowEditorComment(params: {
  user: AuthUser | null;
  editorComment: string;
}): boolean {
  if (!params.editorComment.trim()) return false;
  if (!params.user) return false;
  return (
    params.user.role === "editor" ||
    params.user.role === "administrator" ||
    params.user.is_superuser === true
  );
}

function hasDisplayValue(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return s !== "" && s !== "-" && s.toLowerCase() !== "unknown";
}

function buildGalleryImages(record: MarkingRecord): GalleryImage[] {
  const typeLabel = markingTypeLabel(record.type) || "Marking";
  return record.images.map((img: MarkingImage) => ({
    imageUrl: normalizeImageUrl(img.imageUrl),
    originalFilename: img.originalFilename || undefined,
    category: typeLabel,
  }));
}

function DetailRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last: boolean;
}) {
  return (
    <div
      className={`flex justify-between py-2 ${last ? "" : "border-b border-border"}`}
    >
      <dt className="text-muted-foreground font-medium">{label}</dt>
      <dd className="text-foreground whitespace-pre-line text-right">{value}</dd>
    </div>
  );
}

function AssociatedCoverEntry({
  cover,
  isFirst,
}: {
  cover: AssociatedCover;
  isFirst: boolean;
}) {
  const c = cover.coverDetails;
  const datesText =
    c && c.coverDates.length > 0
      ? c.coverDates.map(formatCoverDate).filter(Boolean).join("\n")
      : EMPTY;
  const colorText = c?.colorName?.trim() ?? "";
  const allRows: { label: string; value: string; show: boolean }[] = [
    { label: "Catalog key", value: c?.code?.trim() || EMPTY, show: true },
    { label: "Color", value: colorText, show: colorText.length > 0 },
    { label: "Type", value: coverTypeLabel(c?.type ?? null), show: true },
    {
      label: "Dimensions",
      value: coverDimensionsDisplay(c?.width ?? null, c?.height ?? null),
      show: true,
    },
    { label: "Dates", value: datesText, show: true },
    { label: "Has adhesive", value: "Yes", show: c?.hasAdhesive === true },
    { label: "Institutionally Owned", value: "Yes", show: c?.isInstitutional === true },
    { label: "Backstamp", value: "Yes", show: cover.isBackstamp === true },
  ];
  const rows = allRows.filter((r) => r.show);
  return (
    <div className={isFirst ? "" : "border-t-2 border-primary/40 pt-6 mt-6"}>
      <dl className="text-sm">
        {rows.map((r, i) => (
          <DetailRow
            key={r.label}
            label={r.label}
            value={r.value}
            last={i === rows.length - 1}
          />
        ))}
      </dl>
    </div>
  );
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
  const [record, setRecord] = useState<MarkingRecord | null>(null);
  const [associatedCovers, setAssociatedCovers] = useState<AssociatedCover[]>([]);
  const [coversOpen, setCoversOpen] = useState(true);

  const markingId = id ? parseInt(String(id).replace(/^api-/, ""), 10) : null;

  useEffect(() => {
    if (markingId == null || Number.isNaN(markingId)) {
      setError("Invalid record ID");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMarkingById(markingId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setError("Record not found");
          return;
        }
        setRecord(data);
        setError(null);
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
  }, [markingId]);

  useEffect(() => {
    if (markingId == null || Number.isNaN(markingId)) {
      setAssociatedCovers([]);
      return;
    }
    let cancelled = false;
    getMarkingCovers(markingId).then((rows) => {
      if (cancelled) return;
      setAssociatedCovers(rows);
      setCoversOpen(rows.length > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [markingId]);

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

  const editorComment = record.desc?.trim() ?? "";
  const showEditorComment = shouldShowEditorComment({ user, editorComment });
  const galleryImages = buildGalleryImages(record);
  const typeLabel = markingTypeLabel(record.type) || "Townmark";

  const goEdit = () =>
    navigate(`/edit/${record.id}?mode=suggestion`, {
      state: {
        fromSearch: location.state?.fromSearch,
        fromDashboard,
        fromDashboardViaDetail: !!fromDashboard,
        mode: "suggestion",
      },
    });

  const dimensionsValue = dimensionsDisplay(record) || EMPTY;
  const earliestValue = yearOnly(record.earliestSeen);
  const latestValue = yearOnly(record.latestSeen);
  const impressionValue =
    record.impression && record.impression.trim().toLowerCase() !== "normal"
      ? record.impression
      : "";
  const isIrregValue = record.isIrreg === true ? "Yes" : "";
  const isStaff =
    !!user &&
    (user.role === "editor" ||
      user.role === "administrator" ||
      user.is_superuser === true);

  const common = [
    { label: "Type", value: typeLabel, alwaysShow: false },
    { label: "Manuscript", value: record.isManuscript ? "Yes" : "No", alwaysShow: false },
    { label: "Dimensions", value: dimensionsValue, alwaysShow: true },
    { label: "Color", value: record.colorName, alwaysShow: false },
    { label: "Date Format", value: record.dateFmt, alwaysShow: false },
    { label: inscriptionLabel(record.type), value: record.inscriptionTxt, alwaysShow: false },
    ...(isStaff
      ? [{ label: "Catalog text", value: record.catalogTxt, alwaysShow: false }]
      : []),
    { label: "Catalog code", value: record.code, alwaysShow: false },
    { label: "Earliest Seen", value: earliestValue, alwaysShow: false },
    { label: "Latest Seen", value: latestValue, alwaysShow: false },
  ];
  const townmark = [
    { label: "Town", value: record.town, alwaysShow: false },
    { label: "State", value: record.state, alwaysShow: false },
    { label: "Shape", value: record.shapeName, alwaysShow: false },
    { label: "Lettering", value: record.letteringName, alwaysShow: false },
    { label: "Impression", value: impressionValue, alwaysShow: false },
    { label: "Is Irregular", value: isIrregValue, alwaysShow: false },
  ];
  const rateAux = [
    { label: "Shape", value: record.shapeName, alwaysShow: false },
    { label: "Lettering", value: record.letteringName, alwaysShow: false },
    { label: "Impression", value: impressionValue, alwaysShow: false },
    { label: "Is Irregular", value: isIrregValue, alwaysShow: false },
  ];
  const details =
    record.type === "TOWNMARK"
      ? [...common, ...townmark]
      : record.type === "RATEMARK"
        ? [...common, { label: "Rate Value", value: formatRateValue(record.rateVal), alwaysShow: false }, ...rateAux]
        : [...common, ...rateAux];
  const visibleDetails = details.filter(
    (row) => row.alwaysShow || hasDisplayValue(row.value),
  );

  const coverCount = associatedCovers.length;

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <Button variant="ghost" onClick={handleBack} className="-ml-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>

          <div className="grid items-start lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <Card className="shadow-archival-lg">
                <CardContent className="p-6">
                  <Carousel setApi={setApi} className="w-full">
                    <CarouselContent>
                      {(galleryImages.length ? galleryImages : [{ imageUrl: imageNotAvailable, category: typeLabel }]).map((img, index) => {
                        const src = img.imageUrl || imageNotAvailable;
                        const alt = img.originalFilename || `Image ${index + 1}`;
                        const inner = (
                          <div className="relative flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                            <img src={src} alt={alt} className="w-full h-full object-contain" />
                            <Badge className="absolute top-2 left-2" variant="secondary">{img.category}</Badge>
                          </div>
                        );
                        return (
                          <CarouselItem key={index}>
                            {img.imageUrl ? (
                              <a
                                href={img.imageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${alt} in new tab`}
                                className="block"
                              >
                                {inner}
                              </a>
                            ) : (
                              inner
                            )}
                          </CarouselItem>
                        );
                      })}
                    </CarouselContent>
                    {galleryImages.length > 1 && (<><CarouselPrevious className="left-2" /><CarouselNext className="right-2" /></>)}
                  </Carousel>
                  {galleryImages.length > 1 && (
                    <div className="flex justify-center gap-2 mt-4">
                      {galleryImages.map((_, index) => (
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

              <Card className="shadow-archival-md">
                <CardHeader><CardTitle className="font-heading text-lg">Associated Thumbnails</CardTitle></CardHeader>
                <CardContent>
                  {galleryImages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No approved images linked to this marking.</p>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {galleryImages.map((img, idx) => (
                        <button
                          key={`${img.originalFilename ?? "img"}-${idx}`}
                          type="button"
                          onClick={() => api?.scrollTo(idx)}
                          aria-label={`Show image ${idx + 1}`}
                          className={`h-16 w-16 rounded border overflow-hidden shrink-0 transition-all ${idx === current ? "border-primary ring-2 ring-primary" : "border-border"}`}
                        >
                          <img
                            src={img.imageUrl || imageNotAvailable}
                            alt={img.originalFilename || `Thumbnail ${idx + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="shadow-archival-md">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="font-heading text-lg">Record Details</CardTitle>
                    <Button variant="outline" size="sm" onClick={goEdit}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Submit Edit
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-0 text-sm">
                    {visibleDetails.map((row, idx) => (
                      <DetailRow
                        key={row.label}
                        label={row.label}
                        value={String(row.value || EMPTY)}
                        last={idx === visibleDetails.length - 1}
                      />
                    ))}
                  </dl>
                </CardContent>
              </Card>

              <Card className="shadow-archival-md">
                {coverCount === 0 ? (
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="font-heading text-lg">
                        Associated Covers (0)
                      </CardTitle>
                      <Button variant="outline" size="sm" onClick={goEdit}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Submit Edit
                      </Button>
                    </div>
                  </CardHeader>
                ) : (
                  <Collapsible open={coversOpen} onOpenChange={setCoversOpen}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CollapsibleTrigger className="flex items-center gap-2 text-left cursor-pointer">
                          <CardTitle className="font-heading text-lg">
                            Associated Covers ({coverCount})
                          </CardTitle>
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform ${coversOpen ? "rotate-180" : ""}`}
                          />
                        </CollapsibleTrigger>
                        <Button variant="outline" size="sm" onClick={goEdit}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Submit Edit
                        </Button>
                      </div>
                    </CardHeader>
                    <CollapsibleContent>
                      <CardContent>
                        {associatedCovers.map((cover, idx) => (
                          <AssociatedCoverEntry
                            key={cover.id}
                            cover={cover}
                            isFirst={idx === 0}
                          />
                        ))}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </Card>

              {record.desc.trim() && (
                <Card className="shadow-archival-md">
                  <CardHeader><CardTitle className="font-heading text-lg">Description</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{record.desc}</p>
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
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{editorComment}</p>
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
