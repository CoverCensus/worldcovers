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
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { getPostmarkById, normalizeImageUrl } from "@/services/postmarks";
import { getColors, type ColorOption } from "@/services/colors";
import { getRegions, type StateOption } from "@/services/regions";
import { getShapes, type ShapeOption } from "@/services/shapes";
import { getPostOffices, type PostOfficeOption } from "@/services/postOffices";
import {
  sanitizeMmInput,
  validateMmPair,
  catalogSizeToWidthHeightStrings,
} from "@/lib/dimensionsMm";
import { getLetterings, type LetteringOption } from "@/services/letterings";
import { getFramings, type FramingOption } from "@/services/framings";
import { getDateFormats, type DateFormatOption } from "@/constants/postmarkEnums";
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

const MANUSCRIPT_OPTIONS = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
];
const IMPRESSION_OPTIONS = [
  { value: "Normal", label: "Normal" },
  { value: "Stencil", label: "Stencil" },
  { value: "Negative", label: "Negative" },
];
const DATE_TYPE_OPTIONS = [
  { value: "BISHOP MARK", label: "Bishop Mark" },
  { value: "FRANKLIN MARK", label: "Franklin Mark" },
  { value: "QUAKER DATE", label: "Quaker Date" },
];

const MIN_YEAR = 1661;
const CURRENT_YEAR = new Date().getFullYear();

const MONTH_OPTIONS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;
const MONTH_TO_NUM: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};
const NUM_TO_MONTH: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
  "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

type DatePair = {
  earliestDay: string;
  earliestMonth: string;
  earliestYear: string;
  latestDay: string;
  latestMonth: string;
  latestYear: string;
};

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

function datesSeenRowToPair(row: Record<string, unknown> | null | undefined): DatePair | null {
  if (!row || typeof row !== "object") return null;
  const e = String((row as any).earliest_date_seen ?? (row as any).earliestDateSeen ?? "");
  const l = String((row as any).latest_date_seen ?? (row as any).latestDateSeen ?? "");
  const split = (s: string) => {
    const trimmed = s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split("-");
      return { day: d, month: NUM_TO_MONTH[m] ?? "", year: y };
    }
    const y = trimmed.match(/^(\d{4})/);
    return { day: "", month: "", year: y ? y[1] : "" };
  };
  const ep = split(e);
  const lp = split(l);
  if (!ep.year && !lp.year) return null;
  return {
    earliestDay: ep.day,
    earliestMonth: ep.month,
    earliestYear: ep.year,
    latestDay: lp.day,
    latestMonth: lp.month,
    latestYear: lp.year,
  };
}

function buildDateTokenFromPair(pair: DatePair): string {
  const mkIsoOrYear = (d: string, m: string, y: string) => {
    const yy = y.trim();
    if (!yy) return "";
    const dd = d.trim().padStart(2, "0");
    const mm = MONTH_TO_NUM[m.trim()];
    if (mm && dd && dd.length === 2) return `${yy}-${mm}-${dd}`;
    return yy;
  };
  const first = mkIsoOrYear(pair.earliestDay, pair.earliestMonth, pair.earliestYear);
  const last = mkIsoOrYear(pair.latestDay, pair.latestMonth, pair.latestYear);
  if (!first || !last) return "";
  const isIso = first.length === 10 || last.length === 10;
  return isIso ? `${first} - ${last}` : `${first}-${last}`;
}

