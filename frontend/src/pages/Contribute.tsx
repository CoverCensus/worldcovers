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
import { Upload, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { getColors, type ColorOption } from "@/services/colors";
import { getAdministrativeUnits, type StateOption } from "@/services/administrativeUnits";
import { getPostmarkShapes, type PostmarkShapeOption } from "@/services/postmarkShapes";
import { getPostalFacilities, type PostalFacilityOption } from "@/services/postalFacilities";
import { getLetteringStyles, type LetteringStyleOption } from "@/services/letteringStyles";
import { getFramingStyles, type FramingStyleOption } from "@/services/framingStyles";
import { getDateFormats, type DateFormatOption } from "@/services/dateFormats";
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

const MIN_YEAR = 1661;
const CURRENT_YEAR = new Date().getFullYear();

function validateYearString(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.length !== 4) return null; // wait until user types 4 digits
  const n = Number(v);
  if (Number.isNaN(n)) return "Year must be a number";
  if (n < MIN_YEAR || n > CURRENT_YEAR) {
    return `Year must be between ${MIN_YEAR} and ${CURRENT_YEAR}`;
  }
  return null;
}
/** Parse date_range "YYYY-YYYY" or "YYYY" into [firstSeen, lastSeen] */
function parseDateRange(dateRange: string): [string, string] {
  const s = (dateRange || "").trim();
  if (!s) return ["", ""];
  const idx = s.indexOf("-");
  if (idx === -1) return [s, ""];
  return [s.slice(0, idx).trim(), s.slice(idx + 1).trim()];
}

