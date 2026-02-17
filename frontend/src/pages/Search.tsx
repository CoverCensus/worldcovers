import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { Grid3x3, List, Search as SearchIcon, SlidersHorizontal, Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import postmarkSample from "@/assets/postmark-sample.jpg";
import { getPostmarksPage } from "@/services/postmarks";
import { useToast } from "@/hooks/use-toast";
import { useFilterOptions } from "@/hooks/useFilterOptions";

/** Placeholder when image is missing or fails to load */
function ImageOrPlaceholder({
  src,
  alt,
  className,
}: {
  src: any;
  alt: string;
  className?: string;
}) {
  const [error, setError] = useState(false);
  console.log(src)
  if (src) {
    return <img src={src?.imageUrl} alt={alt} className={className} onError={() => setError(true)} />;
  } else {
    return (
      <div
        className={`flex items-center justify-center bg-muted text-muted-foreground text-sm ${className || ""}`}
      >
        No Image
      </div>
    );
  }
  
}

/** Build compact page numbers for pagination (handles 500+ pages) */
function getPaginationPages(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  const delta = 2;
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | "ellipsis")[] = [1];
  if (currentPage > delta + 2) pages.push("ellipsis");
  const start = Math.max(2, currentPage - delta);
  const end = Math.min(totalPages - 1, currentPage + delta);
  for (let i = start; i <= end; i++) pages.push(i);
  if (currentPage < totalPages - delta - 1) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}

