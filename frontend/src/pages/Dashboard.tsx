import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, Grid3x3, List, Search as SearchIcon } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { cn } from "@/lib/utils";
import { normalizeImageUrl } from "@/services/postmarks";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useFilterOptions } from "@/hooks/useFilterOptions";

function getPostmarksApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/postmarks")) return base;
  return `${base}/api/postmarks`;
}

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^|;\\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : null;
}

const noImageClassName = "w-full h-full min-w-0 min-h-0 object-cover bg-muted";

/** Build compact page numbers for pagination (handles many pages) */
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

/** Fetch all pages from a DRF-paginated endpoint (or plain array endpoint). */
async function fetchAllPostmarkPages(url: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  if (Array.isArray(data)) {
    return data;
  }

  let allResults: any[] = Array.isArray(data.results) ? data.results : [];
  let nextUrl: string | null =
    typeof data.next === "string" && data.next.trim() !== "" ? data.next : null;
  let safetyCounter = 0;

  while (nextUrl && safetyCounter < 50) {
    const pageRes = await fetch(nextUrl);
    if (!pageRes.ok) {
      throw new Error(`API error (page): ${pageRes.status} ${pageRes.statusText}`);
    }
    const pageData = await pageRes.json();
    const pageResults = Array.isArray(pageData.results) ? pageData.results : [];
    allResults = allResults.concat(pageResults);

    nextUrl =
      typeof pageData.next === "string" && pageData.next.trim() !== "" ? pageData.next : null;
    safetyCounter += 1;
  }

  return allResults;
}

