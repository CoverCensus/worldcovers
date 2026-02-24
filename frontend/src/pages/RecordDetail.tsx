import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import postmarkSample from "@/assets/postmark-sample.jpg";
import { SubmitImageDialog } from "@/components/SubmitImageDialog";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { getPostmarkById } from "@/services/postmarks";

const RecordDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [submitImageOpen, setSubmitImageOpen] = useState(false);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);
  const [record, setRecord] = useState<{
    id: number;
    name: string;
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
    images: (string | { imageUrl?: string })[];
    valuations?: Array<{ estimatedValue?: string; condition?: string }>;
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
          const firstSize = data.sizes?.[0];
          const firstVal = data.valuations?.[0];
          setRecord({
            id: data.postmarkId,
            name: data.postmarkKey,
            state: data.state || "",
            town: data.town || "",
            dateFirstSeen: datesSeen?.earliestDateSeen?.slice(0, 4) || "",
            dateLastSeen: datesSeen?.latestDateSeen?.slice(0, 4) || "",
            color: data.colorsDisplay || "",
            type: data?.postmarkShape?.shapeName || "",
            dimensions: firstSize ? `${firstSize.width}×${firstSize.height} mm` : "",
            manuscript: data.isManuscript ? "Yes" : "No",
            rarity: firstVal?.estimatedValue ? `$${firstVal.estimatedValue}` : "",
            description: data.otherCharacteristics || data.sourceCatalog || "",
            images: data.images?.length
              ? data.images.map((img) => ({ imageUrl: `${import.meta.env.VITE_IMAGE_URL}${img.storageFilename}`, originalFilename: img.originalFilename }))
              : [],
            valuations: data.valuations?.map((v) => ({
              estimatedValue: v.estimatedValue,
              condition: "Average condition",
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

  if (error || !record) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">{error || "Record not found"}</p>
          <Button variant="outline" onClick={() => (location.state?.fromSearch ? navigate(-1) : navigate("/search"))}>
            Back to Search
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  // const imageSources: string[] = record.images
  //   .map((img) => (typeof img === "string" ? img : (img as { imageUrl?: string }).imageUrl))
  //   .filter((url): url is string => !!url);
  // if (imageSources.length === 0) imageSources.push(postmarkSample);

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      
      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Breadcrumb */}
          <Button
            variant="ghost"
            onClick={() => (location.state?.fromSearch ? navigate(-1) : navigate("/search"))}
            className="mb-6 -ml-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Search
          </Button>

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
                          <img
                            src={img.imageUrl}
                            alt={`${img.originalFilename} - Image ${index + 1}`}
                            className="w-full rounded border border-border object-contain"
                          />
                        </CarouselItem>
                      ))
                    ) : (
                      // <CarouselItem>
                        <div className="flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted text-muted-foreground">
                          No Image
                        </div>
                      // </CarouselItem>
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
                  {record?.type && <Badge variant="secondary">{record?.type}</Badge>}
                  {record?.color && <Badge variant="secondary">{record.color}</Badge>}
                  {record?.rarity && <Badge variant="outline">{record.rarity}</Badge>}
                </div>
              </div>

              <Card className="shadow-archival-md">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Record Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-muted-foreground font-medium">State</dt>
                      <dd className="text-foreground">{record.state}</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-muted-foreground font-medium">Town</dt>
                      <dd className="text-foreground">{record.town}</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-muted-foreground font-medium">First Seen</dt>
                      <dd className="text-foreground">{record.dateFirstSeen}</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-muted-foreground font-medium">Last Seen</dt>
                      <dd className="text-foreground">{record.dateLastSeen}</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-muted-foreground font-medium">Dimensions</dt>
                      <dd className="text-foreground">{record.dimensions}</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-muted-foreground font-medium">Manuscript</dt>
                      <dd className="text-foreground">{record.manuscript}</dd>
                    </div>
                    <div className="flex justify-between py-2">
                      <dt className="text-muted-foreground font-medium">Rarity</dt>
                      <dd className="text-foreground">{record.rarity}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card className="shadow-archival-md">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {record.description}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Additional Information Tabs */}
          <Card className="shadow-archival-lg">
            <CardContent className="p-6">
              <Tabs defaultValue="valuations">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="references">References</TabsTrigger>
                  <TabsTrigger value="valuations">Valuations</TabsTrigger>
                  <TabsTrigger value="citations">Citations</TabsTrigger>
                </TabsList>
                <TabsContent value="references" className="mt-6">
                  <div className="space-y-4">
                    <div className="border-l-4 border-primary pl-4">
                      <p className="text-sm font-medium text-foreground">Skinner-Eno (SE-MA-1825-01)</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Listed in Skinner-Eno catalog of U.S. stampless covers, page 142.
                      </p>
                    </div>
                    <div className="border-l-4 border-primary pl-4">
                      <p className="text-sm font-medium text-foreground">Ashbrook Special Service (1956)</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Documented example sold at auction for $85.
                      </p>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="valuations" className="mt-6">
                  <div className="space-y-4">
                    {(record.valuations && record.valuations.length > 0
                      ? record.valuations
                      : [{ estimatedValue: "", condition: "" }]
                    ).map((v, i) => (
                      <div key={i} className="flex justify-between items-center p-4 bg-muted rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-foreground">On Cover</p>
                          <p className="text-xs text-muted-foreground">{v.condition}</p>
                        </div>
                        <p className="text-lg font-heading font-semibold text-primary">
                          {v.estimatedValue ? `$${v.estimatedValue}` : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="citations" className="mt-6">
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-foreground leading-relaxed">
                      • Kay, John L. and Smith, Chester M. Jr. (1950). "Massachusetts Postal History." 
                      Quarterman Publications, pp. 87-92.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      • Baughman, Urban E. (1975). "Boston Postal Markings to 1850." 
                      American Philatelic Research Library.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      • Chronicle of U.S. Classic Postal Issues, Vol. 48, No. 2 (1996), pp. 45-48.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
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
