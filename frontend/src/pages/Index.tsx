import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Search, BookOpen, Users, Database } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import heroImage from "@/assets/hero-cover.jpg";
import { getPostmarksPage } from "@/services/postmarks";
import { getAdministrativeUnits } from "@/services/administrativeUnits";
import { getPostalFacilities } from "@/services/postalFacilities";
import { getPostmarksDateRange } from "@/services/postmarkRange";

type FAQItem = {
  id: string;
  question: string;
  answer: string;
};

const Index = () => {
  const navigate = useNavigate();
  const user = useAuth();
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [isLoadingFaqs, setIsLoadingFaqs] = useState(false);

  useEffect(() => {
    const fetchFaqs = async () => {
      setIsLoadingFaqs(true);
      try {
        const response = await fetch("/api/faq-entries/");
        if (!response.ok) {
          throw new Error(`Failed to load FAQs (${response.status})`);
        }
        const data = await response.json();
        const rawItems = Array.isArray(data) ? data : data?.results || [];
        const items: FAQItem[] = rawItems
          .map((item: any, index: number) => {
            if (!item) return null;
            const question = item.question ?? "";
            const answer = item.answer ?? "";
            if (!question || !answer) return null;
            return {
              id: String(item.faq_entry_id ?? item.id ?? index),
              question,
              answer,
            };
          })
          .filter(Boolean) as FAQItem[];

        setFaqs(items);
      } catch {
        // If FAQ API fails, leave FAQs empty so the section stays hidden
      } finally {
        setIsLoadingFaqs(false);
      }
    };

    void fetchFaqs();
  }, []);

  const [stats, setStats] = useState<{
    postmarks: number | null;
    postmarksCapped: boolean;
    towns: number | null;
    states: number | null;
    earliestYear: number | null;
    latestYear: number | null;
  }>({
    postmarks: null,
    postmarksCapped: false,
    towns: null,
    states: null,
    earliestYear: null,
    latestYear: null,
  });

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      // Fetch all stats in parallel; use allSettled so one failure doesn't block the rest
      // (e.g. catalog count from postmarks API should show even if facilities/units fail)
      const [postmarksResult, facilitiesResult, unitsResult, dateRangeResult] = await Promise.allSettled([
        getPostmarksPage(1, 1),
        getPostalFacilities(),
        getAdministrativeUnits(false),
        getPostmarksDateRange(),
      ]);

      if (cancelled) return;

      const postmarksPage =
        postmarksResult.status === "fulfilled" ? postmarksResult.value : null;
      const facilities =
        facilitiesResult.status === "fulfilled" ? facilitiesResult.value : [];
      const administrativeUnits =
        unitsResult.status === "fulfilled" ? unitsResult.value : [];
      const dateRange =
        dateRangeResult.status === "fulfilled" ? dateRangeResult.value : null;

      setStats({
        postmarks: postmarksPage?.count ?? null,
        postmarksCapped: !!(postmarksPage?.count_capped),
        towns: Array.isArray(facilities) ? facilities.length : null,
        states: Array.isArray(administrativeUnits) ? administrativeUnits.length : null,
        earliestYear: dateRange?.earliest_year ?? null,
        latestYear: dateRange?.latest_year ?? null,
      });
    };

    loadStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleContributeClick = () => {
    if (user) {
      navigate('/contribute');
    } else {
      navigate('/auth');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-background to-secondary overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <img 
            src={heroImage} 
            alt="" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="max-w-3xl">
            <h1 className="font-heading text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
              American Stampless Cover Catalog
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed">
              Explore over {stats.postmarks != null
                  ? `${stats.postmarks.toLocaleString()}${stats.postmarksCapped ? "+" : ""}`
                  : "—"} historical postal markings from across America. A comprehensive, open-access archive for researchers, collectors, and philatelic enthusiasts.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-archival-md"
                onClick={() => navigate('/search')}
              >
                <Search className="mr-2 h-5 w-5" />
                Browse Catalog
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="border-primary text-primary hover:bg-primary/5"
                onClick={handleContributeClick}
              >
                <Users className="mr-2 h-5 w-5" />
                Contribute
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Statistics */}
      <section className="py-12 bg-card border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-heading font-bold text-primary mb-2">
                {stats.postmarks != null
                  ? `${stats.postmarks.toLocaleString()}${stats.postmarksCapped ? "+" : ""}`
                  : "—"}
              </div>
              <div className="text-sm text-muted-foreground">Postmarks Cataloged</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-heading font-bold text-primary mb-2">
                {stats.towns != null ? stats.towns.toLocaleString() : "—"}
              </div>
              <div className="text-sm text-muted-foreground">Towns Documented</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-heading font-bold text-primary mb-2">
                {stats.states != null ? stats.states.toLocaleString() : "—"}
              </div>
              <div className="text-sm text-muted-foreground">States/Territories Covered</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-heading font-bold text-primary mb-2">
                1661–1989
              </div>
              <div className="text-sm text-muted-foreground">Historical Range</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-4">
              Explore Historical Postal History
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our comprehensive database provides researchers and collectors with detailed information about American postal markings from the pre-stamp era.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-border shadow-archival-md hover:shadow-archival-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Search className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-heading text-xl font-semibold mb-2">Advanced Search</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Filter by state, town, date range, postmark type, color, and more. View results in list or gallery format.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border shadow-archival-md hover:shadow-archival-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Database className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-heading text-xl font-semibold mb-2">Detailed Records</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Each entry includes high-resolution images, metadata, references, valuations, and publication citations.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border shadow-archival-md hover:shadow-archival-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-heading text-xl font-semibold mb-2">Open Access</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  All catalog data is freely available under CC BY 4.0. Download records and contribute your own discoveries.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-br from-primary/5 to-accent/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-4">
            Help Preserve Postal History
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join our community of contributors and help document America's postal heritage. Your submissions help researchers and collectors worldwide.
          </p>
          <Button 
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleContributeClick}
          >
            Start Contributing
          </Button>
        </div>
      </section>

      {faqs.length > 0 && (
        <section id="faq" className="py-16 md:py-24 scroll-mt-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-lg text-foreground">
                Learn more about the American Postal Markings Catalog
              </p>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq) => (
                <AccordionItem
                  key={faq.id}
                  value={faq.id}
                  className="border border-border rounded-lg px-6 bg-card"
                >
                  <AccordionTrigger className="text-left font-semibold">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-foreground leading-relaxed whitespace-pre-line">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
};

export default Index;
