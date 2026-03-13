import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Loader2, Search as SearchIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

function getApiBaseUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  return env.trim().replace(/\/+$/, "");
}

interface ContributionListItem {
  id: number;
  state: string;
  town: string;
  status: string;
  created_at: string;
  postmark_id: number | null;
}

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

const MySuggestions = () => {
  const user = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [items, setItems] = useState<ContributionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [goToPageInput, setGoToPageInput] = useState("");
  const pageSize = 10;

  useEffect(() => {
    const apiBase = getApiBaseUrl();
    if (!apiBase || !user) {
      setItems([]);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/api/contributions/`, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        const data: any[] = await res.json();
        if (!Array.isArray(data)) {
          setItems([]);
          return;
        }
        const mapped: ContributionListItem[] = data.map((c) => ({
          id: c.id,
          state: (c.stateDisplay || c.state_display || c.submittedData?.state || "").trim(),
          town: (c.townDisplay || c.town_display || c.submittedData?.town || "").trim(),
          status: String(c.status || "pending"),
          created_at: String(c.createdAt || c.created_at || ""),
          postmark_id: typeof c.postmarkId === "number" ? c.postmarkId : null,
        }));
        setItems(mapped);
      } catch (err) {
        toast({
          title: "Error loading suggestions",
          description: err instanceof Error ? err.message : "Could not load your suggestions.",
          variant: "destructive",
        });
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, toast]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const composite = `${item.town}, ${item.state}`.toLowerCase();
        if (!composite.includes(q)) return false;
      }
      return true;
    });
  }, [items, searchQuery, statusFilter]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(startIndex, startIndex + pageSize);
  const pageStart = totalCount === 0 ? 0 : startIndex + 1;
  const pageEnd = Math.min(startIndex + pageSize, totalCount);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "needs_revision":
        return <Badge variant="secondary">Needs Revision</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-2">
              My Suggestions
            </h1>
            <p className="text-muted-foreground">
              Suggested corrections and additions you have submitted for expert review.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            <aside className="lg:w-72 space-y-4">
              <Card className="shadow-archival-md">
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-2">
                    <Label>Search</Label>
                    <div className="relative">
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Search by town or state..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 bg-background"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      className="w-full border border-input bg-background rounded-md px-3 py-2 text-sm"
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                    }}
                  >
                    Clear Filters
                  </Button>
                </CardContent>
              </Card>
            </aside>

            <main className="flex-1 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-archival-sm">
                <p className="text-sm text-muted-foreground">
                  {totalCount === 0 ? (
                    "0 suggestions"
                  ) : (
                    <>
                      Showing{" "}
                      <span className="font-semibold text-foreground">
                        {pageStart.toLocaleString()}-{pageEnd.toLocaleString()}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold text-foreground">
                        {totalCount.toLocaleString()}
                      </span>{" "}
                      suggestions
                    </>
                  )}
                </p>
              </div>

              {loading ? (
                <div className="flex flex-col justify-center items-center gap-3 py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                  <p>Loading suggestions...</p>
                </div>
              ) : totalCount === 0 ? (
                <Card className="flex-1 flex items-center justify-center min-h-[200px]">
                  <CardContent className="text-center">
                    <p className="text-muted-foreground mb-4">
                      You have not submitted any suggestions yet.
                    </p>
                    <Button variant="outline" onClick={() => navigate("/contribute")}>
                      Go to Contribute
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {pageItems.map((item) => (
                    <Card key={item.id} className="shadow-archival-md">
                      <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:gap-4 justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-heading text-base md:text-lg text-foreground">
                              {item.town || item.state ? `${item.town || "Unknown"}, ${item.state || ""}` : `Suggestion #${item.id}`}
                            </h3>
                            {getStatusBadge(item.status)}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Submitted on{" "}
                            {item.created_at
                              ? new Date(item.created_at).toLocaleDateString()
                              : "unknown date"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                          {item.postmark_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/record/api-${item.postmark_id}`)}
                            >
                              View Catalog Entry
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {totalPages > 1 && !loading && totalCount > 0 && (
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

export default MySuggestions;

