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
import { formatCatalogDate, markingTypeLabel } from "@/lib/catalogRecordDisplay";
import {
  getMarkingById,
  normalizeImageUrl,
  type MarkingImage,
  type MarkingRecord,
} from "@/services/markings";
import { useAuth } from "@/hooks/useAuth";
import type { AuthUser } from "@/lib/auth";

type GalleryImage = {
  imageUrl: string | null;
  originalFilename?: string;
  category: string;
};

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

  // Accept either bare numeric ids or the legacy "api-<id>" cardId prefix.
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

  const common = [
    { label: "Type", value: typeLabel },
    { label: "Manuscript", value: record.isManuscript ? "Yes" : "No" },
    { label: "Dimensions", value: dimensionsDisplay(record) },
    { label: "Color", value: record.colorName },
    { label: "Date Format", value: record.dateFmt },
    { label: "Inscription", value: record.inscriptionTxt },
    { label: "Catalog text", value: record.catalogTxt },
    { label: "Catalog code", value: record.code },
  ];
  const townmark = [
    { label: "Town", value: record.town },
    { label: "State", value: record.state },
    { label: "Shape", value: record.shapeName },
    { label: "Lettering", value: record.letteringName },
    { label: "Impression", value: record.impression },
    {
      label: "Is Irregular",
      value: record.isIrreg === true ? "Yes" : record.isIrreg === false ? "No" : "",
    },
    { label: "Earliest Seen", value: formatCatalogDate(record.earliestSeen) },
    { label: "Latest Seen", value: formatCatalogDate(record.latestSeen) },
  ];
  const rateAux = [
    { label: "Shape", value: record.shapeName },
    { label: "Lettering", value: record.letteringName },
    { label: "Impression", value: record.impression },
    {
      label: "Is Irregular",
      value: record.isIrreg === true ? "Yes" : record.isIrreg === false ? "No" : "",
    },
  ];
  const details =
    record.type === "TOWNMARK"
      ? [...common, ...townmark]
      : record.type === "RATEMARK"
        ? [...common, { label: "Rate Value", value: record.rateVal ?? "" }, ...rateAux]
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
                    {(galleryImages.length ? galleryImages : [{ imageUrl: imageNotAvailable, category: typeLabel }]).map((img, index) => (
                      <CarouselItem key={index}>
                        <div className="relative flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                          <img src={img.imageUrl || imageNotAvailable} alt={img.originalFilename || `Image ${index + 1}`} className="w-full h-full object-contain" />
                          <Badge className="absolute top-2 left-2" variant="secondary">{img.category}</Badge>
                        </div>
                      </CarouselItem>
                    ))}
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

            <div className="space-y-6">
              <Card className="shadow-archival-md">
                <CardHeader><CardTitle className="font-heading text-lg">Record Details</CardTitle></CardHeader>
                <CardContent>
                  <dl className="space-y-0 text-sm">
                    {visibleDetails.map((row, idx) => (
                      <div key={row.label} className={`flex justify-between py-2 ${idx < visibleDetails.length - 1 ? "border-b border-border" : ""}`}>
                        <dt className="text-muted-foreground font-medium">{row.label}</dt>
                        <dd className="text-foreground whitespace-pre-line text-right">{String(row.value)}</dd>
                      </div>
                    ))}
                  </dl>
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
