import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, Search } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import postmarkSample from "@/assets/postmark-sample.jpg";

function getPostmarksApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/postmarks")) return base;
  return `${base}/api/postmarks`;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useAuth();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Fetch only current user's catalog submissions (from Django postmarks API)
  useEffect(() => {
    if (!user) {
      setSubmissions([]);
      setLoading(false);
      return;
    }

    const fetchSubmissions = async () => {
      setLoading(true);
      try {
        const submitter = user.username || user.email;
        if (!submitter) {
          setSubmissions([]);
          return;
        }
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
        const url = `${base}/my-submissions/?submitter=${encodeURIComponent(submitter)}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        const results = Array.isArray(data.results) ? data.results : [];
        const mapped = results.map((item: any) => ({
          id: item.postmark_id,
          name: `${item.town || ""}${item.state ? `, ${item.state}` : ""} ${item.shape_name || ""}`.trim(),
          town: item.town || "",
          state: item.state || "",
          date_range: item.date_range || "",
          type: item.shape_name || "",
          color: item.colors_display || "",
          status: "approved" as const,
          created_at: item.created_date || new Date().toISOString(),
          description: undefined,
          image_url: item.main_image?.image_url || null,
        }));
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

  // Apply filters
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((submission) => {
      // Text search (name, town, state)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches = [submission.name, submission.town, submission.state].some(
          (val) => val != null && String(val).toLowerCase().includes(q)
        );
        if (!matches) return false;
      }

      // Status filter
      if (statusFilter !== "all" && submission.status !== statusFilter) return false;

      // State filter
      if (stateFilter !== "all" && submission.state !== stateFilter) return false;

      // Date range filter
      if (dateFrom && new Date(submission.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(submission.created_at) > new Date(dateTo)) return false;

      return true;
    });
  }, [submissions, searchQuery, statusFilter, stateFilter, dateFrom, dateTo]);

  // Get unique values for filters
  const uniqueStates = useMemo(() => 
    Array.from(new Set(submissions.map(s => s.state).filter(Boolean))),
    [submissions]
  );

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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Name, town, state..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 bg-background"
                      aria-label="Search submissions by name, town, or state"
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
                  <Label>State</Label>
                  <Select value={stateFilter} onValueChange={setStateFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {uniqueStates.map(state => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Submission Date From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Name, town, state..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 bg-background"
                      aria-label="Search submissions by name, town, or state"
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
                  <Label className="text-sm font-medium">State</Label>
                  <Select value={stateFilter} onValueChange={setStateFilter}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {uniqueStates.map(state => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Date From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Date To</Label>
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
            ) : filteredSubmissions.length === 0 ? (
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
            ) : (
              <div className="space-y-4">
                {filteredSubmissions.map((submission) => (
                  <Card
                    key={submission.id}
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => navigate(`/record/${submission.id}`)}
                  >
                    <CardContent className="p-6">
                      <div className="grid md:grid-cols-[200px_1fr] gap-6">
                        <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                          <img
                            src={submission.image_url || postmarkSample}
                            alt={submission.name}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-semibold text-lg mb-1">{submission.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                {submission.town}, {submission.state}
                              </p>
                            </div>
                            {getStatusBadge(submission.status)}
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-muted-foreground">Date Range:</span>
                              <span className="ml-2 font-medium">{submission.date_range}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Type:</span>
                              <span className="ml-2 font-medium">{submission.type}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Color:</span>
                              <span className="ml-2 font-medium">{submission.color}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Submitted:</span>
                              <span className="ml-2 font-medium">
                                {new Date(submission.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          {submission.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {submission.description}
                            </p>
                          )}

                          <Button
                            variant="link"
                            className="p-0 h-auto text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/record/${submission.id}`);
                            }}
                          >
                            View details
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
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
