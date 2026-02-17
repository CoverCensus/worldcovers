import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import postmarkSample from "@/assets/postmark-sample.jpg";
import { SubmitImageDialog } from "@/components/SubmitImageDialog";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";

const RecordDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [submitImageOpen, setSubmitImageOpen] = useState(false);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  // Mock data - in production, this would come from API based on id
  const record = {
    id: 1,
    name: "Boston, Mass. - Circular Date Stamp",
    state: "Massachusetts",
    town: "Boston",
    dateFirstSeen: "1825",
    dateLastSeen: "1845",
    color: "Black",
    type: "Circular Date Stamp",
    dimensions: "32mm diameter",
    manuscript: "No",
    rarity: "Common",
    description: "Standard circular date stamp used at the Boston Post Office during the pre-stamp period. Features town name in arc above center date.",
    images: [postmarkSample, postmarkSample, postmarkSample], // Multiple images for carousel
  };

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

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      
      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Breadcrumb */}
          <Button
            variant="ghost"
            onClick={() => navigate('/search')}
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
                    {record.images.map((image, index) => (
                      <CarouselItem key={index}>
                        <img
                          src={image}
                          alt={`${record.name} - Image ${index + 1}`}
                          className="w-full rounded border border-border object-contain"
                        />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="left-2" />
                  <CarouselNext className="right-2" />
                </Carousel>
                
                {/* Pagination Dots */}
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
                  <Badge variant="secondary">{record.type}</Badge>
                  <Badge variant="secondary">{record.color}</Badge>
                  <Badge variant="outline">{record.rarity}</Badge>
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
              <Tabs defaultValue="references">
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
                    <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-foreground">On Cover</p>
                        <p className="text-xs text-muted-foreground">Average condition</p>
                      </div>
                      <p className="text-lg font-heading font-semibold text-primary">$45-$75</p>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-foreground">Strike on Folded Letter</p>
                        <p className="text-xs text-muted-foreground">Clear strike</p>
                      </div>
                      <p className="text-lg font-heading font-semibold text-primary">$25-$40</p>
                    </div>
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
