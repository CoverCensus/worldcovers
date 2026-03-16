import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { Grid3x3, List, Search as SearchIcon, SlidersHorizontal, Loader2 } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { getPostmarksPage, normalizeImageUrl } from "@/services/postmarks";
import { useToast } from "@/hooks/use-toast";
import { useFilterOptions } from "@/hooks/useFilterOptions";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 400;
const MIN_YEAR = 1661;
const CURRENT_YEAR = new Date().getFullYear();

function validateYearString(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.length !== 4) return null; // wait until user types 4 digits
  const n = Number(v);
  if (Number.isNaN(n)) return "Year must be a number";
  if (n < MIN_YEAR || n > CURRENT_YEAR) {
    return `Year must be between ${MIN_YEAR} and ${CURRENT_YEAR}`;
  }
  return null;
}

/** Read a single search param with default */
function getSearchParam(params: URLSearchParams, key: string, defaultValue: string): string {
  const v = params.get(key);
  return v ?? defaultValue;
}

const noImageClassName = "w-full h-full min-w-0 min-h-0 object-cover bg-muted";

/** Placeholder when image is missing or fails to load. Shows fallback artwork instead of text. */
function ImageOrPlaceholder({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <img
        src={imageNotAvailable}
        alt="No image available"
        className={cn(noImageClassName, className)}
      />
    );
  }
  if (!src) {
    return (
      <img
        src={imageNotAvailable}
        alt="No image available"
        className={cn(noImageClassName, className)}
      />
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setError(true)} />;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<"gallery" | "list">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch filter options from API (colors, postmark shapes, states)
  const { colorOptions, shapeOptions, stateOptions, isLoading: isLoadingFilters, error: filterError } = useFilterOptions();

  // Filter states - initialize from URL so filters persist when navigating back from detail
  const [keywordSearch, setKeywordSearch] = useState(() => getSearchParam(searchParams, "q", ""));
  const [stateFilter, setStateFilter] = useState(() => getSearchParam(searchParams, "state", "all"));
  const [townFilter, setTownFilter] = useState(() => getSearchParam(searchParams, "town", ""));
  const [beginYear, setBeginYear] = useState(() => getSearchParam(searchParams, "from", ""));
  const [endYear, setEndYear] = useState(() => getSearchParam(searchParams, "to", ""));
  const [typeFilter, setTypeFilter] = useState(() => getSearchParam(searchParams, "type", "all"));
  const [colorFilter, setColorFilter] = useState(() => getSearchParam(searchParams, "color", "all"));
  const [valuationFilter, setValuationFilter] = useState("all");
  const [excludeManuscripts, setExcludeManuscripts] = useState(() => getSearchParam(searchParams, "noManuscripts", "") === "true");
  const [imagesOnly, setImagesOnly] = useState(() => getSearchParam(searchParams, "images", "") === "true");

  // Debounced values for text inputs - API called only after user stops typing
  const debouncedKeywordSearch = useDebounce(keywordSearch, DEBOUNCE_MS);
  const debouncedTownFilter = useDebounce(townFilter, DEBOUNCE_MS);
  const debouncedBeginYear = useDebounce(beginYear, DEBOUNCE_MS);
  const debouncedEndYear = useDebounce(endYear, DEBOUNCE_MS);

  // Pagination - 10 records per page from api/postmarks/
  const [currentPage, setCurrentPage] = useState(() => {
    const p = searchParams.get("page");
    const n = p ? parseInt(p, 10) : 1;
    return Number.isNaN(n) || n < 1 ? 1 : n;
  });
  const [goToPageInput, setGoToPageInput] = useState("");
  const itemsPerPage = 10;

  const prevKeywordRef = useRef(debouncedKeywordSearch);
  const prevTypeFilterRef = useRef(typeFilter);
  const prevColorFilterRef = useRef(colorFilter);
  const prevStateFilterRef = useRef(stateFilter);
  const prevTownFilterRef = useRef(debouncedTownFilter);
  const prevBeginYearRef = useRef(debouncedBeginYear.trim().length === 4 ? debouncedBeginYear.trim() : "");
  const prevEndYearRef = useRef(debouncedEndYear.trim().length === 4 ? debouncedEndYear.trim() : "");
  const prevImagesOnlyRef = useRef(imagesOnly);
  const prevExcludeManuscriptsRef = useRef(excludeManuscripts);

  const beginYearError = useMemo(() => validateYearString(beginYear), [beginYear]);
  const endYearError = useMemo(() => validateYearString(endYear), [endYear]);

  // Reset page to 1 when filters change
  useEffect(() => {
    const currentNormalizedBegin = debouncedBeginYear.trim().length === 4 ? debouncedBeginYear.trim() : "";
    const currentNormalizedEnd = debouncedEndYear.trim().length === 4 ? debouncedEndYear.trim() : "";

    const searchJustChanged = prevKeywordRef.current !== debouncedKeywordSearch;
    const typeFilterJustChanged = prevTypeFilterRef.current !== typeFilter;
    const colorFilterJustChanged = prevColorFilterRef.current !== colorFilter;
    const stateFilterJustChanged = prevStateFilterRef.current !== stateFilter;
    const townFilterJustChanged = prevTownFilterRef.current !== debouncedTownFilter;
    const beginYearJustChanged = prevBeginYearRef.current !== currentNormalizedBegin;
    const endYearJustChanged = prevEndYearRef.current !== currentNormalizedEnd;
    const imagesOnlyJustChanged = prevImagesOnlyRef.current !== imagesOnly;
    const excludeManuscriptsJustChanged = prevExcludeManuscriptsRef.current !== excludeManuscripts;
    if (searchJustChanged) prevKeywordRef.current = debouncedKeywordSearch;
    if (typeFilterJustChanged) prevTypeFilterRef.current = typeFilter;
    if (colorFilterJustChanged) prevColorFilterRef.current = colorFilter;
    if (stateFilterJustChanged) prevStateFilterRef.current = stateFilter;
    if (townFilterJustChanged) prevTownFilterRef.current = debouncedTownFilter;
    if (beginYearJustChanged) prevBeginYearRef.current = currentNormalizedBegin;
    if (endYearJustChanged) prevEndYearRef.current = currentNormalizedEnd;
    if (imagesOnlyJustChanged) prevImagesOnlyRef.current = imagesOnly;
    if (excludeManuscriptsJustChanged) prevExcludeManuscriptsRef.current = excludeManuscripts;

    const anyFilterChanged =
      searchJustChanged ||
      typeFilterJustChanged ||
      colorFilterJustChanged ||
      stateFilterJustChanged ||
      townFilterJustChanged ||
      beginYearJustChanged ||
      endYearJustChanged ||
      imagesOnlyJustChanged ||
      excludeManuscriptsJustChanged;
    if (anyFilterChanged) {
      setCurrentPage(1);
    }
  }, [debouncedKeywordSearch, typeFilter, stateFilter, debouncedTownFilter, debouncedBeginYear, debouncedEndYear, imagesOnly, colorFilter, excludeManuscripts]);

  // Treat years as active filters only when they are valid and 4 digits.
  const normalizedBeginYear = useMemo(() => {
    return validateYearString(debouncedBeginYear) ? "" : (debouncedBeginYear.trim().length === 4 ? debouncedBeginYear.trim() : "");
  }, [debouncedBeginYear]);
  const normalizedEndYear = useMemo(() => {
    return validateYearString(debouncedEndYear) ? "" : (debouncedEndYear.trim().length === 4 ? debouncedEndYear.trim() : "");
  }, [debouncedEndYear]);

  // Fetch postmarks with React Query - cached so Back shows previous results immediately
  const {
    data: queryData,
    isLoading: queryLoading,
    isFetching: queryFetching,
    error: queryError,
  } = useQuery({
    queryKey: [
      "postmarks",
      currentPage,
      debouncedKeywordSearch,
      typeFilter,
      stateFilter,
      debouncedTownFilter,
      normalizedBeginYear,
      normalizedEndYear,
      imagesOnly,
      colorFilter,
      excludeManuscripts,
      itemsPerPage,
    ],
    queryFn: async () => {
      const normalizedFrom =
        debouncedBeginYear.trim().length === 4 ? debouncedBeginYear.trim() : undefined;
      const normalizedTo =
        debouncedEndYear.trim().length === 4 ? debouncedEndYear.trim() : undefined;

      const { results, count, count_capped } = await getPostmarksPage(
        currentPage,
        itemsPerPage,
        debouncedKeywordSearch.trim() || undefined,
        typeFilter !== "all" ? typeFilter : undefined,
        excludeManuscripts,
        colorFilter !== "all" ? colorFilter : null,
        stateFilter !== "all" ? stateFilter : undefined,
        debouncedTownFilter.trim() || undefined,
        normalizedFrom,
        normalizedTo,
        imagesOnly
      );
      const apiTransformed = results.map((record: any) => ({
        id: `api-${record.id}`,
        name:
          [
            [record.town, record.state].filter(Boolean).join(", "),
            record.shapeName,
          ]
            .filter((x) => x && String(x).trim().toLowerCase() !== "unknown")
            .join(" — ") || record.postmarkKey,
        postmarkKey: record.postmarkKey,
        state: record.state || "",
        town: record.town || "",
        dateRange: record.dateRange || "",
        size: (record as any).sizeDisplay || "",
        color: record.colorsDisplay || "",
        type: record.shapeName || "",
        valuation: record.rateValue,
        image: normalizeImageUrl(
          (record as any).mainImage?.imageUrl ??
          (typeof (record as any).mainImage === "string" ? (record as any).mainImage : null)
        ),
      }));
      return { records: apiTransformed, count, count_capped };
    },
    staleTime: 5 * 60 * 1000, // 5 min - use cache when navigating back, no loading
  });

  const catalogRecords = queryData?.records ?? [];
  const totalCount = queryData?.count ?? 0;
  const countCapped = queryData?.count_capped ?? false;
  // Show loading only when we have no data; when we have cached data, show it (no spinner)
  const loading = queryLoading || (queryFetching && catalogRecords.length === 0);
  const refreshing = queryFetching && !loading;
  const filtersDisabled = loading;

  useEffect(() => {
    if (queryError) {
      toast({
        title: "Error loading catalog",
        description: (queryError as Error).message,
        variant: "destructive",
      });
    }
  }, [queryError, toast]);

  // Persist filters to URL so they survive navigation (Back from detail page)
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedKeywordSearch.trim()) params.set("q", debouncedKeywordSearch.trim());
    if (stateFilter !== "all") params.set("state", stateFilter);
    if (debouncedTownFilter.trim()) params.set("town", debouncedTownFilter.trim());
    // Only persist valid years (normalized values) to the URL
    if (normalizedBeginYear) params.set("from", normalizedBeginYear);
    if (normalizedEndYear) params.set("to", normalizedEndYear);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (colorFilter !== "all") params.set("color", colorFilter);
    if (excludeManuscripts) params.set("noManuscripts", "true");
    if (imagesOnly) params.set("images", "true");
    if (currentPage > 1) params.set("page", String(currentPage));
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      setSearchParams(next ? params : {}, { replace: true });
    }
  }, [currentPage, debouncedKeywordSearch, stateFilter, debouncedTownFilter, normalizedBeginYear, normalizedEndYear, typeFilter, colorFilter, excludeManuscripts, imagesOnly, searchParams, setSearchParams]);

  // Enforce exactly itemsPerPage (10) per page — slice in case API returns more
  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;
  const paginatedResults = catalogRecords.slice(0, itemsPerPage);

  // Clear all filters and URL params
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
    setSearchParams("", { replace: true });
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
                        placeholder="Search by name..."
                        value={keywordSearch}
                        onChange={(e) => setKeywordSearch(e.target.value)}
                        className="pl-9"
                        aria-label="Search records by name, town, state, or type"
                        disabled={filtersDisabled}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <SearchableSelect
                      id="state"
                      value={stateFilter}
                      onValueChange={setStateFilter}
                      placeholder="All States"
                      allOption={{ value: "all", label: "All States" }}
                      options={Array.isArray(stateOptions) ? stateOptions : []}
                      loading={isLoadingFilters}
                      error={!!filterError}
                      errorMessage="Failed to load states"
                      searchPlaceholder="Search states..."
                      emptyMessage="No state found."
                      aria-label="Filter by state"
                      disabled={filtersDisabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="town">Town</Label>
                    <Input
                      id="town"
                      placeholder="Enter town name..."
                      value={townFilter}
                      onChange={(e) => setTownFilter(e.target.value)}
                      disabled={filtersDisabled}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="beginYear">Begin Year</Label>
                      <Input
                        id="beginYear"
                        type="number"
                        placeholder={String(MIN_YEAR)}
                        inputMode="numeric"
                        value={beginYear}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                          setBeginYear(v);
                        }}
                        disabled={filtersDisabled}
                        className={cn(
                          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                          beginYearError ? "border-destructive" : ""
                        )}
                      />
                      {beginYearError && (
                        <p className="text-xs text-destructive">{beginYearError}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endYear">End Year</Label>
                      <Input
                        id="endYear"
                        type="number"
                        placeholder={String(CURRENT_YEAR)}
                        inputMode="numeric"
                        value={endYear}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                          setEndYear(v);
                        }}
                        disabled={filtersDisabled}
                        className={cn(
                          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                          endYearError ? "border-destructive" : ""
                        )}
                      />
                      {endYearError && (
                        <p className="text-xs text-destructive">{endYearError}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="type">Postmark Type</Label>
                    <SearchableSelect
                      id="type"
                      disabled={filtersDisabled}
                      value={typeFilter}
                      onValueChange={setTypeFilter}
                      placeholder="All Types"
                      allOption={{ value: "all", label: "All Types" }}
                      options={Array.isArray(shapeOptions) ? shapeOptions : []}
                      loading={isLoadingFilters}
                      error={!!filterError}
                      errorMessage="Failed to load types"
                      searchPlaceholder="Search types..."
                      emptyMessage="No type found."
                      aria-label="Filter by postmark type"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="color">Color</Label>
                    <SearchableSelect
                      id="color"
                      value={colorFilter}
                      onValueChange={setColorFilter}
                      placeholder="All Colors"
                      allOption={{ value: "all", label: "All Colors" }}
                      options={Array.isArray(colorOptions) ? colorOptions : []}
                      loading={isLoadingFilters}
                      error={!!filterError}
                      errorMessage="Failed to load colors"
                      searchPlaceholder="Search colors..."
                      emptyMessage="No color found."
                      aria-label="Filter by color"
                      disabled={filtersDisabled}
                    />
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
                        disabled={filtersDisabled}
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
                        disabled={filtersDisabled}
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
                    disabled={filtersDisabled}
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
                        Showing <span className="font-semibold text-foreground">{((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, totalCount)}</span> of <span className="font-semibold text-foreground">{countCapped ? `${totalCount.toLocaleString()}+` : totalCount.toLocaleString()}</span> results
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="lg:hidden"
                    onClick={() => setFiltersOpen((open) => !open)}
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
                  {refreshing && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    </div>
                  )}
                </div>
              </div>

              {/* Results Grid/List */}
              {loading ? (
                <div className="flex flex-col justify-center items-center gap-3 py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
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
                      onClick={() => navigate(`/record/${result.id}`, { state: { fromSearch: true } })}
                    >
                      <CardContent className="p-4">
                        <div className="flex gap-6 md:flex-row flex-col">
                          <ImageOrPlaceholder
                            src={result.image}
                            alt={result.name}
                            className="md:w-32 md:h-32 w-full h-48 object-cover rounded border border-border"
                          />
                          <div className="flex-1">
                            <h3 className="font-heading text-xl font-semibold text-foreground mb-2">
                              {result.name}
                            </h3>

                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                              {result.town && (
                                <div>
                                  <span className="text-muted-foreground">Town:</span>{" "}
                                  <span className="text-foreground">{result.town}</span>
                                </div>
                              )}
                              {result.state && (
                                <div>
                                  <span className="text-muted-foreground">State:</span>{" "}
                                  <span className="text-foreground">{result.state}</span>
                                </div>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                              {result.dateRange && (
                                <div>
                                  <span className="text-muted-foreground">Date Seen:</span>{" "}
                                  <span className="text-foreground">{result.dateRange}</span>
                                </div>
                              )}
                              {result.size && (
                                <div>
                                  <span className="text-muted-foreground">Size:</span>{" "}
                                  <span className="text-foreground">{result.size}</span>
                                </div>
                              )}
                              {result.color && (
                                <div>
                                  <span className="text-muted-foreground">Color:</span>{" "}
                                  <span className="text-foreground">{result.color}</span>
                                </div>
                              )}
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
                      onClick={() => navigate(`/record/${result.id}`, { state: { fromSearch: true } })}
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
                          {result.town && (
                            <div>
                              <span className="text-muted-foreground">Town:</span>{" "}
                              <span className="text-foreground">{result.town}</span>
                            </div>
                          )}
                             {result.state && (
                            <div>
                              <span className="text-muted-foreground">State:</span>{" "}
                              <span className="text-foreground">{result.state}</span>
                            </div>
                          )}
                          {result.dateRange && (
                            <div>
                              <span className="text-muted-foreground">Date Seen:</span>{" "}
                              <span className="text-foreground">{result.dateRange}</span>
                            </div>
                          )}
                          {result.size && (
                            <div>
                              <span className="text-muted-foreground">Size:</span>{" "}
                              <span className="text-foreground">{result.size}</span>
                            </div>
                          )}
                          {result.color && (
                            <div>
                              <span className="text-muted-foreground">Color:</span>{" "}
                              <span className="text-foreground">{result.color}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Pagination - compact for 500+ pages */}
              {totalPages > 1 && !loading && (
                <div className="mt-8 flex flex-col items-center gap-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => {
                            setCurrentPage(p => Math.max(1, p - 1));
                          }}
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
                              onClick={() => {
                                setCurrentPage(p);
                              }}
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
                          onClick={() => {
                            setCurrentPage(p => Math.min(totalPages, p + 1));
                          }}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Go to page</span>
                    <Input
                      type="number"
                      min={1}
                      max={totalPages}
                      placeholder="Page"
                      value={goToPageInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          setGoToPageInput("");
                          return;
                        }
                        const n = parseInt(raw, 10);
                        if (Number.isNaN(n)) return;
                        const clamped = Math.max(1, Math.min(totalPages, n));
                        setGoToPageInput(String(clamped));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const n = parseInt(goToPageInput, 10);
                          if (!Number.isNaN(n)) {
                            setCurrentPage(Math.max(1, Math.min(totalPages, n)));
                            setGoToPageInput("");
                          }
                        }
                      }}
                      className="h-9 w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      aria-label="Go to page number"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => {
                        const n = parseInt(goToPageInput, 10);
                        if (!Number.isNaN(n)) {
                          setCurrentPage(Math.max(1, Math.min(totalPages, n)));
                          setGoToPageInput("");
                        }
                      }}
                    >
                      Go
                    </Button>
                  </div>
                </div>
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