const Search = () => {
  const [viewMode, setViewMode] = useState<"gallery" | "list">("list");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch filter options from API (colors, postmark shapes, states)
  const { colorOptions, shapeOptions, stateOptions, isLoading: isLoadingFilters, error: filterError } = useFilterOptions();

  // Filter states
  const [keywordSearch, setKeywordSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [townFilter, setTownFilter] = useState("");
  const [beginYear, setBeginYear] = useState("");
  const [endYear, setEndYear] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [valuationFilter, setValuationFilter] = useState("all");
  const [excludeManuscripts, setExcludeManuscripts] = useState(false);
  const [imagesOnly, setImagesOnly] = useState(false);

  // Pagination - 10 records per page from api/postmarks/
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Catalog records (current page from API)
  const [catalogRecords, setCatalogRecords] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const prevKeywordRef = useRef(keywordSearch);
  const prevTypeFilterRef = useRef(typeFilter);

  // Fetch postmarks page when currentPage, keywordSearch, or typeFilter changes
  useEffect(() => {
    const searchJustChanged = prevKeywordRef.current !== keywordSearch;
    const typeFilterJustChanged = prevTypeFilterRef.current !== typeFilter;
    if (searchJustChanged) {
      prevKeywordRef.current = keywordSearch;
    }
    if (typeFilterJustChanged) {
      prevTypeFilterRef.current = typeFilter;
    }
    if (searchJustChanged || typeFilterJustChanged || excludeManuscripts) {
      setCurrentPage(1);
    }
    const pageToFetch = searchJustChanged || typeFilterJustChanged ? 1 : currentPage;

    const fetchPage = async () => {
      setLoading(true);
      try {
        const { results, count } = await getPostmarksPage(
          pageToFetch,
          itemsPerPage,
          keywordSearch.trim() || undefined,
          typeFilter !== "all" ? typeFilter : undefined,
          excludeManuscripts,
          colorFilter !== "all" ? colorFilter : null
        );

        const apiTransformed = results.map((record) => ({
          id: `api-${record.id}`,
          name: record.postmarkKey,
          state: record.state || "",
          town: record.town || "",
          dateRange: record.dateRange || "",
          color: record.colorsDisplay || "",
          type: record.shapeName || "",
          valuation: record.rateValue,
          image: record.mainImage || null,
        }));

        setCatalogRecords(apiTransformed);
        setTotalCount(count);
      } catch (error: any) {
        toast({
          title: "Error loading catalog",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPage();
  }, [currentPage, keywordSearch, typeFilter, stateFilter, colorFilter, excludeManuscripts, toast]);

  // Server-side pagination: catalogRecords = current page (10 items) from api/postmarks/
  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;
  const paginatedResults = catalogRecords;

  // Clear all filters
  const handleClearAllFilters = () => {
    setKeywordSearch("");
    setStateFilter("all");
    setTownFilter("");
    setBeginYear("");
    setEndYear("");
    setTypeFilter("all");
    setColorFilter("all");
    setValuationFilter("all");
    setExcludeManuscripts(false);
    setImagesOnly(false);
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-2">
              Catalog Search
            </h1>
            <p className="text-muted-foreground">
              Search and filter through our comprehensive collection of American stampless postal markings.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Filters Sidebar */}
            <aside className={`lg:w-80 space-y-6 ${filtersOpen ? 'block' : 'hidden lg:block'}`}>
              <Card className="shadow-archival-md">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-heading text-lg font-semibold">Filters</h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="lg:hidden"
                      onClick={() => setFiltersOpen(false)}
                    >
                      Close
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="keyword-search">Search</Label>
                    <div className="relative">
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="keyword-search"
                        type="search"
                        placeholder="Name, town, state, type..."
                        value={keywordSearch}
                        onChange={(e) => setKeywordSearch(e.target.value)}
                        className="pl-9"
                        aria-label="Search records by name, town, state, or type"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Select value={stateFilter} onValueChange={setStateFilter}>
                      <SelectTrigger id="state">
                        <SelectValue placeholder="All States" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All States</SelectItem>
                        {isLoadingFilters ? (
                          <div className="flex items-center justify-center py-2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : filterError ? (
                          <div className="px-2 py-1 text-sm text-destructive">
                            Failed to load states
                          </div>
                        ) : (
                          (Array.isArray(stateOptions) ? stateOptions : []).map((state) => (
                            <SelectItem key={state.value} value={state.value}>
                              {state.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="town">Town</Label>
                    <Input
                      id="town"
                      placeholder="Enter town name..."
                      value={townFilter}
                      onChange={(e) => setTownFilter(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="beginYear">Begin Year</Label>
                      <Input
                        id="beginYear"
                        type="number"
                        placeholder="1776"
                        value={beginYear}
                        onChange={(e) => setBeginYear(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endYear">End Year</Label>
                      <Input
                        id="endYear"
                        type="number"
                        placeholder="1900"
                        value={endYear}
                        onChange={(e) => setEndYear(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="type">Postmark Type</Label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger id="type">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {isLoadingFilters ? (
                          <div className="flex items-center justify-center py-2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : filterError ? (
                          <div className="px-2 py-1 text-sm text-destructive">
                            Failed to load types
                          </div>
                        ) : (
                          (Array.isArray(shapeOptions) ? shapeOptions : []).map((shape) => (
                            <SelectItem key={shape.value} value={shape.value}>
                              {shape.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="color">Color</Label>
                    <Select value={colorFilter} onValueChange={setColorFilter}>
                      <SelectTrigger id="color">
                        <SelectValue placeholder="All Colors" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Colors</SelectItem>
                        {isLoadingFilters ? (
                          <div className="flex items-center justify-center py-2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : filterError ? (
                          <div className="px-2 py-1 text-sm text-destructive">
                            Failed to load colors
                          </div>
                        ) : (
                          (Array.isArray(colorOptions) ? colorOptions : []).map((color) => (
                            <SelectItem key={color.value} value={color.value}>
                              {color.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* <div className="space-y-2">
                    <Label htmlFor="valuation">Postmark Valuation</Label>
                    <Select value={valuationFilter} onValueChange={setValuationFilter}>
                      <SelectTrigger id="valuation">
                        <SelectValue placeholder="All Valuations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Valuations</SelectItem>
                        <SelectItem value="Common">Common</SelectItem>
                        <SelectItem value="Scarce">Scarce</SelectItem>
                        <SelectItem value="Rare">Rare</SelectItem>
                        <SelectItem value="Very Rare">Very Rare</SelectItem>
                      </SelectContent>
                    </Select>
                  </div> */}

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="manuscripts"
                        checked={excludeManuscripts}
                        onCheckedChange={(checked) => setExcludeManuscripts(checked as boolean)}
                      />
                      <label
                        htmlFor="manuscripts"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Exclude Manuscripts
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="imagesOnly"
                        checked={imagesOnly}
                        onCheckedChange={(checked) => setImagesOnly(checked as boolean)}
                      />
                      <label
                        htmlFor="imagesOnly"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Images Only
                      </label>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleClearAllFilters}
                  >
                    Clear Filters
                  </Button>
                </CardContent>
              </Card>
            </aside>

            {/* Results */}
            <main className="flex-1 space-y-4">
              {/* Results Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-archival-sm">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {totalCount === 0 ? (
                      "0 results"
                    ) : (
                      <>
                        Showing <span className="font-semibold text-foreground">{((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, totalCount)}</span> of <span className="font-semibold text-foreground">{totalCount}</span> results
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="lg:hidden"
                    onClick={() => setFiltersOpen(true)}
                  >
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Filters
                  </Button>
                  <div className="flex border border-border rounded-md">
                    <Button
                      variant={viewMode === "list" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("list")}
                      className="rounded-r-none"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "gallery" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("gallery")}
                      className="rounded-l-none"
                    >
                      <Grid3x3 className="h-4 w-4" />
                    </Button>


                  </div>
                </div>
              </div>

              {/* Results Grid/List */}
              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <p className="text-muted-foreground">Loading catalog records...</p>
                </div>
              ) : catalogRecords.length === 0 ? (
                <div className="flex justify-center items-center py-12">
                  <p className="text-muted-foreground">No catalog records found.</p>
                </div>
              ) : viewMode === "list" ? (
                <div className="space-y-4">
                  {paginatedResults.map((result) => (
                    <Card
                      key={result.id}
                      className="shadow-archival-md hover:shadow-archival-lg transition-shadow cursor-pointer"
                      onClick={() => navigate(`/record/${result.id}`)}
                    >
                      <CardContent className="p-6">
                        <div className="flex gap-6">
                          <ImageOrPlaceholder
                            src={result.image}
                            alt={result.name}
                            className="w-32 h-32 object-cover rounded border border-border"
                          />
                          <div className="flex-1">
                            <h3 className="font-heading text-xl font-semibold text-foreground mb-2">
                              {result.name}
                            </h3>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                              <div>
                                <span className="text-muted-foreground">Location:</span>{" "}
                                <span className="text-foreground">{result.town ? `${result.town}, ${result.state}` : result.state}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Date Range:</span>{" "}
                                <span className="text-foreground">{result.dateRange}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Type:</span>{" "}
                                <span className="text-foreground">{result.type}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Color:</span>{" "}
                                <span className="text-foreground">{result.color}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedResults.map((result) => (
                    <Card
                      key={result.id}
                      className="shadow-archival-md hover:shadow-archival-lg transition-shadow cursor-pointer overflow-hidden"
                      onClick={() => navigate(`/record/${result.id}`)}
                    >
                      <ImageOrPlaceholder
                        src={result.image}
                        alt={result.name}
                        className="w-full h-48 object-cover"
                      />
                      <CardContent className="p-4">
                        <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
                          {result.name}
                        </h3>
                        <div className="space-y-1 text-sm">
                          <div>
                            <span className="text-muted-foreground">Location:</span>{" "}
                            <span className="text-foreground">{result.town ? `${result.town}, ${result.state}` : result.state}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Date:</span>{" "}
                            <span className="text-foreground">{result.dateRange}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Color:</span>{" "}
                            <span className="text-foreground">{result.color}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Pagination - compact for 500+ pages */}
              {totalPages > 1 && (
                <Pagination className="mt-8">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>

                    {getPaginationPages(currentPage, totalPages).map((p, i) =>
                      p === "ellipsis" ? (
                        <PaginationItem key={`ellipsis-${i}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={p}>
                          <PaginationLink
                            onClick={() => setCurrentPage(p)}
                            isActive={currentPage === p}
                            className="cursor-pointer"
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}

                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </main>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Search;
