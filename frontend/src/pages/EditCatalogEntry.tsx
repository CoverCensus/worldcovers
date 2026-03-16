import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { getPostmarkById, normalizeImageUrl } from "@/services/postmarks";
import { getColors, type ColorOption } from "@/services/colors";
import { getAdministrativeUnits, type StateOption } from "@/services/administrativeUnits";
import { getPostmarkShapes, type PostmarkShapeOption } from "@/services/postmarkShapes";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

function getApiBaseUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  return env.trim().replace(/\/+$/, "");
}

const MAX_IMAGE_SIZE_MB = 10;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/tiff"];

const STATE_OTHER_VALUE = "__other__";
const COLOR_OTHER_VALUE = "__other__";
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

const MIN_YEAR = 1661;
const CURRENT_YEAR = new Date().getFullYear();

function getYearError(value: string, opts: { required: boolean; label: string }): string | null {
  const v = value.trim();
  if (!v) {
    return opts.required ? `${opts.label} is required` : null;
  }
  if (v.length !== 4) {
    return `${opts.label} must be 4 digits`;
  }
  const n = Number(v);
  if (Number.isNaN(n) || n < MIN_YEAR || n > CURRENT_YEAR) {
    return `${opts.label} must be between ${MIN_YEAR} and ${CURRENT_YEAR}`;
  }
  return null;
}

function parseOtherCharacteristics(raw: string | null | undefined) {
  const result = {
    submitterName: "",
    description: "",
    citationReferences: "",
    rarityLabel: "",
  };
  if (!raw) return result;
  const lines = String(raw).split(/\r?\n/);
  const extraDescriptionLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("Submitted by:")) {
      result.submitterName = trimmed.slice("Submitted by:".length).trim();
    } else if (trimmed.startsWith("Description:")) {
      result.description = trimmed.slice("Description:".length).trim();
    } else if (trimmed.startsWith("Citation references:")) {
      result.citationReferences = trimmed.slice("Citation references:".length).trim();
    } else if (trimmed.startsWith("Rarity:")) {
      result.rarityLabel = trimmed.slice("Rarity:".length).trim();
    } else {
      extraDescriptionLines.push(trimmed);
    }
  }
  const extra = extraDescriptionLines.join("\n");
  result.description = [result.description, extra].filter(Boolean).join("\n");
  return result;
}

