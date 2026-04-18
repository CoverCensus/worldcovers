import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";

type HelpDoc = {
  slug: string;
  title: string;
  sourceFile: string;
  markdown: string;
};

const getDocNavLabel = (doc: HelpDoc): string => {
  if (doc.sourceFile) {
    const fileName = doc.sourceFile.split("/").pop() ?? doc.sourceFile;
    const withoutExt = fileName.replace(/\.md$/i, "");
    return withoutExt.replace(/[_-]+/g, " ").trim();
  }

  // Fallback if backend doesn't send source_file for a document.
  return doc.slug.replace(/[-_]+/g, " ").trim();
};

const Help = () => {
  const [docs, setDocs] = useState<HelpDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const response = await fetch("/api/v2/help-docs/");
        if (!response.ok) {
          throw new Error(`Failed to load help docs (${response.status})`);
        }
        const data = await response.json();
        const rawItems = Array.isArray(data) ? data : data?.results || [];
        const items: HelpDoc[] = rawItems
          .map((item: any) => {
            if (!item) return null;
            const slug = String(item.slug ?? "").trim();
            const title = String(item.title ?? "").trim();
            const sourceFile = String(item.source_file ?? "").trim();
            const markdown = String(item.markdown ?? "");
            if (!slug || !title || !markdown) return null;
            return { slug, title, sourceFile, markdown };
          })
          .filter(Boolean) as HelpDoc[];
        setDocs(items);
      } catch {
        setDocs([]);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchDocs();
  }, []);

  useEffect(() => {
    if (docs.length === 0) {
      setSelectedSlug(null);
      return;
    }

    setSelectedSlug((current) => {
      if (current && docs.some((doc) => doc.slug === current)) return current;
      return docs[0].slug;
    });
  }, [docs]);

  const renderedDocs = useMemo(
    () => docs.map((doc) => ({ ...doc, html: marked.parse(doc.markdown) as string })),
    [docs],
  );
  const selectedDoc = useMemo(
    () => renderedDocs.find((doc) => doc.slug === selectedSlug) ?? null,
    [renderedDocs, selectedSlug],
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <header className="mb-10">
            <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-3">
              Help
            </h1>
            <p className="text-muted-foreground">
              This page is built from all markdown files in <code>docs/</code>.
            </p>
          </header>

          {isLoading ? (
            <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
              Loading help documents...
            </div>
          ) : renderedDocs.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
              No help documents found.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
              <aside className="lg:col-span-4 xl:col-span-3">
                <div className="rounded-lg border border-border bg-card p-3 md:p-4">
                  <h2 className="font-heading text-lg font-semibold text-foreground mb-3">
                    Documents
                  </h2>
                  <div className="space-y-1">
                    {renderedDocs.map((doc) => {
                      const isActive = doc.slug === selectedSlug;
                      return (
                        <button
                          key={doc.slug}
                          type="button"
                          onClick={() => setSelectedSlug(doc.slug)}
                          className={`w-full text-left rounded-md px-3 py-2 transition-colors break-words ${
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          }`}
                        >
                          <span className="block text-sm">{getDocNavLabel(doc)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </aside>

              <article className="lg:col-span-8 xl:col-span-9 rounded-lg border border-border bg-card p-6 md:p-8">
                {selectedDoc ? (
                  <>
                    <h2 className="font-heading text-2xl font-semibold text-foreground mb-4">
                      {selectedDoc.title}
                    </h2>
                    <div className="w-full overflow-x-auto">
                      <div
                        className="prose prose-slate max-w-none dark:prose-invert break-words [&_p]:my-4 [&_p]:leading-7 [&_li]:my-1.5 [&_li]:leading-7 [&_h1]:mb-5 [&_h1]:mt-8 [&_h2]:mb-4 [&_h2]:mt-8 [&_h3]:mb-3 [&_h3]:mt-6 [&_hr]:my-8 [&_table]:block [&_table]:w-full [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:text-sm [&_table]:border [&_table]:border-border [&_table]:border-collapse [&_th]:whitespace-normal [&_th]:border [&_th]:border-border [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:whitespace-normal [&_td]:break-words [&_td]:align-top [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_code]:break-words"
                        dangerouslySetInnerHTML={{ __html: selectedDoc.html }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Select a document to view its content.</p>
                )}
              </article>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Help;