/** Placeholder when image is missing or fails to load. Matches Catalog Search. */
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

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useAuth();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);

  const [viewMode, setViewMode] = useState<"gallery" | "list">("list");
  const [currentPage, setCurrentPage] = useState(1);
  const [goToPageInput, setGoToPageInput] = useState("");
  const itemsPerPage = 10;

  // Filter states (mirror Catalog Search)
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [townFilter, setTownFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Shared filter options (states, types, colors) - only states assigned to user
  const { colorOptions, shapeOptions, stateOptions, isLoading: isLoadingFilters, error: filterError } =
    useFilterOptions({ assignedStatesOnly: true });

  // Fetch catalog listings:
  // - All entries submitted via Contributor Dashboard (my-submissions), including pending/rejected/revision
  // - All catalog listings for states assigned to the current user (my-assigned)
  useEffect(() => {
    if (!user) {
      setSubmissions([]);
      setLoading(false);
      return;
    }

    const fetchSubmissions = async () => {
      setLoading(true);
      try {
        const apiUrl = getPostmarksApiUrl();
        if (!apiUrl) {
          toast({
            title: "Configuration error",
            description: "VITE_API_URL is not set, cannot load submissions.",
            variant: "destructive",
          });
          setSubmissions([]);
          return;
        }
        const base = apiUrl.replace(/\/+$/, "");

        // 1) All submissions created via the dashboard (can be pending/rejected/revision/approved)
        const mySubmissionsUrl = `${base}/my-submissions/`;
        // 2) All catalog entries in states assigned to this user (legacy + approved contributions)
        const myAssignedUrl = `${base}/my-assigned/`;

        const [mySubmissionsRaw, myAssignedRaw] = await Promise.all([
          fetchAllPostmarkPages(mySubmissionsUrl),
          fetchAllPostmarkPages(myAssignedUrl),
        ]);

        // Merge and deduplicate by postmarkId so entries that are both "my-submission"
        // and in an assigned state only appear once.
        const seen = new Set<number>();
        const combinedRaw: any[] = [];

        for (const item of [...mySubmissionsRaw, ...myAssignedRaw]) {
          const id = (item as any).postmarkId;
          if (typeof id !== "number") continue;
          if (seen.has(id)) continue;
          seen.add(id);
          combinedRaw.push(item);
        }

        // Sort newest-first by createdDate to match backend ordering expectations.
        combinedRaw.sort((a, b) => {
          const aDate = new Date((a as any).createdDate ?? 0).getTime();
          const bDate = new Date((b as any).createdDate ?? 0).getTime();
          return bDate - aDate;
        });

        const mapped = combinedRaw.map((item: any) => {
          // Prefer list-style mainImage when present; otherwise derive from images[] (full serializer).
          const mainImageFromList =
            (item as any).mainImage?.imageUrl ??
            (typeof (item as any).mainImage === "string" ? (item as any).mainImage : null);

          const mainImageFromImages =
            (item as any).images?.find?.((img: any) => img.displayOrder === 0)?.imageUrl ??
            ((item as any).images && (item as any).images.length > 0
              ? (item as any).images[0].imageUrl
              : null);

          const imageUrl = normalizeImageUrl(mainImageFromList ?? mainImageFromImages);

          const displayName =
            [
              [item.town, item.state].filter(Boolean).join(", "),
              item.shapeName,
            ]
              .filter(Boolean)
              .join(" — ") || item.postmarkKey;

          return {
            // API uses camelCase keys via Postmark* serializers + renderer
            id: item.postmarkId,
            name: displayName,
            town: item.town || "",
            state: item.state || "",
            date_range: item.dateRange || "",
            type: item.shapeName || "",
            color: item.colorsDisplay || "",
            is_manuscript: item.isManuscript === true,
            status: item.contributionApprovalStatus || "pending",
            created_at: item.createdDate || new Date().toISOString(),
            description: undefined,
            image_url: imageUrl,
          };
        });
        setSubmissions(mapped);
      } catch (error: unknown) {
        toast({
          title: "Error loading submissions",
          description: error instanceof Error ? error.message : "Could not load submissions",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSubmissions();
  }, [user, toast]);

  const handleDeleteSubmission = async (submissionId: number) => {
    if (!window.confirm("Are you sure you want to delete this submission from the catalog? This cannot be undone.")) {
      return;
    }
    const apiUrl = getPostmarksApiUrl();
    if (!apiUrl) {
      toast({
        title: "Configuration error",
        description: "VITE_API_URL is not set, cannot delete submission.",
        variant: "destructive",
      });
      return;
    }
    const base = apiUrl.replace(/\/+$/, "");
    const url = `${base}/${submissionId}/delete-mine/`;
    const csrfToken = getCsrfTokenFromCookie();
    const headers: HeadersInit = {};
    if (csrfToken) {
      headers["X-CSRFToken"] = csrfToken;
    }
    try {
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
        headers,
      });
      if (!res.ok) {
        throw new Error(`Delete failed: ${res.status} ${res.statusText}`);
      }
      setSubmissions(prev => prev.filter(s => s.id !== submissionId));
      toast({
        title: "Submission deleted",
        description: "The catalog entry has been removed.",
      });
    } catch (error: unknown) {
      toast({
        title: "Could not delete submission",
        description: error instanceof Error ? error.message : "Please try again or contact an admin.",
        variant: "destructive",
      });
    }
  };

  // Apply filters (mirror Catalog Search semantics on client side)
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((submission) => {
      // Text search (name, town, state, type, color)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch = submission.name != null && String(submission.name).toLowerCase().includes(q);
        if (!nameMatch) return false;
      }

      // Status filter
      if (statusFilter !== "all" && submission.status !== statusFilter) return false;

      // State filter
      if (stateFilter !== "all" && submission.state !== stateFilter) return false;

      // Town filter
      if (townFilter.trim()) {
        const tq = townFilter.trim().toLowerCase();
        if (!submission.town || !submission.town.toLowerCase().includes(tq)) return false;
      }

      // Type filter
      if (typeFilter !== "all" && submission.type !== typeFilter) return false;

      // Color filter
      if (colorFilter !== "all" && submission.color !== colorFilter) return false;

      // Submission created date range filter
      if (dateFrom && new Date(submission.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(submission.created_at) > new Date(dateTo)) return false;

      return true;
    });
  }, [
    submissions,
    searchQuery,
    statusFilter,
    stateFilter,
    townFilter,
    typeFilter,
    colorFilter,
    dateFrom,
    dateTo,
  ]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    statusFilter,
    stateFilter,
    townFilter,
    typeFilter,
    colorFilter,
    dateFrom,
    dateTo,
  ]);

  // Keep current page within bounds when result count changes
  useEffect(() => {
    const total = filteredSubmissions.length;
    const totalPages = Math.max(1, Math.ceil(total / itemsPerPage));
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [filteredSubmissions.length, itemsPerPage]);

  const totalResults = filteredSubmissions.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalResults);
  const paginatedSubmissions = filteredSubmissions.slice(startIndex, endIndex);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "revision":
        return <Badge variant="secondary">Needs Revision</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <main className="flex-1 mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[calc(100vh-8rem)] max-w-[62.5rem] w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-heading font-bold text-foreground mb-2">My Submissions</h1>
          <p className="text-muted-foreground">
            View and track your contributions and their status
          </p>
        </div>

        {/* Mobile Filter Drawer */}
        <div className="lg:hidden mb-4">
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline" className="w-full">
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Filter your submissions</DrawerTitle>
              </DrawerHeader>
              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label>Search</Label>
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Name, town, state, type..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 bg-background"
                      aria-label="Search submissions by name, town, state, or type"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="revision">Needs Revision</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state-mobile">State</Label>
                  <SearchableSelect
                    id="state-mobile"
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
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="town-mobile">Town</Label>
                  <Input
                    id="town-mobile"
                    placeholder="Enter town name..."
                    value={townFilter}
                    onChange={(e) => setTownFilter(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type-mobile">Postmark Type</Label>
                  <SearchableSelect
                    id="type-mobile"
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
                  <Label htmlFor="color-mobile">Color</Label>
                  <SearchableSelect
                    id="color-mobile"
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
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <Label>Submission Date From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <Label>Submission Date To</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                    setStateFilter("all");
                    setTownFilter("");
                    setTypeFilter("all");
                    setColorFilter("all");
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            </DrawerContent>
          </Drawer>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-6 lg:items-stretch min-h-[60vh] w-full">
          {/* Desktop Filters Sidebar */}
          <div className="hidden lg:block">
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 sticky top-4">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Search</Label>
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Name, town, state, type..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 bg-background"
                      aria-label="Search submissions by name, town, state, or type"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="revision">Needs Revision</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" htmlFor="state-desktop">State</Label>
                  <SearchableSelect
                    id="state-desktop"
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
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" htmlFor="town-desktop">Town</Label>
                  <Input
                    id="town-desktop"
                    placeholder="Enter town name..."
                    value={townFilter}
                    onChange={(e) => setTownFilter(e.target.value)}
                    className="bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" htmlFor="type-desktop">Postmark Type</Label>
                  <SearchableSelect
                    id="type-desktop"
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
                  <Label className="text-sm font-medium" htmlFor="color-desktop">Color</Label>
                  <SearchableSelect
                    id="color-desktop"
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
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Submission Date From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Submission Date To</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="bg-background"
                  />
                </div>

                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                    setStateFilter("all");
                    setTownFilter("");
                    setTypeFilter("all");
                    setColorFilter("all");
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Clear Filters
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Submissions List - fixed min height so layout doesn't shrink then expand when loading */}
          <div className="min-w-0 min-h-full flex flex-col w-full" style={{ minHeight: "60vh" }}>
            {loading ? (
              <Card className="flex-1 flex items-center justify-center min-h-0">
                <CardContent className="flex items-center justify-center h-full min-h-[200px]">
                  <p className="text-muted-foreground">Loading submissions...</p>
                </CardContent>
              </Card>
            ) : !user ? (
              <Card className="flex-1 flex items-center justify-center min-h-[60vh]">
                <CardContent className="text-center">
                  <p className="text-muted-foreground mb-4">Sign in to see your submissions.</p>
                  <Button variant="outline" onClick={() => navigate("/auth")}>
                    Sign in
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="flex-1 flex flex-col space-y-4">
                {/* Results header with count + view toggle */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-archival-sm">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {totalResults === 0 ? (
                        "0 results"
                      ) : (
                        <>
                          Showing{" "}
                          <span className="font-semibold text-foreground">
                            {startIndex + 1}-{endIndex}
                          </span>{" "}
                          of{" "}
                          <span className="font-semibold text-foreground">
                            {totalResults.toLocaleString()}
                          </span>{" "}
                          results
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
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

                {/* Results content */}
                {totalResults === 0 ? (
                  <Card className="flex-1 flex items-center justify-center min-h-[60vh]">
                    <CardContent className="text-center">
                      <p className="text-muted-foreground mb-4">
                        {submissions.length === 0
                          ? "You haven't submitted anything yet."
                          : "No submissions found matching your filters."}
                      </p>
                      {submissions.length === 0 && (
                        <Button variant="outline" onClick={() => navigate("/contribute")}>
                          Go to Contribute
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ) : viewMode === "list" ? (
                  <div className="space-y-4">
                    {paginatedSubmissions.map((submission) => (
                      <Card
                        key={submission.id}
                        className="shadow-archival-md hover:shadow-archival-lg transition-shadow cursor-pointer"
                        onClick={() => navigate(`/record/${submission.id}`)}
                      >
                        <CardContent className="p-6">
                          <div className="flex gap-6">
                            <ImageOrPlaceholder
                              src={submission.image_url}
                              alt={submission.name}
                              className="w-32 h-32 object-cover rounded border border-border shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <h3 className="font-heading text-xl font-semibold text-foreground">
                                  {submission.name}
                                </h3>
                                {getStatusBadge(submission.status)}
                              </div>

                              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                {(submission.town || submission.state) && (
                                  <div>
                                    <span className="text-muted-foreground">Location:</span>{" "}
                                    <span className="text-foreground">
                                      {submission.town ? `${submission.town}, ${submission.state}` : submission.state}
                                    </span>
                                  </div>
                                )}
                                {submission.date_range && (
                                  <div>
                                    <span className="text-muted-foreground">Date Range:</span>{" "}
                                    <span className="text-foreground">{submission.date_range}</span>
                                  </div>
                                )}
                                {submission.color && (
                                  <div>
                                    <span className="text-muted-foreground">Color:</span>{" "}
                                    <span className="text-foreground">{submission.color}</span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-muted-foreground">Submitted:</span>{" "}
                                  <span className="text-foreground">
                                    {new Date(submission.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>

                              {submission.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                                  {submission.description}
                                </p>
                              )}

                              <div className="mt-3 flex gap-2 justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/record/${submission.id}`);
                                  }}
                                >
                                  View details
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/edit/${submission.id}`);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSubmission(submission.id);
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {paginatedSubmissions.map((submission) => (
                      <Card
                        key={submission.id}
                        className="shadow-archival-md hover:shadow-archival-lg transition-shadow cursor-pointer overflow-hidden"
                        onClick={() => navigate(`/record/${submission.id}`)}
                      >
                        <ImageOrPlaceholder
                          src={submission.image_url}
                          alt={submission.name}
                          className="w-full h-48 object-cover border-b border-border"
                        />
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="font-heading text-lg font-semibold text-foreground">
                              {submission.name}
                            </h3>
                            {getStatusBadge(submission.status)}
                          </div>

                          <div className="space-y-1 text-sm">
                            {(submission.town || submission.state) && (
                              <div>
                                <span className="text-muted-foreground">Location:</span>{" "}
                                <span className="text-foreground">
                                  {submission.town ? `${submission.town}, ${submission.state}` : submission.state}
                                </span>
                              </div>
                            )}
                            {submission.date_range && (
                              <div>
                                <span className="text-muted-foreground">Date Range:</span>{" "}
                                <span className="text-foreground">{submission.date_range}</span>
                              </div>
                            )}
                            {submission.color && (
                              <div>
                                <span className="text-muted-foreground">Color:</span>{" "}
                                <span className="text-foreground">{submission.color}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-muted-foreground">Submitted:</span>{" "}
                              <span className="text-foreground">
                                {new Date(submission.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/record/${submission.id}`);
                              }}
                            >
                              View details
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/edit/${submission.id}`);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSubmission(submission.id);
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && totalResults > 0 && (
                  <div className="mt-4 flex flex-col items-center gap-4">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => {
                              setCurrentPage((p) => Math.max(1, p - 1));
                            }}
                            className={safeCurrentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>

                        {getPaginationPages(safeCurrentPage, totalPages).map((p, i) =>
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
                                isActive={safeCurrentPage === p}
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
                              setCurrentPage((p) => Math.min(totalPages, p + 1));
                            }}
                            className={
                              safeCurrentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                            }
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
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Dashboard;