const EditCatalogEntry = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const { toast } = useToast();
  const user = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const postmarkId = id ? parseInt(String(id).replace(/^api-/, ""), 10) : null;

  const [colorOptions, setColorOptions] = useState<ColorOption[]>([]);
  const [stateOptions, setStateOptions] = useState<StateOption[]>([]);
  const [typeOptions, setTypeOptions] = useState<PostmarkShapeOption[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [stateOptionsError, setStateOptionsError] = useState<string | null>(null);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [typeOptionsError, setTypeOptionsError] = useState<string | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(true);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    state?: string;
    town?: string;
    firstSeen?: string;
    lastSeen?: string;
    type?: string;
    color?: string;
    dimensions?: string;
  }>({});

  /** Town/City: letters, spaces, hyphens, apostrophes only */
  const sanitizeTown = (v: string) => v.replace(/[^a-zA-Z\s\-']/g, "");
  /** Dimensions: max 4 digits, numbers only */
  const sanitizeDimensions = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  useEffect(() => {
    getColors()
      .then(setColorOptions)
      .catch(() => setColorOptions([{ id: 0, name: "Black", value: "" }]));
  }, []);

  useEffect(() => {
    setLoadingStates(true);
    setStateOptionsError(null);
    getAdministrativeUnits(true)
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

  useEffect(() => {
    if (postmarkId == null || isNaN(postmarkId)) {
      setLoadingRecord(false);
      setRecordError("Invalid record ID");
      return;
    }
    let cancelled = false;
    setLoadingRecord(true);
    setRecordError(null);
    getPostmarkById(postmarkId)
      .then((data) => {
        if (cancelled || !data) {
          if (!data) setRecordError("Record not found");
          return;
        }
        const datesSeen = data.datesSeen?.[0];
        const firstSize = data.sizes?.[0];
        const firstVal = data.valuations?.[0];
        const parsed = parseOtherCharacteristics(data.otherCharacteristics);
        const rarityFromOther = parsed.rarityLabel?.trim() || "";
        const rarityMatch = RARITY_OPTIONS.find(
          (opt) =>
            opt.value === rarityFromOther ||
            rarityFromOther.toLowerCase() === opt.value.toLowerCase()
        );
        const initialRarity = rarityMatch ? rarityMatch.value : "";
        const dimRaw =
          firstSize?.sizeNotes?.trim() ||
          (firstSize?.width != null && firstSize?.height != null
            ? `${firstSize.width}×${firstSize.height} mm`
            : "");
        const dimStr = dimRaw ? dimRaw.replace(/\D/g, "").slice(0, 4) : "";

        const baseImageUrl = import.meta.env.VITE_IMAGE_URL ?? "";
        const firstImage = data.images?.[0];
        const existingUrl = firstImage
          ? normalizeImageUrl(
              firstImage.imageUrl ??
                (baseImageUrl
                  ? `${baseImageUrl.replace(/\/+$/, "")}/postmarks/${firstImage.storageFilename ?? ""}`
                  : null)
            )
          : null;

        setExistingImageUrl(existingUrl);
        setState(data.state || "");
        setTown(sanitizeTown(data.town || ""));
        setFirstSeen(datesSeen?.earliestDateSeen?.slice(0, 4) || "");
        setLastSeen(datesSeen?.latestDateSeen?.slice(0, 4) || "");
        setType(data?.postmarkShape?.shapeName || "");
        setColor(data.colorsDisplay || "");
        setDimensions(dimStr);
        setManuscript(data.isManuscript ? "Yes" : "No");
        setRarity(initialRarity);
        // Only prefill the textarea with an actual description, not raw otherCharacteristics
        // so users don't have to clear default "Submitted by: ..." lines.
        setDescription(parsed.description || "");
        setReferences(parsed.citationReferences || "");
      })
      .catch(() => {
        if (!cancelled) setRecordError("Failed to load record");
      })
      .finally(() => {
        if (!cancelled) setLoadingRecord(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postmarkId]);

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

    const errors: typeof fieldErrors = {};
    if (!stateVal) {
      errors.state = "State is required";
    }
    if (!townVal) {
      errors.town = "Town/City is required";
    }

    const firstSeenError = getYearError(firstSeen, { required: true, label: "First Seen Year" });
    const lastSeenError = getYearError(lastSeen, { required: false, label: "Last Seen Year" });
    if (firstSeenError) {
      errors.firstSeen = firstSeenError;
    }
    if (lastSeenError) {
      errors.lastSeen = lastSeenError;
    }
    if (!typeVal) {
      errors.type = "Postmark Type is required";
    }
    if (!colorVal) {
      errors.color = "Color is required";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
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
        description: "VITE_API_URL is not set. Cannot submit.",
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
        form.append("editPostmarkId", String(postmarkId!));
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
      } else {
        body = JSON.stringify({
          editPostmarkId: postmarkId!,
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
        credentials: "include",
        headers,
        body,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = errBody?.detail || res.statusText || "Could not submit.";
        throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }

      const result = await res.json().catch(() => ({} as any));
      const updatedId = (result as any)?.postmarkId as number | undefined;
      const contributionId = (result as any)?.contributionId as number | undefined;

      if (updatedId) {
        toast({
          title: "Entry updated",
          description: "Your catalog entry has been updated.",
        });
      } else if (contributionId) {
        toast({
          title: "Correction submitted",
          description: "Your suggested edit has been sent for review by a State Editor.",
        });
      } else {
        toast({
          title: "Submitted",
          description: "Your changes have been submitted.",
        });
      }

      const fromDashboard = location.state?.fromDashboard;
      const fromDashboardDirect = location.state?.fromDashboardDirect;
      const fromDashboardViaDetail = location.state?.fromDashboardViaDetail;
      const fromSearch = location.state?.fromSearch;

      if (fromDashboardDirect) {
        navigate("/dashboard");
      } else if (fromDashboardViaDetail && updatedId) {
        navigate(`/record/api-${updatedId}`, {
          state: { fromDashboard: true },
        });
      } else if (updatedId) {
        navigate(`/record/api-${updatedId}`, {
          state: fromSearch ? { fromSearch: true } : undefined,
        });
      } else if (fromDashboard) {
        navigate("/dashboard");
      } else if (fromSearch) {
        navigate("/search");
      } else {
        navigate("/dashboard");
      }
    } catch (err: unknown) {
      toast({
        title: "Submit failed",
        description: err instanceof Error ? err.message : "Could not submit. Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (postmarkId == null || isNaN(postmarkId)) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Invalid record.</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go back
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  if (loadingRecord) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
        <Footer />
      </div>
    );
  }

  if (recordError) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">{recordError}</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go back
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const role = user?.role;
  const isStateEditor = role === "state_editor";
  const isContributor = role === "contributor";

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6 -ml-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div className="mb-8">
            <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-2">
              Edit Catalog Entry
            </h1>
            <p className="text-muted-foreground">
              {isStateEditor
                ? "Update the catalog entry directly. All fields are prefilled where data exists."
                : "Suggest corrections to this catalog entry. Your suggestion will be reviewed by a State Editor before it appears in the catalog."}
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Card className="shadow-archival-lg">
                <CardHeader>
                  <CardTitle className="font-heading text-xl">Edit and Submit</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!user && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
                      Sign in to add your name to the submission.{" "}
                      <Button
                        variant="link"
                        className="p-0 h-auto text-amber-700 dark:text-amber-300"
                        onClick={() => navigate("/auth")}
                      >
                        Sign in
                      </Button>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                    <div className="space-y-2">
                      <Label htmlFor="edit-state">State *</Label>
                      <SearchableSelect
                        id="edit-state"
                        value={state}
                        onValueChange={(value) => {
                          setState(value);
                          if (fieldErrors.state) {
                            setFieldErrors((prev) => ({ ...prev, state: undefined }));
                          }
                        }}
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
                        triggerClassName={fieldErrors.state ? "border-destructive" : ""}
                      />
                      {fieldErrors.state && (
                        <p className="text-sm text-destructive">{fieldErrors.state}</p>
                      )}
                      {state === STATE_OTHER_VALUE && (
                        <Input
                          id="edit-state-other"
                          placeholder="e.g. Virginia Territory"
                          value={stateOther}
                          onChange={(e) => setStateOther(e.target.value)}
                          className="mt-2"
                          aria-label="State (other)"
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-town">Town/City *</Label>
                      <Input
                        id="edit-town"
                        type="text"
                        placeholder="e.g., Boston"
                        value={town}
                        onChange={(e) => {
                          setTown(sanitizeTown(e.target.value));
                          if (fieldErrors.town) {
                            setFieldErrors((prev) => ({ ...prev, town: undefined }));
                          }
                        }}
                        className={fieldErrors.town ? "border-destructive" : ""}
                        aria-label="Town or city (letters and spaces only)"
                      />
                      {fieldErrors.town && (
                        <p className="text-sm text-destructive">{fieldErrors.town}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-firstSeen">First Seen Year *</Label>
                        <Input
                          id="edit-firstSeen"
                          type="text"
                          inputMode="numeric"
                          placeholder={String(MIN_YEAR)}
                          value={firstSeen}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                            setFirstSeen(v);
                            const err = getYearError(v, { required: true, label: "First Seen Year" });
                            setFieldErrors((prev) => ({ ...prev, firstSeen: err || undefined }));
                          }}
                          maxLength={5}
                          className={fieldErrors.firstSeen ? "border-destructive" : ""}
                        />
                        {fieldErrors.firstSeen && (
                          <p className="text-sm text-destructive">{fieldErrors.firstSeen}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-lastSeen">Last Seen Year</Label>
                        <Input
                          id="edit-lastSeen"
                          type="text"
                          inputMode="numeric"
                          placeholder={String(CURRENT_YEAR)}
                          value={lastSeen}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                            setLastSeen(v);
                            const err = getYearError(v, { required: false, label: "Last Seen Year" });
                            setFieldErrors((prev) => ({ ...prev, lastSeen: err || undefined }));
                          }}
                          maxLength={5}
                          className={fieldErrors.lastSeen ? "border-destructive" : ""}
                        />
                        {fieldErrors.lastSeen && (
                          <p className="text-sm text-destructive">{fieldErrors.lastSeen}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-type">Postmark Type *</Label>
                      <SearchableSelect
                        id="edit-type"
                        value={type}
                        onValueChange={(value) => {
                          setType(value);
                          if (fieldErrors.type) {
                            setFieldErrors((prev) => ({ ...prev, type: undefined }));
                          }
                        }}
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
                        triggerClassName={fieldErrors.type ? "border-destructive" : ""}
                      />
                      {fieldErrors.type && (
                        <p className="text-sm text-destructive">{fieldErrors.type}</p>
                      )}
                      {type === TYPE_OTHER_VALUE && (
                        <Input
                          id="edit-type-other"
                          placeholder="e.g. Circular Date Stamp"
                          value={typeOther}
                          onChange={(e) => setTypeOther(e.target.value)}
                          className="mt-2"
                          aria-label="Postmark type (other)"
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-color">Color *</Label>
                      <Select
                        value={color}
                        onValueChange={(value) => {
                          setColor(value);
                          if (fieldErrors.color) {
                            setFieldErrors((prev) => ({ ...prev, color: undefined }));
                          }
                        }}
                      >
                        <SelectTrigger
                          id="edit-color"
                          className={fieldErrors.color ? "border-destructive" : ""}
                        >
                          <SelectValue placeholder="Select color..." />
                        </SelectTrigger>
                        <SelectContent>
                          {colorOptions.map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.name}
                            </SelectItem>
                          ))}
                          <SelectItem value={COLOR_OTHER_VALUE}>Other (type below)</SelectItem>
                        </SelectContent>
                      </Select>
                      {fieldErrors.color && (
                        <p className="text-sm text-destructive">{fieldErrors.color}</p>
                      )}
                      {color === COLOR_OTHER_VALUE && (
                        <Input
                          id="edit-color-other"
                          placeholder="e.g. Sepia"
                          value={colorOther}
                          onChange={(e) => setColorOther(e.target.value)}
                          className="mt-2"
                          aria-label="Color (other)"
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-dimensions">Dimensions</Label>
                      <Input
                        id="edit-dimensions"
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g., 32mm diameter"
                        maxLength={4}
                        value={dimensions}
                        onChange={(e) => {
                          setDimensions(sanitizeDimensions(e.target.value));
                          if (fieldErrors.dimensions) {
                            setFieldErrors((prev) => ({ ...prev, dimensions: undefined }));
                          }
                        }}
                        className={fieldErrors.dimensions ? "border-destructive" : ""}
                        aria-label="Dimensions (numbers only, max 4 digits)"
                      />
                      {fieldErrors.dimensions && (
                        <p className="text-sm text-destructive">{fieldErrors.dimensions}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-manuscript">Manuscript</Label>
                      <Select value={manuscript} onValueChange={setManuscript}>
                        <SelectTrigger id="edit-manuscript">
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
                      <Label htmlFor="edit-rarity">Rarity</Label>
                      <Select value={rarity} onValueChange={setRarity}>
                        <SelectTrigger id="edit-rarity">
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
                      <Label htmlFor="edit-description">Description</Label>
                      <Textarea
                        id="edit-description"
                        placeholder="Details about the postmark..."
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-references">Citation References (Optional)</Label>
                      <Textarea
                        id="edit-references"
                        placeholder="Catalog numbers, publications..."
                        rows={3}
                        value={references}
                        onChange={(e) => setReferences(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Image</Label>
                      {existingImageUrl && !imagePreview && (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Current image</p>
                          <div className="rounded-lg border border-border overflow-hidden bg-muted inline-block max-w-sm">
                            <img
                              src={existingImageUrl}
                              alt="Current catalog entry"
                              className="max-h-48 w-full object-contain"
                            />
                          </div>
                        </div>
                      )}
                      {existingImageUrl && !imagePreview && (
                        <p className="text-sm text-muted-foreground">
                          Upload a new image below to replace it.
                        </p>
                      )}
                      <Label className={existingImageUrl ? "mt-4 block" : ""}>
                        {existingImageUrl ? "Update image" : "Upload image (optional)"}
                      </Label>
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
                            <img
                              src={imagePreview}
                              alt="New image preview"
                              className="mx-auto max-h-40 rounded object-contain"
                            />
                            <p className="text-sm text-muted-foreground">{imageFile?.name}</p>
                            <p className="text-xs text-muted-foreground">
                              This will replace the current image on submit.
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setImageFile(null);
                                setImagePreview(null);
                                if (fileInputRef.current) fileInputRef.current.value = "";
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-sm text-muted-foreground mb-2">
                              {existingImageUrl
                                ? "Click to upload a new image (replaces current)"
                                : "Click to upload or drag and drop (optional)"}
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
                      {submitting
                        ? "Submitting..."
                        : isStateEditor
                          ? "Save Changes"
                          : "Submit Suggestion"}
                    </Button>
                  </form>

                  <p className="text-xs text-muted-foreground">
                    * Required: State, Town/City, First Seen Year, Postmark Type, Color.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card className="shadow-archival-md">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">About editing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  {isStateEditor ? (
                    <p className="leading-relaxed">
                      As a State Editor, your changes are applied directly to the catalog entry. Please review
                      carefully before saving.
                    </p>
                  ) : (
                    <p className="leading-relaxed">
                      Submitting this form sends your suggested corrections to a State Editor. The original
                      record remains unchanged until your suggestion is reviewed and approved.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default EditCatalogEntry;
