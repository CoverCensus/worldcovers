import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Upload, CheckCircle, XCircle, Clock } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getColors, type ColorOption } from "@/services/colors";
import { getAdministrativeUnits, type StateOption } from "@/services/administrativeUnits";
import { getPostmarkShapes, type PostmarkShapeOption } from "@/services/postmarkShapes";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

/** Base URL for Django API (contributions, etc.) */
function getApiBaseUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  return env.trim().replace(/\/+$/, "");
}

const SUBMISSION_IMAGES_BUCKET = "submission-images";
const MAX_IMAGE_SIZE_MB = 10;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/tiff"];

/** Value when user chooses "Other" and types state manually */
const STATE_OTHER_VALUE = "__other__";
/** Value when user chooses "Other" and types color manually */
const COLOR_OTHER_VALUE = "__other__";
/** Value when user chooses "Other" and types postmark type manually */
const TYPE_OTHER_VALUE = "__other__";

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

const Contribute = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const user = useAuth();
  const [colorOptions, setColorOptions] = useState<ColorOption[]>([]);
  const [stateOptions, setStateOptions] = useState<StateOption[]>([]);
  const [typeOptions, setTypeOptions] = useState<PostmarkShapeOption[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [stateOptionsError, setStateOptionsError] = useState<string | null>(null);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [typeOptionsError, setTypeOptionsError] = useState<string | null>(null);
  const [mySubmissions, setMySubmissions] = useState<MySubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state – all fields shown on Submission Detail
  const [state, setState] = useState("");
  const [stateOther, setStateOther] = useState("");
  const [town, setTown] = useState("");
  const [firstSeen, setFirstSeen] = useState("");
  const [lastSeen, setLastSeen] = useState("");
  const [type, setType] = useState("");
  const [typeOther, setTypeOther] = useState("");
  const [color, setColor] = useState("");
  const [colorOther, setColorOther] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [manuscript, setManuscript] = useState("");
  const [rarity, setRarity] = useState("");
  const [description, setDescription] = useState("");
  const [references, setReferences] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    getColors()
      .then(setColorOptions)
      .catch(() => setColorOptions([{ id: 0, name: "Black", value: "" }]));
  }, []);

  useEffect(() => {
    setLoadingStates(true);
    setStateOptionsError(null);
    getAdministrativeUnits()
      .then(setStateOptions)
      .catch((err) => {
        setStateOptionsError(err instanceof Error ? err.message : "Failed to load states");
        setStateOptions([]);
      })
      .finally(() => setLoadingStates(false));
  }, []);

  useEffect(() => {
    setLoadingTypes(true);
    setTypeOptionsError(null);
    getPostmarkShapes()
      .then(setTypeOptions)
      .catch((err) => {
        setTypeOptionsError(err instanceof Error ? err.message : "Failed to load postmark types");
        setTypeOptions([]);
      })
      .finally(() => setLoadingTypes(false));
  }, []);

  // Submissions are now stored in Django; "My Submissions" list can be added via Django API later if needed.

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
        description: "Only PNG, JPG, or TIFF are allowed.",
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

  const buildName = () => {
    const stateLabel = state === STATE_OTHER_VALUE ? stateOther.trim() : state;
    return `${town.trim()}, ${stateLabel} ${type}`.trim();
  };

  const buildDateRange = () => {
    const first = firstSeen.trim();
    const last = lastSeen.trim();
    if (!first) return "";
    return last ? `${first}-${last}` : first;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const stateVal = state === STATE_OTHER_VALUE ? stateOther.trim() : state.trim();
    const townVal = town.trim();
    const firstVal = firstSeen.trim();
    const typeVal = type === TYPE_OTHER_VALUE ? typeOther.trim() : type.trim();
    const colorVal = color === COLOR_OTHER_VALUE ? colorOther.trim() : color.trim();

    if (!stateVal || !townVal || !firstVal || !typeVal || !colorVal) {
      const parts = [];
      if (!stateVal) parts.push("State");
      if (!townVal) parts.push("Town/City");
      if (!firstVal) parts.push("First Seen Year");
      if (!typeVal) parts.push("Postmark Type");
      if (!colorVal) parts.push("Color");
      toast({
        title: "Missing required fields",
        description: `Please fill in: ${parts.join(", ")}.`,
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

    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      toast({
        title: "Configuration error",
        description: "VITE_API_URL is not set. Cannot submit to catalog.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const submitterName = user?.username || user?.email || undefined;

      let body: string | FormData;
      let headers: Record<string, string> = {};

      if (imageFile) {
        const form = new FormData();
        form.append("state", stateVal);
        form.append("town", townVal);
        form.append("firstSeen", firstVal);
        form.append("lastSeen", lastSeen.trim());
        form.append("type", typeVal);
        form.append("color", colorVal);
        if (dimensions.trim()) form.append("dimensions", dimensions.trim());
        if (manuscript.trim()) form.append("manuscript", manuscript.trim());
        if (rarity.trim()) form.append("rarity", rarity.trim());
        if (description.trim()) form.append("description", description.trim());
        if (references.trim()) form.append("references", references.trim());
        if (submitterName) form.append("submitterName", submitterName);
        form.append("image", imageFile, imageFile.name);
        body = form;
        // Do not set Content-Type so browser sets multipart/form-data with boundary
      } else {
        body = JSON.stringify({
          state: stateVal,
          town: townVal,
          firstSeen: firstVal,
          lastSeen: lastSeen.trim(),
          type: typeVal,
          color: colorVal,
          dimensions: dimensions.trim() || undefined,
          manuscript: manuscript.trim() || undefined,
          rarity: rarity.trim() || undefined,
          description: description.trim() || undefined,
          references: references.trim() || undefined,
          submitterName: submitterName || undefined,
        });
        headers["Content-Type"] = "application/json";
      }

      const res = await fetch(`${apiBase}/api/contributions/`, {
        method: "POST",
        headers,
        body,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = errBody?.detail || res.statusText || "Could not submit.";
        throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }

      toast({
        title: "Submission sent",
        description: "Your entry has been added to the catalog.",
      });

      setState("");
      setStateOther("");
      setTown("");
      setFirstSeen("");
      setLastSeen("");
      setType("");
      setTypeOther("");
      setColor("");
      setColorOther("");
      setDimensions("");
      setManuscript("");
      setRarity("");
      setDescription("");
      setReferences("");
      setImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      toast({
        title: "Submission failed",
        description: err instanceof Error ? err.message : "Could not submit. Try again.",
        variant: "destructive",
      });
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
                  <CardTitle className="font-heading text-xl">Submit New Entry</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!user && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
                      Sign in to add your name to the submission.{" "}
                      <Button variant="link" className="p-0 h-auto text-amber-700 dark:text-amber-300" onClick={() => navigate("/auth")}>
                        Sign in
                      </Button>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="state">State *</Label>
                      <SearchableSelect
                        id="state"
                        value={state}
                        onValueChange={setState}
                        placeholder="Select state..."
                        options={[
                          ...stateOptions,
                          { value: STATE_OTHER_VALUE, label: "Other (type below)" },
                        ]}
                        loading={loadingStates}
                        error={!!stateOptionsError}
                        errorMessage={stateOptionsError ?? "Failed to load states"}
                        searchPlaceholder="Search states..."
                        emptyMessage="No state found."
                        aria-label="State"
                      />
                      {state === STATE_OTHER_VALUE && (
                        <Input
                          id="state-other"
                          placeholder="e.g. Virginia Territory, District of Columbia"
                          value={stateOther}
                          onChange={(e) => setStateOther(e.target.value)}
                          className="mt-2"
                          aria-label="State (other)"
                        />
                      )}
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
                          type="text"
                          inputMode="numeric"
                          placeholder="1825"
                          value={firstSeen}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                            setFirstSeen(v);
                          }}
                          maxLength={5}
                          aria-label="First seen year (numbers only, up to 5 digits)"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastSeen">Last Seen Year</Label>
                        <Input
                          id="lastSeen"
                          type="text"
                          inputMode="numeric"
                          placeholder="1845"
                          value={lastSeen}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                            setLastSeen(v);
                          }}
                          maxLength={5}
                          aria-label="Last seen year (numbers only, up to 5 digits)"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="type">Postmark Type *</Label>
                      <SearchableSelect
                        id="type"
                        value={type}
                        onValueChange={setType}
                        placeholder="Select type..."
                        options={[
                          ...typeOptions.map((t) => ({ value: t.name, label: t.name })),
                          { value: TYPE_OTHER_VALUE, label: "Other (type below)" },
                        ]}
                        loading={loadingTypes}
                        error={!!typeOptionsError}
                        errorMessage={typeOptionsError ?? "Failed to load postmark types"}
                        searchPlaceholder="Search types..."
                        emptyMessage="No type found."
                        aria-label="Postmark type"
                      />
                      {type === TYPE_OTHER_VALUE && (
                        <Input
                          id="type-other"
                          placeholder="e.g. Circular Date Stamp, Straight Line"
                          value={typeOther}
                          onChange={(e) => setTypeOther(e.target.value)}
                          className="mt-2"
                          aria-label="Postmark type (other)"
                        />
                      )}
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
                          <SelectItem value={COLOR_OTHER_VALUE}>
                            Other (type below)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {color === COLOR_OTHER_VALUE && (
                        <Input
                          id="color-other"
                          placeholder="e.g. Sepia, Blue-black"
                          value={colorOther}
                          onChange={(e) => setColorOther(e.target.value)}
                          className="mt-2"
                          aria-label="Color (other)"
                        />
                      )}
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
                        type="file"
                        accept={ALLOWED_IMAGE_TYPES.join(",")}
                        className="hidden"
                        onChange={handleImageChange}
                      />
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                        className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                      >
                        {imagePreview ? (
                          <div className="space-y-2">
                            <img src={imagePreview} alt="Preview" className="mx-auto max-h-40 rounded object-contain" />
                            <p className="text-sm text-muted-foreground">{imageFile?.name}</p>
                            <Button type="button" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                              Remove
                            </Button>
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
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={submitting}
                    >
                      {submitting ? "Submitting..." : "Submit to Catalog"}
                    </Button>
                  </form>

                  <p className="text-xs text-muted-foreground">
                    * Required: State, Town/City, First Seen Year, Postmark Type, Color. All other fields match Submission Detail.
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
