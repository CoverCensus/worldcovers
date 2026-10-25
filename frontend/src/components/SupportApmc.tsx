import { Button } from "@/components/ui/button";
import { APP_NAME, APP_LONG_NAME, DONATE_URL, ORG_NAME, ORG_URL } from "@/constants/brand";

// Trello T99: the one "Support the APMC" block, shown on the home page under the
// three feature cards and again on the About page. The button hands the visitor
// to PayPal on the Society's account; nothing on our side touches a payment.
export const SupportApmc = () => (
  <section
    aria-labelledby="support-apmc-heading"
    className="py-16 bg-gradient-to-br from-primary/5 to-accent/5 border-y border-border"
  >
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <h2
        id="support-apmc-heading"
        className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-4"
      >
        Support the {APP_NAME}
      </h2>
      <p className="text-lg text-muted-foreground mb-8">
        The {APP_LONG_NAME} is free to use and kept up by volunteers. Your gift to the{" "}
        {ORG_NAME} helps keep the catalog online, growing, and open to everyone.
      </p>
      <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
        <a href={DONATE_URL} target="_blank" rel="noopener noreferrer">
          Donate via PayPal
        </a>
      </Button>
      <p className="text-sm text-muted-foreground mt-4">
        Donations go to the{" "}
        <a href={ORG_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          {ORG_NAME}
        </a>
        , the nonprofit that sponsors the {APP_NAME}, through PayPal.
      </p>
    </div>
  </section>
);
