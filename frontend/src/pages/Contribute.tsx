import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, CheckCircle, XCircle, Clock } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getColors, type ColorOption } from "@/services/colors";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getApiBaseUrl } from "@/lib/api";

const SUBMISSION_IMAGES_BUCKET = "submission-images";
const MAX_IMAGE_SIZE_MB = 10;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/tiff"];

const STATE_OPTIONS = [
  { value: "MA", label: "Massachusetts" },
  { value: "NY", label: "New York" },
  { value: "PA", label: "Pennsylvania" },
  { value: "CT", label: "Connecticut" },
];

const TYPE_OPTIONS = [
  { value: "Circular Date Stamp", label: "Circular Date Stamp" },
  { value: "Straight Line", label: "Straight Line" },
  { value: "Manuscript", label: "Manuscript" },
  { value: "Oval", label: "Oval" },
];

const RARITY_OPTIONS = [
  { value: "Common", label: "Common" },
  { value: "Scarce", label: "Scarce" },
  { value: "Rare", label: "Rare" },
  { value: "Very Rare", label: "Very Rare" },
];

const MANUSCRIPT_OPTIONS = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
];

interface MySubmission {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

function parseDateRange(dateRange: string): { firstSeen: string; lastSeen: string } {
  const s = (dateRange ?? "").trim();
  if (!s) return { firstSeen: "", lastSeen: "" };
  const dash = s.indexOf("-");
  if (dash === -1) return { firstSeen: s, lastSeen: "" };
  return { firstSeen: s.slice(0, dash).trim(), lastSeen: s.slice(dash + 1).trim() };
}

const Contribute = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const [colorOptions, setColorOptions] = useState<ColorOption[]>([]);
  const [mySubmissions, setMySubmissions] = useState<MySubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);

  // Form state – all fields shown on Submission Detail
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [town, setTown] = useState("");
  const [firstSeen, setFirstSeen] = useState("");
  const [lastSeen, setLastSeen] = useState("");
  const [type, setType] = useState("");
  const [color, setColor] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [manuscript, setManuscript] = useState("");
  const [rarity, setRarity] = useState("");
  const [description, setDescription] = useState("");
  const [references, setReferences] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);

  useEffect(() => {
    getColors()
      .then(setColorOptions)
      .catch(() => setColorOptions([{ id: 0, name: "Black", value: "" }]));
  }, []);

  useEffect(() => {
    setMySubmissions([]);
    setLoadingSubmissions(false);
  }, [user]);

  useEffect(() => {
    if (editId) {
      toast({
        title: "Edit not available",
        description: "Submissions are managed via Django admin. Use the admin site to edit.",
        variant: "destructive",
      });
      navigate("/contribute", { replace: true });
    }
    setLoadingEdit(false);
  }, [editId, navigate, toast]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please use PNG, JPG, WebP, or TIFF.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      toast({
        title: "File too large",
        description: `Maximum size is ${MAX_IMAGE_SIZE_MB}MB.`,
        variant: "destructive",
      });
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const buildDateRange = () => {
    const first = firstSeen.trim();
    const last = lastSeen.trim();
    if (!first) return "";
    return last ? `${first}-${last}` : first;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to submit an entry.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    const nameVal = name.trim();
    const stateVal = state.trim();
    const townVal = town.trim();
    const firstVal = firstSeen.trim();
    const typeVal = type.trim();
    const colorVal = color.trim();

    if (!nameVal || !stateVal || !townVal || !firstVal || !typeVal || !colorVal) {
      toast({
        title: "Missing required fields",
        description: "Please fill in Name, State, Town/City, First Seen Year, Postmark Type, and Color.",
        variant: "destructive",
      });
      return;
    }

    const dateRange = buildDateRange();
    if (!dateRange) {
      toast({
        title: "Invalid date",
        description: "Please enter at least First Seen Year.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const adminUrl = getApiBaseUrl().replace(/\/api\/?$/, "") + "/admin/";
      toast({
        title: "Submissions via Django",
        description: "New entries and corrections are managed via Django admin. Contact the site administrator for access or use the admin site.",
        variant: "default",
      });
      if (window.confirm("Open Django admin to add or edit postmarks?")) {
        window.open(adminUrl, "_blank");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "rejected":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">Pending Review</Badge>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-2">
              Contributor Dashboard
            </h1>
            <p className="text-muted-foreground">
              Submit new postmark records or corrections. All fields match what reviewers see on the Submission Detail page.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Card className="shadow-archival-lg">
                <CardHeader>
                  <CardTitle className="font-heading text-xl">
                    {editId ? "Edit Submission" : "Submit New Entry"}
                  </CardTitle>
                  {editId && (
                    <p className="text-sm text-muted-foreground">
                      Update your submission and resubmit for review.
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-6">
                  {!user && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
                      You must be signed in to submit.{" "}
                      <Button variant="link" className="p-0 h-auto text-amber-700 dark:text-amber-300" onClick={() => navigate("/auth")}>
                        Sign in
                      </Button>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        placeholder="e.g., Boston Harbor Cover, Central Park Postmark"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="state">State *</Label>
                      <Select value={state} onValueChange={setState} required>
                        <SelectTrigger id="state">
                          <SelectValue placeholder="Select state..." />
                        </SelectTrigger>
                        <SelectContent>
                          {STATE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="town">Town/City *</Label>
                      <Input
                        id="town"
                        placeholder="e.g., Boston"
                        value={town}
                        onChange={(e) => setTown(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstSeen">First Seen Year *</Label>
                        <Input
                          id="firstSeen"
                          type="number"
                          placeholder="1825"
                          value={firstSeen}
                          onChange={(e) => setFirstSeen(e.target.value)}
                          min={1700}
                          max={1861}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastSeen">Last Seen Year</Label>
                        <Input
                          id="lastSeen"
                          type="number"
                          placeholder="1845"
                          value={lastSeen}
                          onChange={(e) => setLastSeen(e.target.value)}
                          min={1700}
                          max={1861}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="type">Postmark Type *</Label>
                      <Select value={type} onValueChange={setType} required>
                        <SelectTrigger id="type">
                          <SelectValue placeholder="Select type..." />
                        </SelectTrigger>
                        <SelectContent>
                          {TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="color">Color *</Label>
                      <Select value={color} onValueChange={setColor} required>
                        <SelectTrigger id="color">
                          <SelectValue placeholder="Select color..." />
                        </SelectTrigger>
                        <SelectContent>
                          {colorOptions.map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dimensions">Dimensions</Label>
                      <Input
                        id="dimensions"
                        placeholder="e.g., 32mm diameter"
                        value={dimensions}
                        onChange={(e) => setDimensions(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manuscript">Manuscript</Label>
                      <Select value={manuscript} onValueChange={setManuscript}>
                        <SelectTrigger id="manuscript">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {MANUSCRIPT_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="rarity">Rarity</Label>
                      <Select value={rarity} onValueChange={setRarity}>
                        <SelectTrigger id="rarity">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {RARITY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Provide details about the postmark, its characteristics, and any notable features..."
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="references">Citation References (Optional)</Label>
                      <Textarea
                        id="references"
                        placeholder="List any catalog numbers, publications, or other references..."
                        rows={3}
                        value={references}
                        onChange={(e) => setReferences(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Upload Image</Label>
                      <input
                        ref={fileInputRef}
                        id="contribute-image-input"
                        type="file"
                        accept={ALLOWED_IMAGE_TYPES.join(",")}
                        className="sr-only"
                        onChange={handleImageChange}
                      />
                      <label
                        htmlFor="contribute-image-input"
                        className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer min-h-[180px]"
                      >
                        {imagePreview ? (
                          <div className="space-y-2 w-full">
                            <img src={imagePreview} alt="Preview" className="mx-auto max-h-40 rounded object-contain pointer-events-none" />
                            <p className="text-sm text-muted-foreground">{imageFile?.name || "Current image"}</p>
                            <div className="flex gap-2 justify-center">
                              <span className="text-sm text-primary font-medium">Click to change</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setImageFile(null);
                                  setImagePreview(null);
                                  setExistingImageUrl(null);
                                  if (fileInputRef.current) fileInputRef.current.value = "";
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-sm text-muted-foreground mb-2">
                              Click to upload or drag and drop
                            </p>
                            <p className="text-xs text-muted-foreground">
                              PNG, JPG, or TIFF up to {MAX_IMAGE_SIZE_MB}MB
                            </p>
                          </>
                        )}
                      </label>
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={!user || submitting || loadingEdit}
                    >
                      {submitting ? (editId ? "Updating..." : "Submitting...") : editId ? "Update and Resubmit" : "Submit for Review"}
                    </Button>
                  </form>

                  <p className="text-xs text-muted-foreground">
                    * Required: Name, State, Town/City, First Seen Year, Postmark Type, Color. All other fields match Submission Detail.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="shadow-archival-md">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Submission Guidelines</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p className="leading-relaxed">
                    <strong className="text-foreground">Image Quality:</strong> Provide clear, high-resolution scans or photographs of postmarks.
                  </p>
                  <p className="leading-relaxed">
                    <strong className="text-foreground">Accuracy:</strong> Verify all dates, locations, and details before submission.
                  </p>
                  <p className="leading-relaxed">
                    <strong className="text-foreground">Citations:</strong> Include references when available to help verification.
                  </p>
                  <p className="leading-relaxed">
                    <strong className="text-foreground">Review Time:</strong> Most submissions are reviewed within 5-7 business days.
                  </p>
                </CardContent>
              </Card>

              {/* <Card className="shadow-archival-md">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">My Submissions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!user ? (
                    <p className="text-sm text-muted-foreground">Sign in to see your submissions.</p>
                  ) : loadingSubmissions ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : mySubmissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No submissions yet.</p>
                  ) : (
                    mySubmissions.map((submission) => (
                      <div key={submission.id} className="p-3 border border-border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{submission.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(submission.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          {getStatusIcon(submission.status)}
                        </div>
                        <div className="flex items-center justify-between">
                          {getStatusBadge(submission.status)}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card> */}
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Contribute;
