import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

/** Two-column shell shared by marking and cover entry detail pages. */
export function EntryDetailLayout({
  onBack,
  title,
  leftColumn,
  rightColumn,
}: {
  onBack: () => void;
  title?: string;
  leftColumn: ReactNode;
  rightColumn: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 pb-8 pt-3 sm:px-6 lg:px-8">
          <div className="mb-6 grid items-center gap-8 lg:grid-cols-2">
            <div className="flex flex-col items-start gap-1">
              <Button variant="ghost" onClick={onBack} className="-ml-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              {title && (
                <h1 className="font-heading text-[2.35rem] font-semibold text-foreground">
                  {title}
                </h1>
              )}
            </div>
          </div>
          <div className="grid items-start lg:grid-cols-2 gap-8">
            <div className="space-y-6">{leftColumn}</div>
            <div className="space-y-6">{rightColumn}</div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
