import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { getPostalFacilities, type PostalFacilityOption } from "@/services/postalFacilities";
import {
  sanitizeMmInput,
  validateMmPair,
  catalogSizeToWidthHeightStrings,
} from "@/lib/dimensionsMm";
import { getLetteringStyles, type LetteringStyleOption } from "@/services/letteringStyles";
import { getFramingStyles, type FramingStyleOption } from "@/services/framingStyles";
import { getDateFormats, type DateFormatOption } from "@/services/dateFormats";
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
    } else if (trimmed.startsWith("Comment:")) {
      // Editor/internal notes in otherCharacteristics — not catalog description (matches RecordDetail).
      continue;
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
  const [postalFacilities, setPostalFacilities] = useState<PostalFacilityOption[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [stateOptionsError, setStateOptionsError] = useState<string | null>(null);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [typeOptionsError, setTypeOptionsError] = useState<string | null>(null);
  const [loadingTowns, setLoadingTowns] = useState(false);
  const [townOptionsError, setTownOptionsError] = useState<string | null>(null);
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
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [manuscript, setManuscript] = useState("");
  const [rarity, setRarity] = useState("");
  const [description, setDescription] = useState("");
  const [references, setReferences] = useState("");
  // Contributor -> editor note for suggestions/corrections
  const [contributorComment, setContributorComment] = useState("");
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [letteringId, setLetteringId] = useState("");
  const [framingId, setFramingId] = useState("");
  const [dateFormatId, setDateFormatId] = useState("");
  const [letteringOptions, setLetteringOptions] = useState<LetteringStyleOption[]>([]);
  const [framingOptions, setFramingOptions] = useState<FramingStyleOption[]>([]);
  const [dateFormatOptions, setDateFormatOptions] = useState<DateFormatOption[]>([]);
  const [catalogOptionsLoading, setCatalogOptionsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    state?: string;
    town?: string;
    firstSeen?: string;
    lastSeen?: string;
    type?: string;
    color?: string;
    widthMm?: string;
    heightMm?: string;
    lettering?: string;
    framing?: string;
    dateFormat?: string;
  }>({});

  /** Town/City: letters, spaces, hyphens, apostrophes only */
  const sanitizeTown = (v: string) => v.replace(/[^a-zA-Z\s\-']/g, "");
  useEffect(() => {
    getColors()
      .then(setColorOptions)
      .catch(() => setColorOptions([{ id: 0, name: "Black", value: "" }]));
  }, []);

  useEffect(() => {
    setLoadingTowns(true);
    setTownOptionsError(null);
    getPostalFacilities()
      .then(setPostalFacilities)
      .catch((err) => {
        setTownOptionsError(err instanceof Error ? err.message : "Failed to load towns");
        setPostalFacilities([]);
      })
      .finally(() => setLoadingTowns(false));
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
    setCatalogOptionsLoading(true);
    Promise.all([getLetteringStyles(), getFramingStyles(), getDateFormats()])
      .then(([lettering, framing, dateFmt]) => {
        setLetteringOptions(lettering);
        setFramingOptions(framing);
        setDateFormatOptions(dateFmt);
      })
      .catch(() => {
        setLetteringOptions([]);
        setFramingOptions([]);
        setDateFormatOptions([]);
      })
      .finally(() => setCatalogOptionsLoading(false));
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
        const sizes = Array.isArray(data.sizes) ? [...data.sizes] : [];
        sizes.sort((a: any, b: any) => {
          const da = a?.created_date ?? a?.createdDate ?? "";
          const db = b?.created_date ?? b?.createdDate ?? "";
          return String(db).localeCompare(String(da));
        });
        const firstSize = sizes[0];
        const firstVal = data.valuations?.[0];
        const parsed = parseOtherCharacteristics(data.otherCharacteristics);
        const rarityFromOther = parsed.rarityLabel?.trim() || "";
        const rarityMatch = RARITY_OPTIONS.find(
          (opt) =>
            opt.value === rarityFromOther ||
            rarityFromOther.toLowerCase() === opt.value.toLowerCase()
        );
        const initialRarity = rarityMatch ? rarityMatch.value : "";
        const wh = catalogSizeToWidthHeightStrings(firstSize as Record<string, unknown> | undefined);

        const baseImageUrl = import.meta.env.VITE_IMAGE_URL ?? "";
        const existingUrls = Array.isArray(data.images)
          ? data.images
              .map((img: any) => {
                const rawUrl =
                  img?.imageUrl ??
                  img?.image_url ??
                  (baseImageUrl && (img?.storageFilename ?? img?.storage_filename)
                    ? `${baseImageUrl.replace(/\/+$/, "")}/postmarks/${img.storageFilename ?? img.storage_filename}`
                    : null);
                return normalizeImageUrl(rawUrl);
              })
              .filter((u: string | null): u is string => !!u)
          : [];

        setExistingImageUrls(existingUrls);
        setState(data.state || "");
        setTown(sanitizeTown(data.town || ""));
        setFirstSeen(datesSeen?.earliestDateSeen?.slice(0, 4) || "");
        setLastSeen(datesSeen?.latestDateSeen?.slice(0, 4) || "");
        setType(data?.postmarkShape?.shapeName || "");
        setColor(data.colorsDisplay || "");
        setWidthMm(wh.width);
        setHeightMm(wh.height);
        setManuscript(data.isManuscript ? "Yes" : "No");
        setRarity(initialRarity);
        // Only prefill the textarea with an actual description, not raw otherCharacteristics
        // so users don't have to clear default "Submitted by: ..." lines.
        setDescription(parsed.description || "");
        setReferences(parsed.citationReferences || "");
        // API may return snake_case or camelCase (CamelCaseJSONRenderer); support both
        const letteringIdRaw =
          data.lettering_style_id ?? data.letteringStyleId
          ?? data.lettering_style?.lettering_style_id ?? data.lettering_style?.letteringStyleId
          ?? (data as any).letteringStyle?.lettering_style_id ?? (data as any).letteringStyle?.letteringStyleId;
        const framingIdRaw =
          data.framing_style_id ?? data.framingStyleId
          ?? data.framing_style?.framing_style_id ?? data.framing_style?.framingStyleId
          ?? (data as any).framingStyle?.framing_style_id ?? (data as any).framingStyle?.framingStyleId;
        const dateFormatIdRaw =
          data.date_format_id ?? data.dateFormatId
          ?? data.date_format?.date_format_id ?? data.date_format?.dateFormatId
          ?? (data as any).dateFormat?.date_format_id ?? (data as any).dateFormat?.dateFormatId;
        setLetteringId(letteringIdRaw != null ? String(letteringIdRaw) : "");
        setFramingId(framingIdRaw != null ? String(framingIdRaw) : "");
        setDateFormatId(dateFormatIdRaw != null ? String(dateFormatIdRaw) : "");
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

  const townOptions = useMemo(() => {
    const normalizedState = state.trim().toLowerCase();
    if (!normalizedState) return [];
    const seen = new Set<string>();
    const towns: { value: string; label: string }[] = [];
    for (const facility of postalFacilities) {
      const facilityState = (facility.state || "").trim().toLowerCase();
      const facilityTown = (facility.town || "").trim();
      if (!facilityTown || facilityState !== normalizedState) continue;
      const key = facilityTown.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      towns.push({ value: facilityTown, label: facilityTown });
    }
    towns.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    return towns;
  }, [postalFacilities, state]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const toAdd: File[] = [];
    const rejectedType: string[] = [];
    const rejectedSize: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        rejectedType.push(file.name);
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        rejectedSize.push(file.name);
        continue;
      }
      toAdd.push(file);
    }
    if (rejectedType.length) {
      toast({
        title: "Invalid file type",
        description: `Only PNG, JPG, or TIFF are allowed. Skipped: ${rejectedType.join(", ")}`,
        variant: "destructive",
      });
    }
    if (rejectedSize.length) {
      toast({
        title: "File too large",
        description: `Maximum size is ${MAX_IMAGE_SIZE_MB}MB per file. Skipped: ${rejectedSize.join(", ")}`,
        variant: "destructive",
      });
    }
    if (toAdd.length === 0) {
      e.target.value = "";
      return;
    }
    setImageFiles((prev) => [...prev, ...toAdd]);
    Promise.all(
      toAdd.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          })
      )
    ).then((newPreviews) => {
      setImagePreviews((prev) => [...prev, ...newPreviews]);
    });
    e.target.value = "";
  };

  const removeImageAt = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) fileInputRef.current.value = "";
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
    if (!letteringId) errors.lettering = "Lettering style is required";
    if (!framingId) errors.framing = "Framing style is required";
    if (!dateFormatId) errors.dateFormat = "Date format is required";
    const mmErr = validateMmPair(widthMm, heightMm);
    if (mmErr.width) errors.widthMm = mmErr.width;
    if (mmErr.height) errors.heightMm = mmErr.height;
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

    const oversized = imageFiles.filter((f) => f.size > MAX_IMAGE_SIZE_MB * 1024 * 1024);
    if (oversized.length) {
      toast({
        title: "Image too large",
        description: `Please remove or replace images over ${MAX_IMAGE_SIZE_MB}MB.`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const submitterName = user?.username || user?.email || undefined;

      let body: string | FormData;
      let headers: Record<string, string> = {};

      if (imageFiles.length > 0) {
        const form = new FormData();
        form.append("editPostmarkId", String(postmarkId!));
        form.append("state", stateVal);
        form.append("town", townVal);
        form.append("firstSeen", firstVal);
        form.append("lastSeen", lastSeen.trim());
        form.append("type", typeVal);
        form.append("color", colorVal);
        form.append("lettering_style_id", letteringId);
        form.append("framing_style_id", framingId);
        form.append("date_format_id", dateFormatId);
        if (widthMm.trim() && heightMm.trim()) {
          form.append("width_mm", widthMm.trim());
          form.append("height_mm", heightMm.trim());
        }
        if (manuscript.trim()) form.append("manuscript", manuscript.trim());
        if (rarity.trim()) form.append("rarity", rarity.trim());
        if (description.trim()) form.append("description", description.trim());
        if (references.trim()) form.append("references", references.trim());
        if (!isStateEditor && contributorComment.trim()) {
          form.append("contributorComment", contributorComment.trim());
        }
        if (submitterName) form.append("submitterName", submitterName);
        for (const file of imageFiles) {
          form.append("image", file, file.name);
        }
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
          lettering_style_id: letteringId ? Number(letteringId) : undefined,
          framing_style_id: framingId ? Number(framingId) : undefined,
          date_format_id: dateFormatId ? Number(dateFormatId) : undefined,
          width_mm: widthMm.trim() || undefined,
          height_mm: heightMm.trim() || undefined,
          manuscript: manuscript.trim() || undefined,
          rarity: rarity.trim() || undefined,
          description: description.trim() || undefined,
          references: references.trim() || undefined,
          ...(isStateEditor || !contributorComment.trim()
            ? {}
            : { contributorComment: contributorComment.trim() }),
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
        if (res.status === 413) {
          toast({
            title: "Image too large",
            description: `The image file is too large for the server to accept. Please use an image under ${MAX_IMAGE_SIZE_MB}MB. If your image is already under ${MAX_IMAGE_SIZE_MB}MB, the server may have a lower limit—try a smaller file.`,
            variant: "destructive",
          });
          return;
        }
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
                      <Label htmlFor="edit-state">State <span className="text-destructive">*</span></Label>
                      <SearchableSelect
                        id="edit-state"
                        value={state}
                        onValueChange={(value) => {
                          setState(value);
                          // Reset town if it's no longer valid for the newly selected state
                          const hasTown = townOptions.some((opt) => opt.value === town);
                          if (!hasTown) {
                            setTown("");
                          }
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
                      <Label htmlFor="edit-town">Town/City <span className="text-destructive">*</span></Label>
                      <SearchableSelect
                        id="edit-town"
                        value={town}
                        onValueChange={(value) => {
                          setTown(value);
                          if (fieldErrors.town) {
                            setFieldErrors((prev) => ({ ...prev, town: undefined }));
                          }
                        }}
                        placeholder={state ? "Select town/city..." : "Select a state first"}
                        options={townOptions}
                        loading={loadingTowns}
                        error={!!townOptionsError}
                        errorMessage={
                          townOptionsError ??
                          (state ? "Failed to load towns" : "Select a state first")
                        }
                        searchPlaceholder="Search towns..."
                        emptyMessage={state ? "No towns found for this state." : "Select a state first."}
                        aria-label="Town or city"
                        triggerClassName={fieldErrors.town ? "border-destructive" : ""}
                        disabled={!state || townOptions.length === 0}
                      />
                      {fieldErrors.town && (
                        <p className="text-sm text-destructive">{fieldErrors.town}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-firstSeen">First Seen Year <span className="text-destructive">*</span></Label>
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
                      <Label htmlFor="edit-type">Postmark Type <span className="text-destructive">*</span></Label>
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
                      <Label htmlFor="edit-color">Color <span className="text-destructive">*</span></Label>
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
                      <Label>Lettering style <span className="text-destructive">*</span></Label>
                      <Select value={letteringId} onValueChange={(v) => { setLetteringId(v); setFieldErrors((prev) => ({ ...prev, lettering: undefined })); }} disabled={catalogOptionsLoading}>
                        <SelectTrigger className={fieldErrors.lettering ? "border-destructive" : ""}>
                          <SelectValue placeholder={catalogOptionsLoading ? "Loading..." : "Select lettering style"} />
                        </SelectTrigger>
                        <SelectContent>
                          {letteringOptions.map((opt) => (
                            <SelectItem key={opt.id} value={String(opt.id)}>{opt.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.lettering && <p className="text-sm text-destructive">{fieldErrors.lettering}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Framing style <span className="text-destructive">*</span></Label>
                      <Select value={framingId} onValueChange={(v) => { setFramingId(v); setFieldErrors((prev) => ({ ...prev, framing: undefined })); }} disabled={catalogOptionsLoading}>
                        <SelectTrigger className={fieldErrors.framing ? "border-destructive" : ""}>
                          <SelectValue placeholder={catalogOptionsLoading ? "Loading..." : "Select framing style"} />
                        </SelectTrigger>
                        <SelectContent>
                          {framingOptions.map((opt) => (
                            <SelectItem key={opt.id} value={String(opt.id)}>{opt.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.framing && <p className="text-sm text-destructive">{fieldErrors.framing}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Date format <span className="text-destructive">*</span></Label>
                      <Select value={dateFormatId} onValueChange={(v) => { setDateFormatId(v); setFieldErrors((prev) => ({ ...prev, dateFormat: undefined })); }} disabled={catalogOptionsLoading}>
                        <SelectTrigger className={fieldErrors.dateFormat ? "border-destructive" : ""}>
                          <SelectValue placeholder={catalogOptionsLoading ? "Loading..." : "Select date format"} />
                        </SelectTrigger>
                        <SelectContent>
                          {dateFormatOptions.map((opt) => (
                            <SelectItem key={opt.id} value={String(opt.id)}>{opt.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.dateFormat && <p className="text-sm text-destructive">{fieldErrors.dateFormat}</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-width-mm">Width (mm)</Label>
                        <Input
                          id="edit-width-mm"
                          type="text"
                          inputMode="decimal"
                          placeholder="e.g. 34"
                          value={widthMm}
                          onChange={(e) => {
                            setWidthMm(sanitizeMmInput(e.target.value));
                            if (fieldErrors.widthMm || fieldErrors.heightMm) {
                              setFieldErrors((prev) => ({
                                ...prev,
                                widthMm: undefined,
                                heightMm: undefined,
                              }));
                            }
                          }}
                          className={fieldErrors.widthMm ? "border-destructive" : ""}
                          aria-label="Width in millimetres"
                        />
                        {fieldErrors.widthMm && (
                          <p className="text-sm text-destructive">{fieldErrors.widthMm}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-height-mm">Height (mm)</Label>
                        <Input
                          id="edit-height-mm"
                          type="text"
                          inputMode="decimal"
                          placeholder="e.g. 28"
                          value={heightMm}
                          onChange={(e) => {
                            setHeightMm(sanitizeMmInput(e.target.value));
                            if (fieldErrors.widthMm || fieldErrors.heightMm) {
                              setFieldErrors((prev) => ({
                                ...prev,
                                widthMm: undefined,
                                heightMm: undefined,
                              }));
                            }
                          }}
                          className={fieldErrors.heightMm ? "border-destructive" : ""}
                          aria-label="Height in millimetres"
                        />
                        {fieldErrors.heightMm && (
                          <p className="text-sm text-destructive">{fieldErrors.heightMm}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Optional. If you enter one, enter both. Stored as width × height (mm) on the catalog.
                    </p>

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
                      <Label htmlFor="edit-references">Citation References</Label>
                      <Textarea
                        id="edit-references"
                        placeholder="Catalog numbers, publications..."
                        rows={3}
                        value={references}
                        onChange={(e) => setReferences(e.target.value)}
                      />
                    </div>

                    {!isStateEditor && (
                      <div className="space-y-2">
                        <Label htmlFor="edit-contributor-comment">Comment for editor</Label>
                        <Textarea
                          id="edit-contributor-comment"
                          placeholder="Explain what you’re changing and why (helps the editor review your suggestion)..."
                          rows={3}
                          value={contributorComment}
                          onChange={(e) => setContributorComment(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Image</Label>
                      {existingImageUrls.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            Current image{existingImageUrls.length > 1 ? "s" : ""}
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {existingImageUrls.map((url, idx) => (
                              <div
                                key={`${url}-${idx}`}
                                className="rounded-lg border border-border overflow-hidden bg-muted"
                              >
                                <img
                                  src={url}
                                  alt={`Current catalog entry ${idx + 1}`}
                                  className="max-h-48 w-full object-contain"
                                />
                              </div>
                            ))}
                          </div>
                          {imagePreviews.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                              Add more images below (optional).
                            </p>
                          )}
                        </div>
                      )}
                      <Label className={existingImageUrls.length > 0 ? "mt-4 block" : ""}>
                        {existingImageUrls.length > 0 ? "Add more images" : "Upload images (optional, multiple allowed)"}
                      </Label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ALLOWED_IMAGE_TYPES.join(",")}
                        multiple
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
                        {imagePreviews.length > 0 ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                              {imagePreviews.map((preview, i) => (
                                <div key={i} className="relative rounded border bg-muted/30 overflow-hidden">
                                  <img src={preview} alt={`New image ${i + 1}`} className="w-full aspect-square object-contain max-h-32" />
                                  <p className="text-xs text-muted-foreground truncate px-2 py-1">{imageFiles[i]?.name}</p>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    className="absolute top-1 right-1 h-7 w-7 p-0"
                                    onClick={(e) => { e.stopPropagation(); removeImageAt(i); }}
                                  >
                                    ×
                                  </Button>
                                </div>
                              ))}
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                              Add more images
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-sm text-muted-foreground mb-2">
                              {existingImageUrls.length > 0
                                ? "Click to add more images (optional)"
                                : "Click to upload or drag and drop (optional, multiple allowed)"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              PNG, JPG, or TIFF up to {MAX_IMAGE_SIZE_MB}MB each
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
                    <span className="text-destructive">*</span> Required: State, Town/City, First Seen Year, Postmark Type, Color, Lettering style, Framing style, Date format.
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
