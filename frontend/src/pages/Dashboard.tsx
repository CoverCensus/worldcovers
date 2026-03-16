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
import { normalizeImageUrl, getAssignedCatalogPage, type PostmarkRecord } from "@/services/postmarks";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useFilterOptions } from "@/hooks/useFilterOptions";
import { getLetteringStyles } from "@/services/letteringStyles";
import { getFramingStyles } from "@/services/framingStyles";
import { getDateFormats } from "@/services/dateFormats";

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

/** Catalog entry for User Submissions (state editor): postmarks in assigned states. */
type AssignedCatalogEntry = PostmarkRecord;

/** Pending contribution for editor review (approve / reject / request revision). */
interface PendingReviewItem {
  id: number;
  contributor_username: string;
  state_display: string;
  town_display: string;
  postmark_id: number | null;
  status: string;
  created_at: string;
  review_notes: string | null;
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

  // User Submissions (state editor): catalog entries for assigned states – view, edit, delete
  const [assignedCatalogItems, setAssignedCatalogItems] = useState<AssignedCatalogEntry[]>([]);
  const [assignedCatalogPage, setAssignedCatalogPage] = useState(1);
  const [assignedCatalogTotal, setAssignedCatalogTotal] = useState<number | null>(null);
  const [assignedCatalogLoading, setAssignedCatalogLoading] = useState(false);
  const [assignedCatalogError, setAssignedCatalogError] = useState<string | null>(null);
  const assignedCatalogPageSize = 10;

  // Pending review (state editor): contributions awaiting approve/reject/revision – comment required
  const [pendingReviewItems, setPendingReviewItems] = useState<PendingReviewItem[]>([]);
  const [pendingReviewLoading, setPendingReviewLoading] = useState(false);
  const [pendingReviewError, setPendingReviewError] = useState<string | null>(null);
  const [statusDecisionTarget, setStatusDecisionTarget] = useState<PendingReviewItem | null>(null);
  const [statusDecisionKind, setStatusDecisionKind] = useState<"approve" | "reject" | "revision">("approve");
  const [statusComment, setStatusComment] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  // Editor-required fields when approving (Shape, Lettering, Framing, Date format, Value)
  const [approveShapeId, setApproveShapeId] = useState<string>("");
  const [approveLetteringId, setApproveLetteringId] = useState<string>("");
  const [approveFramingId, setApproveFramingId] = useState<string>("");
  const [approveDateFormatId, setApproveDateFormatId] = useState<string>("");
  const [approveValue, setApproveValue] = useState("");
  const [approveOptions, setApproveOptions] = useState<{
    lettering: { id: number; name: string }[];
    framing: { id: number; name: string }[];
    dateFormats: { id: number; name: string }[];
  }>({ lettering: [], framing: [], dateFormats: [] });
  const [approveOptionsLoading, setApproveOptionsLoading] = useState(false);

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
              .filter((x) => x && String(x).trim().toLowerCase() !== "unknown")
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
              .filter((x) => x && String(x).trim().toLowerCase() !== "unknown")
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

