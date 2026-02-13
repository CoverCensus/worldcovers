import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useNavigate, useParams } from "react-router-dom";
import { fetchPostmarkById, getApiBaseUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CatalogEntryDetailView, type CatalogEntry } from "@/components/CatalogEntryDetailView";
import { ExternalLink } from "lucide-react";

function postmarkDetailToEntry(d: {
  facilityName?: string;
  facility_name?: string;
  postmarkKey?: string;
  postmark_key?: string;
  shapeName?: string;
  shape_name?: string;
  state?: string;
  town?: string;
  dateRange?: string;
  date_range?: string;
  colorsDisplay?: string;
  colors_display?: string;
  valuationDisplay?: string;
  valuation_display?: string;
  mainImage?: { imageUrl?: string | null; image_url?: string | null } | null;
  main_image?: { imageUrl?: string | null; image_url?: string | null } | null;
  images?: Array<{ imageUrl?: string | null; image_url?: string | null }>;
}): CatalogEntry {
  const name = d.facilityName ?? d.facility_name ?? d.postmarkKey ?? d.postmark_key ?? "";
  const town = d.town ?? "";
  const state = d.state ?? "";
  const dateRange = d.dateRange ?? d.date_range ?? "";
  const type = d.shapeName ?? d.shape_name ?? "";
  const color = d.colorsDisplay ?? d.colors_display ?? "";
  const valuation = d.valuationDisplay ?? d.valuation_display ?? undefined;
  const mainImg = d.mainImage ?? d.main_image;
  const imageUrl = mainImg?.imageUrl ?? mainImg?.image_url ?? (Array.isArray(d.images) && d.images[0] ? (d.images[0].imageUrl ?? d.images[0].image_url) : null) ?? null;
  return {
    name,
    town,
    state,
    date_range: dateRange,
    type,
    color,
    image_url: imageUrl,
    valuation: valuation ?? undefined,
  };
}

const RecordDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const isAdmin = useIsAdmin();
  const [entry, setEntry] = useState<CatalogEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setEntry(null);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchPostmarkById(id);
        if (data) {
          setEntry(postmarkDetailToEntry(data));
        } else {
          setEntry(null);
        }
      } catch {
        setEntry(null);
        toast({
          title: "Error loading record",
          description: "Could not load postmark from API",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, toast]);

  const adminEditUrl = id && isAdmin ? `${getApiBaseUrl().replace(/\/api\/?$/, "")}/admin/common/postmark/${id}/change/` : null;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex items-center justify-center max-w-7xl mx-auto px-4 py-8">
          <p className="text-muted-foreground">Loading record...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!id || !entry) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex items-center justify-center max-w-7xl mx-auto px-4 py-8">
          <p className="text-muted-foreground">Record not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/search")}>
            Back to Search
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
          {adminEditUrl && (
            <Card className="mb-6 border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Admin: Edit in Django
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" asChild>
                  <a href={adminEditUrl} target="_blank" rel="noopener noreferrer">
                    Open in Django Admin
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}
          <CatalogEntryDetailView
            entry={entry}
            backLabel="Back to Search"
            onBack={() => navigate("/search")}
            detailsCardTitle="Record Details"
          />
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default RecordDetail;