const Contribute = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const user = useAuth();
  const editContributionIdRaw =
    location.state?.editContributionId ??
    (() => {
      const edit = searchParams.get("edit");
      if (!edit) return null;
      const n = parseInt(edit, 10);
      return Number.isNaN(n) ? null : n;
    })();
  const editContributionId = editContributionIdRaw ?? null;
  const [editLoadDone, setEditLoadDone] = useState(!editContributionId);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
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
  const [submitting, setSubmitting] = useState(false);

  // Form state – all fields shown on Submission Detail
  const [state, setState] = useState("");

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
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [letteringId, setLetteringId] = useState("");
  const [framingId, setFramingId] = useState("");
  const [dateFormatId, setDateFormatId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    state?: string;
    town?: string;
    firstSeen?: string;
    type?: string;
    color?: string;
    dimensions?: string;
    lettering?: string;
    framing?: string;
    dateFormat?: string;
    editorValue?: string;
    editorComment?: string;
  }>({});
  const [firstSeenError, setFirstSeenError] = useState<string | null>(null);
  const [lastSeenError, setLastSeenError] = useState<string | null>(null);

  // Contributor: lettering, framing, date format (loaded for all)
  const [letteringOptions, setLetteringOptions] = useState<LetteringStyleOption[]>([]);
  const [framingOptions, setFramingOptions] = useState<FramingStyleOption[]>([]);
  const [dateFormatOptions, setDateFormatOptions] = useState<DateFormatOption[]>([]);
  const [catalogOptionsLoading, setCatalogOptionsLoading] = useState(false);

  // Editor-only: value and comment when approving (direct add to catalog)
  const isStateEditor = user?.role === "state_editor";
  const [editorValue, setEditorValue] = useState("");
  const [editorComment, setEditorComment] = useState("");

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

    const loadStates = async () => {
      try {
        // Contributors can submit to any state: load full list (assignedOnly = false).
        // State Editors see only their assigned states.
        const isStateEditor = user?.role === "state_editor";
        const options = await getAdministrativeUnits(isStateEditor);
        setStateOptions(options);
      } catch (err) {
        setStateOptionsError(
          err instanceof Error ? err.message : "Failed to load states"
        );
        setStateOptions([]);
      } finally {
        setLoadingStates(false);
      }
    };

    loadStates();
  }, [user]);

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

  // Load contribution for edit-and-resubmit (rejected / needs_revision)
  useEffect(() => {
    if (!editContributionId) {
      setEditLoadDone(true);
      return;
    }
    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      setEditLoadError("VITE_API_URL is not set.");
      setEditLoadDone(true);
      return;
    }
    let cancelled = false;
    fetch(`${apiBase}/api/contributions/${editContributionId}/`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Contribution not found" : res.statusText);
        return res.json();
      })
      .then((data: Record<string, unknown>) => {
        if (cancelled) return;
        const sd = (data.submitted_data ?? data.submittedData) as Record<string, unknown> | undefined;
        if (!sd || typeof sd !== "object") {
          setEditLoadDone(true);
          return;
        }
        const getStr = (v: unknown) => (v != null && v !== "" ? String(v).trim() : "");
        const stateVal = getStr(sd.state);
        const townVal = getStr(sd.town);
        const dateRange = getStr(sd.date_range ?? (sd as Record<string, unknown>).dateRange);
        const [first, last] = parseDateRange(dateRange);
        const typeVal = getStr(sd.type);
        const colorVal = getStr(sd.color);
        setState(stateVal);
        setTown(townVal);
        setFirstSeen(first);
        setLastSeen(last);
        setType(typeVal || "");
        setTypeOther("");
        setColor(colorVal || "");
        setColorOther("");
        setDimensions(getStr(sd.dimensions));
        setManuscript(getStr(sd.manuscript));
        setRarity(getStr(sd.rarity));
        setDescription(getStr(sd.description));
        setReferences(getStr(sd.references));
        const lid = sd.lettering_style_id ?? (sd as Record<string, unknown>).letteringStyleId;
        setLetteringId(lid != null ? String(lid) : "");
        const fid = sd.framing_style_id ?? (sd as Record<string, unknown>).framingStyleId;
        setFramingId(fid != null ? String(fid) : "");
        const did = sd.date_format_id ?? (sd as Record<string, unknown>).dateFormatId;
        setDateFormatId(did != null ? String(did) : "");
        const metas = (sd.image_metas ?? (sd as Record<string, unknown>).imageMetas) as Array<{ storage_filename?: string; storageFilename?: string }> | undefined;
        const metaOne = sd.image_meta as { storage_filename?: string; storageFilename?: string } | undefined;
        const baseUrl = (import.meta.env.VITE_IMAGE_URL ?? "").replace(/\/+$/, "");
        const previews: string[] = [];
        if (Array.isArray(metas) && metas.length > 0 && baseUrl) {
          metas.forEach((m) => {
            const sf = m?.storage_filename ?? (m as { storageFilename?: string })?.storageFilename;
            if (sf) previews.push(`${baseUrl}/postmarks/${sf}`);
          });
        } else if (metaOne && baseUrl) {
          const sf = metaOne.storage_filename ?? metaOne.storageFilename;
          if (sf) previews.push(`${baseUrl}/postmarks/${sf}`);
        }
        if (previews.length > 0) setImagePreviews(previews);
        setEditLoadError(null);
        setEditLoadDone(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setEditLoadError(err instanceof Error ? err.message : "Failed to load contribution");
          setEditLoadDone(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [editContributionId]); // typeOptions/colorOptions may not be loaded yet; we set type/color as strings

  const noAssignedStates =
    !!user &&
    user.role === "state_editor" &&
    !loadingStates &&
    !stateOptionsError &&
    stateOptions.length === 0;

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

  const buildName = () => {
    const stateLabel = state.trim();
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

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to submit listings.",
        variant: "destructive",
      });
      return;
    }

    const stateVal = state.trim();
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
    } else if (/[0-9]/.test(townVal)) {
      errors.town = "Town/City must contain only letters and spaces";
    }
    if (!firstVal) {
      errors.firstSeen = "First Seen Year is required"
    }
    if (!typeVal) {
      errors.type = "Postmark Type is required";
    }
    if (!colorVal) {
      errors.color = "Color is required";
    }
    const dimensionsVal = dimensions.trim();
    if (dimensionsVal && !/^\d{1,4}$/.test(dimensionsVal)) {
      errors.dimensions = "Dimensions must be numeric only, max 4 digits";
    }
    if (!letteringId) errors.lettering = "Lettering style is required";
    if (!framingId) errors.framing = "Framing style is required";
    if (!dateFormatId) errors.dateFormat = "Date format is required";
    if (isStateEditor) {
      if (editorValue.trim() === "" || Number.isNaN(parseFloat(editorValue)) || parseFloat(editorValue) < 0) {
        errors.editorValue = "Value is required when approving (adding to catalog) and must be a non-negative number";
      }
      if (!editorComment.trim()) errors.editorComment = "Comment is required when adding to catalog";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const firstRangeError = validateYearString(firstVal);
    const lastRangeError = validateYearString(lastSeen.trim());
    setFirstSeenError(firstRangeError);
    setLastSeenError(lastRangeError);
    if (firstRangeError || lastRangeError) {
      toast({
        title: "Invalid year",
        description:
          firstRangeError ||
          lastRangeError ||
          "Please correct the First Seen and Last Seen years.",
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
        description: "VITE_API_URL is not set. Cannot submit postmark.",
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

      const derivedShapeId = isStateEditor && type && type !== TYPE_OTHER_VALUE
        ? typeOptions.find((t) => t.name === type)?.id
        : undefined;
      const editorPayload = isStateEditor
        ? {
            postmark_shape_id: derivedShapeId,
            estimated_value: parseFloat(editorValue),
            review_notes: editorComment.trim() || undefined,
          }
        : {};

      if (imageFiles.length > 0) {
        const form = new FormData();
        if (editContributionId != null) form.append("edit_contribution_id", String(editContributionId));
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
        form.append("lettering_style_id", letteringId);
        form.append("framing_style_id", framingId);
        form.append("date_format_id", dateFormatId);
        if (isStateEditor) {
          if (derivedShapeId != null) form.append("postmark_shape_id", String(derivedShapeId));
          form.append("estimated_value", editorValue.trim());
          form.append("review_notes", editorComment.trim());
        }
        for (const file of imageFiles) {
          form.append("image", file, file.name);
        }
        body = form;
        // Do not set Content-Type so browser sets multipart/form-data with boundary
      } else {
        body = JSON.stringify({
          ...(editContributionId != null ? { edit_contribution_id: editContributionId } : {}),
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
          lettering_style_id: letteringId ? Number(letteringId) : undefined,
          framing_style_id: framingId ? Number(framingId) : undefined,
          date_format_id: dateFormatId ? Number(dateFormatId) : undefined,
          ...editorPayload,
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

      const resData = (await res.json().catch(() => ({}))) as { postmarkId?: number; contributionId?: number; detail?: string };
      const directAdd = resData?.postmarkId != null;
      const wasEdit = editContributionId != null;

      toast({
        title: directAdd ? "Catalog entry added" : wasEdit ? "Changes submitted" : "Submission sent",
        description: directAdd
          ? "The postmark has been added to the catalog and is now visible in Search."
          : wasEdit
            ? "Your updated submission has been sent for review again."
            : "Your catalog entry has been submitted for approval. It will appear in Search after an admin approves it.",
      });

      if (wasEdit && resData?.contributionId != null) {
        navigate(`/contribution/${resData.contributionId}`, { state: { fromDashboard: true } });
        return;
      }

      setState("");
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
      setImageFiles([]);
      setImagePreviews([]);
      setLetteringId("");
      setFramingId("");
      setDateFormatId("");
      if (directAdd) {
        setEditorValue("");
        setEditorComment("");
      }
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

  const isEditMode = editContributionId != null;

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-2">
              {isEditMode
                ? "Edit and resubmit"
                : isStateEditor
                  ? "Editor: Add to catalog"
                  : "Contributor Dashboard"}
            </h1>
            <p className="text-muted-foreground">
              {isEditMode
                ? "Update your submission using the editor feedback, then submit to send it back for review."
                : isStateEditor
                  ? "Fill the form and the catalog details below to add a postmark directly to Search. Entries you submit here appear in the catalog immediately."
                  : "Submit new postmark records or corrections. All fields match what reviewers see on the Submission Detail page."}
            </p>
          </div>

          {isEditMode && !editLoadDone && (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading your submission…</span>
            </div>
          )}

          {isEditMode && editLoadDone && editLoadError && (
            <Card className="border-destructive/50">
              <CardContent className="pt-6">
                <p className="text-destructive mb-4">{editLoadError}</p>
                <Button variant="outline" onClick={() => navigate("/dashboard")}>
                  Back to Dashboard
                </Button>
              </CardContent>
            </Card>
          )}

          {(!isEditMode || (editLoadDone && !editLoadError)) && (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Card className="shadow-archival-lg">
                <CardHeader>
                  <CardTitle className="font-heading text-xl">
                    {isEditMode ? "Edit submission" : "Submit New Entry"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {noAssignedStates && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                      You are signed in but do not have any states assigned to your account. Please contact an
                      administrator to be assigned to one or more states before submitting catalog entries.
                    </div>
                  )}
                  {!user && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
                      Sign in to add your name to the submission.{" "}
                      <Button variant="link" className="p-0 h-auto text-amber-700 dark:text-amber-300" onClick={() => navigate("/auth")}>
                        Sign in
                      </Button>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                    <div className="space-y-2">
                      <Label htmlFor="state">State <span className="text-destructive">*</span></Label>
                      <SearchableSelect
                        id="state"
                        value={state}
                        onValueChange={(value) => {
                          setState(value);
                          // Clear town if it's no longer valid for the new state
                          const hasTown = townOptions.some((opt) => opt.value === town);
                          if (!hasTown) {
                            setTown("");
                          }
                          if (fieldErrors.state) {
                            setFieldErrors((prev) => ({ ...prev, state: undefined }));
                          }
                        }}
                        placeholder="Select state..."
                        options={stateOptions}
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
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="town">Town/City <span className="text-destructive">*</span></Label>
                      <SearchableSelect
                        id="town"
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
                        <Label htmlFor="firstSeen">First Seen Year <span className="text-destructive">*</span></Label>
                        <Input
                          id="firstSeen"
                          type="text"
                          inputMode="numeric"
                          placeholder="1825"
                          value={firstSeen}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                            setFirstSeen(v);
                            if (fieldErrors.firstSeen) {
                              setFieldErrors((prev) => ({ ...prev, firstSeen: undefined }));
                            }
                            setFirstSeenError(validateYearString(v));
                          }}
                          maxLength={5}
                          aria-label="First seen year (numbers only, up to 5 digits)"
                          className={fieldErrors.firstSeen ? "border-destructive" : ""}
                        />
                        {fieldErrors.firstSeen && (
                          <p className="text-sm text-destructive">{fieldErrors.firstSeen}</p>
                        )}
                        {firstSeenError && !fieldErrors.firstSeen && (
                          <p className="text-sm text-destructive">{firstSeenError}</p>
                        )}
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
                            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                            setLastSeen(v);
                            setLastSeenError(validateYearString(v));
                          }}
                          maxLength={5}
                          aria-label="Last seen year (numbers only, up to 5 digits)"

                        />
                        {lastSeenError && (
                          <p className="text-sm text-destructive">{lastSeenError}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="type">Postmark Type <span className="text-destructive">*</span></Label>
                      <SearchableSelect
                        id="type"
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
                      <Label htmlFor="color">Color <span className="text-destructive">*</span></Label>
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
                          id="color"
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
                          <SelectItem value={COLOR_OTHER_VALUE}>
                            Other (type below)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {fieldErrors.color && (
                        <p className="text-sm text-destructive">{fieldErrors.color}</p>
                      )}
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

                    <div className="space-y-2">
                      <Label htmlFor="dimensions">Dimensions</Label>
                      <Input
                        id="dimensions"
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
                      <Label htmlFor="references">Citation References</Label>
                      <Textarea
                        id="references"
                        placeholder="List any catalog numbers, publications, or other references..."
                        rows={3}
                        value={references}
                        onChange={(e) => setReferences(e.target.value)}
                      />
                    </div>

                    {isStateEditor && (
                      <div className="border-t pt-6 mt-6 space-y-4">
                        <p className="text-sm text-muted-foreground">When approving (adding directly to the catalog), Value and Comment are required.</p>
                        <div className="space-y-2">
                          <Label htmlFor="editor-value">Value (of this postmark) <span className="text-destructive">*</span></Label>
                          <Input
                            id="editor-value"
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="e.g. 25.00 (required when approving)"
                            value={editorValue}
                            onChange={(e) => { setEditorValue(e.target.value); setFieldErrors((prev) => ({ ...prev, editorValue: undefined })); }}
                            className={fieldErrors.editorValue ? "border-destructive" : ""}
                          />
                          {fieldErrors.editorValue && <p className="text-sm text-destructive">{fieldErrors.editorValue}</p>}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="editor-comment">Comment <span className="text-destructive">*</span></Label>
                          <Textarea
                            id="editor-comment"
                            placeholder="Add a comment for this catalog entry (required when adding to catalog)..."
                            rows={2}
                            value={editorComment}
                            onChange={(e) => { setEditorComment(e.target.value); setFieldErrors((prev) => ({ ...prev, editorComment: undefined })); }}
                            className={fieldErrors.editorComment ? "border-destructive" : ""}
                          />
                          {fieldErrors.editorComment && <p className="text-sm text-destructive">{fieldErrors.editorComment}</p>}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Upload Images</Label>
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
                                  <img src={preview} alt={`Preview ${i + 1}`} className="w-full aspect-square object-contain max-h-32" />
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
                              Click to upload or drag and drop (multiple allowed)
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
                      disabled={submitting || noAssignedStates}
                    >
                      {submitting ? "Submitting..." : "Submit Postmark"}
                    </Button>
                  </form>

                  <p className="text-xs text-muted-foreground">
                    <span className="text-destructive">*</span> Required: State, Town/City, First Seen Year, Postmark Type, Color, Lettering style, Framing style, Date format. When approving (adding to catalog), editors must also add Value and Comment.
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

              {/* My Submissions list intentionally lives on the separate /dashboard page.
                  Keep this card reserved or remove entirely as needed. */}
            </div>
          </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Contribute;