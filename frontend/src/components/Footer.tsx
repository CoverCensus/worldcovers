import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSiteInfo } from "@/hooks/useSiteInfo";
import { Badge } from "@/components/ui/badge";
import { APP_NAME, CONTACT_EMAIL, DONATE_URL } from "@/constants/brand";

export const Footer = () => {
  const user = useAuth();
  // T84: mark the test site on every page so nobody mistakes it for production.
  const site = useSiteInfo();
  return (
    <footer className="bg-card border-t border-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-heading text-lg font-semibold mb-3">About {APP_NAME}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A nonprofit, open-access philatelic database cataloging historical American postal markings and covers for researchers and collectors worldwide.
            </p>
          </div>
          <div>
            <h3 className="font-heading text-lg font-semibold mb-3">Quick links</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/" className="hover:text-foreground transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/search" className="hover:text-foreground transition-colors">
                  Catalog
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-foreground transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link to="/acknowledgements" className="hover:text-foreground transition-colors">
                  Acknowledgements
                </Link>
              </li>
              <li>
                <a
                  href={DONATE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  Donate
                </a>
              </li>
              {user && (
                <li>
                <Link to="/contribute" className="hover:text-foreground transition-colors">
                    Contribute
                  </Link>
                </li>
              )}
            </ul>
          </div>
          <div>
            <h3 className="font-heading text-lg font-semibold mb-3">Contact</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Questions or feedback?<br />
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-border text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} {APP_NAME}. All catalog data is freely available under CC BY 4.0.{" "}
          <Link to="/help/rights-and-attribution" className="underline hover:text-foreground transition-colors">
            Rights and attribution
          </Link>
        </div>
        <div className="pt-2 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground/60">
          <span>v{__APP_VERSION__}</span>
          {site && !site.isProduction && (
            <Badge variant="outline" className="uppercase tracking-wide">
              Test site
            </Badge>
          )}
        </div>
      </div>
    </footer>
  );
};
