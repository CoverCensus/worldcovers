import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Filter, Search, FileCheck, Users, FileEdit, SlidersHorizontal, List, Grid3x3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { getApiBaseUrl } from "@/lib/api";
import postmarkSample from "@/assets/postmark-sample.jpg";

type LoginRequestRow = { id: string; email: string | null; created_at: string };

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "gallery">("list");

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Admin-only state
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [allSubmissionsLoading, setAllSubmissionsLoading] = useState(false);
  const [allSubmissionsError, setAllSubmissionsError] = useState<string | null>(null);
  const [allSubmissionStatusFilter, setAllSubmissionStatusFilter] = useState("all");
  const [allSubmissionSearch, setAllSubmissionSearch] = useState("");
  const [allSubmissionStateFilter, setAllSubmissionStateFilter] = useState("all");
  const [allSubmissionTypeFilter, setAllSubmissionTypeFilter] = useState("all");
  const [allSubmissionColorFilter, setAllSubmissionColorFilter] = useState("all");
  const [allSubmissionDateFrom, setAllSubmissionDateFrom] = useState("");
  const [allSubmissionDateTo, setAllSubmissionDateTo] = useState("");
  const [adminTab, setAdminTab] = useState("mine");
  const [allSubmissionFiltersOpen, setAllSubmissionFiltersOpen] = useState(false);
  const [allSubmissionViewMode, setAllSubmissionViewMode] = useState<"list" | "gallery">("list");
  const [myCatalogs, setMyCatalogs] = useState<{ id: string; name: string; state?: string; town?: string; date_range?: string; type?: string; color?: string; image_url?: string | null }[]>([]);
  const [myCatalogsLoading, setMyCatalogsLoading] = useState(false);
  const [editRequests, setEditRequests] = useState<{ id: string; name: string; state?: string; status: string; created_at: string }[]>([]);
  const [editRequestsLoading, setEditRequestsLoading] = useState(false);
  const [loginRequests, setLoginRequests] = useState<LoginRequestRow[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; email: string | null; created_at: string }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<{ id: string; email: string | null; created_at: string } | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [deleteUser, setDeleteUser] = useState<{ id: string; email: string | null; created_at: string } | null>(null);
  const [deleteUserLoading, setDeleteUserLoading] = useState(false);

  const fetchSubmissions = async (_opts?: { silent?: boolean }) => {
    if (!user) {
      setSubmissions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSubmissions([]);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) {
      setSubmissions([]);
      setLoading(false);
      return;
    }
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

  const fetchAllSubmissions = async (_opts?: { silent?: boolean }) => {
    setAllSubmissionsLoading(true);
    setAllSubmissionsError(null);
    setAllSubmissions([]);
    setAllSubmissionsLoading(false);
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    setAllUsers([]);
    setLoginRequests([]);
    setUsersLoading(false);
  };

  const fetchMyCatalogs = async () => {
    if (!user) {
      setMyCatalogs([]);
      return;
    }
    setMyCatalogsLoading(true);
    setMyCatalogs([]);
    setMyCatalogsLoading(false);
  };

  useEffect(() => {
    if (!user) {
      setMyCatalogs([]);
      return;
    }
    fetchMyCatalogs();
  }, [user, toast]);

  // Load all submissions when admin opens the All Submissions tab.
  useEffect(() => {
    if (isAdmin === true && adminTab === "all-submissions") {
      fetchAllSubmissions();
    }
  }, [isAdmin, adminTab]);

  const fetchEditRequests = async () => {
    setEditRequestsLoading(true);
    setEditRequests([]);
    setEditRequestsLoading(false);
  };

  useEffect(() => {
    if (isAdmin === true && adminTab === "edit-requests") {
      fetchEditRequests();
    }
  }, [isAdmin, adminTab]);

  // Load users (all users, roles, login requests) when admin opens the Users tab.
  useEffect(() => {
    if (isAdmin === true && adminTab === "users") {
      fetchUsers();
    }
  }, [isAdmin, adminTab]);

  const handleEditRequestApprove = async (requestId: string) => {
    setEditRequests((prev) => prev.filter((r) => r.id !== requestId));
    toast({ title: "Edit requests", description: "Manage via Django admin." });
  };

  const handleEditRequestReject = async (requestId: string) => {
    setEditRequests((prev) => prev.filter((r) => r.id !== requestId));
    toast({ title: "Edit requests", description: "Manage via Django admin." });
  };

  const handleAllSubmissionStatus = async (
    _submissionId: string,
    status: string
  ) => {
    toast({ title: "Submissions", description: `Manage status (e.g. ${status}) via Django admin.` });
  };

  const handleLoginRequestStatus = async (requestId: string, status: string) => {
    setLoginRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status } : r))
    );
    toast({ title: "Login requests", description: "Manage via Django admin." });
  };

  const handleResetPasswordSubmit = async () => {
    if (!resetPasswordUser || resetPasswordValue.length < 6) return;
    setResetPasswordUser(null);
    setResetPasswordValue("");
    toast({ title: "User management", description: "Reset passwords via Django admin." });
  };

  const handleDeleteUserConfirm = async () => {
    if (!deleteUser) return;
    setAllUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
    setDeleteUser(null);
    toast({ title: "User management", description: "Delete users via Django admin." });
  };

  // Unique values for All Submissions filters (from loaded data)
  const allSubmissionUniqueStates = useMemo(
    () => Array.from(new Set(allSubmissions.map((s) => s.state).filter(Boolean))).sort(),
    [allSubmissions]
  );
  const allSubmissionUniqueTypes = useMemo(
    () => Array.from(new Set(allSubmissions.map((s) => s.type).filter(Boolean))).sort(),
    [allSubmissions]
  );
  const allSubmissionUniqueColors = useMemo(
    () => Array.from(new Set(allSubmissions.map((s) => s.color).filter(Boolean))).sort(),
    [allSubmissions]
  );

  const filteredAllSubmissions = useMemo(() => {
    return allSubmissions.filter((s) => {
      if (allSubmissionSearch.trim()) {
        const q = allSubmissionSearch.trim().toLowerCase();
        const fields = [
          s.name,
          s.town,
          s.state,
          s.type,
          s.color,
          s.submitter_name,
          s.date_range,
          s.description,
          s.dimensions,
          s.manuscript,
          s.rarity,
        ].filter(Boolean);
        if (!fields.some((v) => String(v).toLowerCase().includes(q))) return false;
      }
      if (allSubmissionStatusFilter !== "all" && s.status !== allSubmissionStatusFilter) return false;
      if (allSubmissionStateFilter !== "all" && s.state !== allSubmissionStateFilter) return false;
      if (allSubmissionTypeFilter !== "all" && s.type !== allSubmissionTypeFilter) return false;
      if (allSubmissionColorFilter !== "all" && s.color !== allSubmissionColorFilter) return false;
      if (allSubmissionDateFrom && new Date(s.created_at) < new Date(allSubmissionDateFrom)) return false;
      if (allSubmissionDateTo && new Date(s.created_at) > new Date(allSubmissionDateTo)) return false;
      return true;
    });
  }, [
    allSubmissions,
    allSubmissionSearch,
    allSubmissionStatusFilter,
    allSubmissionStateFilter,
    allSubmissionTypeFilter,
    allSubmissionColorFilter,
    allSubmissionDateFrom,
    allSubmissionDateTo,
  ]);

  const clearAllSubmissionFilters = () => {
    setAllSubmissionSearch("");
    setAllSubmissionStatusFilter("all");
    setAllSubmissionStateFilter("all");
    setAllSubmissionTypeFilter("all");
    setAllSubmissionColorFilter("all");
    setAllSubmissionDateFrom("");
    setAllSubmissionDateTo("");
  };

  const showMySubmissions = !isAdmin;
  const showAdminTabs = isAdmin === true;

  // Map approved submissions to catalog record IDs (for Edit link)
  const submissionToCatalogId = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of myCatalogs) {
      const key = `${cat.name}|${cat.state}|${cat.town}|${cat.date_range}|${cat.type}`;
      map.set(key, cat.id);
    }
    return map;
  }, [myCatalogs]);

  const MySubmissionsBlock = () => (
    <>
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Filters sidebar - same pattern as Search */}
        <aside className={`lg:w-80 space-y-6 ${filtersOpen ? "block" : "hidden lg:block"}`}>
          <Card className="shadow-archival-md">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-lg font-semibold">Filters</h2>
                <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(false)}>
                  Close
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="my-submissions-search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="my-submissions-search"
                    type="text"
                    placeholder="Name, town, state..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    aria-label="Search submissions by name, town, or state"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="my-status">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="my-status"><SelectValue placeholder="All Statuses" /></SelectTrigger>
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
                <Label htmlFor="my-state">State</Label>
                <Select value={stateFilter} onValueChange={setStateFilter}>
                  <SelectTrigger id="my-state"><SelectValue placeholder="All States" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {uniqueStates.map((state) => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="my-date-from">Date From</Label>
                <Input id="my-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="my-date-to">Date To</Label>
                <Input id="my-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <Button variant="outline" className="w-full" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setStateFilter("all"); setDateFrom(""); setDateTo(""); }}>
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        </aside>

        {/* Results - same layout as Search */}
        <main className="flex-1 space-y-4">
          {user && filteredSubmissions.length > 0 && (
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-archival-sm">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-semibold text-foreground">1–{filteredSubmissions.length}</span> of <span className="font-semibold text-foreground">{filteredSubmissions.length}</span> submissions
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  Filters
                </Button>
                <div className="flex border border-border rounded-md">
                  <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("list")} className="rounded-r-none">
                    <List className="h-4 w-4" />
                  </Button>
                  <Button variant={viewMode === "gallery" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("gallery")} className="rounded-l-none">
                    <Grid3x3 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <p className="text-muted-foreground">Loading submissions...</p>
            </div>
          ) : !user ? (
            <div className="flex justify-center items-center py-12">
              <p className="text-muted-foreground mb-4">Sign in to see your submissions.</p>
              <Button variant="outline" onClick={() => navigate("/auth")}>Sign in</Button>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="flex flex-col justify-center items-center py-12 text-center">
              <p className="text-muted-foreground mb-4">
                {submissions.length === 0 ? "You haven't submitted anything yet." : "No submissions found matching your filters."}
              </p>
              {submissions.length === 0 && (
                <Button variant="outline" onClick={() => navigate("/contribute")}>Go to Contribute</Button>
              )}
            </div>
          ) : viewMode === "list" ? (
            <div className="space-y-4 min-w-0">
              {filteredSubmissions.map((submission) => (
                <Card
                  key={submission.id}
                  className="shadow-archival-md hover:shadow-archival-lg transition-shadow cursor-pointer overflow-hidden min-w-0"
                  onClick={() => navigate(`/dashboard/${submission.id}`)}
                >
                  <CardContent className="p-4 sm:p-6 min-w-0 overflow-hidden">
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 min-w-0">
                      <img
                        src={submission.image_url || postmarkSample}
                        alt={submission.name}
                        className="w-full h-40 sm:w-32 sm:h-32 object-cover rounded border border-border shrink-0 min-w-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 min-w-0 mb-2">
                          <h3 className="font-heading text-lg sm:text-xl font-semibold text-foreground truncate">
                            {submission.name}
                          </h3>
                          <span className="shrink-0">{getStatusBadge(submission.status)}</span>
                        </div>
                        {/* One line on small screens */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm min-w-0 sm:hidden">
                          <span className="text-muted-foreground">Location:</span><span className="text-foreground">{submission.town}, {submission.state}</span>
                          <span className="text-muted-foreground/50">·</span>
                          <span className="text-muted-foreground">Date:</span><span className="text-foreground">{submission.date_range}</span>
                          <span className="text-muted-foreground/50">·</span>
                          <span className="text-muted-foreground">Type:</span><span className="text-foreground">{submission.type}</span>
                          <span className="text-muted-foreground/50">·</span>
                          <span className="text-muted-foreground">Color:</span><span className="text-foreground">{submission.color}</span>
                        </div>
                        {/* Two columns on sm+ */}
                        <div className="hidden sm:grid grid-cols-2 gap-x-6 gap-y-1 text-sm min-w-0">
                          <div className="min-w-0"><span className="text-muted-foreground">Location:</span>{" "}<span className="text-foreground break-words">{submission.town}, {submission.state}</span></div>
                          <div className="min-w-0"><span className="text-muted-foreground">Date Range:</span>{" "}<span className="text-foreground break-words">{submission.date_range}</span></div>
                          <div className="min-w-0"><span className="text-muted-foreground">Type:</span>{" "}<span className="text-foreground break-words">{submission.type}</span></div>
                          <div className="min-w-0"><span className="text-muted-foreground">Color:</span>{" "}<span className="text-foreground break-words">{submission.color}</span></div>
                        </div>
                        {submission.description && <p className="text-sm text-muted-foreground line-clamp-2 break-words mt-2">{submission.description}</p>}
                        <div className="flex flex-wrap gap-4 mt-2">
                          <Button variant="link" className="p-0 h-auto text-primary" onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/${submission.id}`); }}>View</Button>
                          {submission.status === "approved" ? (() => {
                            const key = `${submission.name}|${submission.state}|${submission.town}|${submission.date_range}|${submission.type}`;
                            const catalogId = submissionToCatalogId.get(key);
                            return catalogId ? (
                              <Button variant="link" className="p-0 h-auto text-primary" onClick={(e) => { e.stopPropagation(); navigate(`/record/${catalogId}`); }}>
                                Edit
                              </Button>
                            ) : null;
                          })() : (
                            <Button variant="link" className="p-0 h-auto text-primary" onClick={(e) => { e.stopPropagation(); navigate(`/contribute?edit=${submission.id}`); }}>
                              Edit
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0">
              {filteredSubmissions.map((submission) => (
                <Card
                  key={submission.id}
                  className="shadow-archival-md hover:shadow-archival-lg transition-shadow cursor-pointer overflow-hidden min-w-0"
                  onClick={() => navigate(`/dashboard/${submission.id}`)}
                >
                  <img src={submission.image_url || postmarkSample} alt={submission.name} className="w-full h-48 object-cover" />
                  <CardContent className="p-4 min-w-0 overflow-hidden">
                    <h3 className="font-heading text-lg font-semibold text-foreground mb-2 truncate">
                      {submission.name}
                    </h3>
                    {/* One line on small screens */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm min-w-0 sm:hidden">
                      <span className="text-muted-foreground">Location:</span><span className="text-foreground">{submission.town}, {submission.state}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="text-muted-foreground">Date:</span><span className="text-foreground">{submission.date_range}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="text-muted-foreground">Color:</span><span className="text-foreground">{submission.color}</span>
                    </div>
                    {/* Stacked rows on sm+ */}
                    <div className="hidden sm:block space-y-1 text-sm min-w-0">
                      <div className="min-w-0"><span className="text-muted-foreground">Location:</span>{" "}<span className="text-foreground break-words">{submission.town}, {submission.state}</span></div>
                      <div className="min-w-0"><span className="text-muted-foreground">Date:</span>{" "}<span className="text-foreground break-words">{submission.date_range}</span></div>
                      <div className="min-w-0"><span className="text-muted-foreground">Color:</span>{" "}<span className="text-foreground break-words">{submission.color}</span></div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button variant="link" className="p-0 h-auto text-primary text-sm" onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/${submission.id}`); }}>View</Button>
                      {submission.status === "approved" ? (() => {
                        const key = `${submission.name}|${submission.state}|${submission.town}|${submission.date_range}|${submission.type}`;
                        const catalogId = submissionToCatalogId.get(key);
                        return catalogId ? (
                          <Button variant="link" className="p-0 h-auto text-primary text-sm" onClick={(e) => { e.stopPropagation(); navigate(`/record/${catalogId}`); }}>Edit</Button>
                        ) : null;
                      })() : (
                        <Button variant="link" className="p-0 h-auto text-primary text-sm" onClick={(e) => { e.stopPropagation(); navigate(`/contribute?edit=${submission.id}`); }}>Edit</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isAdmin ? (
          <Tabs value={adminTab} onValueChange={setAdminTab} className="space-y-6">
            <div className="mb-8">
              <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-2">Dashboard</h1>
              <p className="text-muted-foreground">
                Your submissions and admin tools
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {/* Dropdown only on small screens */}
              <div className="w-full sm:hidden">
                <Select value={adminTab} onValueChange={setAdminTab}>
                  <SelectTrigger className="w-full h-10">
                    <SelectValue placeholder="Choose section" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mine">My Submissions</SelectItem>
                    <SelectItem value="all-submissions">All Submissions</SelectItem>
                    <SelectItem value="edit-requests">Edit Requests</SelectItem>
                    <SelectItem value="users">Users</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Tab boxes on sm and up */}
              <TabsList className="hidden sm:grid w-full max-w-3xl grid-cols-4 h-auto p-1.5">
                <TabsTrigger value="mine" className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4" />
                  My Submissions
                </TabsTrigger>
                <TabsTrigger value="all-submissions" className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4" />
                  All Submissions
                </TabsTrigger>
                <TabsTrigger value="edit-requests" className="flex items-center gap-2">
                  <FileEdit className="h-4 w-4" />
                  Edit Requests
                </TabsTrigger>
                <TabsTrigger value="users" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Users
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="mine" className="mt-0 space-y-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  <FileCheck className="h-5 w-5" />
                  My Submissions
                </h2>
                <p className="text-sm text-muted-foreground">Your catalog requests. Badge shows status. Edit approved entries in the catalog.</p>
              </div>
              <MySubmissionsBlock />
            </TabsContent>

            <TabsContent value="edit-requests" className="mt-0 space-y-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-foreground">Catalog Edit Requests</h2>
                <p className="text-sm text-muted-foreground">
                  Approve or reject update requests. Click &quot;View record &amp; changes&quot; to see only the changed fields on the record detail page.
                </p>
              </div>
              {editRequestsLoading ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-12">
                    <p className="text-muted-foreground">Loading edit requests…</p>
                  </CardContent>
                </Card>
              ) : editRequests.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    No pending edit requests.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {editRequests.map((req) => (
                    <Card key={req.id}>
                      <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{req.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {req.town}, {req.state} · {req.date_range} · {req.type}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Requested {new Date(req.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/record/${req.catalog_record_id}`)}>
                            View record & changes
                          </Button>
                          <Button size="sm" onClick={() => handleEditRequestApprove(req.id)}>
                            Approve
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleEditRequestReject(req.id)}>
                            Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="all-submissions" className="mt-0 space-y-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-foreground">All Submissions</h2>
                <p className="text-sm text-muted-foreground">
                  Filter and review all submissions. Approving adds the record to the public catalog.
                </p>
              </div>
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Filters sidebar - same pattern as Search */}
                <aside className={`lg:w-80 space-y-6 ${allSubmissionFiltersOpen ? "block" : "hidden lg:block"}`}>
                  <Card className="shadow-archival-md">
                    <CardContent className="pt-6 space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="font-heading text-lg font-semibold">Filters</h2>
                        <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setAllSubmissionFiltersOpen(false)}>
                          Close
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="all-submissions-search">Search</Label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="all-submissions-search"
                            type="text"
                            placeholder="Name, town, state, type, color..."
                            value={allSubmissionSearch}
                            onChange={(e) => setAllSubmissionSearch(e.target.value)}
                            className="pl-9"
                            aria-label="Search all submissions"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="all-status">Status</Label>
                        <Select value={allSubmissionStatusFilter} onValueChange={setAllSubmissionStatusFilter}>
                          <SelectTrigger id="all-status"><SelectValue placeholder="All statuses" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                            <SelectItem value="revision">Needs Revision</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="all-state">State</Label>
                        <Select value={allSubmissionStateFilter} onValueChange={setAllSubmissionStateFilter}>
                          <SelectTrigger id="all-state"><SelectValue placeholder="All states" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All states</SelectItem>
                            {allSubmissionUniqueStates.map((st) => (
                              <SelectItem key={st} value={st}>{st}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="all-type">Type</Label>
                        <Select value={allSubmissionTypeFilter} onValueChange={setAllSubmissionTypeFilter}>
                          <SelectTrigger id="all-type"><SelectValue placeholder="All types" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All types</SelectItem>
                            {allSubmissionUniqueTypes.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="all-color">Color</Label>
                        <Select value={allSubmissionColorFilter} onValueChange={setAllSubmissionColorFilter}>
                          <SelectTrigger id="all-color"><SelectValue placeholder="All colors" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All colors</SelectItem>
                            {allSubmissionUniqueColors.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="all-date-from">Submitted date from</Label>
                        <Input id="all-date-from" type="date" value={allSubmissionDateFrom} onChange={(e) => setAllSubmissionDateFrom(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="all-date-to">Submitted date to</Label>
                        <Input id="all-date-to" type="date" value={allSubmissionDateTo} onChange={(e) => setAllSubmissionDateTo(e.target.value)} />
                      </div>
                      <Button variant="outline" className="w-full" onClick={clearAllSubmissionFilters}>
                        Clear Filters
                      </Button>
                    </CardContent>
                  </Card>
                </aside>

                <main className="flex-1 space-y-4">
                  {filteredAllSubmissions.length > 0 && !allSubmissionsLoading && (
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-archival-sm">
                      <p className="text-sm text-muted-foreground">
                        Showing <span className="font-semibold text-foreground">1–{filteredAllSubmissions.length}</span> of <span className="font-semibold text-foreground">{filteredAllSubmissions.length}</span> submissions
                      </p>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setAllSubmissionFiltersOpen(true)}>
                          <SlidersHorizontal className="h-4 w-4 mr-2" />
                          Filters
                        </Button>
                        <div className="flex border border-border rounded-md">
                          <Button variant={allSubmissionViewMode === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setAllSubmissionViewMode("list")} className="rounded-r-none">
                            <List className="h-4 w-4" />
                          </Button>
                          <Button variant={allSubmissionViewMode === "gallery" ? "secondary" : "ghost"} size="sm" onClick={() => setAllSubmissionViewMode("gallery")} className="rounded-l-none">
                            <Grid3x3 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  {allSubmissionsLoading ? (
                    <div className="flex justify-center items-center py-12">
                      <p className="text-muted-foreground">Loading submissions…</p>
                    </div>
                  ) : allSubmissions.length === 0 ? (
                    <div className="flex flex-col justify-center items-center py-12 text-center">
                      {allSubmissionsError && (
                        <p className="text-sm text-destructive mb-2">Failed to load: {allSubmissionsError}</p>
                      )}
                      <p className="text-muted-foreground">No submissions loaded.</p>
                    </div>
                  ) : filteredAllSubmissions.length === 0 ? (
                    <div className="flex flex-col justify-center items-center py-12 text-center">
                      <p className="text-muted-foreground mb-4">No submissions match your filters.</p>
                      <Button variant="outline" onClick={clearAllSubmissionFilters}>
                        Clear Filters
                      </Button>
                    </div>
                  ) : allSubmissionViewMode === "list" ? (
                    <div className="space-y-4 min-w-0">
                      {filteredAllSubmissions.map((s) => (
                        <Card
                          key={s.id}
                          className="shadow-archival-md hover:shadow-archival-lg transition-shadow cursor-pointer overflow-hidden min-w-0"
                          onClick={() => navigate(`/dashboard/${s.id}`)}
                        >
                          <CardContent className="p-4 sm:p-6 min-w-0 overflow-hidden">
                            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 min-w-0">
                              <img
                                src={s.image_url || postmarkSample}
                                alt={s.name}
                                className="w-full h-40 sm:w-32 sm:h-32 object-cover rounded border border-border shrink-0 min-w-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 min-w-0 mb-2">
                                  <h3 className="font-heading text-lg sm:text-xl font-semibold text-foreground truncate">
                                    {s.name}
                                  </h3>
                                  <span className="shrink-0">{getStatusBadge(s.status)}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm min-w-0 sm:hidden">
                                  <span className="text-muted-foreground">Location:</span><span className="text-foreground">{s.town}, {s.state}</span>
                                  <span className="text-muted-foreground/50">·</span>
                                  <span className="text-muted-foreground">Date:</span><span className="text-foreground">{s.date_range}</span>
                                  <span className="text-muted-foreground/50">·</span>
                                  <span className="text-muted-foreground">Type:</span><span className="text-foreground">{s.type}</span>
                                  {s.submitter_name && <><span className="text-muted-foreground/50">·</span><span className="text-muted-foreground">by {s.submitter_name}</span></>}
                                </div>
                                <div className="hidden sm:grid grid-cols-2 gap-x-6 gap-y-1 text-sm min-w-0">
                                  <div className="min-w-0"><span className="text-muted-foreground">Location:</span>{" "}<span className="text-foreground break-words">{s.town}, {s.state}</span></div>
                                  <div className="min-w-0"><span className="text-muted-foreground">Date Range:</span>{" "}<span className="text-foreground break-words">{s.date_range}</span></div>
                                  <div className="min-w-0"><span className="text-muted-foreground">Type:</span>{" "}<span className="text-foreground break-words">{s.type}</span></div>
                                  {s.submitter_name && <div className="min-w-0"><span className="text-muted-foreground">By:</span>{" "}<span className="text-foreground break-words">{s.submitter_name}</span></div>}
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/${s.id}`); }}>View</Button>
                                  {s.status === "pending" && (
                                    <>
                                      <Button size="sm" onClick={(e) => { e.stopPropagation(); handleAllSubmissionStatus(s.id, "approved"); }}>Approve</Button>
                                      <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); handleAllSubmissionStatus(s.id, "rejected"); }}>Reject</Button>
                                      <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleAllSubmissionStatus(s.id, "revision"); }}>Revision</Button>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0">
                      {filteredAllSubmissions.map((s) => (
                        <Card
                          key={s.id}
                          className="shadow-archival-md hover:shadow-archival-lg transition-shadow cursor-pointer overflow-hidden min-w-0"
                          onClick={() => navigate(`/dashboard/${s.id}`)}
                        >
                          <img src={s.image_url || postmarkSample} alt={s.name} className="w-full h-48 object-cover" />
                          <CardContent className="p-4 min-w-0 overflow-hidden">
                            <h3 className="font-heading text-lg font-semibold text-foreground mb-2 truncate">
                              {s.name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm min-w-0 sm:hidden">
                              <span className="text-muted-foreground">Location:</span><span className="text-foreground">{s.town}, {s.state}</span>
                              <span className="text-muted-foreground/50">·</span>
                              <span className="text-muted-foreground">Date:</span><span className="text-foreground">{s.date_range}</span>
                              <span className="text-muted-foreground/50">·</span>
                              <span className="text-muted-foreground">Color:</span><span className="text-foreground">{s.color}</span>
                            </div>
                            <div className="hidden sm:block space-y-1 text-sm min-w-0">
                              <div className="min-w-0"><span className="text-muted-foreground">Location:</span>{" "}<span className="text-foreground break-words">{s.town}, {s.state}</span></div>
                              <div className="min-w-0"><span className="text-muted-foreground">Date:</span>{" "}<span className="text-foreground break-words">{s.date_range}</span></div>
                              <div className="min-w-0"><span className="text-muted-foreground">Color:</span>{" "}<span className="text-foreground break-words">{s.color}</span></div>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-3">
                              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/${s.id}`); }}>View</Button>
                              {s.status === "pending" && (
                                <>
                                  <Button size="sm" onClick={(e) => { e.stopPropagation(); handleAllSubmissionStatus(s.id, "approved"); }}>Approve</Button>
                                  <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); handleAllSubmissionStatus(s.id, "rejected"); }}>Reject</Button>
                                  <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleAllSubmissionStatus(s.id, "revision"); }}>Revision</Button>
                                </>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </main>
              </div>
            </TabsContent>

            <TabsContent value="users" className="mt-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>All users</CardTitle>
                  <p className="text-sm text-muted-foreground">Registered users (fellow users).</p>
                </CardHeader>
                <CardContent>
                  {allUsers.length === 0 && !usersLoading ? (
                    <p className="text-muted-foreground">No users returned.</p>
                  ) : allUsers.length === 0 ? (
                    <p className="text-muted-foreground">Loading…</p>
                  ) : (
                    <div className="rounded-md border overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="p-2 text-left">Email</th>
                            <th className="p-2 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allUsers.map((u) => (
                            <tr key={u.id} className="border-b">
                              <td className="p-2">{u.email ?? "—"}</td>
                              <td className="p-2 flex flex-wrap gap-1">
                                <Button variant="outline" size="sm" onClick={() => { setResetPasswordUser(u); setResetPasswordValue(""); }}>
                                  Reset password
                                </Button>
                                {user?.id !== u.id && (
                                  <Button variant="destructive" size="sm" onClick={() => setDeleteUser(u)}>
                                    Delete
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Login requests</CardTitle>
                  <p className="text-sm text-muted-foreground">Update status as needed.</p>
                </CardHeader>
                <CardContent>
                  {loginRequests.length === 0 ? (
                    <p className="text-muted-foreground">No login requests.</p>
                  ) : (
                    <div className="space-y-3">
                      {loginRequests.map((lr) => (
                        <div key={lr.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3">
                          <div>
                            <p className="font-medium">{lr.first_name} {lr.last_name}</p>
                            <p className="text-sm text-muted-foreground">{lr.email}</p>
                            <p className="text-xs text-muted-foreground">{lr.country} · {new Date(lr.created_at).toLocaleString()}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={lr.status === "pending" ? "outline" : "secondary"}>{lr.status}</Badge>
                            <Select value={lr.status} onValueChange={(v) => handleLoginRequestStatus(lr.id, v)}>
                              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="approved">Approved</SelectItem>
                                <SelectItem value="denied">Denied</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="mt-4">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-2">Catalog and bulk import are managed in Django admin.</p>
                  <Button variant="outline" size="sm" asChild>
                    <a href={getApiBaseUrl().replace(/\/api\/?$/, "") + "/admin/"} target="_blank" rel="noopener noreferrer">
                      Open Django Admin
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : null}

        {/* Reset password dialog (admin) */}
        <Dialog open={!!resetPasswordUser} onOpenChange={(open) => { if (!open) { setResetPasswordUser(null); setResetPasswordValue(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                Set a new password for {resetPasswordUser?.email ?? "this user"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>New password (min 6 characters)</Label>
              <Input
                type="password"
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                placeholder="New password"
                minLength={6}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setResetPasswordUser(null); setResetPasswordValue(""); }}>
                Cancel
              </Button>
              <Button onClick={handleResetPasswordSubmit} disabled={resetPasswordValue.length < 6 || resetPasswordLoading}>
                {resetPasswordLoading ? "Resetting…" : "Reset password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete user confirmation (admin) */}
        <AlertDialog open={!!deleteUser} onOpenChange={(open) => { if (!open) setDeleteUser(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete user</AlertDialogTitle>
              <AlertDialogDescription>
                Permanently delete {deleteUser?.email ?? "this user"}? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button variant="destructive" onClick={handleDeleteUserConfirm} disabled={deleteUserLoading}>
                {deleteUserLoading ? "Deleting…" : "Delete"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {!isAdmin ? (
          <>
            <div className="mb-8">
              <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-2">Dashboard</h1>
              <p className="text-muted-foreground">
                Your catalog submissions and their status
              </p>
            </div>

            {user && <MySubmissionsBlock />}
            {!user && (
              <Card className="flex-1 flex items-center justify-center min-h-[60vh]">
                <CardContent className="text-center">
                  <p className="text-muted-foreground mb-4">Sign in to see your submissions.</p>
                  <Button variant="outline" onClick={() => navigate("/auth")}>Sign in</Button>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Dashboard;