  // Load assigned-state catalog for User Submissions tab (state editors)
  useEffect(() => {
    if (!isStateEditor || activeTab !== "editor") return;
    let cancelled = false;
    setAssignedCatalogError(null);
    setAssignedCatalogLoading(true);
    getAssignedCatalogPage(assignedCatalogPage, assignedCatalogPageSize)
      .then(({ results, count }) => {
        if (!cancelled) {
          setAssignedCatalogItems(results);
          setAssignedCatalogTotal(count ?? results.length);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAssignedCatalogError(err instanceof Error ? err.message : "Could not load catalog.");
          setAssignedCatalogItems([]);
          setAssignedCatalogTotal(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAssignedCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isStateEditor, activeTab, assignedCatalogPage]);

  // Load pending contributions for editor review (approve/reject/request revision)
  useEffect(() => {
    if (!isStateEditor || activeTab !== "editor") return;
    const apiBase = import.meta.env.VITE_API_URL?.trim?.()?.replace(/\/+$/, "");
    if (!apiBase) {
      setPendingReviewError("VITE_API_URL is not set.");
      setPendingReviewItems([]);
      return;
    }
    setPendingReviewError(null);
    setPendingReviewLoading(true);
    fetch(`${apiBase}/api/contributions/?mode=editor&status=pending`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText || "Failed to load pending submissions");
        return res.json();
      })
      .then((data: any[]) => {
        if (!Array.isArray(data)) {
          setPendingReviewItems([]);
          return;
        }
        setPendingReviewItems(
          data.map((c) => ({
            id: c.id,
            contributor_username: c.contributor_username ?? "",
            state_display: c.state_display ?? "",
            town_display: c.town_display ?? "",
            postmark_id: c.postmark_id ?? null,
            status: String(c.status ?? "pending"),
            created_at: String(c.created_at ?? ""),
            review_notes: c.review_notes ?? null,
          })),
        );
      })
      .catch((err) => {
        setPendingReviewError(err instanceof Error ? err.message : "Could not load pending submissions.");
        setPendingReviewItems([]);
      })
      .finally(() => setPendingReviewLoading(false));
  }, [isStateEditor, activeTab]);

  // Load lettering/framing/date-format options when approve dialog opens
  useEffect(() => {
    if (!statusDecisionTarget || statusDecisionKind !== "approve") return;
    setApproveOptionsLoading(true);
    Promise.all([getLetteringStyles(), getFramingStyles(), getDateFormats()])
      .then(([lettering, framing, dateFormats]) => {
        setApproveOptions({
          lettering: lettering.map((o) => ({ id: o.id, name: o.name })),
          framing: framing.map((o) => ({ id: o.id, name: o.name })),
          dateFormats: dateFormats.map((o) => ({ id: o.id, name: o.name })),
        });
      })
      .catch(() => {
        setApproveOptions({ lettering: [], framing: [], dateFormats: [] });
      })
      .finally(() => setApproveOptionsLoading(false));
  }, [statusDecisionTarget, statusDecisionKind]);

  const submitStatusDecision = async () => {
    if (!statusDecisionTarget || !statusComment.trim()) return;
    if (statusDecisionKind === "approve") {
      const shapeId = approveShapeId ? Number(approveShapeId) : NaN;
      const letteringId = approveLetteringId ? Number(approveLetteringId) : NaN;
      const framingId = approveFramingId ? Number(approveFramingId) : NaN;
      const dateFormatId = approveDateFormatId ? Number(approveDateFormatId) : NaN;
      const valueNum = approveValue.trim() === "" ? NaN : parseFloat(approveValue);
      if (!Number.isInteger(shapeId) || !Number.isInteger(letteringId) || !Number.isInteger(framingId) || !Number.isInteger(dateFormatId) || Number.isNaN(valueNum) || valueNum < 0) {
        toast({ title: "Missing required fields", description: "Please fill Shape, Lettering style, Framing style, Date format, and Value before approving.", variant: "destructive" });
        return;
      }
    }
    const apiBase = import.meta.env.VITE_API_URL?.trim?.()?.replace(/\/+$/, "");
    if (!apiBase) {
      toast({ title: "Configuration error", description: "VITE_API_URL is not set.", variant: "destructive" });
      return;
    }
    const actionPath =
      statusDecisionKind === "approve" ? "approve" : statusDecisionKind === "reject" ? "reject" : "request-revision";
    const body: Record<string, unknown> = { review_notes: statusComment.trim() };
    if (statusDecisionKind === "approve") {
      body.postmark_shape_id = Number(approveShapeId);
      body.lettering_style_id = Number(approveLetteringId);
      body.framing_style_id = Number(approveFramingId);
      body.date_format_id = Number(approveDateFormatId);
      body.estimated_value = parseFloat(approveValue);
    }
    setStatusSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/contributions/${statusDecisionTarget.id}/${actionPath}/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const resBody = await res.json().catch(() => ({}));
        const msg = resBody?.review_notes?.[0] ?? resBody?.detail ?? res.statusText;
        throw new Error(typeof msg === "string" ? msg : "Request failed");
      }
      const actionLabel =
        statusDecisionKind === "approve" ? "Approved" : statusDecisionKind === "reject" ? "Rejected" : "Revision requested";
      toast({ title: actionLabel, description: "Your comment was saved for the contributor." });
      setPendingReviewItems((prev) => prev.filter((i) => i.id !== statusDecisionTarget.id));
      setStatusDecisionTarget(null);
      setStatusComment("");
      setApproveShapeId("");
      setApproveLetteringId("");
      setApproveFramingId("");
      setApproveDateFormatId("");
      setApproveValue("");
    } catch (err) {
      toast({
        title: "Could not submit",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleDeleteSubmission = async () => {
    if (!deleteTarget) return;
    const postmarkId = (deleteTarget as { postmark_id?: number }).postmark_id ?? (deleteTarget as { id?: number }).id;
    if (postmarkId == null) return;

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
      // Remove from the visible list (submissions or assigned catalog)
      const targetId = (deleteTarget as { id?: number }).id ?? (deleteTarget as { postmark_id?: number }).postmark_id;
      setSubmissions(prev => prev.filter((s) => s.id !== targetId && s.postmark_id !== postmarkId));
      setAssignedCatalogItems(prev => prev.filter((e) => e.id !== postmarkId));
      setAssignedCatalogTotal((prev) => (prev != null && prev > 0 ? prev - 1 : null));
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

  const assignedCatalogTotalPages = Math.max(
    1,
    Math.ceil((assignedCatalogTotal ?? 0) / assignedCatalogPageSize),
  );

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
                  ? "Manage catalog entries for your assigned states — view, edit, and delete."
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
              {/* My Suggestions – commented out for now
              <Button
                type="button"
                variant={activeTab === "suggestions" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-l-none"
                onClick={() => setActiveTab("suggestions")}
              >
                My Suggestions
              </Button>
              */}
              {isStateEditor && (
                <Button
                  type="button"
                  variant={activeTab === "editor" ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-l-none"
                  onClick={() => setActiveTab("editor")}
                >
                  User Submissions
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

          {/* My Suggestions – commented out for now
          {activeTab === "suggestions" && (
            <div className="flex flex-col lg:flex-row gap-6">
              ...suggestions filters and list...
            </div>
          )}
          */}

          {activeTab === "editor" && isStateEditor && (
            <div className="flex flex-col gap-6">
              {/* Pending submissions to review — approve / reject / request revision with required comment */}
              {(pendingReviewLoading || pendingReviewItems.length > 0) && (
                <Card className="shadow-archival-md">
                  <CardContent className="pt-6">
                    <h2 className="font-heading text-lg font-semibold text-foreground mb-2">
                      Pending review
                    </h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      When you change status, add a comment so the contributor knows the outcome (e.g. quality note for
                      approved, reason for reject, or what to fix for revision).
                    </p>
                    {pendingReviewLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading pending submissions...</span>
                      </div>
                    ) : pendingReviewError ? (
                      <p className="text-sm text-destructive">{pendingReviewError}</p>
                    ) : (
                      <ul className="space-y-3">
                        {pendingReviewItems.map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4 bg-muted/30"
                          >
                            <div>
                              <span className="font-medium text-foreground">
                                {item.town_display && item.state_display
                                  ? `${item.town_display}, ${item.state_display}`
                                  : item.state_display || item.town_display || `Submission #${item.id}`}
                              </span>
                              <span className="text-muted-foreground text-sm ml-2">
                                by {item.contributor_username}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setStatusDecisionTarget(item);
                                  setStatusDecisionKind("approve");
                                  setStatusComment("");
                                }}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setStatusDecisionTarget(item);
                                  setStatusDecisionKind("reject");
                                  setStatusComment("");
                                }}
                              >
                                Reject
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setStatusDecisionTarget(item);
                                  setStatusDecisionKind("revision");
                                  setStatusComment("");
                                }}
                              >
                                Request revision
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )}

              <main className="flex-1 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-archival-sm">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {assignedCatalogLoading
                        ? "Loading catalog for your assigned states..."
                        : `${assignedCatalogTotal != null ? assignedCatalogTotal.toLocaleString() : assignedCatalogItems.length} catalog entr${assignedCatalogTotal === 1 ? "y" : "ies"} in your assigned states`}
                    </p>
                    {assignedCatalogError && (
                      <p className="text-xs text-destructive mt-1">{assignedCatalogError}</p>
                    )}
                  </div>
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

                {assignedCatalogLoading ? (
                  <div className="flex flex-col justify-center items-center gap-3 py-12 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                    <p>Loading catalog...</p>
                  </div>
                ) : assignedCatalogItems.length === 0 ? (
                  <Card className="flex-1 flex items-center justify-center min-h-[200px]">
                    <CardContent className="text-center">
                      <p className="text-muted-foreground mb-1">
                        {assignedCatalogTotal === 0
                          ? "No catalog entries in your assigned states."
                          : "No catalog entries on this page."}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        You can view, edit, and delete any catalog entry in states assigned to you.
                      </p>
                    </CardContent>
                  </Card>
                ) : viewMode === "list" ? (
                  <div className="space-y-4">
                    {assignedCatalogItems.map((entry) => {
                      const imageUrl = normalizeImageUrl(
                        (entry.mainImage as { imageUrl?: string })?.imageUrl ??
                          (typeof entry.mainImage === "string" ? entry.mainImage : null),
                      );
                      const title =
                        [entry.town, entry.state].filter(Boolean).join(", ") ||
                        entry.facilityName ||
                        entry.postmarkKey ||
                        `Entry #${entry.id}`;
                      return (
                        <Card
                          key={entry.id}
                          className="shadow-archival-md hover:shadow-archival-lg transition-shadow"
                        >
                          <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row md:items-center gap-4">
                              {imageUrl && (
                                <div className="flex-shrink-0 w-20 h-20 rounded overflow-hidden bg-muted">
                                  <ImageOrPlaceholder
                                    src={imageUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <h3 className="font-heading text-lg font-semibold text-foreground">
                                  {title}
                                </h3>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {entry.shapeName && <span>{entry.shapeName}</span>}
                                  {entry.dateRange && (
                                    <span className={entry.shapeName ? " ml-2" : ""}>{entry.dateRange}</span>
                                  )}
                                  {entry.colorsDisplay && (
                                    <span className="ml-2">{entry.colorsDisplay}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2 justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/record/${entry.id}`)}
                                >
                                  View
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/edit/${entry.id}`)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() =>
                                    setDeleteTarget({ id: entry.id, postmark_id: entry.id, name: title })
                                  }
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {assignedCatalogItems.map((entry) => {
                      const imageUrl = normalizeImageUrl(
                        (entry.mainImage as { imageUrl?: string })?.imageUrl ??
                          (typeof entry.mainImage === "string" ? entry.mainImage : null),
                      );
                      const title =
                        [entry.town, entry.state].filter(Boolean).join(", ") ||
                        entry.facilityName ||
                        entry.postmarkKey ||
                        `Entry #${entry.id}`;
                      return (
                        <Card
                          key={entry.id}
                          className="shadow-archival-md hover:shadow-archival-lg transition-shadow overflow-hidden"
                        >
                          <div className="aspect-[4/3] bg-muted">
                            <ImageOrPlaceholder
                              src={imageUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <CardContent className="p-4 flex flex-col gap-3">
                            <h3 className="font-heading font-semibold text-foreground line-clamp-2">
                              {title}
                            </h3>
                            <div className="text-sm text-muted-foreground">
                              {entry.shapeName}
                              {entry.dateRange ? ` · ${entry.dateRange}` : ""}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/record/${entry.id}`)}
                              >
                                View
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/edit/${entry.id}`)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() =>
                                  setDeleteTarget({ id: entry.id, postmark_id: entry.id, name: title })
                                }
                              >
                                Delete
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {assignedCatalogTotalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={assignedCatalogPage <= 1}
                      onClick={() => setAssignedCatalogPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground px-2">
                      Page {assignedCatalogPage} of {assignedCatalogTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={assignedCatalogPage >= assignedCatalogTotalPages}
                      onClick={() =>
                        setAssignedCatalogPage((p) => Math.min(assignedCatalogTotalPages, p + 1))
                      }
                    >
                      Next
                    </Button>
                  </div>
                )}
              </main>
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

      {/* Status decision (approve / reject / request revision) — comment required; approve requires catalog fields */}
      <AlertDialog
        open={!!statusDecisionTarget}
        onOpenChange={(open) => {
          if (!open && !statusSubmitting) {
            setStatusDecisionTarget(null);
            setStatusComment("");
            setApproveShapeId("");
            setApproveLetteringId("");
            setApproveFramingId("");
            setApproveDateFormatId("");
            setApproveValue("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusDecisionKind === "approve"
                ? "Approve submission"
                : statusDecisionKind === "reject"
                  ? "Reject submission"
                  : "Request revision"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusDecisionKind === "approve"
                ? "Fill catalog fields and add a comment. The contributor will see your comment."
                : statusDecisionKind === "reject"
                  ? "Add a comment so the contributor knows why it was rejected and can improve."
                  : "Add a comment explaining what to fix so the contributor can resubmit."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            {statusDecisionKind === "approve" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Shape <span className="text-destructive">*</span></Label>
                  <Select value={approveShapeId} onValueChange={setApproveShapeId} disabled={statusSubmitting || approveOptionsLoading}>
                    <SelectTrigger><SelectValue placeholder="Select shape" /></SelectTrigger>
                    <SelectContent>
                      {shapeOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Lettering style <span className="text-destructive">*</span></Label>
                  <Select value={approveLetteringId} onValueChange={setApproveLetteringId} disabled={statusSubmitting || approveOptionsLoading}>
                    <SelectTrigger><SelectValue placeholder={approveOptionsLoading ? "Loading..." : "Select lettering style"} /></SelectTrigger>
                    <SelectContent>
                      {approveOptions.lettering.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Framing style <span className="text-destructive">*</span></Label>
                  <Select value={approveFramingId} onValueChange={setApproveFramingId} disabled={statusSubmitting || approveOptionsLoading}>
                    <SelectTrigger><SelectValue placeholder={approveOptionsLoading ? "Loading..." : "Select framing style"} /></SelectTrigger>
                    <SelectContent>
                      {approveOptions.framing.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date format <span className="text-destructive">*</span></Label>
                  <Select value={approveDateFormatId} onValueChange={setApproveDateFormatId} disabled={statusSubmitting || approveOptionsLoading}>
                    <SelectTrigger><SelectValue placeholder={approveOptionsLoading ? "Loading..." : "Select date format"} /></SelectTrigger>
                    <SelectContent>
                      {approveOptions.dateFormats.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="approve-value">Value (of this postmark) <span className="text-destructive">*</span></Label>
                  <Input
                    id="approve-value"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="e.g. 0 or 12.50"
                    value={approveValue}
                    onChange={(e) => setApproveValue(e.target.value)}
                    disabled={statusSubmitting}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="status-comment">
                Comment <span className="text-destructive">(required)</span>
              </Label>
              <Textarea
                id="status-comment"
                value={statusComment}
                onChange={(e) => setStatusComment(e.target.value)}
                rows={4}
                placeholder={
                  statusDecisionKind === "approve"
                    ? "e.g. Good quality image and details."
                    : statusDecisionKind === "reject"
                      ? "e.g. Image too blurry; please resubmit with a clearer scan."
                      : "e.g. Please add the date range and correct the town name."
                }
                disabled={statusSubmitting}
                className="resize-none"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                statusSubmitting ||
                !statusComment.trim() ||
                (statusDecisionKind === "approve" &&
                  (!approveShapeId ||
                    !approveLetteringId ||
                    !approveFramingId ||
                    !approveDateFormatId ||
                    approveValue.trim() === "" ||
                    Number.isNaN(parseFloat(approveValue)) ||
                    parseFloat(approveValue) < 0))
              }
              onClick={submitStatusDecision}
            >
              {statusSubmitting
                ? "Submitting..."
                : statusDecisionKind === "approve"
                  ? "Approve"
                  : statusDecisionKind === "reject"
                    ? "Reject"
                    : "Request revision"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  </div>
  );
};

export default Dashboard;
