import { Link } from "react-router-dom";
import { BookOpen, Landmark, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { SupportApmc } from "@/components/SupportApmc";
import { APP_LONG_NAME, APP_NAME, ORG_NAME, ORG_URL } from "@/constants/brand";

// Trello T99: a short page that says what the catalog is, who stands behind it,
// and how to help, ending in the shared Support block. Wording is Ian's to confirm.
const About = () => (
  <div className="min-h-screen flex flex-col">
    <Navigation />

    <main className="flex-1">
      <section className="bg-gradient-to-br from-background to-secondary border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 text-center">
          <h1 className="font-heading text-4xl md:text-5xl font-bold text-foreground mb-4">
            About the {APP_NAME}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            The {APP_LONG_NAME} is a free, open-access record of the postal markings and covers
            that carried American mail before and during the first postage stamps.
          </p>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-border shadow-archival-md">
              <CardContent className="pt-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <h2 className="font-heading text-xl font-semibold mb-2">What it is</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  A searchable catalog that continues the printed American Stampless Cover Catalog
                  and the Virginia Postal History Catalog. Each record carries the town, the
                  marking, its dates and rates, images where we have them, and the sources behind
                  it. Every change is reviewed before it is published.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border shadow-archival-md">
              <CardContent className="pt-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Landmark className="h-6 w-6 text-primary" />
                </div>
                <h2 className="font-heading text-xl font-semibold mb-2">Who stands behind it</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  The catalog is sponsored by the{" "}
                  <a
                    href={ORG_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {ORG_NAME}
                  </a>
                  , a nonprofit of collectors and students of classic United States postal history.
                  Volunteer state editors review every submission, and the software is built and
                  kept up by volunteers.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border shadow-archival-md">
              <CardContent className="pt-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h2 className="font-heading text-xl font-semibold mb-2">How to help</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Collectors can add markings and covers from their own holdings, correct records,
                  and attach images. Start with the{" "}
                  <Link to="/help/getting-started" className="text-primary hover:underline">
                    getting started guide
                  </Link>
                  , and see the{" "}
                  <Link to="/acknowledgements" className="text-primary hover:underline">
                    acknowledgements
                  </Link>{" "}
                  for the editors and donors who brought the catalog this far.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <SupportApmc />
    </main>

    <Footer />
  </div>
);

export default About;
