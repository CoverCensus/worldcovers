import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CatalogEntryDetailView, type CatalogEntry } from "@/components/CatalogEntryDetailView";

const SubmissionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submission, setSubmission] = useState<CatalogEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchSubmission = async () => {
      try {
        const { data, error } = await supabase
          .from("submissions")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw error;
        if (!data) {
          setSubmission(null);
          return;
        }

        setSubmission({
          name: data.name,
          town: data.town,
          state: data.state,
          date_range: data.date_range,
          type: data.type,
          color: data.color,
          image_url: data.image_url,
          description: data.description ?? undefined,
          citation_references: data.citation_references ?? undefined,
          dimensions: data.dimensions ?? undefined,
          manuscript: data.manuscript ?? undefined,
          rarity: data.rarity ?? undefined,
          status: data.status,
          submitter_name: data.submitter_name ?? undefined,
          created_at: data.created_at,
          reviewed_at: data.reviewed_at ?? undefined,
        });
      } catch (err: unknown) {
        toast({
          title: "Error loading submission",
          description: err instanceof Error ? err.message : "Could not load submission",
          variant: "destructive",
        });
        setSubmission(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSubmission();
  }, [id, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex items-center justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-muted-foreground">Loading submission...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex flex-col items-center justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-muted-foreground mb-4">Submission not found.</p>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
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
        <CatalogEntryDetailView
          entry={submission}
          backLabel="Back to Dashboard"
          onBack={() => navigate("/dashboard")}
          detailsCardTitle="Submission Details"
        />
      </div>

      <Footer />
    </div>
  );
};

export default SubmissionDetail;
