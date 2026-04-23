import { useState, useEffect, useMemo } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ArrowLeft, Loader2, CheckCircle, XCircle, MessageSquare, ExternalLink, Pencil } from "lucide-react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { normalizeImageUrl } from "@/services/postmarks";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { getLetterings, type LetteringOption } from "@/services/letterings";
import { getFramings, type FramingOption } from "@/services/framings";
import { getDateFormats, type DateFormatOption } from "@/constants/postmarkEnums";
import { sanitizeMmInput, submittedDataToWidthHeightStrings, validateMmPair } from "@/lib/dimensionsMm";
import { getRegions } from "@/services/regions";
import { getPostOffices, type PostOfficeOption } from "@/services/postOffices";
import { getShapes, type ShapeOption } from "@/services/shapes";
import { getColors, type ColorOption } from "@/services/colors";

const STATE_OTHER_VALUE = "__other__";
const COLOR_OTHER_VALUE = "__other__";
const MIN_YEAR = 1661;
const CURRENT_YEAR = new Date().getFullYear();

const MANUSCRIPT_OPTIONS = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
];

const IMPRESSION_OPTIONS = [
  { value: "Normal", label: "Normal" },
  { value: "Stencil", label: "Stencil" },
  { value: "Negative", label: "Negative" },
];

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

type YearPair = { earliestYear: string; latestYear: string };

function parseDatesObservedToYearPairs(raw: unknown): YearPair[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  return s
    .split(",")
    .map((tok) => {
      const t = tok.trim();
      if (!t) return null;
      const spaced = t.split(/\s+[-–—]\s+/);
      const parts = spaced.length >= 2 ? spaced : t.match(/^\s*(\d{4})\s*[-–—]\s*(\d{4})\s*$/)?.slice(1) ?? [t];
      const first = String(parts[0] ?? "").trim().slice(0, 4);
      const last = String(parts[1] ?? "").trim().slice(0, 4);
      const earliestYear = /^\d{4}$/.test(first) ? first : "";
      const latestYear = /^\d{4}$/.test(last) ? last : "";
      if (!earliestYear && !latestYear) return null;
      return { earliestYear, latestYear };
    })
    .filter((p): p is YearPair => p != null);
}

function buildDatesObservedFromYearPairs(pairs: YearPair[]): string {
  return pairs
    .map((p) => {
      const a = p.earliestYear.trim();
      const b = p.latestYear.trim();
      if (!a || !b) return "";
      return `${a}-${b}`;
    })
    .filter(Boolean)
    .join(", ");
}

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : null;
}

interface SubmittedData {
  state?: string;
  town?: string;
  date_range?: string;
  dateRange?: string;
  first_seen?: string;
  last_seen?: string;
  firstSeen?: string;
  lastSeen?: string;
  shape?: string;
  type?: string;
  color?: string;
  manuscript?: string;
  dimensions?: string;
  width_mm?: string | number;
  height_mm?: string | number;
  widthMm?: string | number;
  heightMm?: string | number;
  description?: string;
  references?: string;
  is_irreg?: boolean;
  isIrreg?: boolean;
  submitter_name?: string;
  original_postmark_id?: string;
  image_meta?: {
    storage_filename?: string;
    original_filename?: string;
    /** API may return camelCase */
    storageFilename?: string;
    originalFilename?: string;
  };
  /** Multiple images; API may return as image_metas or imageMetas */
  image_metas?: Array<{
    storage_filename?: string;
    original_filename?: string;
    storageFilename?: string;
    originalFilename?: string;
  }>;
  /** API may return camelCase */
  imageMetas?: SubmittedData["image_metas"];
  /** Categorized public image URLs returned by backend sanitization */
  postmark_images?: string[];
  ratemark_images?: string[];
  auxmark_images?: string[];
  /** API may return camelCase or PascalCase */
  postmarkImages?: string[];
  ratemarkImages?: string[];
  auxmarkImages?: string[];
  PostmarkImages?: string[];
  RatemarkImages?: string[];
  AuxmarkImages?: string[];
  /** Contributor-provided; used when editor approves (editor only fills value + comment). */
  lettering_style_id?: number;
  framing_style_id?: number;
  date_format_id?: number;
  framing_style_ids?: number[];
  date_format_ids?: number[];
  /** API may return camelCase */
  letteringStyleId?: number;
  framingStyleId?: number;
  dateFormatId?: number;
  framingStyleIds?: number[];
  dateFormatIds?: number[];
  dates_observed?: string;
  datesObserved?: string;
}

interface Contribution {
  id: number;
  /** Submitter user id (from API `contributor` FK) */
  contributor_id?: number | null;
  status: string;
  contributor_username: string;
  review_notes: string | null;
  created_at: string;
  submitted_data: SubmittedData;
  /** Postmaker-style title from API: "Town, State — Type" or "Submission #id" */
  display_name?: string;
  postmark_id?: number | null;
  /** When approved, FK to catalog postmark (API may return as postmark or postmark_id) */
  postmark?: number | null;
}

/** True if this ticket targets an existing catalog listing (suggestion/correction), not a brand-new postmark. */
function contributionIsCatalogSuggestion(c: Contribution): boolean {
  const rawSubmitted =
    c.submitted_data ?? (c as unknown as Record<string, unknown>).submittedData ?? {};
  const sd =
    typeof rawSubmitted === "object" && rawSubmitted !== null
      ? (rawSubmitted as Record<string, unknown>)
      : {};
  const postmarkIdRaw =
    c.postmark_id ?? c.postmark ?? (c as unknown as Record<string, unknown>).postmarkId ?? null;
  const pid =
    typeof postmarkIdRaw === "number"
      ? postmarkIdRaw
      : postmarkIdRaw != null && String(postmarkIdRaw).trim() !== ""
        ? parseInt(String(postmarkIdRaw), 10)
        : NaN;
  const hasLinkedPostmark = pid != null && !Number.isNaN(pid);
  const origStr = String(sd.original_postmark_id ?? sd.originalPostmarkId ?? "").trim();
  return hasLinkedPostmark || origStr !== "";
}

const ContributionDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuth();
  const { toast } = useToast();
  const { id } = useParams();
  const [contribution, setContribution] = useState<Contribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor form state (only Value and Comment; lettering/framing/date format come from contribution's submitted_data when approving)
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  // Options to display names for lettering/framing/date format in Submitted data
  const [letteringOptions, setLetteringOptions] = useState<LetteringOption[]>([]);
  const [framingOptions, setFramingOptions] = useState<FramingOption[]>([]);
  const [dateFormatOptions, setDateFormatOptions] = useState<DateFormatOption[]>([]);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [carouselCurrent, setCarouselCurrent] = useState(0);
  const [carouselCount, setCarouselCount] = useState(0);
  const [stateOptions, setStateOptions] = useState<{ value: string; label: string }[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [stateOptionsError, setStateOptionsError] = useState<string | null>(null);
  const [postOffices, setPostOffices] = useState<PostOfficeOption[]>([]);
  const [loadingTowns, setLoadingTowns] = useState(false);
  const [townOptionsError, setTownOptionsError] = useState<string | null>(null);
  const [shapeOptions, setShapeOptions] = useState<ShapeOption[]>([]);
  const [loadingShapes, setLoadingShapes] = useState(false);
  const [shapeOptionsError, setShapeOptionsError] = useState<string | null>(null);
  const [colorOptions, setColorOptions] = useState<ColorOption[]>([]);
  const [catalogOptionsLoading, setCatalogOptionsLoading] = useState(false);
  const [editorFieldErrors, setEditorFieldErrors] = useState<{
    state?: string;
    town?: string;
    firstSeen?: string;
    lastSeen?: string;
    datePairs?: string;
    shape?: string;
    color?: string;
    width_mm?: string;
    height_mm?: string;
    lettering?: string;
    framing?: string;
    dateFormat?: string;
  }>({});

  // Editor direct-edit: same field model as Edit Catalog Entry
  const [editorEdits, setEditorEdits] = useState<{
    state: string;
    stateOther: string;
    town: string;
    firstSeen: string;
    lastSeen: string;
    shape: string;
    color: string;
    colorOther: string;
    width_mm: string;
    height_mm: string;
    manuscript: string;
    description: string;
    references: string;
    impression: string;
    is_irreg: boolean;
    lettering_style_id: string;
    framing_style_id: string;
    date_format_id: string;
  }>({
    state: "",
    stateOther: "",
    town: "",
    firstSeen: "",
    lastSeen: "",
    shape: "",
    color: "",
    colorOther: "",
    width_mm: "",
    height_mm: "",
    manuscript: "",
    description: "",
    references: "",
    impression: "",
    is_irreg: false,
    lettering_style_id: "",
    framing_style_id: "",
    date_format_id: "",
  });
  const [additionalDatePairs, setAdditionalDatePairs] = useState<YearPair[]>([]);
  const fromDashboard = location.state?.fromDashboard === true;
  const isStateEditor = user?.role === "state_editor" || user?.is_superuser;
  /** True if the logged-in user is the person who submitted this contribution (edit/review UI is for other editors only). */
  const isContributor =
    !!user &&
    !!contribution &&
    (contribution.contributor_id === user.id ||
      contribution.contributor_username === user.username ||
      contribution.contributor_username === user.email);

  useEffect(() => {
    const contributionId = id ? parseInt(String(id), 10) : null;
    if (!contributionId || isNaN(contributionId)) {
      setError("Invalid contribution");
      setLoading(false);
      return;
    }

    const apiBase = import.meta.env.VITE_API_URL?.trim?.()?.replace(/\/+$/, "");
    if (!apiBase) {
      setError("VITE_API_URL is not set.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetch(`${apiBase}/contributions/${contributionId}/`, {
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
        // API returns camelCase (CamelCaseJSONRenderer); normalize so component can use snake_case
        const normalized: Contribution = {
          id: data.id as number,
          contributor_id:
            typeof data.contributor === "number"
              ? data.contributor
              : typeof (data as { contributorId?: number }).contributorId === "number"
                ? (data as { contributorId: number }).contributorId
                : null,
          status: (data.status as string) ?? "pending",
          contributor_username: (data.contributor_username ?? data.contributorUsername) as string,
          review_notes: (data.review_notes ?? data.reviewNotes) as string | null,
          created_at: (data.created_at ?? data.createdAt) as string,
          submitted_data: (data.submitted_data ?? data.submittedData) as SubmittedData,
          display_name: (data.display_name ?? data.displayName) as string | undefined,
          postmark_id: (data.postmark_id ?? data.postmarkId ?? data.postmark) as number | null | undefined,
          postmark: (data.postmark ?? data.postmark_id ?? data.postmarkId) as number | null | undefined,
        };
        setContribution(normalized);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Carousel pagination
  useEffect(() => {
    if (!carouselApi) return;
    setCarouselCount(carouselApi.scrollSnapList().length);
    setCarouselCurrent(carouselApi.selectedScrollSnap());
    const onSelect = () => setCarouselCurrent(carouselApi.selectedScrollSnap());
    carouselApi.on("select", onSelect);
    return () => {
      carouselApi.off("select", onSelect);
    };
  }, [carouselApi]);

  // Lettering / framing / date format + colors (catalog options)
  useEffect(() => {
    let cancelled = false;
    setCatalogOptionsLoading(true);
    Promise.all([
      getLetterings(),
      getFramings(),
      getDateFormats(),
      getColors().catch(() => [] as ColorOption[]),
    ])
      .then(([lettering, framing, dateFormat, colors]) => {
        if (!cancelled) {
          setLetteringOptions(lettering);
          setFramingOptions(framing);
          setDateFormatOptions(dateFormat);
          setColorOptions(colors.length ? colors : [{ id: 0, name: "Black", value: "" }]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLetteringOptions([]);
          setFramingOptions([]);
          setDateFormatOptions([]);
          setColorOptions([{ id: 0, name: "Black", value: "" }]);
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // States (assigned only — same as Edit Catalog Entry for editors)
  useEffect(() => {
    let cancelled = false;
    setLoadingStates(true);
    setStateOptionsError(null);
    getRegions(true)
      .then((opts) => {
        if (!cancelled) setStateOptions(opts);
      })
      .catch((err) => {
        if (!cancelled) {
          setStateOptionsError(err instanceof Error ? err.message : "Failed to load states");
          setStateOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingStates(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Towns / postal facilities
  useEffect(() => {
    let cancelled = false;
    setLoadingTowns(true);
    setTownOptionsError(null);
    getPostOffices()
      .then((rows) => {
        if (!cancelled) setPostOffices(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setTownOptionsError(err instanceof Error ? err.message : "Failed to load towns");
          setPostOffices([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTowns(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Postmark shapes
  useEffect(() => {
    let cancelled = false;
    setLoadingShapes(true);
    setShapeOptionsError(null);
    getShapes()
      .then((rows) => {
        if (!cancelled) setShapeOptions(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setShapeOptionsError(err instanceof Error ? err.message : "Failed to load shapes");
          setShapeOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingShapes(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync editor form from submitted_data when contribution loads (and when color options arrive for "Other" mapping)
  useEffect(() => {
    if (!contribution?.submitted_data) return;
    const sd = contribution.submitted_data as Record<string, unknown>;
    const dr = String(sd.date_range ?? sd.dateRange ?? "").trim();
    const drParts = dr ? dr.split(/\s*[-–—]\s*/).map((s) => s.trim()) : [];
    const firstSeenRaw = String(sd.first_seen ?? sd.firstSeen ?? drParts[0] ?? "").trim();
    const lastSeenRaw = String(sd.last_seen ?? sd.lastSeen ?? drParts[1] ?? "").trim();
    const firstSeen = /^\d{4}/.test(firstSeenRaw) ? firstSeenRaw.slice(0, 4) : "";
    const lastSeen = /^\d{4}/.test(lastSeenRaw) ? lastSeenRaw.slice(0, 4) : "";
    const wh = submittedDataToWidthHeightStrings(sd);
    const rawShape = String(sd.shape ?? sd.type ?? "").trim();
    const rawColor = String(sd.color ?? "").trim();
    let colorSel = rawColor;
    let colorOth = "";
    if (colorOptions.length > 0 && rawColor && !colorOptions.some((c) => c.name === rawColor)) {
      colorSel = COLOR_OTHER_VALUE;
      colorOth = rawColor;
    }
    const letteringStyleIdRaw =
      sd.lettering_style_id ??
      sd.letteringStyleId ??
      (sd.lettering_style as { lettering_style_id?: number; letteringStyleId?: number } | undefined)
        ?.lettering_style_id ??
      (sd.lettering_style as { lettering_style_id?: number; letteringStyleId?: number } | undefined)
        ?.letteringStyleId ??
      (sd.letteringStyle as { lettering_style_id?: number; letteringStyleId?: number } | undefined)
        ?.lettering_style_id ??
      (sd.letteringStyle as { lettering_style_id?: number; letteringStyleId?: number } | undefined)
        ?.letteringStyleId;
    const framingStyleIdRaw =
      sd.framing_style_id ??
      sd.framingStyleId ??
      (Array.isArray(sd.framing_style_ids) ? sd.framing_style_ids[0] : undefined) ??
      (Array.isArray(sd.framingStyleIds) ? sd.framingStyleIds[0] : undefined) ??
      (sd.framing_style as { framing_style_id?: number; framingStyleId?: number } | undefined)
        ?.framing_style_id ??
      (sd.framing_style as { framing_style_id?: number; framingStyleId?: number } | undefined)
        ?.framingStyleId ??
      (sd.framingStyle as { framing_style_id?: number; framingStyleId?: number } | undefined)
        ?.framing_style_id ??
      (sd.framingStyle as { framing_style_id?: number; framingStyleId?: number } | undefined)
        ?.framingStyleId;
    const dateFormatIdRaw =
      sd.date_format_id ??
      sd.dateFormatId ??
      (Array.isArray(sd.date_format_ids) ? sd.date_format_ids[0] : undefined) ??
      (Array.isArray(sd.dateFormatIds) ? sd.dateFormatIds[0] : undefined) ??
      (sd.date_format as { date_format_id?: number; dateFormatId?: number } | undefined)
        ?.date_format_id ??
      (sd.date_format as { date_format_id?: number; dateFormatId?: number } | undefined)
        ?.dateFormatId ??
      (sd.dateFormat as { date_format_id?: number; dateFormatId?: number } | undefined)
        ?.date_format_id ??
      (sd.dateFormat as { date_format_id?: number; dateFormatId?: number } | undefined)
        ?.dateFormatId;
    setEditorEdits({
      state: String(sd.state ?? "").trim(),
      stateOther: "",
      town: String(sd.town ?? "").trim(),
      firstSeen: firstSeen || "",
      lastSeen: lastSeen || "",
      shape: rawShape,
      color: colorSel,
      colorOther: colorOth,
      width_mm: wh.width,
      height_mm: wh.height,
      manuscript: String(sd.manuscript ?? "").trim(),
      description: String(sd.description ?? "").trim(),
      references: String(sd.references ?? "").trim(),
      impression: String(sd.impression ?? "").trim(),
      is_irreg: Boolean(sd.is_irreg ?? sd.isIrreg),
      lettering_style_id: letteringStyleIdRaw != null ? String(letteringStyleIdRaw) : "",
      framing_style_id: framingStyleIdRaw != null ? String(framingStyleIdRaw) : "",
      date_format_id: dateFormatIdRaw != null ? String(dateFormatIdRaw) : "",
    });
    setAdditionalDatePairs(parseDatesObservedToYearPairs(sd.dates_observed ?? sd.datesObserved));
    setEditorFieldErrors({});
  }, [contribution?.id, contribution?.submitted_data, shapeOptions, colorOptions]);

  const effectiveStateKey = useMemo(() => {
    return editorEdits.state === STATE_OTHER_VALUE
      ? editorEdits.stateOther.trim().toLowerCase()
      : editorEdits.state.trim().toLowerCase();
  }, [editorEdits.state, editorEdits.stateOther]);

  const townOptions = useMemo(() => {
    if (!effectiveStateKey) return [];
    const seen = new Set<string>();
    const towns: { value: string; label: string }[] = [];
    for (const facility of postOffices) {
      const facilityState = (facility.state || "").trim().toLowerCase();
      const facilityTown = (facility.town || facility.name || "").trim();
      if (!facilityTown || facilityState !== effectiveStateKey) continue;
      const key = facilityTown.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      towns.push({ value: facilityTown, label: facilityTown });
    }
    towns.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    return towns;
  }, [postOffices, effectiveStateKey]);

  const stateSelectOptions = useMemo(() => {
    const base = [...stateOptions, { value: STATE_OTHER_VALUE, label: "Other (type below)" }];
    const s = editorEdits.state.trim();
    if (s && s !== STATE_OTHER_VALUE && !base.some((o) => o.value === s)) {
      return [{ value: s, label: s }, ...base];
    }
    return base;
  }, [stateOptions, editorEdits.state]);

  const townSelectOptions = useMemo(() => {
    const t = editorEdits.town.trim();
    const base = townOptions;
    if (t && !base.some((o) => o.value === t)) {
      return [{ value: t, label: `${t} (from submission)` }, ...base];
    }
    return base;
  }, [townOptions, editorEdits.town]);

  const shapeSelectOptions = useMemo(() => {
    const base = shapeOptions.map((t) => ({ value: t.name, label: t.name }));
    const submittedShape = editorEdits.shape.trim();
    if (submittedShape && !base.some((o) => o.value === submittedShape)) {
      return [{ value: submittedShape, label: `${submittedShape} (from submission)` }, ...base];
    }
    return base;
  }, [shapeOptions, editorEdits.shape]);

  /** Validate editor fields (same rules as Edit Catalog Entry) and build PATCH body; returns null if invalid. */
  const buildValidatedEditorPatch = (): Record<string, unknown> | null => {
    const stateVal =
      editorEdits.state === STATE_OTHER_VALUE ? editorEdits.stateOther.trim() : editorEdits.state.trim();
    const townVal = editorEdits.town.trim();
    const shapeVal = editorEdits.shape.trim();
    const colorVal =
      editorEdits.color === COLOR_OTHER_VALUE ? editorEdits.colorOther.trim() : editorEdits.color.trim();
    const manuscriptVal = editorEdits.manuscript.trim();

    const errors: typeof editorFieldErrors = {};
    if (!stateVal) errors.state = "State is required";
    if (!townVal) errors.town = "Town/City is required";
    const fe = getYearError(editorEdits.firstSeen, { required: true, label: "First Seen Year" });
    if (fe) errors.firstSeen = fe;
    const le = getYearError(editorEdits.lastSeen, { required: false, label: "Last Seen Year" });
    if (le) errors.lastSeen = le;
    if (manuscriptVal === "No" && !shapeVal) {
      errors.shape = "Shape is required when Manuscript is No";
    }
    if (!colorVal) errors.color = "Color is required";
    if (!editorEdits.lettering_style_id) errors.lettering = "Lettering style is required";
    if (!editorEdits.framing_style_id) errors.framing = "Framing style is required";
    if (!editorEdits.date_format_id) errors.dateFormat = "Date format is required";
    const mmErr = validateMmPair(editorEdits.width_mm, editorEdits.height_mm);
    if (mmErr.width) errors.width_mm = mmErr.width;
    if (mmErr.height) errors.height_mm = mmErr.height;

    for (const pair of additionalDatePairs) {
      const a = pair.earliestYear.trim();
      const b = pair.latestYear.trim();
      if (!a || !b) {
        errors.datePairs = "Each additional pair requires both Earliest Year and Latest Year.";
        break;
      }
      const aErr = getYearError(a, { required: true, label: "Earliest Year" });
      const bErr = getYearError(b, { required: true, label: "Latest Year" });
      if (aErr || bErr) {
        errors.datePairs = aErr || bErr || "Invalid additional date pair.";
        break;
      }
      if (Number(a) > Number(b)) {
        errors.datePairs = "Earliest Year must be less than or equal to Latest Year in each pair.";
        break;
      }
    }

    if (Object.keys(errors).length > 0) {
      setEditorFieldErrors(errors);
      return null;
    }
    setEditorFieldErrors({});

    const first = editorEdits.firstSeen.trim();
    const last = editorEdits.lastSeen.trim();

    const datesObservedStr = buildDatesObservedFromYearPairs(additionalDatePairs);

    return {
      state: stateVal,
      town: townVal,
      firstSeen: first,
      lastSeen: last,
      dates_observed: datesObservedStr || undefined,
      shape: shapeVal,
      color: colorVal,
      width_mm: editorEdits.width_mm.trim() || undefined,
      height_mm: editorEdits.height_mm.trim() || undefined,
      manuscript: editorEdits.manuscript.trim() || undefined,
      description: editorEdits.description.trim() || undefined,
      references: editorEdits.references.trim() || undefined,
      impression: editorEdits.impression.trim() || undefined,
      is_irreg: editorEdits.is_irreg,
      lettering_style_id: editorEdits.lettering_style_id
        ? parseInt(editorEdits.lettering_style_id, 10)
        : undefined,
      framing_style_id: editorEdits.framing_style_id
        ? parseInt(editorEdits.framing_style_id, 10)
        : undefined,
      date_format_id: editorEdits.date_format_id ? parseInt(editorEdits.date_format_id, 10) : undefined,
    };
  };

  /** Persists editor submission-data changes to the server (required before approve applies them). */
  const persistEditorEdits = async (apiBase: string): Promise<boolean> => {
    if (!contribution) return false;
    const patch = buildValidatedEditorPatch();
    if (!patch) {
      toast({
        title: "Fix form errors",
        description: "Correct the highlighted fields before saving or approving.",
        variant: "destructive",
      });
      return false;
    }
    const csrfToken = getCsrfTokenFromCookie();
    const headers: HeadersInit = { "Content-Type": "application/json", Accept: "application/json" };
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;
    try {
      const res = await fetch(`${apiBase}/contributions/${contribution.id}/editor-edit/`, {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.detail ?? res.statusText);
      }
      const data = await res.json();
      const normalized: Contribution = {
        id: data.id,
        contributor_id:
          typeof data.contributor === "number"
            ? data.contributor
            : typeof (data as { contributorId?: number }).contributorId === "number"
              ? (data as { contributorId: number }).contributorId
              : contribution.contributor_id,
        status: data.status ?? "pending",
        contributor_username: (data.contributor_username ?? data.contributorUsername) ?? "",
        review_notes: data.review_notes ?? data.reviewNotes ?? null,
        created_at: data.created_at ?? data.createdAt ?? "",
        submitted_data: (data.submitted_data ?? data.submittedData) ?? contribution.submitted_data,
        display_name: data.display_name ?? data.displayName,
        postmark_id: data.postmark_id ?? data.postmarkId ?? data.postmark ?? null,
        postmark: data.postmark ?? data.postmark_id ?? data.postmarkId ?? null,
      };
      setContribution(normalized);
      return true;
    } catch (err) {
      toast({
        title: "Could not save submission edits",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const submitDecision = async (kind: "approve" | "reject" | "revision") => {
    if (!contribution) return;
    if (kind !== "approve" && !comment.trim()) {
      setCommentError("A comment is required to reject or request revision.");
      return;
    }
    setCommentError(null);

    const apiBase = import.meta.env.VITE_API_URL?.trim?.()?.replace(/\/+$/, "");
    if (!apiBase) {
      toast({ title: "Configuration error", description: "VITE_API_URL is not set.", variant: "destructive" });
      return;
    }

    const actionPath = kind === "approve" ? "approve" : kind === "reject" ? "reject" : "request-revision";
    const body: Record<string, unknown> = {};
    if (comment.trim()) {
      body.review_notes = comment.trim();
    }
    // lettering_style_id, framing_style_id, date_format_id come from contribution's submitted_data (required on form)

    setSubmitting(true);
    // New postmark submissions: submitted_data is authoritative; editors do not PATCH catalog fields.
    if (kind === "approve" && contributionIsCatalogSuggestion(contribution)) {
      const persisted = await persistEditorEdits(apiBase);
      if (!persisted) {
        setSubmitting(false);
        return;
      }
    }
    const csrfToken = getCsrfTokenFromCookie();
    const headers: HeadersInit = { "Content-Type": "application/json", Accept: "application/json" };
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;

    try {
      const res = await fetch(`${apiBase}/contributions/${contribution.id}/${actionPath}/`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const resBody = await res.json().catch(() => ({}));
        const msg = resBody?.review_notes?.[0] ?? resBody?.detail ?? res.statusText;
        throw new Error(typeof msg === "string" ? msg : "Request failed");
      }
      const actionLabel = kind === "approve" ? "Approved" : kind === "reject" ? "Rejected" : "Revision requested";
      toast({ title: actionLabel, description: "Your comment was saved for the contributor." });
      if (kind === "approve") {
        const data = await res.json();
        const postmarkId = data?.postmark_id ?? data?.postmarkId;
        if (postmarkId != null) {
          navigate(`/record/${postmarkId}`, { state: { fromDashboard: true } });
          return;
        }
      }
      navigate("/dashboard", { state: { tab: "editor" } });
    } catch (err) {
      toast({
        title: "Could not submit",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (fromDashboard) navigate("/dashboard", { state: { tab: "editor" } });
    else navigate("/dashboard");
  };

  if (loading) {
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

  if (error || !contribution) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">{error || "Contribution not found"}</p>
          <Button variant="outline" onClick={handleBack}>
            Back to Dashboard
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  // Support both snake_case (API) and camelCase in case response is transformed
  const rawSubmitted =
    contribution.submitted_data ??
    (contribution as unknown as Record<string, unknown>).submittedData ??
    {};
  const sd: Record<string, unknown> =
    typeof rawSubmitted === "object" && rawSubmitted !== null
      ? (rawSubmitted as Record<string, unknown>)
      : {};
  const state = String(sd.state ?? "").trim();
  const town = String(sd.town ?? "").trim();
  const shape = String(sd.shape ?? sd.type ?? "").trim();
  const color = String(sd.color ?? "").trim();
  const contributorComment = String(
    sd.contributor_comment ??
      sd.contributorComment ??
      sd.comment_for_editor ??
      sd.commentForEditor ??
      sd.review_notes ??
      sd.reviewNotes ??
      sd.comment ??
      ""
  ).trim();
  const manuscript = String(sd.manuscript ?? "").trim();
  const isIrregular = Boolean(sd.is_irreg ?? sd.isIrreg);
  const title = [town, state].filter(Boolean).join(", ") || `Submission #${contribution.id}`;
  const displayName = [title, shape].filter((x) => x && String(x).trim().toLowerCase() !== "unknown").join(" — ") || title;
  const baseImageUrl = (import.meta.env.VITE_IMAGE_URL ?? "").replace(/\/+$/, "");
  const imageRoot = baseImageUrl || "/media";
  const resolveStorageImageUrl = (storageFilename: string) =>
    normalizeImageUrl(`${imageRoot}/postmarks/${storageFilename.replace(/^\/+/, "")}`);
  const imageMetasRaw = (sd.image_metas ?? sd.imageMetas) as SubmittedData["image_metas"] | undefined;
  const imageMetaSingle = sd.image_meta as SubmittedData["image_meta"] | undefined;
  const imageMetaList: Array<{ imageUrl: string; originalFilename?: string }> = [];
  const asImageUrlArray = (raw: unknown): string[] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (!item || typeof item !== "object") return "";
        const obj = item as Record<string, unknown>;
        const fromUrl =
          obj.url ?? obj.image_url ?? obj.imageUrl ?? obj.public_url ?? obj.publicUrl;
        return typeof fromUrl === "string" ? fromUrl.trim() : "";
      })
      .filter((url) => url.length > 0);
  };
  const categorizedImageUrls = [
    ...asImageUrlArray(sd.postmark_images ?? sd.postmarkImages ?? sd.PostmarkImages),
    ...asImageUrlArray(sd.ratemark_images ?? sd.ratemarkImages ?? sd.RatemarkImages),
    ...asImageUrlArray(sd.auxmark_images ?? sd.auxmarkImages ?? sd.AuxmarkImages),
  ];
  const seenImageUrls = new Set<string>();
  categorizedImageUrls.forEach((url) => {
    const normalized = normalizeImageUrl(url);
    if (!normalized || seenImageUrls.has(normalized)) return;
    seenImageUrls.add(normalized);
    imageMetaList.push({ imageUrl: normalized });
  });
  if (imageMetasRaw && Array.isArray(imageMetasRaw) && imageMetasRaw.length > 0) {
    for (const meta of imageMetasRaw) {
      if (meta && typeof meta === "object") {
        const sf = meta.storage_filename ?? meta.storageFilename;
        if (sf) {
          const imageUrl = resolveStorageImageUrl(sf);
          if (!imageUrl || seenImageUrls.has(imageUrl)) continue;
          seenImageUrls.add(imageUrl);
          imageMetaList.push({
            imageUrl,
            originalFilename: meta.original_filename ?? meta.originalFilename,
          });
        }
      }
    }
  }
  if (imageMetaList.length === 0 && imageMetaSingle) {
    const sf = imageMetaSingle.storage_filename ?? imageMetaSingle.storageFilename;
    if (sf) {
      const imageUrl = resolveStorageImageUrl(sf);
      if (imageUrl) {
        imageMetaList.push({
          imageUrl,
          originalFilename: imageMetaSingle.original_filename ?? imageMetaSingle.originalFilename,
        });
      }
    }
  }
  const images = imageMetaList;

  const isPending = contribution.status === "pending";
  const normalizedStatus = String(contribution.status || "").toLowerCase();
  const statusLabel =
    normalizedStatus === "approved"
      ? "Approved"
      : normalizedStatus === "rejected"
        ? "Rejected"
        : normalizedStatus === "needs_revision"
          ? "Needs Revision"
          : "Pending";
  const statusBadgeClassName =
    normalizedStatus === "approved"
      ? "rounded-full border border-green-700 bg-green-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-green-600"
      : normalizedStatus === "rejected"
        ? "rounded-full border border-red-700 bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-red-600"
        : normalizedStatus === "needs_revision"
          ? "rounded-full border border-orange-600 bg-orange-500 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-orange-500"
          : "rounded-full border border-yellow-600 bg-yellow-500 px-3 py-1 text-xs font-semibold text-black shadow-sm hover:bg-yellow-500";
  const canReview = isStateEditor && isPending && !!user;
  const isCatalogSuggestion = contributionIsCatalogSuggestion(contribution);
  const showSubmittedData = !canReview || !isCatalogSuggestion;
  const showPeerReviewNotice = false;
  const showEditorFeedbackCard =
    contribution.status !== "pending" || !!(contribution.review_notes && contribution.review_notes.trim());
  const canContributorResubmit =
    isContributor && (contribution.status === "rejected" || contribution.status === "needs_revision");
  const postmarkIdRaw =
    contribution.postmark_id ?? contribution.postmark ?? (contribution as unknown as Record<string, unknown>).postmarkId ?? null;
  const postmarkId =
    typeof postmarkIdRaw === "number"
      ? postmarkIdRaw
      : postmarkIdRaw != null && String(postmarkIdRaw).trim() !== ""
        ? parseInt(String(postmarkIdRaw), 10)
        : null;
  const hasValue = (v: unknown) => {
    const s = v != null ? String(v).trim() : "";
    return s !== "" && s.toLowerCase() !== "unknown";
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Breadcrumb + View record when approved — same as RecordDetail */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <Button variant="ghost" onClick={handleBack} className="sm:-ml-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge className={statusBadgeClassName}>{statusLabel}</Badge>
              {postmarkId != null && (
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/record/${postmarkId}`} state={{ fromDashboard: true }}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View record
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* Main Content — max-lg: flex + order → image → meta → review → feedback. lg: 2 columns, 1 row; left cell is a
              flex stack so Review sits directly under the image (no multi-row grid splitting the form height). */}
          <div className="flex flex-col gap-8 mb-8 min-w-0 lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
            <div className="contents lg:flex lg:flex-col lg:gap-8 lg:min-w-0">
            <div className="order-1 min-w-0 lg:order-none">
              <Card className="shadow-archival-lg">
                <CardContent className="p-6">
                  <Carousel setApi={setCarouselApi} className="w-full">
                    <CarouselContent>
                      {images.length > 0 ? (
                        images.map((img, index) => (
                          <CarouselItem key={index}>
                            <div className="flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                              <img
                                src={img.imageUrl}
                                alt={img.originalFilename || `Submission image ${index + 1}`}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          </CarouselItem>
                        ))
                      ) : (
                        <CarouselItem>
                          <div className="flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                            <img
                              src={imageNotAvailable}
                              alt="No image available"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </CarouselItem>
                      )}
                    </CarouselContent>
                    {images.length > 1 && (
                      <>
                        <CarouselPrevious className="left-2" />
                        <CarouselNext className="right-2" />
                      </>
                    )}
                  </Carousel>
                  {images.length > 1 && (
                    <div className="flex justify-center gap-2 mt-4 mb-4">
                      {images.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => carouselApi?.scrollTo(index)}
                          className={`h-2 rounded-full transition-all ${
                            index === carouselCurrent
                              ? "w-6 bg-primary"
                              : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                          }`}
                          aria-label={`Go to image ${index + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>



            {canReview && (
              <div className="order-4 min-w-0 lg:order-none">
                <Card className="shadow-archival-lg border-primary/20">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">Review this submission</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Choose Approve, Reject, or Request revision.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="contribution-comment">Comment</Label>
                      <Textarea
                        id="contribution-comment"
                        placeholder="Optional for approvals, required for rejection/revision."
                        rows={4}
                        value={comment}
                        onChange={(e) => {
                          setComment(e.target.value);
                          if (commentError && e.target.value.trim()) setCommentError(null);
                        }}
                        disabled={submitting}
                        className={`resize-none ${commentError ? "border-destructive" : ""}`}
                      />
                      {commentError ? (
                        <p className="text-sm text-destructive">{commentError}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        type="button"
                        onClick={() => submitDecision("approve")}
                        disabled={submitting}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        {submitting ? "Submitting..." : "Approve"}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => submitDecision("reject")}
                        disabled={submitting}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => submitDecision("revision")}
                        disabled={submitting}
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Request revision
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {showEditorFeedbackCard ? (
              <div className="order-5 min-w-0 lg:order-none">
                <Card className="shadow-archival-md border-amber-500/20 bg-amber-500/5">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-amber-600" />
                      Editor feedback
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {contribution.status === "approved"
                        ? "Your submission was approved and added to the catalog. If the editor left a comment below, use it as guidance for future submissions."
                        : contribution.status === "rejected"
                          ? "Your submission was not accepted. See the comment below for details."
                          : contribution.status === "needs_revision"
                            ? "The editor requested changes. Please update this submission and resubmit."
                            : "The reviewer left a comment for you. Use this feedback to improve your submission or add a new postmark if requested."}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {contribution.status !== "pending" && (
                      <p className="text-sm font-medium text-foreground">
                        Outcome:{" "}
                        <Badge className={statusBadgeClassName}>{statusLabel}</Badge>
                      </p>
                    )}
                    {contribution.review_notes?.trim() ? (
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                        {contribution.review_notes.trim()}
                      </p>
                    ) : null}
                    {canContributorResubmit ? (
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => navigate(`/contribute?edit=${contribution.id}`)}
                          disabled={resubmitting}
                        >
                          Edit before resubmitting
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            ) : null}
            </div>

            <div className="order-2 min-w-0 space-y-6 lg:order-none lg:col-start-2 lg:row-start-1">
              <div>
                <h1 className="font-heading text-3xl font-bold text-foreground mb-2">{displayName}</h1>
                <div className="flex flex-wrap gap-2">
                  {hasValue(shape) ? <Badge variant="secondary">{shape}</Badge> : null}
                  {hasValue(color) ? <Badge variant="secondary">{color}</Badge> : null}
                  <Badge variant="outline">Irregular: {isIrregular ? "Yes" : "No"}</Badge>
                </div>
              </div>

              {/* Read-only submitted fields; editors see this for new postmarks (suggestions use "Edit submission data" instead). */}
              {canReview && contributorComment && (
                <Card className="shadow-archival-md border-primary/15">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Contributor comment
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Note from the contributor attached to this suggestion.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                      {contributorComment}
                    </p>
                  </CardContent>
                </Card>
              )}

              {showSubmittedData && (
                <Card className="shadow-archival-md border-primary/10">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">Submitted data</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {canReview
                        ? "Contributor submission (read-only). Use Review this submission to add a comment and decide."
                        : isContributor
                          ? "What you submitted. An editor will review this and add a catalog value and comment."
                          : "Snapshot of fields stored on this contribution."}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(sd).length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        No submitted data returned for this contribution. If you expect to see it, the record may have been created before this field was stored, or there may be an API issue.
                      </p>
                    ) : (
                      <dl className="space-y-0 text-sm">
                        {contributorComment ? (
                          <div className="flex justify-between py-2 border-b border-border gap-4">
                            <dt className="text-muted-foreground font-medium shrink-0">Comment for editor</dt>
                            <dd className="text-foreground whitespace-pre-line text-right">{contributorComment}</dd>
                          </div>
                        ) : null}
                        {Object.entries(sd)
                          .filter(([k]) => {
                            if (
                              k === "contributor_comment" ||
                              k === "contributorComment" ||
                              k === "comment_for_editor" ||
                              k === "commentForEditor" ||
                              k === "review_notes" ||
                              k === "reviewNotes" ||
                              k === "comment"
                            ) {
                              return false;
                            }
                            if (k === "image_meta") return false;
                            if (k === "image_metas" || k === "imageMetas") return false;
                            if (
                              k === "postmark_images" ||
                              k === "ratemark_images" ||
                              k === "auxmark_images" ||
                              k === "postmarkImages" ||
                              k === "ratemarkImages" ||
                              k === "auxmarkImages" ||
                              k === "PostmarkImages" ||
                              k === "RatemarkImages" ||
                              k === "AuxmarkImages"
                            ) {
                              return false;
                            }
                            const hasMm =
                              String(sd.width_mm ?? sd.widthMm ?? "").trim() !== "" ||
                              String(sd.height_mm ?? sd.heightMm ?? "").trim() !== "";
                            if (k === "dimensions" && hasMm) return false;
                            if (k === "original_postmark_id" || k === "originalPostmarkId") return false;
                            return true;
                          })
                          .map(([key, val]) => {
                            const label = key
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c) => c.toUpperCase())
                              .replace(/Id\b/, "")
                              .replace(/\s+/g, " ")
                              .trim();
                            let display: React.ReactNode = val == null ? "—" : String(val);
                            if (key === "image_meta" && val != null && typeof val === "object") {
                              const meta = val as { storage_filename?: string; original_filename?: string };
                              display = (
                                <span className="text-muted-foreground">
                                  {meta.original_filename ?? meta.storage_filename ?? "—"}
                                </span>
                              );
                            } else if (key === "lettering_style_id" || key === "letteringStyleId") {
                              const numVal = typeof val === "number" ? val : typeof val === "string" ? parseInt(val, 10) : NaN;
                              if (!Number.isNaN(numVal)) {
                                const opt = letteringOptions.find((o) => o.id === numVal);
                                display = opt ? opt.name : String(val);
                              }
                            } else if (key === "framing_style_id" || key === "framingStyleId") {
                              const idsFromArray = (
                                Array.isArray(sd.framing_style_ids)
                                  ? sd.framing_style_ids
                                  : Array.isArray(sd.framingStyleIds)
                                    ? sd.framingStyleIds
                                    : []
                              )
                                .map((x) => (typeof x === "number" ? x : typeof x === "string" ? parseInt(x, 10) : NaN))
                                .filter((x): x is number => !Number.isNaN(x));
                              if (idsFromArray.length > 0) {
                                const names = idsFromArray.map(
                                  (id) => framingOptions.find((o) => o.id === id)?.name ?? String(id)
                                );
                                display = names.join(", ");
                              } else {
                                const numVal = typeof val === "number" ? val : typeof val === "string" ? parseInt(val, 10) : NaN;
                                if (!Number.isNaN(numVal)) {
                                  const opt = framingOptions.find((o) => o.id === numVal);
                                  display = opt ? opt.name : String(val);
                                }
                              }
                            } else if (key === "framing_style_ids" || key === "framingStyleIds") {
                              const ids = Array.isArray(val)
                                ? val
                                    .map((x) => (typeof x === "number" ? x : typeof x === "string" ? parseInt(x, 10) : NaN))
                                    .filter((x): x is number => !Number.isNaN(x))
                                : [];
                              if (ids.length > 0) {
                                const names = ids.map((id) => framingOptions.find((o) => o.id === id)?.name ?? String(id));
                                display = names.join(", ");
                              } else {
                                display = "—";
                              }
                            } else if (key === "date_format_id" || key === "dateFormatId") {
                              const numVal = typeof val === "number" ? val : typeof val === "string" ? parseInt(val, 10) : NaN;
                              if (!Number.isNaN(numVal)) {
                                const opt = dateFormatOptions.find((o) => o.id === numVal);
                                display = opt ? opt.name : String(val);
                              }
                            } else if (key === "date_format_ids" || key === "dateFormatIds") {
                              const ids = Array.isArray(val)
                                ? val
                                    .map((x) => (typeof x === "number" ? x : typeof x === "string" ? parseInt(x, 10) : NaN))
                                    .filter((x): x is number => !Number.isNaN(x))
                                : [];
                              if (ids.length > 0) {
                                const names = ids.map((id) => dateFormatOptions.find((o) => o.id === id)?.name ?? String(id));
                                display = names.join(", ");
                              } else {
                                display = "—";
                              }
                            } else if (typeof val === "object" && val !== null) {
                              display = JSON.stringify(val);
                            }
                            return (
                              <div
                                key={key}
                                className="flex justify-between py-2 border-b border-border last:border-0 gap-4"
                              >
                                <dt className="text-muted-foreground font-medium shrink-0">{label}</dt>
                                <dd className="text-foreground break-all text-right">{display}</dd>
                              </div>
                            );
                          })}
                      </dl>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Editor: catalog suggestions only — new postmark submissions stay read-only above */}
              {canReview && isCatalogSuggestion && (
                <Card className="shadow-archival-md border-primary/15">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg flex items-center gap-2">
                      <Pencil className="h-5 w-5" />
                      Edit Catalog Entry
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Same fields as <strong>Edit Catalog Entry</strong>. Changes are saved automatically when you approve (after validation).
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="contrib-edit-state">
                        State <span className="text-destructive">*</span>
                      </Label>
                      <SearchableSelect
                        id="contrib-edit-state"
                        value={editorEdits.state}
                        onValueChange={(v) => {
                          setEditorEdits((p) => ({ ...p, state: v }));
                          setEditorFieldErrors((prev) => ({ ...prev, state: undefined }));
                        }}
                        placeholder="Select state..."
                        options={stateSelectOptions}
                        loading={loadingStates}
                        error={!!stateOptionsError}
                        errorMessage={stateOptionsError ?? "Failed to load states"}
                        searchPlaceholder="Search states..."
                        emptyMessage="No state found."
                        aria-label="State"
                        disabled={submitting}
                        triggerClassName={editorFieldErrors.state ? "border-destructive" : ""}
                      />
                      {editorFieldErrors.state && (
                        <p className="text-sm text-destructive">{editorFieldErrors.state}</p>
                      )}
                      {editorEdits.state === STATE_OTHER_VALUE && (
                        <Input
                          id="contrib-edit-state-other"
                          placeholder="e.g. Virginia Territory"
                          value={editorEdits.stateOther}
                          onChange={(e) => setEditorEdits((p) => ({ ...p, stateOther: e.target.value }))}
                          className="mt-2"
                          disabled={submitting}
                          aria-label="State (other)"
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contrib-edit-town">
                        Town/City <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="contrib-edit-town"
                        type="text"
                        value={editorEdits.town}
                        onChange={(e) => {
                          const sanitized = e.target.value.replace(/[^a-zA-Z\s\-']/g, "");
                          setEditorEdits((p) => ({ ...p, town: sanitized }));
                          setEditorFieldErrors((prev) => ({ ...prev, town: undefined }));
                        }}
                        placeholder="Enter town/city..."
                        list="contrib-edit-town-options"
                        aria-label="Town or city"
                        disabled={submitting}
                        className={editorFieldErrors.town ? "border-destructive" : ""}
                      />
                      <datalist id="contrib-edit-town-options">
                        {townSelectOptions.map((opt) => (
                          <option key={opt.value} value={opt.value} />
                        ))}
                      </datalist>
                      {loadingTowns && (effectiveStateKey || editorEdits.state === STATE_OTHER_VALUE) ? (
                        <p className="text-xs text-muted-foreground">Loading town suggestions...</p>
                      ) : null}
                      {townOptionsError && (effectiveStateKey || editorEdits.state === STATE_OTHER_VALUE) ? (
                        <p className="text-xs text-destructive">{townOptionsError}</p>
                      ) : null}
                      {editorFieldErrors.town && (
                        <p className="text-sm text-destructive">{editorFieldErrors.town}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contrib-edit-firstSeen">
                          First Seen Year <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="contrib-edit-firstSeen"
                          type="text"
                          inputMode="numeric"
                          placeholder=""
                          value={editorEdits.firstSeen}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                            setEditorEdits((p) => ({ ...p, firstSeen: v }));
                            const err = getYearError(v, { required: true, label: "First Seen Year" });
                            setEditorFieldErrors((prev) => ({ ...prev, firstSeen: err || undefined }));
                          }}
                          maxLength={5}
                          disabled={submitting}
                          className={editorFieldErrors.firstSeen ? "border-destructive" : ""}
                        />
                        {editorFieldErrors.firstSeen && (
                          <p className="text-sm text-destructive">{editorFieldErrors.firstSeen}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contrib-edit-lastSeen">Last Seen Year</Label>
                        <Input
                          id="contrib-edit-lastSeen"
                          type="text"
                          inputMode="numeric"
                          placeholder=""
                          value={editorEdits.lastSeen}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                            setEditorEdits((p) => ({ ...p, lastSeen: v }));
                            const err = getYearError(v, { required: false, label: "Last Seen Year" });
                            setEditorFieldErrors((prev) => ({ ...prev, lastSeen: err || undefined }));
                          }}
                          maxLength={5}
                          disabled={submitting}
                          className={editorFieldErrors.lastSeen ? "border-destructive" : ""}
                        />
                        {editorFieldErrors.lastSeen && (
                          <p className="text-sm text-destructive">{editorFieldErrors.lastSeen}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label>Additional Earliest/Latest pairs</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={submitting}
                          onClick={() =>
                            setAdditionalDatePairs((prev) => [
                              ...prev,
                              { earliestYear: "", latestYear: "" },
                            ])
                          }
                        >
                          Add date
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Add extra year ranges observed for this postmark.
                      </p>
                      <div className="space-y-2">
                        {additionalDatePairs.map((pair, idx) => (
                          <div key={idx} className="space-y-2 rounded-md border border-border p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-muted-foreground">Pair {idx + 1}</p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={submitting}
                                onClick={() =>
                                  setAdditionalDatePairs((prev) => prev.filter((_, i) => i !== idx))
                                }
                              >
                                Remove
                              </Button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Earliest Year</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="YYYY"
                                  value={pair.earliestYear}
                                  disabled={submitting}
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                                    setAdditionalDatePairs((prev) =>
                                      prev.map((p, i) => (i === idx ? { ...p, earliestYear: v } : p))
                                    );
                                    if (editorFieldErrors.datePairs) {
                                      setEditorFieldErrors((prev) => ({ ...prev, datePairs: undefined }));
                                    }
                                  }}
                                  maxLength={5}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Latest Year</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="YYYY"
                                  value={pair.latestYear}
                                  disabled={submitting}
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                                    setAdditionalDatePairs((prev) =>
                                      prev.map((p, i) => (i === idx ? { ...p, latestYear: v } : p))
                                    );
                                    if (editorFieldErrors.datePairs) {
                                      setEditorFieldErrors((prev) => ({ ...prev, datePairs: undefined }));
                                    }
                                  }}
                                  maxLength={5}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {editorFieldErrors.datePairs && (
                        <p className="text-sm text-destructive">{editorFieldErrors.datePairs}</p>
                      )}
                    </div>

                    {editorEdits.manuscript !== "Yes" && (
                    <div className="space-y-2">
                      <Label htmlFor="contrib-edit-shape">
                        Shape <span className="text-destructive">*</span>
                      </Label>
                      <SearchableSelect
                        id="contrib-edit-shape"
                        value={editorEdits.shape}
                        onValueChange={(v) => {
                          setEditorEdits((p) => ({ ...p, shape: v }));
                          setEditorFieldErrors((prev) => ({ ...prev, shape: undefined }));
                        }}
                        placeholder="Select shape..."
                        options={shapeSelectOptions}
                        loading={loadingShapes}
                        error={!!shapeOptionsError}
                        errorMessage={shapeOptionsError ?? "Failed to load postmark shapes"}
                        searchPlaceholder="Search shapes..."
                        emptyMessage="No shape found."
                        aria-label="Postmark shape"
                        disabled={submitting}
                        triggerClassName={editorFieldErrors.shape ? "border-destructive" : ""}
                      />
                      {editorFieldErrors.shape && (
                        <p className="text-sm text-destructive">{editorFieldErrors.shape}</p>
                      )}
                    </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="contrib-edit-impression">Impression</Label>
                      <Select
                        value={editorEdits.impression}
                        onValueChange={(v) => setEditorEdits((p) => ({ ...p, impression: v }))}
                        disabled={submitting}
                      >
                        <SelectTrigger id="contrib-edit-impression">
                          <SelectValue placeholder="Select impression..." />
                        </SelectTrigger>
                        <SelectContent>
                          {IMPRESSION_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contrib-edit-is-irregular">Is Irregular</Label>
                      <Select
                        value={editorEdits.is_irreg ? "yes" : "no"}
                        onValueChange={(v) => setEditorEdits((p) => ({ ...p, is_irreg: v === "yes" }))}
                        disabled={submitting}
                      >
                        <SelectTrigger id="contrib-edit-is-irregular">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contrib-edit-color">
                        Color <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={editorEdits.color}
                        onValueChange={(v) => {
                          setEditorEdits((p) => ({ ...p, color: v }));
                          setEditorFieldErrors((prev) => ({ ...prev, color: undefined }));
                        }}
                        disabled={submitting}
                      >
                        <SelectTrigger
                          id="contrib-edit-color"
                          className={editorFieldErrors.color ? "border-destructive" : ""}
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
                      {editorFieldErrors.color && (
                        <p className="text-sm text-destructive">{editorFieldErrors.color}</p>
                      )}
                      {editorEdits.color === COLOR_OTHER_VALUE && (
                        <Input
                          id="contrib-edit-color-other"
                          placeholder="e.g. Sepia"
                          value={editorEdits.colorOther}
                          onChange={(e) => setEditorEdits((p) => ({ ...p, colorOther: e.target.value }))}
                          className="mt-2"
                          disabled={submitting}
                          aria-label="Color (other)"
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>
                        Lettering style <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={editorEdits.lettering_style_id}
                        onValueChange={(v) => {
                          setEditorEdits((p) => ({ ...p, lettering_style_id: v }));
                          setEditorFieldErrors((prev) => ({ ...prev, lettering: undefined }));
                        }}
                        disabled={submitting || catalogOptionsLoading}
                      >
                        <SelectTrigger className={editorFieldErrors.lettering ? "border-destructive" : ""}>
                          <SelectValue placeholder={catalogOptionsLoading ? "Loading..." : "Select lettering style"} />
                        </SelectTrigger>
                        <SelectContent>
                          {letteringOptions.map((opt) => (
                            <SelectItem key={opt.id} value={String(opt.id)}>
                              {opt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {editorFieldErrors.lettering && (
                        <p className="text-sm text-destructive">{editorFieldErrors.lettering}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Framing style <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={editorEdits.framing_style_id}
                        onValueChange={(v) => {
                          setEditorEdits((p) => ({ ...p, framing_style_id: v }));
                          setEditorFieldErrors((prev) => ({ ...prev, framing: undefined }));
                        }}
                        disabled={submitting || catalogOptionsLoading}
                      >
                        <SelectTrigger className={editorFieldErrors.framing ? "border-destructive" : ""}>
                          <SelectValue placeholder={catalogOptionsLoading ? "Loading..." : "Select framing style"} />
                        </SelectTrigger>
                        <SelectContent>
                          {framingOptions.map((opt) => (
                            <SelectItem key={opt.id} value={String(opt.id)}>
                              {opt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {editorFieldErrors.framing && (
                        <p className="text-sm text-destructive">{editorFieldErrors.framing}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Date format <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={editorEdits.date_format_id}
                        onValueChange={(v) => {
                          setEditorEdits((p) => ({ ...p, date_format_id: v }));
                          setEditorFieldErrors((prev) => ({ ...prev, dateFormat: undefined }));
                        }}
                        disabled={submitting || catalogOptionsLoading}
                      >
                        <SelectTrigger className={editorFieldErrors.dateFormat ? "border-destructive" : ""}>
                          <SelectValue placeholder={catalogOptionsLoading ? "Loading..." : "Select date format"} />
                        </SelectTrigger>
                        <SelectContent>
                          {dateFormatOptions.map((opt) => (
                            <SelectItem key={opt.id} value={String(opt.id)}>
                              {opt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {editorFieldErrors.dateFormat && (
                        <p className="text-sm text-destructive">{editorFieldErrors.dateFormat}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contrib-edit-width-mm">Width (mm)</Label>
                        <Input
                          id="contrib-edit-width-mm"
                          type="text"
                          inputMode="decimal"
                          placeholder="e.g. 34"
                          value={editorEdits.width_mm}
                          onChange={(e) => {
                            setEditorEdits((p) => ({ ...p, width_mm: sanitizeMmInput(e.target.value) }));
                            setEditorFieldErrors((prev) => ({
                              ...prev,
                              width_mm: undefined,
                              height_mm: undefined,
                            }));
                          }}
                          disabled={submitting}
                          className={editorFieldErrors.width_mm ? "border-destructive" : ""}
                        />
                        {editorFieldErrors.width_mm && (
                          <p className="text-sm text-destructive">{editorFieldErrors.width_mm}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contrib-edit-height-mm">Height (mm)</Label>
                        <Input
                          id="contrib-edit-height-mm"
                          type="text"
                          inputMode="decimal"
                          placeholder="e.g. 28"
                          value={editorEdits.height_mm}
                          onChange={(e) => {
                            setEditorEdits((p) => ({ ...p, height_mm: sanitizeMmInput(e.target.value) }));
                            setEditorFieldErrors((prev) => ({
                              ...prev,
                              width_mm: undefined,
                              height_mm: undefined,
                            }));
                          }}
                          disabled={submitting}
                          className={editorFieldErrors.height_mm ? "border-destructive" : ""}
                        />
                        {editorFieldErrors.height_mm && (
                          <p className="text-sm text-destructive">{editorFieldErrors.height_mm}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Optional. If you enter one, enter both (mm). Same as catalog edit.
                    </p>

                    <div className="space-y-2">
                      <Label htmlFor="contrib-edit-manuscript">
                        Manuscript <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={editorEdits.manuscript}
                        onValueChange={(v) => {
                          setEditorEdits((p) => ({
                            ...p,
                            manuscript: v,
                            ...(v === "Yes" ? { shape: "" } : {}),
                          }));
                          if (v === "Yes") {
                            setEditorFieldErrors((prev) => ({ ...prev, shape: undefined }));
                          }
                        }}
                        disabled={submitting}
                      >
                        <SelectTrigger id="contrib-edit-manuscript">
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
                      <Label htmlFor="contrib-edit-description">Description</Label>
                      <Textarea
                        id="contrib-edit-description"
                        value={editorEdits.description}
                        onChange={(e) => setEditorEdits((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Details about the postmark..."
                        rows={4}
                        disabled={submitting}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contrib-edit-references">Citation references</Label>
                      <Textarea
                        id="contrib-edit-references"
                        value={editorEdits.references}
                        onChange={(e) => setEditorEdits((p) => ({ ...p, references: e.target.value }))}
                        placeholder="Catalog numbers, publications..."
                        rows={3}
                        disabled={submitting}
                      />
                    </div>

                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {isPending && !isStateEditor && (
            <p className="text-sm text-red-600">This submission is pending review by an editor.</p>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ContributionDetail;
