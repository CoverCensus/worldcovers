import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Grid3x3, List, Search as SearchIcon, SlidersHorizontal, Loader2 } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import postmarkSample from "@/assets/postmark-sample.jpg";
import { fetchPostmarks } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useFilterOptions } from "@/hooks/useFilterOptions";

const Search = () => {
  const [viewMode, setViewMode] = useState<"gallery" | "list">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch filter options from API
  const { colorOptions, isLoading: isLoadingFilters, error: filterError } = useFilterOptions();

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

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;

  // Catalog records from database
  const [catalogRecords, setCatalogRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch catalog records from Django API
  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const results = await fetchPostmarks();
        const transformedData = results.map((record) => ({
          id: record.postmark_id,
          name: record.facility_name || record.postmark_key,
          state: record.state ?? "",
          town: record.town ?? "",
          dateRange: record.date_range ?? "",
          color: record.colors_display ?? "",
          type: record.shape_name ?? "",
          valuation: record.valuation_display ?? "",
          image: record.main_image?.image_url || postmarkSample,
        }));
        setCatalogRecords(transformedData);
      } catch (error: any) {
        toast({
          title: "Error loading catalog",
          description: error?.message ?? "Failed to load catalog from API",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadCatalog();
  }, [toast]);

  // Derive unique state values from catalog records for the filter dropdown
  const uniqueStates = useMemo(() => {
    return Array.from(new Set(catalogRecords.map((r) => r.state).filter(Boolean))).sort();
  }, [catalogRecords]);

  // Derive unique type values from catalog records
  const uniqueTypes = useMemo(() => {
    return Array.from(new Set(catalogRecords.map((r) => r.type).filter(Boolean))).sort();
  }, [catalogRecords]);

  // Apply filters
  const filteredResults = useMemo(() => {
    return catalogRecords.filter((result) => {
      // Keyword search (name, town, state, type, color)
      if (keywordSearch.trim()) {
        const q = keywordSearch.trim().toLowerCase();
        const matches = [result.name, result.town, result.state, result.type, result.color].some(
          (val) => val != null && String(val).toLowerCase().includes(q)
        );
        if (!matches) return false;
      }

      // State filter
      if (stateFilter !== "all" && result.state !== stateFilter) return false;

      // Town filter
      if (townFilter && !result.town.toLowerCase().includes(townFilter.toLowerCase())) return false;

      // Year range filter
      const dateRange = result.dateRange ?? "";
      const parts = dateRange.split("-").map((y) => parseInt(y, 10));
      const resultBegin = parts[0];
      const resultEnd = parts[1] ?? resultBegin;
      if (beginYear && (isNaN(resultBegin) || resultBegin < parseInt(beginYear, 10))) return false;
      if (endYear && (isNaN(resultEnd) || resultEnd > parseInt(endYear, 10))) return false;

      // Type filter
      if (typeFilter !== "all" && result.type !== typeFilter) return false;

      // Color filter (color can be comma-separated from API)
      if (colorFilter !== "all") {
        const recordColors = (result.color ?? "")
          .split(",")
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean);
        if (!recordColors.length || !recordColors.includes(colorFilter)) return false;
      }

      // Valuation filter
      if (valuationFilter !== "all" && result.valuation !== valuationFilter) return false;

      // Manuscripts filter
      if (excludeManuscripts && result.type === "Manuscript") return false;

      // Images only filter (in real app, check if image exists)
      if (imagesOnly && !result.image) return false;

      return true;
    });
  }, [catalogRecords, keywordSearch, stateFilter, townFilter, beginYear, endYear, typeFilter, colorFilter, valuationFilter, excludeManuscripts, imagesOnly]);

  // Pagination
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredResults.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredResults, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [keywordSearch, stateFilter, townFilter, beginYear, endYear, typeFilter, colorFilter, valuationFilter, excludeManuscripts, imagesOnly]);

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
                        {uniqueStates.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
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
                        {uniqueTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
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

                  <div className="space-y-2">
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
                  </div>

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
                    Showing <span className="font-semibold text-foreground">{((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredResults.length)}</span> of <span className="font-semibold text-foreground">{filteredResults.length}</span> results
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
                <div className="space-y-4 min-w-0">
                  {paginatedResults.map((result) => (
                    <Card
                      key={result.id}
                      className="shadow-archival-md hover:shadow-archival-lg transition-shadow cursor-pointer overflow-hidden min-w-0"
                      onClick={() => navigate(`/record/${result.id}`)}
                    >
                      <CardContent className="p-4 sm:p-6 min-w-0 overflow-hidden">
                        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 min-w-0">
                          <img
                            src={result.image}
                            alt={result.name}
                            className="w-full h-40 sm:w-32 sm:h-32 object-cover rounded border border-border shrink-0 min-w-0"
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-heading text-lg sm:text-xl font-semibold text-foreground mb-2 truncate">
                              {result.name}
                            </h3>
                            {/* One line on small screens */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm min-w-0 sm:hidden">
                              <span className="text-muted-foreground">Location:</span><span className="text-foreground">{result.town}, {result.state}</span>
                              <span className="text-muted-foreground/50">·</span>
                              <span className="text-muted-foreground">Date:</span><span className="text-foreground">{result.dateRange}</span>
                              <span className="text-muted-foreground/50">·</span>
                              <span className="text-muted-foreground">Type:</span><span className="text-foreground">{result.type}</span>
                              <span className="text-muted-foreground/50">·</span>
                              <span className="text-muted-foreground">Color:</span><span className="text-foreground">{result.color}</span>
                            </div>
                            {/* Two columns on sm+ */}
                            <div className="hidden sm:grid grid-cols-2 gap-x-6 gap-y-1 text-sm min-w-0">
                              <div className="min-w-0"><span className="text-muted-foreground">Location:</span>{" "}<span className="text-foreground break-words">{result.town}, {result.state}</span></div>
                              <div className="min-w-0"><span className="text-muted-foreground">Date Range:</span>{" "}<span className="text-foreground break-words">{result.dateRange}</span></div>
                              <div className="min-w-0"><span className="text-muted-foreground">Type:</span>{" "}<span className="text-foreground break-words">{result.type}</span></div>
                              <div className="min-w-0"><span className="text-muted-foreground">Color:</span>{" "}<span className="text-foreground break-words">{result.color}</span></div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0">
                  {paginatedResults.map((result) => (
                    <Card
                      key={result.id}
                      className="shadow-archival-md hover:shadow-archival-lg transition-shadow cursor-pointer overflow-hidden min-w-0"
                      onClick={() => navigate(`/record/${result.id}`)}
                    >
                      <img
                        src={result.image}
                        alt={result.name}
                        className="w-full h-48 object-cover"
                      />
                      <CardContent className="p-4 min-w-0 overflow-hidden">
                        <h3 className="font-heading text-lg font-semibold text-foreground mb-2 truncate">
                          {result.name}
                        </h3>
                        {/* One line on small screens */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm min-w-0 sm:hidden">
                          <span className="text-muted-foreground">Location:</span><span className="text-foreground">{result.town}, {result.state}</span>
                          <span className="text-muted-foreground/50">·</span>
                          <span className="text-muted-foreground">Date:</span><span className="text-foreground">{result.dateRange}</span>
                          <span className="text-muted-foreground/50">·</span>
                          <span className="text-muted-foreground">Color:</span><span className="text-foreground">{result.color}</span>
                        </div>
                        {/* Stacked rows on sm+ */}
                        <div className="hidden sm:block space-y-1 text-sm min-w-0">
                          <div className="min-w-0"><span className="text-muted-foreground">Location:</span>{" "}<span className="text-foreground break-words">{result.town}, {result.state}</span></div>
                          <div className="min-w-0"><span className="text-muted-foreground">Date:</span>{" "}<span className="text-foreground break-words">{result.dateRange}</span></div>
                          <div className="min-w-0"><span className="text-muted-foreground">Color:</span>{" "}<span className="text-foreground break-words">{result.color}</span></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <Pagination className="mt-8">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}

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
