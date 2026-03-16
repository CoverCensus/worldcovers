import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar, Grid3x3, List, Loader2, Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
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

type DashboardTab = "submissions" | "suggestions" | "editor";

interface DashboardItem {
  id: number;
  name: string;
  town: string;
  state: string;
  dateRange?: string;
  size?: string;
  type?: string;
  color?: string;
  status: string;
  created_at: string;
  description?: string;
  image_url: string | null;
  postmark_id?: number | null;
}

interface EditorQueueItem {
  id: number;
  contributor: number;
  contributor_username: string;
  postmark: number | null;
  postmark_id: number | null;
  status: string;
  reviewer: number | null;
  reviewer_username: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  state_display: string;
  town_display: string;
}

/** Build compact page numbers for pagination (shared with Catalog Search) */
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

interface DashboardProps {
  initialTab?: DashboardTab;
}

const Dashboard = ({ initialTab = "submissions" }: DashboardProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);

  const [submissions, setSubmissions] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"gallery" | "list">("list");
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [goToPageInput, setGoToPageInput] = useState("");
  const itemsPerPage = 10;

  // Suggestions state
  const [suggestions, setSuggestions] = useState<DashboardItem[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionsPage, setSuggestionsPage] = useState(1);
  const [suggestionsGoToInput, setSuggestionsGoToInput] = useState("");
  const suggestionsPageSize = 10;

  // Editor moderation queue state
  const [editorItems, setEditorItems] = useState<EditorQueueItem[]>([]);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorDecisionTarget, setEditorDecisionTarget] = useState<EditorQueueItem | null>(null);
  const [editorDecisionKind, setEditorDecisionKind] = useState<"approve" | "reject" | "revision">("approve");
  const [editorReviewNotes, setEditorReviewNotes] = useState("");
  const [editorSubmittingDecision, setEditorSubmittingDecision] = useState(false);

  // Filter states (mirror Catalog Search)
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [townFilter, setTownFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const dateFromInputRef = useRef<HTMLInputElement>(null);
  const dateToInputRef = useRef<HTMLInputElement>(null);

  // Shared filter options (states, types, colors) - only states assigned to user
  const { colorOptions, shapeOptions, stateOptions, isLoading: isLoadingFilters, error: filterError } =
    useFilterOptions({ assignedStatesOnly: true });

  // Disable filters while submissions or filter options are loading
  const filtersDisabled = loading || isLoadingFilters;
  const isStateEditor = user?.role === "state_editor";
  // Fetch current user's contributions for "My Submissions" (new catalog entries)
  useEffect(() => {
    if (!user) {
      setSubmissions([]);
      setLoading(false);
      return;
    }

    const fetchSubmissions = async () => {
      setLoading(true);
      try {
        const apiEnv = import.meta.env.VITE_API_URL;
        const apiBase =
          apiEnv && typeof apiEnv === "string" && apiEnv.trim() !== ""
            ? apiEnv.trim().replace(/\/+$/, "")
            : null;

        if (!apiBase) {
          toast({
            title: "Configuration error",
            description: "VITE_API_URL is not set, cannot load submissions.",
            variant: "destructive",
          });
          setSubmissions([]);
          return;
        }

        const res = await fetch(`${apiBase}/api/contributions/?kind=submission`, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        const data: any[] = await res.json();
        if (!Array.isArray(data)) {
          setSubmissions([]);
          return;
        }
        const mapped: DashboardItem[] = data.map((c) => {
          const state = (c.stateDisplay || c.state_display || c.submittedData?.state || "").trim();
          const town = (c.townDisplay || c.town_display || c.submittedData?.town || "").trim();

          const mainImageFromList =
            c.mainImage?.imageUrl ??
            (typeof c.mainImage === "string" ? c.mainImage : null);

          const imageUrl = normalizeImageUrl(
            mainImageFromList ??
              c.imageUrl ??
              c.image_url ??
              null,
          );

          const displayName =
            [
              [town, state].filter(Boolean).join(", "),
              c.shapeName || c.typeDisplay || c.type || c.submittedData?.type,
            ]
              .filter(Boolean)
              .join(" — ") || `Submission #${c.id}`;

          const dateRange =
            c.dateRange ||
            c.date_range ||
            c.submittedData?.dateRange ||
            (c.submittedData?.firstSeen
              ? c.submittedData.lastSeen
                ? `${c.submittedData.firstSeen}-${c.submittedData.lastSeen}`
                : String(c.submittedData.firstSeen)
              : "");

          return {
            id: c.id,
            name: displayName,
            town,
            state,
            dateRange,
            size: c.sizeDisplay || c.size || c.submittedData?.dimensions || "",
            type: c.shapeName || c.typeDisplay || c.type || c.submittedData?.type || "",
            color: c.colorsDisplay || c.colorDisplay || c.color || c.submittedData?.color || "",
            status: String(c.status || "pending"),
            created_at: String(c.createdAt || c.created_at || ""),
            description: c.description || c.submittedData?.description || "",
            image_url: imageUrl,
            postmark_id:
              typeof c.postmarkId === "number"
                ? c.postmarkId
                : typeof c.postmark_id === "number"
                  ? c.postmark_id
                  : typeof c.catalogPostmarkId === "number"
                    ? c.catalogPostmarkId
                    : typeof c.postmark?.id === "number"
                      ? c.postmark.id
                      : null,
          } as DashboardItem;
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

  // Fetch suggestions (corrections) for the current user
  useEffect(() => {
    const apiEnv = import.meta.env.VITE_API_URL;
    const apiBase =
      apiEnv && typeof apiEnv === "string" && apiEnv.trim() !== ""
        ? apiEnv.trim().replace(/\/+$/, "")
        : null;

    if (!apiBase || !user) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    const load = async () => {
      setSuggestionsLoading(true);
      try {
        const res = await fetch(`${apiBase}/api/contributions/?kind=suggestion`, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        const data: any[] = await res.json();
        if (!Array.isArray(data)) {
          setSuggestions([]);
          return;
        }
        const mapped: DashboardItem[] = data.map((c) => {
          const state = (c.stateDisplay || c.state_display || c.submittedData?.state || "").trim();
          const town = (c.townDisplay || c.town_display || c.submittedData?.town || "").trim();

          const mainImageFromList =
            c.mainImage?.imageUrl ??
            (typeof c.mainImage === "string" ? c.mainImage : null);

          const imageUrl = normalizeImageUrl(
            mainImageFromList ??
              c.imageUrl ??
              c.image_url ??
              null,
          );

          const displayName =
            [
              [town, state].filter(Boolean).join(", "),
              c.shapeName || c.typeDisplay || c.type || c.submittedData?.type,
            ]
              .filter(Boolean)
              .join(" — ") || `Suggestion #${c.id}`;

          const dateRange =
            c.dateRange ||
            c.date_range ||
            c.submittedData?.dateRange ||
            (c.submittedData?.firstSeen
              ? c.submittedData.lastSeen
                ? `${c.submittedData.firstSeen}-${c.submittedData.lastSeen}`
                : String(c.submittedData.firstSeen)
              : "");

          return {
            id: c.id,
            name: displayName,
            town,
            state,
            dateRange,
            size: c.sizeDisplay || c.size || c.submittedData?.dimensions || "",
            type: c.shapeName || c.typeDisplay || c.type || c.submittedData?.type || "",
            color: c.colorsDisplay || c.colorDisplay || c.color || c.submittedData?.color || "",
            status: String(c.status || "pending"),
            created_at: String(c.createdAt || c.created_at || ""),
            description: c.description || c.submittedData?.description || "",
            image_url: imageUrl,
            postmark_id:
              typeof c.postmarkId === "number"
                ? c.postmarkId
                : typeof c.postmark_id === "number"
                  ? c.postmark_id
                  : typeof c.catalogPostmarkId === "number"
                    ? c.catalogPostmarkId
                    : typeof c.postmark?.id === "number"
                      ? c.postmark.id
                      : null,
          } as DashboardItem;
        });
        setSuggestions(mapped);
      } catch (err) {
        toast({
          title: "Error loading suggestions",
          description: err instanceof Error ? err.message : "Could not load your suggestions.",
          variant: "destructive",
        });
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    };

    load();
  }, [user, toast]);

  // Fetch editor moderation queue when Editor tab is active
  useEffect(() => {
    if (!isStateEditor || activeTab !== "editor") {
      return;
    }

    const apiEnv = import.meta.env.VITE_API_URL;
    const apiBase =
      apiEnv && typeof apiEnv === "string" && apiEnv.trim() !== ""
        ? apiEnv.trim().replace(/\/+$/, "")
        : null;

    if (!apiBase) {
      setEditorError("VITE_API_URL is not set, cannot load editor queue.");
      setEditorItems([]);
      return;
    }

    const loadEditorQueue = async () => {
      setEditorLoading(true);
      setEditorError(null);
      try {
        const res = await fetch(`${apiBase}/api/contributions/?mode=editor&status=pending`, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        const data: EditorQueueItem[] = await res.json();
        if (!Array.isArray(data)) {
          setEditorItems([]);
          return;
        }
        setEditorItems(data);
      } catch (err) {
        setEditorError(err instanceof Error ? err.message : "Could not load editor queue.");
        setEditorItems([]);
      } finally {
        setEditorLoading(false);
      }
    };

    loadEditorQueue();
  }, [isStateEditor, activeTab]);

  const handleDeleteSubmission = async () => {
    if (!deleteTarget) return;
    const postmarkId = deleteTarget.postmark_id as number | undefined;
    if (!postmarkId) return;

    const apiUrl = getPostmarksApiUrl();
    if (!apiUrl) {
      toast({
        title: "Configuration error",
        description: "VITE_API_URL is not set, cannot delete catalog entry.",
        variant: "destructive",
      });
      return;
    }
    const base = apiUrl.replace(/\/+$/, "");
    const url = `${base}/${postmarkId}/`;
    const csrfToken = getCsrfTokenFromCookie();
    const headers: HeadersInit = {};
    if (csrfToken) {
      headers["X-CSRFToken"] = csrfToken;
    }
    try {
      setDeletingId(postmarkId);
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
        headers,
      });
      if (!res.ok) {
        throw new Error(`Delete failed: ${res.status} ${res.statusText}`);
      }
      // Remove this submission from the visible list
      setSubmissions(prev => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({
        title: "Catalog entry deleted",
        description: "The catalog entry linked to this submission has been removed.",
      });
    } catch (error: unknown) {
      toast({
        title: "Could not delete catalog entry",
        description: error instanceof Error ? error.message : "Please try again or contact an admin.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
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

  const effectiveTotalCount = filteredSubmissions.length;

  const totalPages = Math.max(1, Math.ceil(effectiveTotalCount / itemsPerPage));

  let paginatedSubmissions: DashboardItem[] = [];
  let pageStart = 0;
  let pageEnd = 0;

  if (effectiveTotalCount === 0) {
    paginatedSubmissions = [];
    pageStart = 0;
    pageEnd = 0;
  } else {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredSubmissions.length);
    paginatedSubmissions = filteredSubmissions.slice(startIndex, endIndex);
    pageStart = startIndex + 1;
    pageEnd = endIndex;
  }

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

  // Reset submissions pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, stateFilter, townFilter, typeFilter, colorFilter, dateFrom, dateTo]);

  // Suggestions derived state – reuse same filter semantics as submissions
  const filteredSuggestions = useMemo(() => {
    return suggestions.filter((suggestion) => {
      // Text search (name, town, state, type, color)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch =
          suggestion.name != null && String(suggestion.name).toLowerCase().includes(q);
        if (!nameMatch) return false;
      }

      // Status filter
      if (statusFilter !== "all" && suggestion.status !== statusFilter) return false;

      // State filter
      if (stateFilter !== "all" && suggestion.state !== stateFilter) return false;

      // Town filter
      if (townFilter.trim()) {
        const tq = townFilter.trim().toLowerCase();
        if (!suggestion.town || !suggestion.town.toLowerCase().includes(tq)) return false;
      }

      // Type filter
      if (typeFilter !== "all" && suggestion.type !== typeFilter) return false;

      // Color filter
      if (colorFilter !== "all" && suggestion.color !== colorFilter) return false;

      // Created date range filter
      if (dateFrom && new Date(suggestion.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(suggestion.created_at) > new Date(dateTo)) return false;

      return true;
    });
  }, [
    suggestions,
    searchQuery,
    statusFilter,
    stateFilter,
    townFilter,
    typeFilter,
    colorFilter,
    dateFrom,
    dateTo,
  ]);

  const suggestionsTotal = filteredSuggestions.length;
  const suggestionsTotalPages = Math.max(1, Math.ceil(suggestionsTotal / suggestionsPageSize));
  const suggestionsStartIndex = (suggestionsPage - 1) * suggestionsPageSize;
  const suggestionsPageItems = filteredSuggestions.slice(
    suggestionsStartIndex,
    suggestionsStartIndex + suggestionsPageSize,
  );
  const suggestionsPageStart = suggestionsTotal === 0 ? 0 : suggestionsStartIndex + 1;
  const suggestionsPageEnd = Math.min(suggestionsStartIndex + suggestionsPageSize, suggestionsTotal);

  // Reset suggestions pagination when shared filters change
  useEffect(() => {
    setSuggestionsPage(1);
  }, [searchQuery, statusFilter, stateFilter, townFilter, typeFilter, colorFilter, dateFrom, dateTo]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-2">
                {isStateEditor && activeTab === "editor" ? "Editor Dashboard" : "Contributor Dashboard"}
              </h1>
              <p className="text-muted-foreground">
                {isStateEditor && activeTab === "editor"
                  ? "Review and decide on submissions for your assigned states."
                  : "View and track your submissions and suggestions."}
              </p>
            </div>

            <div className="inline-flex rounded-md border border-border bg-card p-1">
              <Button
                type="button"
                variant={activeTab === "submissions" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-r-none"
                onClick={() => setActiveTab("submissions")}
              >
                My Submissions
              </Button>
              <Button
                type="button"
                variant={activeTab === "suggestions" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-l-none"
                onClick={() => setActiveTab("suggestions")}
              >
                My Suggestions
              </Button>
              {isStateEditor && (
                <Button
                  type="button"
                  variant={activeTab === "editor" ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-l-none"
                  onClick={() => setActiveTab("editor")}
                >
                  Editor Queue
                </Button>
              )}
            </div>
          </div>

          {activeTab === "submissions" && (
            <div className="flex flex-col lg:flex-row gap-6">
              <aside className={`lg:w-80 space-y-6 ${filtersOpen ? "block" : "hidden lg:block"}`}>
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
                        disabled={filtersDisabled}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter} disabled={filtersDisabled}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="All Statuses" />
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
                      className="bg-background"
                      disabled={filtersDisabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="type">Postmark Type</Label>
                    <SearchableSelect
                      id="type"
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
                      disabled={filtersDisabled}
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

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label>Submission Date From</Label>
                      <div className="relative">
                        <Input
                          ref={dateFromInputRef}
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                          className="bg-background pr-10 date-input-hide-native-icon"
                          disabled={filtersDisabled}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:bg-transparent hover:text-foreground"
                          onClick={() => dateFromInputRef.current?.showPicker?.()}
                          disabled={filtersDisabled}
                          aria-label="Open date picker"
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Submission Date To</Label>
                      <div className="relative">
                        <Input
                          ref={dateToInputRef}
                          type="date"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                          className="bg-background pr-10 date-input-hide-native-icon"
                          disabled={filtersDisabled}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:bg-transparent hover:text-foreground"
                          onClick={() => dateToInputRef.current?.showPicker?.()}
                          disabled={filtersDisabled}
                          aria-label="Open date picker"
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
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
                    disabled={filtersDisabled}
                  >
                    Clear Filters
                  </Button>
                </CardContent>
              </Card>
              </aside>

              <main className="flex-1 space-y-4">
              {/* Results Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-archival-sm">
                <div>
                    <p className="text-sm text-muted-foreground">
                    {effectiveTotalCount === 0 ? (
                      "0 results"
                    ) : (
                      <>
                        Showing{" "}
                        <span className="font-semibold text-foreground">
                          {pageStart.toLocaleString()}-{pageEnd.toLocaleString()}
                        </span>{" "}
                        of{" "}
                        <span className="font-semibold text-foreground">
                          {effectiveTotalCount.toLocaleString()}
                        </span>{" "}
                        results
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
                  {/* {loading && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    </div>
                  )} */}
                </div>
              </div>

              {/* Submissions List (backed by contributions; can manage linked catalog entry when present) */}
              {loading ? (
                 <div className="flex flex-col justify-center items-center gap-3 py-12 text-muted-foreground">
                 <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                 <p className="text-muted-foreground">Loading submissions...</p>
               </div>
              ) : filteredSubmissions.length === 0 ? (
                <Card className="flex-1 flex items-center justify-center min-h-[200px]">
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
                      className="shadow-archival-md hover:shadow-archival-lg transition-shadow"
                    >
                      <CardContent className="p-6">
                        <div className="flex gap-6 md:flex-row flex-col">
                          <ImageOrPlaceholder
                            src={submission.image_url}
                            alt={submission.name}
                            className="md:w-32 md:h-32 w-full h-48 object-cover rounded border border-border shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <h3 className="font-heading text-xl font-semibold text-foreground">
                                {submission.name}
                              </h3>
                              {getStatusBadge(submission.status)}
                            </div>

                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                            {submission.town && (
                                <div>
                                  <span className="text-muted-foreground">Town:</span>{" "}
                                  <span className="text-foreground">{submission.town}</span>
                                </div>
                              )}
                              {submission.state && (
                                <div>
                                  <span className="text-muted-foreground">State:</span>{" "}
                                  <span className="text-foreground">{submission.state}</span>
                                </div>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                              {submission.dateRange && (
                                <div>
                                  <span className="text-muted-foreground">Date Seen:</span>{" "}
                                  <span className="text-foreground">{submission.dateRange}</span>
                                </div>
                              )}
                              {submission.size && (
                                <div>
                                  <span className="text-muted-foreground">Size:</span>{" "}
                                  <span className="text-foreground">{submission.size}</span>
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

                            <div className="mt-3 flex flex-wrap gap-2 justify-end">
                              {submission.postmark_id && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      navigate(`/record/${submission.postmark_id}`)
                                    }
                                  >
                                    View
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      navigate(`/edit/${submission.postmark_id}`, {
                                        state: { fromDashboard: true, fromDashboardDirect: true },
                                      })
                                    }
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => setDeleteTarget(submission)}
                                  >
                                    Delete
                                  </Button>
                                </>
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
                  {paginatedSubmissions.map((submission) => (
                    <Card
                      key={submission.id}
                      className="shadow-archival-md hover:shadow-archival-lg transition-shadow overflow-hidden"
                    >
                      <ImageOrPlaceholder
                        src={submission.image_url}
                        alt={submission.name}
                        className="w-full h-48 object-cover"
                      />
                      <CardContent className="p-4 flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-heading text-lg font-semibold text-foreground">
                            {submission.name}
                          </h3>
                          {getStatusBadge(submission.status)}
                        </div>

                        <div className="space-y-1 text-sm flex-1">
                        {submission.town && (
                            <div>
                              <span className="text-muted-foreground">Town:</span>{" "}
                              <span className="text-foreground">{submission.town}</span>
                            </div>
                          )}
                             {submission.state && (
                            <div>
                              <span className="text-muted-foreground">State:</span>{" "}
                              <span className="text-foreground">{submission.state}</span>
                            </div>
                          )}
                          {submission.dateRange && (
                            <div>
                              <span className="text-muted-foreground">Date Seen:</span>{" "}
                              <span className="text-foreground">{submission.dateRange}</span>
                            </div>
                          )}
                          {submission.size && (
                            <div>
                              <span className="text-muted-foreground">Size:</span>{" "}
                              <span className="text-foreground">{submission.size}</span>
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

                        <div className="mt-2 flex flex-wrap gap-2 justify-center">
                          {submission.postmark_id && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  navigate(`/record/${submission.postmark_id}`)
                                }
                              >
                                View
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  navigate(`/edit/${submission.postmark_id}`, {
                                    state: { fromDashboard: true, fromDashboardDirect: true },
                                  })
                                }
                              >
                                Edit
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setDeleteTarget(submission)}
                              >
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {totalPages > 1 && !loading && user && filteredSubmissions.length > 0 && (
                <div className="mt-8 flex flex-col items-center gap-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => {
                            setCurrentPage((p) => Math.max(1, p - 1));
                            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
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
                                window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                              }}
                              isActive={currentPage === p}
                              className="cursor-pointer"
                            >
                              {p}
                            </PaginationLink>
                          </PaginationItem>
                        ),
                      )}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() => {
                            setCurrentPage((p) => Math.min(totalPages, p + 1));
                            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                          }}
                          className={
                            currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
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
                            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
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
                          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
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
          )}

          {activeTab === "suggestions" && (
            <div className="flex flex-col lg:flex-row gap-6">
              <aside className={`lg:w-80 space-y-6 ${filtersOpen ? "block" : "hidden lg:block"}`}>
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
                      <Label>Search</Label>
                      <div className="relative">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="search"
                          placeholder="Name, town, state, type..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9 bg-background"
                          aria-label="Search suggestions by name, town, state, or type"
                          disabled={filtersDisabled}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={statusFilter} onValueChange={setStatusFilter} disabled={filtersDisabled}>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="All Statuses" />
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
                      <Label htmlFor="state-suggestions">State</Label>
                      <SearchableSelect
                        id="state-suggestions"
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
                        aria-label="Filter suggestions by state"
                        disabled={filtersDisabled}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="town-suggestions">Town</Label>
                      <Input
                        id="town-suggestions"
                        placeholder="Enter town name..."
                        value={townFilter}
                        onChange={(e) => setTownFilter(e.target.value)}
                        className="bg-background"
                        disabled={filtersDisabled}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="type-suggestions">Postmark Type</Label>
                      <SearchableSelect
                        id="type-suggestions"
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
                        aria-label="Filter suggestions by postmark type"
                        disabled={filtersDisabled}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="color-suggestions">Color</Label>
                      <SearchableSelect
                        id="color-suggestions"
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
                        aria-label="Filter suggestions by color"
                        disabled={filtersDisabled}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label>Submitted Date From</Label>
                        <div className="relative">
                          <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="bg-background pr-10 date-input-hide-native-icon"
                            disabled={filtersDisabled}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:bg-transparent hover:text-foreground"
                            disabled={filtersDisabled}
                            aria-label="Open date picker"
                          >
                            <Calendar className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Submitted Date To</Label>
                        <div className="relative">
                          <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="bg-background pr-10 date-input-hide-native-icon"
                            disabled={filtersDisabled}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:bg-transparent hover:text-foreground"
                            disabled={filtersDisabled}
                            aria-label="Open date picker"
                          >
                            <Calendar className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
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
                      disabled={filtersDisabled}
                    >
                      Clear Filters
                    </Button>
                  </CardContent>
                </Card>
              </aside>

              <main className="flex-1 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-archival-sm">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {suggestionsTotal === 0 ? (
                        "0 suggestions"
                      ) : (
                        <>
                          Showing{" "}
                          <span className="font-semibold text-foreground">
                            {suggestionsPageStart.toLocaleString()}-{suggestionsPageEnd.toLocaleString()}
                          </span>{" "}
                          of{" "}
                          <span className="font-semibold text-foreground">
                            {suggestionsTotal.toLocaleString()}
                          </span>{" "}
                          suggestions
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
                  </div>
                </div>

                {suggestionsLoading ? (
                  <div className="flex flex-col justify-center items-center gap-3 py-12 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                    <p>Loading suggestions...</p>
                  </div>
                ) : filteredSuggestions.length === 0 ? (
                  <Card className="flex-1 flex items-center justify-center min-h-[200px]">
                    <CardContent className="text-center">
                      <p className="text-muted-foreground mb-4">
                        {suggestions.length === 0
                          ? "You have not submitted any suggestions yet."
                          : "No suggestions found matching your filters."}
                      </p>
                      {suggestions.length === 0 && (
                        <Button variant="outline" onClick={() => navigate("/contribute")}>
                          Go to Contribute
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ) : viewMode === "list" ? (
                  <div className="space-y-4">
                    {suggestionsPageItems.map((item) => (
                      <Card
                        key={item.id}
                        className="shadow-archival-md hover:shadow-archival-lg transition-shadow"
                      >
                        <CardContent className="p-6">
                          <div className="flex gap-6 md:flex-row flex-col">
                            <ImageOrPlaceholder
                              src={item.image_url}
                              alt={item.name}
                              className="md:w-32 md:h-32 w-full h-48 object-cover rounded border border-border shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <h3 className="font-heading text-xl font-semibold text-foreground">
                                  {item.name}
                                </h3>
                                {getStatusBadge(item.status)}
                              </div>

                              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                {item.town && (
                                  <div>
                                    <span className="text-muted-foreground">Town:</span>{" "}
                                    <span className="text-foreground">{item.town}</span>
                                  </div>
                                )}
                                {item.state && (
                                  <div>
                                    <span className="text-muted-foreground">State:</span>{" "}
                                    <span className="text-foreground">{item.state}</span>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                {item.dateRange && (
                                  <div>
                                    <span className="text-muted-foreground">Date Seen:</span>{" "}
                                    <span className="text-foreground">{item.dateRange}</span>
                                  </div>
                                )}
                                {item.size && (
                                  <div>
                                    <span className="text-muted-foreground">Size:</span>{" "}
                                    <span className="text-foreground">{item.size}</span>
                                  </div>
                                )}
                                {item.color && (
                                  <div>
                                    <span className="text-muted-foreground">Color:</span>{" "}
                                    <span className="text-foreground">{item.color}</span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-muted-foreground">Submitted:</span>{" "}
                                  <span className="text-foreground">
                                    {new Date(item.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>

                              {item.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                                  {item.description}
                                </p>
                              )}

                              <div className="mt-3 flex gap-2 justify-end">
                                {item.postmark_id && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`/record/api-${item.postmark_id}`)}
                                  >
                                    View
                                  </Button>
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
                    {suggestionsPageItems.map((item) => (
                      <Card
                        key={item.id}
                        className="shadow-archival-md hover:shadow-archival-lg transition-shadow overflow-hidden"
                      >
                        <ImageOrPlaceholder
                          src={item.image_url}
                          alt={item.name}
                          className="w-full h-48 object-cover"
                        />
                        <CardContent className="p-4 flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-heading text-lg font-semibold text-foreground">
                              {item.name}
                            </h3>
                            {getStatusBadge(item.status)}
                          </div>

                          <div className="space-y-1 text-sm flex-1">
                            {item.town && (
                              <div>
                                <span className="text-muted-foreground">Town:</span>{" "}
                                <span className="text-foreground">{item.town}</span>
                              </div>
                            )}
                            {item.state && (
                              <div>
                                <span className="text-muted-foreground">State:</span>{" "}
                                <span className="text-foreground">{item.state}</span>
                              </div>
                            )}
                            {item.dateRange && (
                              <div>
                                <span className="text-muted-foreground">Date Seen:</span>{" "}
                                <span className="text-foreground">{item.dateRange}</span>
                              </div>
                            )}
                            {item.size && (
                              <div>
                                <span className="text-muted-foreground">Size:</span>{" "}
                                <span className="text-foreground">{item.size}</span>
                              </div>
                            )}
                            {item.color && (
                              <div>
                                <span className="text-muted-foreground">Color:</span>{" "}
                                <span className="text-foreground">{item.color}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-muted-foreground">Submitted:</span>{" "}
                              <span className="text-foreground">
                                {new Date(item.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          <div className="mt-2 flex gap-2 justify-center">
                            {item.postmark_id && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/record/api-${item.postmark_id}`)}
                              >
                                View
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {suggestionsTotalPages > 1 && !suggestionsLoading && filteredSuggestions.length > 0 && (
                  <div className="mt-8 flex flex-col items-center gap-4">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => {
                              setSuggestionsPage((p) => Math.max(1, p - 1));
                              window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                            }}
                            className={
                              suggestionsPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
                            }
                          />
                        </PaginationItem>

                        {getPaginationPages(suggestionsPage, suggestionsTotalPages).map((p, i) =>
                          p === "ellipsis" ? (
                            <PaginationItem key={`ellipsis-${i}`}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          ) : (
                            <PaginationItem key={p}>
                              <PaginationLink
                                onClick={() => {
                                  setSuggestionsPage(p);
                                  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                                }}
                                isActive={suggestionsPage === p}
                                className="cursor-pointer"
                              >
                                {p}
                              </PaginationLink>
                            </PaginationItem>
                          ),
                        )}

                        <PaginationItem>
                          <PaginationNext
                            onClick={() => {
                              setSuggestionsPage((p) => Math.min(suggestionsTotalPages, p + 1));
                              window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                            }}
                            className={
                              suggestionsPage === suggestionsTotalPages
                                ? "pointer-events-none opacity-50"
                                : "cursor-pointer"
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
                        max={suggestionsTotalPages}
                        placeholder="Page"
                        value={suggestionsGoToInput}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            setSuggestionsGoToInput("");
                            return;
                          }
                          const n = parseInt(raw, 10);
                          if (Number.isNaN(n)) return;
                          const clamped = Math.max(1, Math.min(suggestionsTotalPages, n));
                          setSuggestionsGoToInput(String(clamped));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const n = parseInt(suggestionsGoToInput, 10);
                            if (!Number.isNaN(n)) {
                              setSuggestionsPage(Math.max(1, Math.min(suggestionsTotalPages, n)));
                              window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                              setSuggestionsGoToInput("");
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
                          const n = parseInt(suggestionsGoToInput, 10);
                          if (!Number.isNaN(n)) {
                            setSuggestionsPage(Math.max(1, Math.min(suggestionsTotalPages, n)));
                            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                            setSuggestionsGoToInput("");
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
          )}

          {activeTab === "editor" && isStateEditor && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-archival-sm">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {editorLoading
                      ? "Loading pending submissions for your assigned states..."
                      : `${editorItems.length.toLocaleString()} pending submission${editorItems.length === 1 ? "" : "s"} in your assigned states`}
                  </p>
                  {editorError && (
                    <p className="text-xs text-destructive mt-1">
                      {editorError}
                    </p>
                  )}
                </div>
              </div>

              {editorLoading ? (
                <div className="flex flex-col justify-center items-center gap-3 py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                  <p>Loading editor queue...</p>
                </div>
              ) : editorItems.length === 0 ? (
                <Card className="flex-1 flex items-center justify-center min-h-[200px]">
                  <CardContent className="text-center">
                    <p className="text-muted-foreground mb-1">
                      There are no pending submissions for your assigned states.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      New submissions will appear here as contributors submit them.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {editorItems.map((item) => (
                    <Card
                      key={item.id}
                      className="shadow-archival-md hover:shadow-archival-lg transition-shadow"
                    >
                      <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-heading text-lg font-semibold text-foreground">
                                {item.town_display && item.state_display
                                  ? `${item.town_display}, ${item.state_display}`
                                  : item.state_display || item.town_display || `Submission #${item.id}`}
                              </h3>
                              {getStatusBadge(item.status)}
                            </div>
                            <div className="text-sm text-muted-foreground space-y-1">
                              <div>
                                <span className="font-medium text-foreground">Contributor:</span>{" "}
                                <span>{item.contributor_username}</span>
                              </div>
                              <div>
                                <span className="font-medium text-foreground">Submitted:</span>{" "}
                                <span>{new Date(item.created_at).toLocaleString()}</span>
                              </div>
                              {item.review_notes && (
                                <div>
                                  <span className="font-medium text-foreground">Previous notes:</span>{" "}
                                  <span>{item.review_notes}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2 justify-end">
                            {item.postmark_id && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/record/${item.postmark_id}`)}
                              >
                                View Catalog Entry
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditorDecisionTarget(item);
                                setEditorDecisionKind("approve");
                                setEditorReviewNotes("");
                              }}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditorDecisionTarget(item);
                                setEditorDecisionKind("reject");
                                setEditorReviewNotes("");
                              }}
                            >
                              Reject
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditorDecisionTarget(item);
                                setEditorDecisionKind("revision");
                                setEditorReviewNotes("Needs revision: ");
                              }}
                            >
                              Needs Revision
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
      </div>
      <Footer />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deletingId) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name ?? "this catalog entry"}
              </span>{" "}
              from your submissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubmission}
              disabled={!!deletingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!editorDecisionTarget}
        onOpenChange={(open) => {
          if (!open && !editorSubmittingDecision) {
            setEditorDecisionTarget(null);
            setEditorReviewNotes("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {editorDecisionKind === "approve"
                ? "Approve submission"
                : editorDecisionKind === "reject"
                  ? "Reject submission"
                  : "Request revisions"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {editorDecisionKind === "approve"
                ? "This will apply the contributor's data to the catalog."
                : editorDecisionKind === "reject"
                  ? "This will reject the submission. The catalog will remain unchanged."
                  : "This will reject the submission but your notes should explain what needs to be revised so the contributor can resubmit."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="editor-review-notes">Feedback to contributor (optional but recommended)</Label>
            <Textarea
              id="editor-review-notes"
              value={editorReviewNotes}
              onChange={(e) => setEditorReviewNotes(e.target.value)}
              rows={4}
              placeholder={
                editorDecisionKind === "approve"
                  ? "Optional note about your decision..."
                  : "Explain what is incorrect, missing, or needs clarification..."
              }
              disabled={editorSubmittingDecision}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={editorSubmittingDecision}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={editorSubmittingDecision}
              onClick={async () => {
                if (!editorDecisionTarget || !isStateEditor) return;

                const apiEnv = import.meta.env.VITE_API_URL;
                const apiBase =
                  apiEnv && typeof apiEnv === "string" && apiEnv.trim() !== ""
                    ? apiEnv.trim().replace(/\/+$/, "")
                    : null;
                if (!apiBase) {
                  toast({
                    title: "Configuration error",
                    description: "VITE_API_URL is not set, cannot submit decision.",
                    variant: "destructive",
                  });
                  return;
                }

                const actionPath =
                  editorDecisionKind === "approve"
                    ? "approve"
                    : "reject";

                setEditorSubmittingDecision(true);
                try {
                  const res = await fetch(
                    `${apiBase}/api/contributions/${editorDecisionTarget.id}/${actionPath}/`,
                    {
                      method: "POST",
                      credentials: "include",
                      headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                      },
                      body: JSON.stringify({ review_notes: editorReviewNotes || "" }),
                    },
                  );
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    const msg = body?.detail || res.statusText || "Could not submit decision.";
                    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
                  }

                  toast({
                    title:
                      editorDecisionKind === "approve"
                        ? "Submission approved"
                        : editorDecisionKind === "reject"
                          ? "Submission rejected"
                          : "Revisions requested",
                  });

                  setEditorItems((prev) => prev.filter((i) => i.id !== editorDecisionTarget.id));
                  setEditorDecisionTarget(null);
                  setEditorReviewNotes("");
                } catch (err) {
                  toast({
                    title: "Decision failed",
                    description: err instanceof Error ? err.message : "Could not submit decision. Try again.",
                    variant: "destructive",
                  });
                } finally {
                  setEditorSubmittingDecision(false);
                }
              }}
            >
              {editorSubmittingDecision
                ? "Submitting..."
                : editorDecisionKind === "approve"
                  ? "Approve"
                  : editorDecisionKind === "reject"
                    ? "Reject"
                    : "Request revisions"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </div>
  );
};

export default Dashboard;
