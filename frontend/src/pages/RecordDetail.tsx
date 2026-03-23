import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, ArrowLeft, Loader2, Pencil, MessageSquare } from "lucide-react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { SubmitImageDialog } from "@/components/SubmitImageDialog";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { getPostmarkById, normalizeImageUrl, formatPostmarkDimensionsDisplay } from "@/services/postmarks";
import { useAuth } from "@/hooks/useAuth";
import type { AuthUser } from "@/lib/auth";

function parseOtherCharacteristics(raw: string | null | undefined) {
  const result = {
    submitterName: "",
    description: "",
    citationReferences: "",
    rarityLabel: "",
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
    } else if (trimmed.startsWith("Rarity:")) {
      result.rarityLabel = trimmed.slice("Rarity:".length).trim();
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
    color: string;
    type: any;
    dimensions: string;
    manuscript: string;
    rarity: string;
    description: string;
    submitterName?: string;
    citationReferences?: string;
    images: (string | { imageUrl?: string })[];
    valuations?: Array<{
      estimatedValue?: string;
      condition?: string;
      valuationDate?: string;
      valuedBy?: { username?: string; firstName?: string; lastName?: string };
    }>;
    /** Physical characteristics from the postmark (shape, lettering, framing, date format) */
    letteringStyle?: string;
    framingStyle?: string;
    dateFormat?: string;
    /** From API source_catalog — used to decide if editor Comment is visible to logged-in users */
    sourceCatalog?: string;
    /** Parsed from other_characteristics `Comment:` (editor feedback at approval) */
    editorComment?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          const datesSeen = data.datesSeen?.[0];
          const parsed = parseOtherCharacteristics(
            data.otherCharacteristics ?? data.other_characteristics,
          );
          const locationLabel = [data.town, data.state].filter(Boolean).join(", ");
          const shapeLabel =
            data?.postmark_shape?.shape_name ?? data?.postmarkShape?.shapeName ?? "";
          const letteringStyle =
            data?.lettering_style?.lettering_style_name ?? data?.letteringStyle?.letteringStyleName ?? "";
          const framingStyle =
            data?.framing_style?.framing_style_name ?? data?.framingStyle?.framingStyleName ?? "";
          const dateFormat =
            data?.date_format?.format_name ?? data?.dateFormat?.formatName ?? "";
          const displayParts = [locationLabel, shapeLabel].filter(
            (x) => x && String(x).trim().toLowerCase() !== "unknown"
          );
          const displayName = displayParts.join(" — ") || data.postmarkKey;
          const baseImageUrl = import.meta.env.VITE_IMAGE_URL ?? "";
          // Rarity in Record Details is the label (Common/Scarce/Rare/Very Rare), not the dollar valuation
          const rarityLabel = (parsed.rarityLabel || "").trim();
          const images =
            data.images?.length
              ? data.images.map((img: any) => ({
                  imageUrl:
                    img.imageUrl ??
                    (baseImageUrl
                      ? `${baseImageUrl.replace(/\/+$/, "")}/postmarks/${img.storageFilename ?? ""}`
                      : null),
                  originalFilename: img.originalFilename,
                }))
              : [];
          const sourceCatalog = String(
            data.source_catalog ?? data.sourceCatalog ?? "",
          ).trim();
          setRecord({
            id: data.postmarkId,
            name: displayName,
            postmarkKey: data.postmarkKey,
            state: data.state || "",
            town: data.town || "",
            dateFirstSeen: datesSeen?.earliestDateSeen?.slice(0, 4) || "",
            dateLastSeen: datesSeen?.latestDateSeen?.slice(0, 4) || "",
            color: data.colorsDisplay || "",
            type: shapeLabel || data?.postmarkShape?.shapeName || "",
            dimensions: formatPostmarkDimensionsDisplay(data.sizes),
            manuscript: data.is_manuscript ?? data.isManuscript ? "Yes" : "No",
            letteringStyle: letteringStyle || undefined,
            framingStyle: framingStyle || undefined,
            dateFormat: dateFormat || undefined,
            rarity: rarityLabel,
            // Only show description text the contributor actually provided
            // Do NOT fall back to raw otherCharacteristics (which may only contain submitter info)
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
    } else if (fromSearch) {
      navigate("/search");
    } else {
      navigate("/search");
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
                Suggest
              </Button>
            ) : null}
          </div>

          {/* Main Content */}
          <div className="grid items-start lg:grid-cols-2 gap-8 mb-8">
            {/* Image Carousel */}
            <Card className="shadow-archival-lg">
              <CardContent className="p-6">
                <Carousel setApi={setApi} className="w-full">
                  <CarouselContent>
                    {record?.images?.length ? (
                      record.images.map((img: any, index) => (
                        <CarouselItem key={index}>
                          <div className="flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                            <img
                              src={normalizeImageUrl(img.imageUrl)}
                              alt={`${img.originalFilename} - Image ${index + 1}`}
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

            {/* Metadata */}
            <div className="space-y-6">
              <div>
                <h1 className="font-heading text-3xl font-bold text-foreground mb-2">
                  {record.name}
                </h1>
                
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const show = (v: string | undefined) => {
                      const s = (v ?? "").trim();
                      return s !== "" && s.toLowerCase() !== "unknown";
                    };
                    return (
                      <>
                        {show(record?.type) ? <Badge variant="secondary">{record.type}</Badge> : null}
                        {show(record?.color) ? <Badge variant="secondary">{record.color}</Badge> : null}
                        {show(record?.rarity) ? <Badge variant="outline">{record.rarity}</Badge> : null}
                      </>
                    );
                  })()}
                </div>
              </div>

              <Card className="shadow-archival-md">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Record Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-0 text-sm">
                    {(() => {
                      const hasValue = (v: unknown) => {
                        const s = v != null ? String(v).trim() : "";
                        return s !== "" && s.toLowerCase() !== "unknown";
                      };
                      const details = [
                        { label: "State", value: record.state },
                        { label: "Town", value: record.town },
                        { label: "First Seen", value: record.dateFirstSeen },
                        { label: "Last Seen", value: record.dateLastSeen },
                        { label: "Dimensions", value: record.dimensions },
                        { label: "Manuscript", value: record.manuscript },
                        { label: "Rarity", value: record.rarity },
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
            </div>
          </div>

          {/* Additional Information Tabs */}
          <Card className="shadow-archival-lg">
            <CardContent className="p-6">
              {(() => {
                const hasValuations = !!record.valuations?.some((v) => v.estimatedValue != null && String(v.estimatedValue).trim() !== "");
                const tabCount = 1 + (hasValuations ? 1 : 0) + (record.citationReferences ? 1 : 0);
                return (
                  <Tabs defaultValue="physical">
                    <TabsList
                      className={`mt-1 w-full gap-1 rounded-md bg-muted p-1 flex flex-wrap justify-start h-auto sm:grid sm:h-10 grid-cols-${tabCount}`}
                      style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
                    >
                      <TabsTrigger value="physical">Physical Characteristics</TabsTrigger>
                      {hasValuations ? (
                        <TabsTrigger value="valuations">Valuations</TabsTrigger>
                      ) : null}
                      {record.citationReferences ? (
                        <TabsTrigger value="citations">Citations</TabsTrigger>
                      ) : null}
                    </TabsList>
                    <TabsContent value="physical" className="mt-6">
                      <dl className="space-y-3 text-sm">
                        {(() => {
                          const hasValue = (v: string | undefined) => {
                            const s = (v ?? "").trim();
                            return s !== "" && s.toLowerCase() !== "unknown";
                          };
                          const showLettering = hasValue(record.letteringStyle);
                          const showFraming = hasValue(record.framingStyle);
                          const showDateFormat = hasValue(record.dateFormat);
                          const none = !showLettering && !showFraming && !showDateFormat;
                          return (
                            <>
                              {showLettering ? (
                                <div className="flex gap-3">
                                  <dt className="font-medium text-muted-foreground min-w-[8rem]">Lettering style</dt>
                                  <dd className="text-foreground">{record.letteringStyle}</dd>
                                </div>
                              ) : null}
                              {showFraming ? (
                                <div className="flex gap-3">
                                  <dt className="font-medium text-muted-foreground min-w-[8rem]">Framing style</dt>
                                  <dd className="text-foreground">{record.framingStyle}</dd>
                                </div>
                              ) : null}
                              {showDateFormat ? (
                                <div className="flex gap-3">
                                  <dt className="font-medium text-muted-foreground min-w-[8rem]">Date format</dt>
                                  <dd className="text-foreground">{record.dateFormat}</dd>
                                </div>
                              ) : null}
                              {none ? (
                                <p className="text-muted-foreground py-2">No physical characteristics recorded for this postmark.</p>
                              ) : null}
                            </>
                          );
                        })()}
                      </dl>
                    </TabsContent>
                    {hasValuations ? (
                      <TabsContent value="valuations" className="mt-6">
                        <div className="space-y-4">
                          {record.valuations
                            ?.filter((v) => v.estimatedValue != null && String(v.estimatedValue).trim() !== "")
                            .map((v, i) => (
                              <div key={i} className="flex justify-between items-center p-4 bg-muted rounded-lg">
                                <p className="text-sm font-medium text-muted-foreground">Valuation</p>
                                <p className="text-lg font-heading font-semibold text-primary">
                                  ${v.estimatedValue}
                                </p>
                              </div>
                            ))}
                        </div>
                      </TabsContent>
                    ) : null}
                {record.citationReferences ? (
                  <TabsContent value="citations" className="mt-6">
                    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {record.citationReferences}
                    </div>
                  </TabsContent>
                ) : null}
                  </Tabs>
                );
              })()}
            </CardContent>
          </Card>
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
