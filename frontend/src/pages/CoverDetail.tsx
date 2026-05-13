import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Loader2,
  Pencil,
  Star,
} from "lucide-react";

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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  getImagesForSubject,
  normalizeImageUrl,
  reorderImages,
  type MarkingImage,
} from "@/services/markings";
import { getCoverById, type CoverDetail, type CoverDateSeenItem } from "@/services/covers";

const EMPTY = "-";

type CoverDetailLocationState = {
  from?: string;
  markingId?: number;
  coverMarkingId?: number;
};

type CoverGalleryImage = {
  imageUrl: string | null;
  originalFilename?: string;
  subjectLabel: string;
  isDefault: boolean;
  isTracing: boolean;
  imageId: number | null;
};

function buildCoverGalleryImages(images: MarkingImage[]): CoverGalleryImage[] {
  return images.map((img) => ({
    imageUrl: normalizeImageUrl(img.imageUrl),
    originalFilename: img.originalFilename || undefined,
    subjectLabel: "Cover",
    isDefault: img.displayOrder === 0,
    isTracing: img.isTracing,
    imageId: img.imageId > 0 ? img.imageId : null,
  }));
}

function coverDimensionsDisplay(
  width: string | null,
  height: string | null,
): string {
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

const CoverDetailPage = () => {
  const { coverId: coverIdParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as CoverDetailLocationState | undefined;
  const user = useAuth();
  const { toast } = useToast();

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

  const isStaff =
    !!user &&
    (user.role === "editor" ||
      user.role === "administrator" ||
      user.is_superuser === true);

  const handleBack = () => {
    if (state?.from) {
      navigate(state.from);
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
      const [detail, imgs] = await Promise.all([
        getCoverById(coverPk),
        getImagesForSubject({ subjectType: "COVER", subjectId: coverPk }),
      ]);
      if (cancelled) return;
      if (!detail) {
        setCover(null);
        setImages([]);
        setError("Cover not found");
        setLoading(false);
        return;
      }
      setCover(detail);
      setImages(imgs);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [coverPk]);

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
    const markingId = state?.markingId;
    const coverMarkingId = state?.coverMarkingId;
    if (markingId == null || coverMarkingId == null) return;
    if (!requireAuth()) return;
    navigate(`/record/${markingId}/cover/${coverMarkingId}`, {
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
  const markingId = state?.markingId;
  const coverMarkingId = state?.coverMarkingId;
  const canEditFromRecord =
    user != null &&
    markingId != null &&
    coverMarkingId != null;

  const datesText =
    cover.datesSeen.length > 0
      ? cover.datesSeen.map(formatCoverDate).filter(Boolean).join("\n")
      : EMPTY;
  const colorText = cover.colorName.trim();

  const detailRows: { label: string; value: string; show: boolean }[] = [
    { label: "Catalog key", value: cover.code?.trim() || EMPTY, show: true },
    { label: "Color", value: colorText, show: colorText.length > 0 },
    { label: "Type", value: coverTypeLabel(cover.type), show: true },
    {
      label: "Dimensions",
      value: coverDimensionsDisplay(cover.width, cover.height),
      show: coverDimensionsDisplay(cover.width, cover.height) !== EMPTY,
    },
    { label: "Dates", value: datesText, show: true },
    { label: "Has adhesive", value: "Yes", show: cover.hasAdhesive === true },
    {
      label: "Institutionally Owned",
      value: "Yes",
      show: cover.isInstitutional === true,
    },
  ];
  const visibleRows = detailRows.filter((r) => r.show);

  const titleCode = cover.code?.trim() || `Cover #${cover.id}`;

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={handleBack} className="-ml-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            {canEditFromRecord && (
              <Button
                variant="outline"
                size="sm"
                onClick={openEditCover}
                aria-label="Edit this cover"
                className="inline-flex shrink-0 gap-1.5"
              >
                <Pencil className="h-4 w-4 shrink-0" />
                Edit
              </Button>
            )}
          </div>

          <div className="grid items-start lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <Card className="shadow-archival-lg">
                <CardContent className="p-6">
                  <Carousel setApi={setApi} className="w-full">
                    <CarouselContent>
                      {(galleryImages.length
                        ? galleryImages
                        : [
                            {
                              imageUrl: imageNotAvailable,
                              subjectLabel: "Cover",
                              isDefault: false,
                              isTracing: false,
                              imageId: null,
                            } satisfies CoverGalleryImage,
                          ]
                      ).map((img, index) => {
                        const src = img.imageUrl || imageNotAvailable;
                        const alt =
                          img.originalFilename || `Image ${index + 1}`;
                        const isPlaceholder = !img.imageUrl;
                        const inner = (
                          <div className="relative flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                            <img
                              src={src}
                              alt={alt}
                              className="w-full h-full object-contain"
                            />
                            <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1">
                              <Badge variant="secondary">{img.subjectLabel}</Badge>
                              {!isPlaceholder && img.isTracing && (
                                <Badge variant="secondary">Tracing</Badge>
                              )}
                            </div>
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
                    {galleryImages.length > 1 && (
                      <>
                        <CarouselPrevious className="left-2" />
                        <CarouselNext className="right-2" />
                      </>
                    )}
                  </Carousel>
                  {galleryImages.length > 1 && (
                    <div className="flex justify-center gap-2 mt-4">
                      {galleryImages.map((_, index) => (
                        <button
                          key={index}
                          type="button"
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
                <CardHeader>
                  <CardTitle className="font-heading text-lg">
                    Associated Thumbnails
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {galleryImages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No images linked to this cover yet.
                    </p>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {galleryImages.map((img, idx) => {
                        const canReorder =
                          isStaff && img.imageId != null && galleryImages.length > 1;
                        return (
                          <div
                            key={`${img.imageId ?? img.originalFilename ?? "img"}-${idx}`}
                            className="flex flex-col items-center gap-1 shrink-0"
                          >
                            <button
                              type="button"
                              onClick={() => api?.scrollTo(idx)}
                              aria-label={`Show image ${idx + 1}`}
                              className={`relative h-16 w-16 rounded border overflow-hidden transition-all ${idx === current ? "border-primary ring-2 ring-primary" : "border-border"}`}
                            >
                              <img
                                src={img.imageUrl || imageNotAvailable}
                                alt={
                                  img.originalFilename || `Thumbnail ${idx + 1}`
                                }
                                className="h-full w-full object-cover"
                              />
                            </button>
                            {canReorder && (
                              <div className="flex items-center gap-0.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  aria-label="Move thumbnail left"
                                  disabled={reorderingImages || idx === 0}
                                  onClick={() => moveImageBy(idx, -1)}
                                >
                                  <ArrowUp className="h-3 w-3 -rotate-90" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  aria-label="Move thumbnail right"
                                  disabled={
                                    reorderingImages ||
                                    idx === galleryImages.length - 1
                                  }
                                  onClick={() => moveImageBy(idx, 1)}
                                >
                                  <ArrowDown className="h-3 w-3 -rotate-90" />
                                </Button>
                                <Button
                                  type="button"
                                  variant={img.isDefault ? "secondary" : "ghost"}
                                  size="icon"
                                  className="h-6 w-6"
                                  aria-label="Set as default catalog thumbnail"
                                  title={
                                    img.isDefault
                                      ? "Default catalog thumbnail"
                                      : "Set as default catalog thumbnail"
                                  }
                                  disabled={reorderingImages || img.isDefault}
                                  onClick={() => setImageAsDefault(idx)}
                                >
                                  <Star
                                    className={`h-3 w-3 ${img.isDefault ? "fill-current" : ""}`}
                                  />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="shadow-archival-md">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">{titleCode}</CardTitle>
                  {markingId != null && (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-primary justify-start"
                      onClick={() =>
                        navigate(`/record/${markingId}`)
                      }
                    >
                      Open parent marking record
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <dl className="space-y-0 text-sm">
                    {visibleRows.map((row, idx) => (
                      <DetailRow
                        key={row.label}
                        label={row.label}
                        value={row.value}
                        last={idx === visibleRows.length - 1}
                      />
                    ))}
                  </dl>
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

export default CoverDetailPage;
