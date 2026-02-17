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
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import heroImage from "@/assets/hero-cover.jpg";

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
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
              Explore over 25,000 historical postal markings from across America. A comprehensive, open-access archive for researchers, collectors, and philatelic enthusiasts.
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
              <div className="text-3xl md:text-4xl font-heading font-bold text-primary mb-2">25,000+</div>
              <div className="text-sm text-muted-foreground">Postmarks Cataloged</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-heading font-bold text-primary mb-2">2,500+</div>
              <div className="text-sm text-muted-foreground">Towns Documented</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-heading font-bold text-primary mb-2">50</div>
              <div className="text-sm text-muted-foreground">States Covered</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-heading font-bold text-primary mb-2">1776-1900</div>
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

      {/* FAQ Section */}
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
            <AccordionItem value="what-is-apmc" className="border border-border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-left font-semibold">
                What is the American Postal Markings Catalog?
              </AccordionTrigger>
              <AccordionContent className="text-foreground leading-relaxed">
                Welcome to the American Postal Markings Catalog (APMC). This online resource builds upon the American Stampless Cover Catalog, last published in 1997. Our goal is to provide a resource for philatelists and postal historians listing the postal markings found on folded letters and covers from settlement until the Civil War.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="database-origin" className="border border-border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-left font-semibold">
                Where does the database information come from?
              </AccordionTrigger>
              <AccordionContent className="text-foreground leading-relaxed">
                The database in front of you started with the information and images in volume 1 of the ASSC with additions and corrections provided by an army of volunteers. It is and will remain a work-in-progress, with further refinements and images provided by users and students of the subject.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="catalog-scope" className="border border-border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-left font-semibold">
                What time period and markings does the catalog cover?
              </AccordionTrigger>
              <AccordionContent className="text-foreground leading-relaxed">
                This catalog is a listing of American handstamps and manuscript town postmarks by states, including Colonial and Territorial periods, U.S. Possessions and Unorganized Territories, from the early 1700's through May 30, 1861 (the last day of a unified postal system before the Civil War). Markings are generally listed based upon their current state location (Virginia/West Virginia is an exception to this, as all markings prior to 1861 were in Virginia).
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="how-to-contribute" className="border border-border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-left font-semibold">
                How can I contribute to the catalog?
              </AccordionTrigger>
              <AccordionContent className="text-foreground leading-relaxed">
                If you see an error, wish to add an image to a listed marking, or report a new marking, please use the forms within the database. All submissions will be reviewed by State administrators and added to the database when appropriate.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="data-organization" className="border border-border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-left font-semibold">
                How is the data organized in the catalog?
              </AccordionTrigger>
              <AccordionContent className="text-foreground leading-relaxed">
                Markings are organized by state, town, date range, and type. You can search and filter the catalog using our advanced search features to find specific postmarks by location, time period, color, and other attributes.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