function parseOtherCharacteristics(raw: string | null | undefined) {
  const result = {
    submitterName: "",
    description: "",
    citationReferences: "",
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

function isCircularType(raw: string) {
  const s = (raw || "").toLowerCase();
  return (
    s.includes("circle") ||
    s.includes("circular") ||
    s.includes("cds") ||
    s.includes("double circle") ||
    s.includes("single circle")
  );
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
  const [typeOptions, setTypeOptions] = useState<ShapeOption[]>([]);
  const [postOffices, setPostOffices] = useState<PostOfficeOption[]>([]);
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
  // Earliest/Latest Use (UI): day/month/year or Unknown.
  // Backend accepts year-only or full ISO date (YYYY-MM-DD) via firstSeen/lastSeen.
  const [earliestDay, setEarliestDay] = useState("");
  const [earliestMonth, setEarliestMonth] = useState("");
  const [earliestYear, setEarliestYear] = useState("");
  const [earliestUnknown, setEarliestUnknown] = useState(false);
  const [latestDay, setLatestDay] = useState("");
  const [latestMonth, setLatestMonth] = useState("");
  const [latestYear, setLatestYear] = useState("");
  const [latestUnknown, setLatestUnknown] = useState(false);
  const [additionalDatePairs, setAdditionalDatePairs] = useState<DatePair[]>([]);
  const [type, setType] = useState("");
  const [typeOther, setTypeOther] = useState("");
  const [color, setColor] = useState("");
  const [colorOther, setColorOther] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [diameterMm, setDiameterMm] = useState("");
  const [manuscript, setManuscript] = useState("");
  const [isIrregular, setIsIrregular] = useState(false);
  const [impression, setImpression] = useState("");
  const [dateType, setDateType] = useState("");
  const [inscriptionText, setInscriptionText] = useState("");
  const [description, setDescription] = useState("");
  const [references, setReferences] = useState("");
  // Contributor -> editor note for suggestions/corrections
  const [contributorComment, setContributorComment] = useState("");
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [letteringId, setLetteringId] = useState("");
  const [framingIds, setFramingIds] = useState<string[]>([]);
  const [dateFormatIds, setDateFormatIds] = useState<string[]>([]);
  const [letteringOptions, setLetteringOptions] = useState<LetteringOption[]>([]);
  const [framingOptions, setFramingOptions] = useState<FramingOption[]>([]);
  const [dateFormatOptions, setDateFormatOptions] = useState<DateFormatOption[]>([]);
  const [catalogOptionsLoading, setCatalogOptionsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    state?: string;
    town?: string;
    earliestDate?: string;
    latestDate?: string;
    datePairs?: string;
    type?: string;
    color?: string;
    widthMm?: string;
    heightMm?: string;
    diameterMm?: string;
    manuscript?: string;
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
    getPostOffices()
      .then(setPostOffices)
      .catch((err) => {
        setTownOptionsError(err instanceof Error ? err.message : "Failed to load towns");
        setPostOffices([]);
      })
      .finally(() => setLoadingTowns(false));
  }, []);

  useEffect(() => {
    setLoadingStates(true);
    setStateOptionsError(null);
    getRegions(true)
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
    getShapes()
      .then(setTypeOptions)
      .catch((err) => {
        setTypeOptionsError(err instanceof Error ? err.message : "Failed to load postmark types");
        setTypeOptions([]);
      })
      .finally(() => setLoadingTypes(false));
  }, []);

  useEffect(() => {
    setCatalogOptionsLoading(true);
    Promise.all([getLetterings(), getFramings(), getDateFormats()])
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
        const datesSeenRaw = data.datesSeen ?? data.dates_seen ?? [];
        const datesSeenArr: Record<string, unknown>[] = Array.isArray(datesSeenRaw) ? datesSeenRaw : [];
        const sortedDatesSeen = [...datesSeenArr].sort((a, b) => {
          const ea = String((a as any)?.earliest_date_seen ?? (a as any)?.earliestDateSeen ?? "");
          const eb = String((b as any)?.earliest_date_seen ?? (b as any)?.earliestDateSeen ?? "");
          return ea.localeCompare(eb);
        });
        const datesSeen = sortedDatesSeen[0];
        const extraDatesSeen = sortedDatesSeen.slice(1);
        const sizes = Array.isArray(data.sizes) ? [...data.sizes] : [];
        sizes.sort((a: any, b: any) => {
          const da = a?.created_date ?? a?.createdDate ?? "";
          const db = b?.created_date ?? b?.createdDate ?? "";
          return String(db).localeCompare(String(da));
        });
        const firstSize = sizes[0];
        const firstVal = data.valuations?.[0];
        const parsed = parseOtherCharacteristics(data.otherCharacteristics);
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
        const monthNumToAbbrev: Record<string, string> = {
          "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
          "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
        };
        const splitIso = (raw: unknown): { day: string; month: string; year: string } => {
          const s = String(raw ?? "").slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { day: "", month: "", year: s.slice(0, 4) || "" };
          const [y, m, d] = s.split("-");
          return { year: y, month: monthNumToAbbrev[m] || "", day: d };
        };

        const eParts = splitIso(datesSeen?.earliestDateSeen);
        const lParts = splitIso(datesSeen?.latestDateSeen);

        setEarliestDay(eParts.day);
        setEarliestMonth(eParts.month);
        setEarliestYear(eParts.year);
        setEarliestUnknown(false);
        setLatestDay(lParts.day);
        setLatestMonth(lParts.month);
        setLatestYear(lParts.year);
        setLatestUnknown(false);
        const extraPairs = extraDatesSeen
          .map((row) => datesSeenRowToPair(row))
          .filter((p): p is DatePair => p != null);
        setAdditionalDatePairs(extraPairs);
        setType(data?.postmarkShape?.shapeName || "");
        setColor(data.color?.color_name || data.color?.colorName || data.color?.name || "");
        setWidthMm(wh.width);
        setHeightMm(wh.height);
        setManuscript(data.isManuscript ? "Yes" : "No");
        setIsIrregular(Boolean(data.is_irreg ?? data.isIrreg));
        setImpression(String(data.impression ?? ""));
        setInscriptionText(String(data.inscription_txt ?? data.inscriptionTxt ?? ""));
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
        const dateTypeRaw = data.date_type ?? data.dateType;
        setLetteringId(letteringIdRaw != null ? String(letteringIdRaw) : "");
        const framingIdsRaw = data.framing_style_ids ?? data.framingStyleIds;
        if (Array.isArray(framingIdsRaw) && framingIdsRaw.length > 0) {
          setFramingIds(framingIdsRaw.map((x: unknown) => String(x)).filter(Boolean));
        } else {
          setFramingIds(framingIdRaw != null ? [String(framingIdRaw)] : []);
        }
        const dateFormatIdsRaw = data.date_format_ids ?? data.dateFormatIds;
        if (Array.isArray(dateFormatIdsRaw) && dateFormatIdsRaw.length > 0) {
          setDateFormatIds(dateFormatIdsRaw.map((x: unknown) => String(x)).filter(Boolean));
        } else {
          setDateFormatIds(dateFormatIdRaw != null ? [String(dateFormatIdRaw)] : []);
        }
        setDateType(dateTypeRaw != null ? String(dateTypeRaw) : "");
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
    for (const facility of postOffices) {
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
  }, [postOffices, state]);

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
    const y1 = earliestUnknown ? "" : earliestYear.trim();
    const y2 = latestUnknown ? "" : latestYear.trim();
    if (!y1) return "";

    const mkIso = (d: string, m: string, y: string) => {
      const yy = y.trim();
      if (!yy) return "";
      const dd = d.trim().padStart(2, "0");
      const mmTxt = m.trim();
      const map: Record<string, string> = {
        Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
        Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
      };
      const mm = map[mmTxt];
      if (!mm || !dd || dd.length !== 2) return "";
      return `${yy}-${mm}-${dd}`;
    };

    const firstIso = earliestUnknown ? "" : mkIso(earliestDay, earliestMonth, earliestYear);
    const lastIso = latestUnknown ? "" : mkIso(latestDay, latestMonth, latestYear);

    const first = firstIso || y1;
    const last = lastIso || y2;
    if (!last) return first;
    const isIso = first.length === 10 || last.length === 10;
    return isIso ? `${first} - ${last}` : `${first}-${last}`;
  };

  const formatDateLabel = (d: string, m: string, y: string, unknown: boolean) => {
    if (unknown) return "Unknown";
    const dd = d.trim();
    const mm = m.trim();
    const yy = y.trim();
    const parts = [dd, mm, yy].filter(Boolean);
    return parts.length ? parts.join(" ") : "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const stateVal = state === STATE_OTHER_VALUE ? stateOther.trim() : state.trim();
    const townVal = town.trim();
    const typeVal = type === TYPE_OTHER_VALUE ? typeOther.trim() : type.trim();
    const colorVal = color === COLOR_OTHER_VALUE ? colorOther.trim() : color.trim();
    const isCircular = isCircularType(typeVal);

    const errors: typeof fieldErrors = {};
    if (!stateVal) {
      errors.state = "State is required";
    }
    if (!townVal) {
      errors.town = "Town/City is required";
    }
    if (!manuscript.trim()) {
      errors.manuscript = "Manuscript is required";
    }

    // Earliest Use date: Day / Month / Year OR Unknown (one of the four required)
    if (!earliestUnknown && !earliestDay.trim() && !earliestMonth.trim() && !earliestYear.trim()) {
      errors.earliestDate = "Enter Day, Month, Year, or choose Unknown";
    }
    // Validate years if provided (years are the only piece we send to backend for date_range)
    const earliestYearErr = getYearError(earliestYear, { required: false, label: "Earliest Use Year" });
    if (earliestYearErr) {
      errors.earliestDate = earliestYearErr;
    }
    const latestYearErr = getYearError(latestYear, { required: false, label: "Latest Use Year" });
    if (latestYearErr) {
      errors.latestDate = latestYearErr;
    }

    for (const pair of additionalDatePairs) {
      const token = buildDateTokenFromPair(pair);
      if (!token) {
        errors.datePairs = "Each additional pair requires both Earliest Use and Latest Use.";
        break;
      }
      const firstErr = getYearError(pair.earliestYear, { required: true, label: "Earliest Year" });
      const lastErr = getYearError(pair.latestYear, { required: true, label: "Latest Year" });
      if (firstErr || lastErr) {
        errors.datePairs = firstErr || lastErr || "Invalid additional date pair.";
        break;
      }
      if (Number(pair.earliestYear) > Number(pair.latestYear)) {
        errors.datePairs = "Earliest Year must be less than or equal to Latest Year in each pair.";
        break;
      }
    }

    // Dimensions: if circular, use diameter; otherwise width/height pair.
    if (isCircular) {
      const d = diameterMm.trim();
      if (d) {
        const wErr = validateMmPair(d, d);
        if (wErr.width) errors.diameterMm = wErr.width;
        if (wErr.height) errors.diameterMm = wErr.height;
      } else {
        const mmErr = validateMmPair(widthMm, heightMm);
        if (mmErr.width) errors.widthMm = mmErr.width;
        if (mmErr.height) errors.heightMm = mmErr.height;
      }
    } else {
    const mmErr = validateMmPair(widthMm, heightMm);
    if (mmErr.width) errors.widthMm = mmErr.width;
    if (mmErr.height) errors.heightMm = mmErr.height;
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const dateRange = buildDateRange();
    // dateRange may be empty when Unknown
    const datesObservedToSend = additionalDatePairs
      .map(buildDateTokenFromPair)
      .filter(Boolean)
      .join(", ");

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

      const mkIso = (d: string, m: string, y: string) => {
        const yy = y.trim();
        if (!yy) return "";
        const dd = d.trim().padStart(2, "0");
        const map: Record<string, string> = {
          Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
          Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
        };
        const mm = map[m.trim()];
        if (!mm || !dd || dd.length !== 2) return "";
        return `${yy}-${mm}-${dd}`;
      };

      const firstSeenToSend = earliestUnknown
        ? ""
        : mkIso(earliestDay, earliestMonth, earliestYear) || earliestYear.trim();
      const lastSeenToSend = latestUnknown
        ? ""
        : mkIso(latestDay, latestMonth, latestYear) || latestYear.trim();
      const earliestLabel = formatDateLabel(earliestDay, earliestMonth, earliestYear, earliestUnknown);
      const latestLabel = formatDateLabel(latestDay, latestMonth, latestYear, latestUnknown);
      const derivedDimensions = (() => {
        const d = diameterMm.trim();
        const w = widthMm.trim();
        const h = heightMm.trim();
        if (isCircular && d) return `${d} mm diameter`;
        if (w && h) return `${w}×${h} mm`;
        return "";
      })();
      const descriptionToSend = description.trim();
      const inscriptionToSend = inscriptionText.trim();

      if (imageFiles.length > 0) {
        const form = new FormData();
        form.append("editPostmarkId", String(postmarkId!));
        form.append("state", stateVal);
        form.append("town", townVal);
        form.append("firstSeen", firstSeenToSend);
        form.append("lastSeen", lastSeenToSend);
        if (datesObservedToSend) form.append("dates_observed", datesObservedToSend);
        form.append("type", typeVal);
        form.append("color", colorVal);
        form.append("lettering_style_id", letteringId);
        if (framingIds.length > 0) {
          form.append("framing_style_id", framingIds[0]);
          framingIds.forEach((id) => form.append("framing_style_ids[]", id));
        }
        if (dateFormatIds.length > 0) {
          form.append("date_format_id", dateFormatIds[0]);
          dateFormatIds.forEach((id) => form.append("date_format_ids[]", id));
        }
        if (dateType.trim()) form.append("date_type", dateType.trim());
        if (derivedDimensions) form.append("dimensions", derivedDimensions);
        if (manuscript.trim()) form.append("manuscript", manuscript.trim());
        form.append("is_irreg", String(isIrregular));
        if (impression.trim()) form.append("impression", impression.trim());
        if (inscriptionToSend) form.append("inscription_txt", inscriptionToSend);
        if (descriptionToSend) form.append("description", descriptionToSend);
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
          firstSeen: firstSeenToSend,
          lastSeen: lastSeenToSend,
          dates_observed: datesObservedToSend || undefined,
          type: typeVal,
          color: colorVal,
          lettering_style_id: letteringId ? Number(letteringId) : undefined,
          framing_style_id: framingIds[0] ? Number(framingIds[0]) : undefined,
          framing_style_ids: framingIds.length > 0 ? framingIds.map((id) => Number(id)) : undefined,
          date_format_id: dateFormatIds[0] ? Number(dateFormatIds[0]) : undefined,
          date_format_ids: dateFormatIds.length > 0 ? dateFormatIds.map((id) => Number(id)) : undefined,
          date_type: dateType.trim() || undefined,
          dimensions: derivedDimensions || undefined,
          manuscript: manuscript.trim() || undefined,
          is_irreg: isIrregular,
          impression: impression.trim() || undefined,
          inscription_txt: inscriptionToSend || undefined,
          description: descriptionToSend || undefined,
          references: references.trim() || undefined,
          ...(isStateEditor || !contributorComment.trim()
            ? {}
            : { contributorComment: contributorComment.trim() }),
          submitterName: submitterName || undefined,
        });
        headers["Content-Type"] = "application/json";
      }

      const res = await fetch(`${apiBase}/contributions/`, {
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
                      <Label htmlFor="edit-state">State</Label>
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
                      <Label htmlFor="edit-town">Town/City</Label>
                      <Input
                        id="edit-town"
                        type="text"
                        value={town}
                        onChange={(e) => {
                          setTown(sanitizeTown(e.target.value));
                          if (fieldErrors.town) {
                            setFieldErrors((prev) => ({ ...prev, town: undefined }));
                          }
                        }}
                        placeholder="Enter town/city..."
                        list="edit-town-options"
                        aria-label="Town or city"
                        className={fieldErrors.town ? "border-destructive" : ""}
                      />
                      <datalist id="edit-town-options">
                        {townOptions.map((opt) => (
                          <option key={opt.value} value={opt.value} />
                        ))}
                      </datalist>
                      {loadingTowns && state ? (
                        <p className="text-xs text-muted-foreground">Loading town suggestions...</p>
                      ) : null}
                      {townOptionsError && state ? (
                        <p className="text-xs text-destructive">{townOptionsError}</p>
                      ) : null}
                      {fieldErrors.town && (
                        <p className="text-sm text-destructive">{fieldErrors.town}</p>
                      )}
                    </div>

                      <div className="space-y-2">
                      <Label htmlFor="edit-manuscript">Manuscript</Label>
                      <Select
                        value={manuscript}
                        onValueChange={(v) => {
                          setManuscript(v);
                          if (fieldErrors.manuscript) setFieldErrors((p) => ({ ...p, manuscript: undefined }));
                        }}
                      >
                        <SelectTrigger
                          id="edit-manuscript"
                          className={fieldErrors.manuscript ? "border-destructive" : ""}
                        >
                          <SelectValue placeholder="Select Yes/No..." />
                        </SelectTrigger>
                        <SelectContent>
                          {MANUSCRIPT_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.manuscript && <p className="text-sm text-destructive">{fieldErrors.manuscript}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-impression">Impression</Label>
                      <Select value={impression} onValueChange={setImpression}>
                        <SelectTrigger id="edit-impression">
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
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Earliest Use</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                          <div className="space-y-1">
                            <Label htmlFor="edit-earliest-day" className="text-xs text-muted-foreground">
                              Day
                            </Label>
                        <Input
                              id="edit-earliest-day"
                          type="text"
                          inputMode="numeric"
                              placeholder="DD"
                              value={earliestDay}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                                setEarliestDay(v);
                                if (fieldErrors.earliestDate) setFieldErrors((p) => ({ ...p, earliestDate: undefined }));
                              }}
                              disabled={earliestUnknown}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Month</Label>
                            <Select
                              value={earliestMonth}
                              onValueChange={(v) => {
                                setEarliestMonth(v);
                                if (fieldErrors.earliestDate) setFieldErrors((p) => ({ ...p, earliestDate: undefined }));
                              }}
                              disabled={earliestUnknown}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Month" />
                              </SelectTrigger>
                              <SelectContent>
                                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="edit-earliest-year" className="text-xs text-muted-foreground">
                              Year
                            </Label>
                            <Input
                              id="edit-earliest-year"
                              type="text"
                              inputMode="numeric"
                              placeholder="YYYY"
                              value={earliestYear}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                                setEarliestYear(v);
                                if (fieldErrors.earliestDate) setFieldErrors((p) => ({ ...p, earliestDate: undefined }));
                          }}
                              disabled={earliestUnknown}
                        />
                      </div>
                          <label className="flex items-center gap-2 text-sm text-muted-foreground select-none">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={earliestUnknown}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setEarliestUnknown(checked);
                                if (checked) {
                                  setEarliestDay("");
                                  setEarliestMonth("");
                                  setEarliestYear("");
                                }
                                if (fieldErrors.earliestDate) setFieldErrors((p) => ({ ...p, earliestDate: undefined }));
                              }}
                            />
                            Unknown
                          </label>
                        </div>
                        {fieldErrors.earliestDate && <p className="text-sm text-destructive">{fieldErrors.earliestDate}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label>Latest Use</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                          <div className="space-y-1">
                            <Label htmlFor="edit-latest-day" className="text-xs text-muted-foreground">
                              Day
                            </Label>
                        <Input
                              id="edit-latest-day"
                          type="text"
                          inputMode="numeric"
                              placeholder="DD"
                              value={latestDay}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                                setLatestDay(v);
                                if (fieldErrors.latestDate) setFieldErrors((p) => ({ ...p, latestDate: undefined }));
                              }}
                              disabled={latestUnknown}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Month</Label>
                            <Select
                              value={latestMonth}
                              onValueChange={(v) => {
                                setLatestMonth(v);
                                if (fieldErrors.latestDate) setFieldErrors((p) => ({ ...p, latestDate: undefined }));
                              }}
                              disabled={latestUnknown}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Month" />
                              </SelectTrigger>
                              <SelectContent>
                                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="edit-latest-year" className="text-xs text-muted-foreground">
                              Year
                            </Label>
                            <Input
                              id="edit-latest-year"
                              type="text"
                              inputMode="numeric"
                              placeholder="YYYY"
                              value={latestYear}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                                setLatestYear(v);
                                if (fieldErrors.latestDate) setFieldErrors((p) => ({ ...p, latestDate: undefined }));
                              }}
                              disabled={latestUnknown}
                            />
                          </div>
                          <label className="flex items-center gap-2 text-sm text-muted-foreground select-none">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={latestUnknown}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setLatestUnknown(checked);
                                if (checked) {
                                  setLatestDay("");
                                  setLatestMonth("");
                                  setLatestYear("");
                                }
                                if (fieldErrors.latestDate) setFieldErrors((p) => ({ ...p, latestDate: undefined }));
                              }}
                            />
                            Unknown
                          </label>
                        </div>
                        {fieldErrors.latestDate && <p className="text-sm text-destructive">{fieldErrors.latestDate}</p>}
                        <p className="text-xs text-muted-foreground">
                          Optional. Leave blank if unknown, or enter Day/Month/Year, or choose Unknown.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label>Additional Earliest/Latest pairs</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setAdditionalDatePairs((prev) => [
                                ...prev,
                                {
                                  earliestDay: "",
                                  earliestMonth: "",
                                  earliestYear: "",
                                  latestDay: "",
                                  latestMonth: "",
                                  latestYear: "",
                                },
                              ])
                            }
                          >
                            Add date
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Add extra date ranges observed for this postmark.
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
                                  onClick={() =>
                                    setAdditionalDatePairs((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                >
                                  Remove
                                </Button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Earliest Day</Label>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="DD"
                                    value={pair.earliestDay}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                                      setAdditionalDatePairs((prev) =>
                                        prev.map((p, i) => (i === idx ? { ...p, earliestDay: v } : p))
                                      );
                                      if (fieldErrors.datePairs) {
                                        setFieldErrors((prev) => ({ ...prev, datePairs: undefined }));
                                      }
                                    }}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Earliest Month</Label>
                                  <Select
                                    value={pair.earliestMonth}
                                    onValueChange={(v) => {
                                      setAdditionalDatePairs((prev) =>
                                        prev.map((p, i) => (i === idx ? { ...p, earliestMonth: v } : p))
                                      );
                                      if (fieldErrors.datePairs) {
                                        setFieldErrors((prev) => ({ ...prev, datePairs: undefined }));
                                      }
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Month" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {MONTH_OPTIONS.map((m) => (
                                        <SelectItem key={m} value={m}>
                                          {m}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Earliest Year</Label>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="YYYY"
                                    value={pair.earliestYear}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                                      setAdditionalDatePairs((prev) =>
                                        prev.map((p, i) => (i === idx ? { ...p, earliestYear: v } : p))
                                      );
                                      if (fieldErrors.datePairs) {
                                        setFieldErrors((prev) => ({ ...prev, datePairs: undefined }));
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Latest Day</Label>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="DD"
                                    value={pair.latestDay}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                                      setAdditionalDatePairs((prev) =>
                                        prev.map((p, i) => (i === idx ? { ...p, latestDay: v } : p))
                                      );
                                      if (fieldErrors.datePairs) {
                                        setFieldErrors((prev) => ({ ...prev, datePairs: undefined }));
                                      }
                                    }}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Latest Month</Label>
                                  <Select
                                    value={pair.latestMonth}
                                    onValueChange={(v) => {
                                      setAdditionalDatePairs((prev) =>
                                        prev.map((p, i) => (i === idx ? { ...p, latestMonth: v } : p))
                                      );
                                      if (fieldErrors.datePairs) {
                                        setFieldErrors((prev) => ({ ...prev, datePairs: undefined }));
                                      }
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Month" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {MONTH_OPTIONS.map((m) => (
                                        <SelectItem key={m} value={m}>
                                          {m}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Latest Year</Label>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="YYYY"
                                    value={pair.latestYear}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                                      setAdditionalDatePairs((prev) =>
                                        prev.map((p, i) => (i === idx ? { ...p, latestYear: v } : p))
                                      );
                                      if (fieldErrors.datePairs) {
                                        setFieldErrors((prev) => ({ ...prev, datePairs: undefined }));
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {fieldErrors.datePairs && (
                          <p className="text-sm text-destructive">{fieldErrors.datePairs}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-type">Shape</Label>
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

                    <div className="flex items-center gap-2">
                      <input
                        id="edit-is-irregular"
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={isIrregular}
                        onChange={(e) => setIsIrregular(e.target.checked)}
                      />
                      <Label htmlFor="edit-is-irregular">Is Irregular</Label>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-color">Color</Label>
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
                      <Label htmlFor="edit-date-type">Date type</Label>
                      <Select value={dateType} onValueChange={setDateType}>
                        <SelectTrigger id="edit-date-type">
                          <SelectValue placeholder="Select date type (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {DATE_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        <span
                          className="cursor-help border-b border-dotted border-muted-foreground/40"
                          title="Lettering style describes the shape/appearance of the letters used in the postmark text."
                        >
                          Lettering style
                        </span>
                      </Label>
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
                      <Label>
                        <span
                          className="cursor-help border-b border-dotted border-muted-foreground/40"
                          title="Framing style describes lines/boxes/circles surrounding the postmark text."
                        >
                          Framing style
                        </span>
                      </Label>
                      <SearchableMultiSelect
                        id="edit-framing"
                        values={framingIds}
                        onValuesChange={(values) => {
                          setFramingIds(values);
                          setFieldErrors((prev) => ({ ...prev, framing: undefined }));
                        }}
                        options={framingOptions.map((opt) => ({
                          value: String(opt.id),
                          label: opt.name,
                        }))}
                        loading={catalogOptionsLoading}
                        placeholder="Select one or more framing styles"
                        searchPlaceholder="Search framing styles..."
                        emptyMessage="No framing style found."
                        triggerClassName={fieldErrors.framing ? "border-destructive" : ""}
                        aria-label="Framing style"
                      />
                      {fieldErrors.framing && <p className="text-sm text-destructive">{fieldErrors.framing}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>
                        <span
                          className="cursor-help border-b border-dotted border-muted-foreground/40"
                          title="Date format is how the date appears in the postmark (e.g. month/day order, abbreviations)."
                        >
                          Date format
                        </span>
                      </Label>
                      <SearchableMultiSelect
                        id="edit-date-format"
                        values={dateFormatIds}
                        onValuesChange={(values) => {
                          setDateFormatIds(values);
                          setFieldErrors((prev) => ({ ...prev, dateFormat: undefined }));
                        }}
                        options={dateFormatOptions.map((opt) => ({
                          value: String(opt.id),
                          label: opt.name,
                        }))}
                        loading={catalogOptionsLoading}
                        placeholder="Select one or more date formats"
                        searchPlaceholder="Search date formats..."
                        emptyMessage="No date format found."
                        triggerClassName={fieldErrors.dateFormat ? "border-destructive" : ""}
                        aria-label="Date format"
                      />
                      {fieldErrors.dateFormat && <p className="text-sm text-destructive">{fieldErrors.dateFormat}</p>}
                    </div>

                    {isCircularType((type === TYPE_OTHER_VALUE ? typeOther : type).trim()) ? (
                      <div className="space-y-2">
                        <Label htmlFor="edit-diameter-mm">Diameter (mm)</Label>
                        <Input
                          id="edit-diameter-mm"
                          type="text"
                          inputMode="decimal"
                          placeholder="e.g. 34"
                          value={diameterMm}
                          onChange={(e) => {
                            setDiameterMm(sanitizeMmInput(e.target.value));
                            if (fieldErrors.diameterMm) {
                              setFieldErrors((prev) => ({ ...prev, diameterMm: undefined }));
                            }
                          }}
                          className={fieldErrors.diameterMm ? "border-destructive" : ""}
                          aria-label="Diameter in millimetres"
                        />
                        {fieldErrors.diameterMm && (
                          <p className="text-sm text-destructive">{fieldErrors.diameterMm}</p>
                        )}
                        <p className="text-xs text-muted-foreground -mt-1">
                          Optional. For circular postmarks, enter the diameter.
                        </p>
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="edit-inscription-text">Inscription Text</Label>
                      <Textarea
                        id="edit-inscription-text"
                        placeholder="Exact text inscribed on the marking device (abbreviations/annotations)."
                        value={inscriptionText}
                        onChange={(e) => setInscriptionText(e.target.value)}
                        rows={3}
                      />
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
                    Required: State, Town/City, and Manuscript (Yes/No). Earliest Use requires Day, Month, Year, or Unknown.
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
