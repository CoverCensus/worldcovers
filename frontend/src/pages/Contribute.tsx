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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Upload, CheckCircle, XCircle, Clock, Loader2, ChevronDown } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { getColors, type ColorOption } from "@/services/colors";
import {
  getRegions,
  getAssignedRegions,
  type StateOption,
} from "@/services/regions";
import { getShapes, type ShapeOption } from "@/services/shapes";
import { getPostOffices, type PostOfficeOption } from "@/services/postOffices";
import { getLetterings, type LetteringOption } from "@/services/letterings";
import { getFramings, type FramingOption } from "@/services/framings";
import { getDateFormats, type DateFormatOption } from "@/constants/postmarkEnums";
import { getReferenceWorks, type ReferenceWorkRecord } from "@/services/referenceWorks";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  sanitizeMmInput,
  validateMmPair,
  submittedDataToWidthHeightStrings,
} from "@/lib/dimensionsMm";

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
  // Prefer an explicit range delimiter with spaces: "YYYY-MM-DD - YYYY-MM-DD"
  const spaced = s.split(/\s+[-–—]\s+/);
  if (spaced.length >= 2) return [spaced[0].trim(), spaced[1].trim()];
  // Fallback: legacy year range "YYYY-YYYY"
  const m = s.match(/^\s*(\d{4})\s*[-–—]\s*(\d{4})\s*$/);
  if (m) return [m[1], m[2]];
  return [s, ""];
}

const MONTH_OPTIONS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;
const MONTH_TO_NUM: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};
const NUM_TO_MONTH: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
  "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};
const PAGE_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9\s\-–—.,:;()/#]*$/;

type DatePair = {
  earliestDay: string;
  earliestMonth: string;
  earliestYear: string;
  latestDay: string;
  latestMonth: string;
  latestYear: string;
};

type ReferenceDetailInput = {
  pageNumber: string;
  citationUrl: string;
};

type ReferenceDetailPayload = {
  reference_work_id: number;
  page_number?: string;
  url?: string;
};

type ReferenceDetailFieldErrors = {
  pageNumber?: string;
  citationUrl?: string;
};

type ImageCategory = "postmark" | "ratemark" | "auxmark";

function parseReferenceWorkIds(raw: unknown): number[] {
  const values: unknown[] = [];
  if (Array.isArray(raw)) {
    values.push(...raw);
  } else if (raw != null) {
    values.push(raw);
  }

  const parsed: number[] = [];
  const seen = new Set<number>();

  for (const value of values) {
    if (Array.isArray(value)) {
      value.forEach((v) => values.push(v));
      continue;
    }
    const s = String(value ?? "").trim();
    if (!s) continue;
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        const json = JSON.parse(s);
        if (Array.isArray(json)) {
          json.forEach((v) => values.push(v));
          continue;
        }
      } catch {
        // Ignore malformed payloads from legacy records.
      }
    }
    if (s.includes(",")) {
      s.split(",").forEach((chunk) => values.push(chunk.trim()));
      continue;
    }
    const n = Number.parseInt(s, 10);
    if (Number.isNaN(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    parsed.push(n);
  }

  return parsed;
}

function parseReferenceWorkDetails(raw: unknown): Record<number, ReferenceDetailInput> {
  if (raw == null) return {};
  let list: unknown = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return {};
    try {
      list = JSON.parse(s);
    } catch {
      return {};
    }
  }
  if (!Array.isArray(list)) {
    if (list && typeof list === "object") {
      list = Object.entries(list as Record<string, unknown>).map(([id, detail]) => ({
        reference_work_id: id,
        ...(detail && typeof detail === "object" ? detail : {}),
      }));
    } else {
      return {};
    }
  }
  const rows = list as unknown[];
  const out: Record<number, ReferenceDetailInput> = {};
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const idRaw = rec.reference_work_id ?? rec.referenceWorkId;
    const id = Number.parseInt(String(idRaw ?? ""), 10);
    if (Number.isNaN(id) || id <= 0) continue;
    out[id] = {
      pageNumber: String(rec.page_number ?? rec.pageNumber ?? "").trim(),
      citationUrl: String(rec.url ?? "").trim(),
    };
  }
  return out;
}

function parseDateTokenToParts(raw: string): { day: string; month: string; year: string } {
  const s = String(raw || "").trim();
  if (!s) return { day: "", month: "", year: "" };
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return {
      day: iso[3],
      month: NUM_TO_MONTH[iso[2]] ?? "",
      year: iso[1],
    };
  }
  const y = s.match(/^(\d{4})$/);
  if (y) return { day: "", month: "", year: y[1] };
  return { day: "", month: "", year: "" };
}

function parseDateRangeToken(raw: string): DatePair | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const [first, last] = parseDateRange(s);
  const a = parseDateTokenToParts(first);
  const b = parseDateTokenToParts(last);
  if (!a.year || !b.year) return null;
  return {
    earliestDay: a.day,
    earliestMonth: a.month,
    earliestYear: a.year,
    latestDay: b.day,
    latestMonth: b.month,
    latestYear: b.year,
  };
}

function formatReferenceWorkForReferences(
  work: ReferenceWorkRecord,
  detail?: ReferenceDetailInput,
): string {
  const parts: string[] = [];
  if (work.title?.trim()) parts.push(`Title: ${work.title.trim()}`);
  if (work.authorship?.trim()) parts.push(`Authorship: ${work.authorship.trim()}`);
  if (work.publisher?.trim()) parts.push(`Publisher: ${work.publisher.trim()}`);
  if (work.publicationYear != null) parts.push(`Publication year: ${work.publicationYear}`);
  if (work.edition?.trim()) parts.push(`Edition: ${work.edition.trim()}`);
  if (work.volume?.trim()) parts.push(`Volume: ${work.volume.trim()}`);
  if (work.isbn?.trim()) parts.push(`Isbn: ${work.isbn.trim()}`);
  if (work.url?.trim()) parts.push(`Url: ${work.url.trim()}`);
  if (detail?.pageNumber?.trim()) parts.push(`Page number: ${detail.pageNumber.trim()}`);
  if (detail?.citationUrl?.trim()) parts.push(`Citation url: ${detail.citationUrl.trim()}`);
  return parts.join("\n");
}

const Contribute = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const postmarkFileInputRef = useRef<HTMLInputElement>(null);
  const ratemarkFileInputRef = useRef<HTMLInputElement>(null);
  const auxmarkFileInputRef = useRef<HTMLInputElement>(null);

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
  const [typeOptions, setTypeOptions] = useState<ShapeOption[]>([]);
  const [postOffices, setPostOffices] = useState<PostOfficeOption[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [stateOptionsError, setStateOptionsError] = useState<string | null>(null);
  const [confirmedNoAssignedStates, setConfirmedNoAssignedStates] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [typeOptionsError, setTypeOptionsError] = useState<string | null>(null);
  const [loadingTowns, setLoadingTowns] = useState(false);
  const [townOptionsError, setTownOptionsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state – all fields shown on Submission Detail
  const [state, setState] = useState("");

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
  const [manuscript, setManuscript] = useState("");
  const [isIrregular, setIsIrregular] = useState(false);
  const [impression, setImpression] = useState("");
  const [dateType, setDateType] = useState("");
  const [inscriptionText, setInscriptionText] = useState("");
  const [description, setDescription] = useState("");
  const [selectedReferenceWorks, setSelectedReferenceWorks] = useState<ReferenceWorkRecord[]>([]);
  const [referenceDetailsById, setReferenceDetailsById] = useState<Record<number, ReferenceDetailInput>>({});
  const [referenceDetailErrorsById, setReferenceDetailErrorsById] = useState<Record<number, ReferenceDetailFieldErrors>>({});
  const [postmarkImageFiles, setPostmarkImageFiles] = useState<File[]>([]);
  const [postmarkImagePreviews, setPostmarkImagePreviews] = useState<string[]>([]);
  const [ratemarkImageFiles, setRatemarkImageFiles] = useState<File[]>([]);
  const [ratemarkImagePreviews, setRatemarkImagePreviews] = useState<string[]>([]);
  const [auxmarkImageFiles, setAuxmarkImageFiles] = useState<File[]>([]);
  const [auxmarkImagePreviews, setAuxmarkImagePreviews] = useState<string[]>([]);
  const [diameterMm, setDiameterMm] = useState("");
  const [letteringId, setLetteringId] = useState("");
  const [framingIds, setFramingIds] = useState<string[]>([]);
  const [dateFormatIds, setDateFormatIds] = useState<string[]>([]);
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
    images?: string;
    lettering?: string;
    framing?: string;
    dateFormat?: string;
    editorValue?: string;
    editorComment?: string;
  }>({});
  const [earliestYearError, setEarliestYearError] = useState<string | null>(null);
  const [latestYearError, setLatestYearError] = useState<string | null>(null);

  // Contributor: lettering, framing, date format (loaded for all)
  const [letteringOptions, setLetteringOptions] = useState<LetteringOption[]>([]);
  const [framingOptions, setFramingOptions] = useState<FramingOption[]>([]);
  const [dateFormatOptions, setDateFormatOptions] = useState<DateFormatOption[]>([]);
  const [catalogOptionsLoading, setCatalogOptionsLoading] = useState(false);
  const [referenceWorks, setReferenceWorks] = useState<ReferenceWorkRecord[]>([]);
  const [pendingReferenceWorkIds, setPendingReferenceWorkIds] = useState<number[]>([]);
  const [referenceWorksLoading, setReferenceWorksLoading] = useState(false);
  const [referenceWorksError, setReferenceWorksError] = useState<string | null>(null);
  const [referenceWorksFetched, setReferenceWorksFetched] = useState(false);

  // Editor-only: value and comment when approving (direct add to catalog)
  const isStateEditor = user?.role === "state_editor";
  const [editorValue, setEditorValue] = useState("");
  const [editorComment, setEditorComment] = useState("");

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
    setConfirmedNoAssignedStates(false);

    const loadStates = async () => {
      try {
        const isStateEditor = user?.role === "state_editor";
        if (isStateEditor) {
          // Prefer dedicated endpoint first; then fallback to assigned_only query.
          const assignedStates = await getAssignedRegions().catch(() => []);
          if (assignedStates.length > 0) {
            setStateOptions(assignedStates);
            setConfirmedNoAssignedStates(false);
            return;
          }
          const assignedOnlyStates = await getRegions(true);
          setStateOptions(assignedOnlyStates);
          setConfirmedNoAssignedStates(assignedOnlyStates.length === 0);
          return;
        }

        // Contributors can submit to any state: load full list.
        const options = await getRegions(false);
        setStateOptions(options);
        setConfirmedNoAssignedStates(false);
      } catch (err) {
        setStateOptionsError(
          err instanceof Error ? err.message : "Failed to load states"
        );
        setStateOptions([]);
        setConfirmedNoAssignedStates(false);
      } finally {
        setLoadingStates(false);
      }
    };

    loadStates();
  }, [user]);

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

        // Defaults (when creating a new submission): Lettering = Normal, Framing = None.
        if (!editContributionId) {
          if (!letteringId) {
            const normal = lettering.find((o) => String(o.name || "").trim().toLowerCase() === "normal");
            if (normal) setLetteringId(String(normal.id));
          }
          if (framingIds.length === 0) {
            const none = framing.find((o) => String(o.name || "").trim().toLowerCase() === "none");
            if (none) setFramingIds([String(none.id)]);
          }
        }
      })
      .catch(() => {
        setLetteringOptions([]);
        setFramingOptions([]);
        setDateFormatOptions([]);
      })
      .finally(() => setCatalogOptionsLoading(false));
  }, [editContributionId, letteringId, framingIds.length]);

  useEffect(() => {
    if (referenceWorksFetched || referenceWorksLoading) return;
    setReferenceWorksLoading(true);
    setReferenceWorksError(null);
    getReferenceWorks()
      .then((rows) => setReferenceWorks(rows))
      .catch((err) => {
        setReferenceWorksError(
          err instanceof Error ? err.message : "Failed to load reference works"
        );
      })
      .finally(() => {
        setReferenceWorksFetched(true);
        setReferenceWorksLoading(false);
      });
  }, [referenceWorksFetched, referenceWorksLoading]);

  useEffect(() => {
    if (pendingReferenceWorkIds.length === 0 || referenceWorks.length === 0) return;
    const mapped = pendingReferenceWorkIds
      .map((id) => referenceWorks.find((w) => w.id === id))
      .filter((w): w is ReferenceWorkRecord => w != null);
    if (mapped.length > 0) {
      setSelectedReferenceWorks(mapped);
      setReferenceDetailsById((prev) => {
        const next = { ...prev };
        mapped.forEach((work) => {
          next[work.id] = next[work.id] ?? { pageNumber: "", citationUrl: "" };
        });
        return next;
      });
    }
    setPendingReferenceWorkIds([]);
  }, [pendingReferenceWorkIds, referenceWorks]);

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
    fetch(`${apiBase}/contributions/${editContributionId}/`, {
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
        // Existing submissions only store year ranges; map into the new Earliest/Latest UI.
        setEarliestDay("");
        setEarliestMonth("");
        setEarliestYear(first || "");
        setEarliestUnknown(false);
        setLatestDay("");
        setLatestMonth("");
        setLatestYear(last || "");
        setLatestUnknown(false);
        const datesObservedRaw = getStr(sd.dates_observed ?? (sd as Record<string, unknown>).datesObserved);
        const extraPairs = datesObservedRaw
          .split(",")
          .map((x) => parseDateRangeToken(x))
          .filter((x): x is DatePair => x != null);
        setAdditionalDatePairs(extraPairs);
        setType(typeVal || "");
        setTypeOther("");
        setColor(colorVal || "");
        setColorOther("");
        const wh = submittedDataToWidthHeightStrings(sd as Record<string, unknown>);
        setWidthMm(wh.width);
        setHeightMm(wh.height);
        setManuscript(getStr(sd.manuscript));
        setImpression(getStr(sd.impression));
        setDateType(getStr(sd.date_type ?? (sd as Record<string, unknown>).dateType));
        setIsIrregular(Boolean(sd.is_irreg ?? (sd as Record<string, unknown>).isIrreg));
        setInscriptionText(getStr(sd.inscription_txt ?? (sd as Record<string, unknown>).inscriptionText));
        setDescription(getStr(sd.description));
        const referenceWorkIds = parseReferenceWorkIds(
          (sd as Record<string, unknown>).reference_work_ids ??
          (sd as Record<string, unknown>).referenceWorkIds ??
          (sd as Record<string, unknown>)["reference_work_ids[]"],
        );
        const referenceDetails = parseReferenceWorkDetails(
          (sd as Record<string, unknown>).reference_work_details ??
          (sd as Record<string, unknown>).referenceWorkDetails,
        );
        setPendingReferenceWorkIds(referenceWorkIds);
        setReferenceDetailsById(referenceDetails);
        if (referenceWorkIds.length === 0) {
          setSelectedReferenceWorks([]);
        }
        const lid = sd.lettering_style_id ?? (sd as Record<string, unknown>).letteringStyleId;
        setLetteringId(lid != null ? String(lid) : "");
        const fids = (sd.framing_style_ids ?? (sd as Record<string, unknown>).framingStyleIds) as unknown;
        const normalizedFramingIds = Array.isArray(fids)
          ? fids.map((x) => String(x)).filter(Boolean)
          : [];
        if (normalizedFramingIds.length > 0) {
          setFramingIds(normalizedFramingIds);
        } else {
          const fid = sd.framing_style_id ?? (sd as Record<string, unknown>).framingStyleId;
          setFramingIds(fid != null ? [String(fid)] : []);
        }
        const dids = (sd.date_format_ids ?? (sd as Record<string, unknown>).dateFormatIds) as unknown;
        const normalizedDateFormatIds = Array.isArray(dids)
          ? dids.map((x) => String(x)).filter(Boolean)
          : [];
        if (normalizedDateFormatIds.length > 0) {
          setDateFormatIds(normalizedDateFormatIds);
        } else {
          const did = sd.date_format_id ?? (sd as Record<string, unknown>).dateFormatId;
          setDateFormatIds(did != null ? [String(did)] : []);
        }
        const asMetaArray = (raw: unknown): Array<{ storage_filename?: string; storageFilename?: string }> => {
          if (!Array.isArray(raw)) return [];
          return raw as Array<{ storage_filename?: string; storageFilename?: string }>;
        };
        const postmarkMetas = asMetaArray(sd.postmark_image_metas ?? (sd as Record<string, unknown>).postmarkImageMetas);
        const ratemarkMetas = asMetaArray(sd.ratemark_image_metas ?? (sd as Record<string, unknown>).ratemarkImageMetas);
        const auxmarkMetas = asMetaArray(sd.auxmark_image_metas ?? (sd as Record<string, unknown>).auxmarkImageMetas);
        const metas = asMetaArray(sd.image_metas ?? (sd as Record<string, unknown>).imageMetas);
        const metaOne = sd.image_meta as { storage_filename?: string; storageFilename?: string } | undefined;
        const baseUrl = (import.meta.env.VITE_IMAGE_URL ?? "").replace(/\/+$/, "");
        const toPreviewUrls = (items: Array<{ storage_filename?: string; storageFilename?: string }>) => {
          const urls: string[] = [];
          if (!baseUrl) return urls;
          items.forEach((m) => {
            const sf = m?.storage_filename ?? (m as { storageFilename?: string })?.storageFilename;
            if (sf) urls.push(`${baseUrl}/postmarks/${sf}`);
          });
          return urls;
        };
        const hasCategorized = postmarkMetas.length > 0 || ratemarkMetas.length > 0 || auxmarkMetas.length > 0;
        if (hasCategorized) {
          setPostmarkImagePreviews(toPreviewUrls(postmarkMetas));
          setRatemarkImagePreviews(toPreviewUrls(ratemarkMetas));
          setAuxmarkImagePreviews(toPreviewUrls(auxmarkMetas));
        } else {
          const legacyItems = [...metas];
          if (metaOne) legacyItems.push(metaOne);
          const postmarkPreviews = toPreviewUrls(legacyItems);
          if (postmarkPreviews.length > 0) setPostmarkImagePreviews(postmarkPreviews);
        }
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
    confirmedNoAssignedStates &&
    !loadingStates &&
    !stateOptionsError &&
    stateOptions.length === 0;

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

  const selectedFramingSummary = useMemo(() => {
    if (framingIds.length === 0) return "Select one or more framing styles";
    const selectedNames = framingOptions
      .filter((opt) => framingIds.includes(String(opt.id)))
      .map((opt) => opt.name);
    if (selectedNames.length <= 2) return selectedNames.join(", ");
    return `${selectedNames.slice(0, 2).join(", ")} +${selectedNames.length - 2} more`;
  }, [framingIds, framingOptions]);
  const selectedDateFormatSummary = useMemo(() => {
    if (dateFormatIds.length === 0) return "Select one or more date formats";
    const selectedNames = dateFormatOptions
      .filter((opt) => dateFormatIds.includes(String(opt.id)))
      .map((opt) => opt.name);
    if (selectedNames.length <= 2) return selectedNames.join(", ");
    return `${selectedNames.slice(0, 2).join(", ")} +${selectedNames.length - 2} more`;
  }, [dateFormatIds, dateFormatOptions]);

  const appendCategoryFiles = (category: ImageCategory, files: File[]) => {
    if (files.length === 0) return;
    if (category === "postmark") setPostmarkImageFiles((prev) => [...prev, ...files]);
    if (category === "ratemark") setRatemarkImageFiles((prev) => [...prev, ...files]);
    if (category === "auxmark") setAuxmarkImageFiles((prev) => [...prev, ...files]);
  };

  const appendCategoryPreviews = (category: ImageCategory, previews: string[]) => {
    if (previews.length === 0) return;
    if (category === "postmark") setPostmarkImagePreviews((prev) => [...prev, ...previews]);
    if (category === "ratemark") setRatemarkImagePreviews((prev) => [...prev, ...previews]);
    if (category === "auxmark") setAuxmarkImagePreviews((prev) => [...prev, ...previews]);
  };

  const handleImageChange = (category: ImageCategory, e: React.ChangeEvent<HTMLInputElement>) => {
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
    if (category === "postmark" && fieldErrors.images) {
      setFieldErrors((prev) => ({ ...prev, images: undefined }));
    }
    appendCategoryFiles(category, toAdd);
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
      appendCategoryPreviews(category, newPreviews);
    });
    e.target.value = "";
  };

  const removeImageAt = (category: ImageCategory, index: number) => {
    if (category === "postmark") {
      setPostmarkImageFiles((prev) => prev.filter((_, i) => i !== index));
      setPostmarkImagePreviews((prev) => prev.filter((_, i) => i !== index));
      if (postmarkFileInputRef.current) postmarkFileInputRef.current.value = "";
    }
    if (category === "ratemark") {
      setRatemarkImageFiles((prev) => prev.filter((_, i) => i !== index));
      setRatemarkImagePreviews((prev) => prev.filter((_, i) => i !== index));
      if (ratemarkFileInputRef.current) ratemarkFileInputRef.current.value = "";
    }
    if (category === "auxmark") {
      setAuxmarkImageFiles((prev) => prev.filter((_, i) => i !== index));
      setAuxmarkImagePreviews((prev) => prev.filter((_, i) => i !== index));
      if (auxmarkFileInputRef.current) auxmarkFileInputRef.current.value = "";
    }
  };

  const getCategoryInputRef = (category: ImageCategory) => {
    if (category === "postmark") return postmarkFileInputRef;
    if (category === "ratemark") return ratemarkFileInputRef;
    return auxmarkFileInputRef;
  };

  const getCategoryFiles = (category: ImageCategory) => {
    if (category === "postmark") return postmarkImageFiles;
    if (category === "ratemark") return ratemarkImageFiles;
    return auxmarkImageFiles;
  };

  const getCategoryPreviews = (category: ImageCategory) => {
    if (category === "postmark") return postmarkImagePreviews;
    if (category === "ratemark") return ratemarkImagePreviews;
    return auxmarkImagePreviews;
  };

  const buildName = () => {
    const stateLabel = state.trim();
    return `${town.trim()}, ${stateLabel} ${type}`.trim();
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
      const mm = MONTH_TO_NUM[mmTxt];
      if (!mm || !dd || dd.length !== 2) return "";
      return `${yy}-${mm}-${dd}`;
    };

    const firstIso = earliestUnknown ? "" : mkIso(earliestDay, earliestMonth, earliestYear);
    const lastIso = latestUnknown ? "" : mkIso(latestDay, latestMonth, latestYear);

    // Prefer full dates when day+month are provided; otherwise fall back to year-only.
    const first = firstIso || y1;
    const last = lastIso || y2;
    if (!last) return first;
    // If we are sending ISO dates, use a delimiter with spaces to avoid ambiguity.
    const isIso = first.length === 10 || last.length === 10;
    return isIso ? `${first} - ${last}` : `${first}-${last}`;
  };

  const formatDateLabel = (d: string, m: string, y: string, unknown: boolean) => {
    if (unknown) return "Unknown";
    const yy = y.trim();
    const mm = m.trim();
    const dd = d.trim();
    const parts = [dd, mm, yy].filter(Boolean);
    return parts.length ? parts.join(" ") : "";
  };

  const isCircularType = (raw: string) => {
    const s = (raw || "").toLowerCase();
    return (
      s.includes("circle") ||
      s.includes("circular") ||
      s.includes("cds") ||
      s.includes("double circle") ||
      s.includes("single circle")
    );
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
    const typeVal = type === TYPE_OTHER_VALUE ? typeOther.trim() : type.trim();
    const colorVal = color === COLOR_OTHER_VALUE ? colorOther.trim() : color.trim();
    const isCircular = isCircularType(typeVal);

    const errors: typeof fieldErrors = {};
    if (!stateVal) {
      errors.state = "State is required";
    }
    if (!townVal) {
      errors.town = "Town/City is required";
    } else if (/[0-9]/.test(townVal)) {
      errors.town = "Town/City must contain only letters and spaces";
    }
    if (!manuscript.trim()) {
      errors.manuscript = "Manuscript is required";
    }
    if (!isEditMode && postmarkImageFiles.length === 0) {
      errors.images = "At least one image is required";
    }

    // Earliest Use date: Day / Month / Year OR Unknown (one of the four required)
    if (!earliestUnknown && !earliestDay.trim() && !earliestMonth.trim() && !earliestYear.trim()) {
      errors.earliestDate = "Enter Day, Month, Year, or choose Unknown";
    }
    // Latest Use date: optional, but if anything is entered it must be valid; Unknown allowed.
    const latestHasAny = !!latestDay.trim() || !!latestMonth.trim() || !!latestYear.trim();
    if (!latestUnknown && latestHasAny === false) {
      // ok: completely blank
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

    if (isStateEditor) {
      if (editorValue.trim() === "" || Number.isNaN(parseFloat(editorValue)) || parseFloat(editorValue) < 0) {
        errors.editorValue = "Value is required when approving (adding to catalog) and must be a non-negative number";
      }
      if (!editorComment.trim()) errors.editorComment = "Comment is required when adding to catalog";
    }

    const referenceDetailErrors: Record<number, ReferenceDetailFieldErrors> = {};
    for (const work of selectedReferenceWorks) {
      const detail = referenceDetailsById[work.id];
      if (!detail) continue;
      const page = detail.pageNumber.trim();
      const citationUrl = detail.citationUrl.trim();
      const rowErrors: ReferenceDetailFieldErrors = {};

      if (page) {
        if (page.length > 120) {
          rowErrors.pageNumber = "Page number must be 120 characters or fewer";
        } else if (!PAGE_NUMBER_RE.test(page)) {
          rowErrors.pageNumber = "Page number has invalid characters";
        }
      }
      if (citationUrl) {
        if (citationUrl.length > 2000) {
          rowErrors.citationUrl = "Citation URL must be 2000 characters or fewer";
        } else {
          try {
            const parsed = new URL(citationUrl);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
              rowErrors.citationUrl = "Citation URL must start with http:// or https://";
            }
          } catch {
            rowErrors.citationUrl = "Citation URL must be a valid URL";
          }
        }
      }

      if (rowErrors.pageNumber || rowErrors.citationUrl) {
        referenceDetailErrors[work.id] = rowErrors;
      }
    }
    setReferenceDetailErrorsById(referenceDetailErrors);
    if (Object.keys(referenceDetailErrors).length > 0) {
      toast({
        title: "Fix reference details",
        description: "Check page number and citation URL fields for selected references.",
        variant: "destructive",
      });
      return;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // Validate years (required; day/month are optional but will be sent when provided)
    const earliestYearRangeError = validateYearString(earliestYear.trim());
    setEarliestYearError(earliestYearRangeError);
    if (earliestYearRangeError) {
      toast({
        title: "Invalid year",
        description: earliestYearRangeError,
        variant: "destructive",
      });
      return;
    }
    const latestYearRangeError = validateYearString(latestYear.trim());
    setLatestYearError(latestYearRangeError);
    if (latestYearRangeError) {
      toast({
        title: "Invalid year",
        description: latestYearRangeError,
        variant: "destructive",
      });
      return;
    }

    for (const pair of additionalDatePairs) {
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
      if (!first || !last) {
        setFieldErrors((prev) => ({
          ...prev,
          datePairs: "Each additional pair requires both Earliest Use and Latest Use.",
        }));
        return;
      }
      const firstErr = validateYearString(pair.earliestYear.trim());
      const lastErr = validateYearString(pair.latestYear.trim());
      if (firstErr || lastErr) {
        setFieldErrors((prev) => ({
          ...prev,
          datePairs: firstErr || lastErr || "Invalid additional date pair.",
        }));
        return;
      }
      if (Number(first) > Number(last)) {
        setFieldErrors((prev) => ({
          ...prev,
          datePairs: "Earliest Year must be less than or equal to Latest Year in each pair.",
        }));
        return;
      }
    }

    const dateRange = buildDateRange(); // may be empty when Unknown
    const datesObservedToSend = additionalDatePairs
      .map((pair) => {
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
      })
      .filter(Boolean)
      .join(", ");
    const referencesToSend = selectedReferenceWorks
      .map((work) => formatReferenceWorkForReferences(work, referenceDetailsById[work.id]))
      .filter(Boolean)
      .join("\n\n");
    const referenceWorkIdsToSend = selectedReferenceWorks.map((work) => work.id);
    const referenceWorkDetailsToSend: ReferenceDetailPayload[] = selectedReferenceWorks.map((work) => {
      const detail = referenceDetailsById[work.id];
      return {
        reference_work_id: work.id,
        page_number: detail?.pageNumber?.trim() || undefined,
        url: detail?.citationUrl?.trim() || undefined,
      };
    });
    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      toast({
        title: "Configuration error",
        description: "VITE_API_URL is not set. Cannot submit postmark.",
        variant: "destructive",
      });
      return;
    }

    const allImageFiles = [...postmarkImageFiles, ...ratemarkImageFiles, ...auxmarkImageFiles];
    const oversized = allImageFiles.filter((f) => f.size > MAX_IMAGE_SIZE_MB * 1024 * 1024);
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

      const mkIso = (d: string, m: string, y: string) => {
        const yy = y.trim();
        if (!yy) return "";
        const dd = d.trim().padStart(2, "0");
        const mm = MONTH_TO_NUM[m.trim()];
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
      const derivedIsCircular = isCircularType(typeVal);
      const derivedDimensions = (() => {
        const d = diameterMm.trim();
        const w = widthMm.trim();
        const h = heightMm.trim();
        if (derivedIsCircular && d) return `${d} mm diameter`;
        if (w && h) return `${w}×${h} mm`;
        return "";
      })();
      const descriptionToSend = description.trim();
      const inscriptionToSend = inscriptionText.trim();

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

      if (allImageFiles.length > 0) {
        const form = new FormData();
        if (editContributionId != null) form.append("edit_contribution_id", String(editContributionId));
        form.append("state", stateVal);
        form.append("town", townVal);
        form.append("firstSeen", firstSeenToSend);
        form.append("lastSeen", lastSeenToSend);
        if (datesObservedToSend) form.append("dates_observed", datesObservedToSend);
        form.append("type", typeVal);
        form.append("color", colorVal);
        if (derivedDimensions) form.append("dimensions", derivedDimensions);
        if (manuscript.trim()) form.append("manuscript", manuscript.trim());
        form.append("is_irreg", String(isIrregular));
        if (impression.trim()) form.append("impression", impression.trim());
        if (dateType.trim()) form.append("date_type", dateType.trim());
        if (inscriptionToSend) form.append("inscription_txt", inscriptionToSend);
        if (descriptionToSend) form.append("description", descriptionToSend);
        if (referencesToSend) form.append("references", referencesToSend);
        referenceWorkIdsToSend.forEach((id) => form.append("reference_work_ids[]", String(id)));
        if (referenceWorkDetailsToSend.length > 0) {
          form.append("reference_work_details", JSON.stringify(referenceWorkDetailsToSend));
        }
        if (submitterName) form.append("submitterName", submitterName);
        form.append("lettering_style_id", letteringId);
        if (framingIds.length > 0) {
          form.append("framing_style_id", framingIds[0]);
          framingIds.forEach((id) => form.append("framing_style_ids[]", id));
        }
        if (dateFormatIds.length > 0) {
          form.append("date_format_id", dateFormatIds[0]);
          dateFormatIds.forEach((id) => form.append("date_format_ids[]", id));
        }
        if (isStateEditor) {
          if (derivedShapeId != null) form.append("postmark_shape_id", String(derivedShapeId));
          form.append("estimated_value", editorValue.trim());
          form.append("review_notes", editorComment.trim());
        }
        for (const file of postmarkImageFiles) form.append("postmark_image", file, file.name);
        for (const file of ratemarkImageFiles) form.append("ratemark_image", file, file.name);
        for (const file of auxmarkImageFiles) form.append("auxmark_image", file, file.name);
        body = form;
        // Do not set Content-Type so browser sets multipart/form-data with boundary
      } else {
        body = JSON.stringify({
          ...(editContributionId != null ? { edit_contribution_id: editContributionId } : {}),
          state: stateVal,
          town: townVal,
          firstSeen: firstSeenToSend,
          lastSeen: lastSeenToSend,
          dates_observed: datesObservedToSend || undefined,
          type: typeVal,
          color: colorVal,
          dimensions: derivedDimensions || undefined,
          manuscript: manuscript.trim() || undefined,
          is_irreg: isIrregular,
          impression: impression.trim() || undefined,
          date_type: dateType.trim() || undefined,
          inscription_txt: inscriptionToSend || undefined,
          description: descriptionToSend || undefined,
          references: referencesToSend || undefined,
          reference_work_ids: referenceWorkIdsToSend.length > 0 ? referenceWorkIdsToSend : undefined,
          reference_work_details: referenceWorkDetailsToSend.length > 0 ? referenceWorkDetailsToSend : undefined,
          submitterName: submitterName || undefined,
          lettering_style_id: letteringId ? Number(letteringId) : undefined,
          framing_style_id: framingIds[0] ? Number(framingIds[0]) : undefined,
          framing_style_ids: framingIds.length > 0 ? framingIds.map((id) => Number(id)) : undefined,
          date_format_id: dateFormatIds[0] ? Number(dateFormatIds[0]) : undefined,
          date_format_ids: dateFormatIds.length > 0 ? dateFormatIds.map((id) => Number(id)) : undefined,
          ...editorPayload,
        });
      }

      const headers: Record<string, string> =
        typeof body === "string" ? { "Content-Type": "application/json" } : {};

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

      const resData = (await res.json().catch(() => ({}))) as { postmarkId?: number; contributionId?: number; detail?: string };
      const directAdd = resData?.postmarkId != null;
      const wasEdit = editContributionId != null;

      toast({
        title: directAdd ? "Catalog entry added" : wasEdit ? "Changes submitted" : "Submission sent",
        description: directAdd
          ? "The postmark has been added to the catalog and is now visible in Search."
          : wasEdit
            ? "Your updated submission has been sent for review again."
            : isStateEditor
              ? "Your entry was sent for peer review. Another state editor assigned to this state must approve it before it appears in Search."
              : "Your catalog entry has been submitted for approval. It will appear in Search after an admin approves it.",
      });

      if (wasEdit && resData?.contributionId != null) {
        navigate(`/contribution/${resData.contributionId}`, { state: { fromDashboard: true } });
        return;
      }

      setState("");
      setTown("");
      setEarliestDay("");
      setEarliestMonth("");
      setEarliestYear("");
      setEarliestUnknown(false);
      setLatestDay("");
      setLatestMonth("");
      setLatestYear("");
      setLatestUnknown(false);
      setAdditionalDatePairs([]);
      setType("");
      setTypeOther("");
      setColor("");
      setColorOther("");
      setWidthMm("");
      setHeightMm("");
      setDiameterMm("");
      setManuscript("");
      setIsIrregular(false);
      setImpression("");
      setDateType("");
      setInscriptionText("");
      setDescription("");
      setPendingReferenceWorkIds([]);
      setSelectedReferenceWorks([]);
      setReferenceDetailsById({});
      setReferenceDetailErrorsById({});
      setPostmarkImageFiles([]);
      setPostmarkImagePreviews([]);
      setRatemarkImageFiles([]);
      setRatemarkImagePreviews([]);
      setAuxmarkImageFiles([]);
      setAuxmarkImagePreviews([]);
      setLetteringId("");
      setFramingIds([]);
      setDateFormatIds([]);
      setDateType("");
      if (directAdd) {
        setEditorValue("");
        setEditorComment("");
      }
      if (postmarkFileInputRef.current) postmarkFileInputRef.current.value = "";
      if (ratemarkFileInputRef.current) ratemarkFileInputRef.current.value = "";
      if (auxmarkFileInputRef.current) auxmarkFileInputRef.current.value = "";
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
  const effectiveTypeLabel = String(type === TYPE_OTHER_VALUE ? (typeOther ?? "") : (type ?? "")).trim();
  const showDiameter = isCircularType(effectiveTypeLabel);

  const renderImageUploader = (
    category: ImageCategory,
    label: string,
    helperText: string,
    required = false,
  ) => {
    const inputRef = getCategoryInputRef(category);
    const previews = getCategoryPreviews(category);
    const files = getCategoryFiles(category);
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        {required && fieldErrors.images && <p className="text-sm text-destructive">{fieldErrors.images}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => handleImageChange(category, e)}
        />
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
        >
          {previews.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {previews.map((preview, i) => (
                  <div key={i} className="relative rounded border bg-muted/30 overflow-hidden">
                    <img src={preview} alt={`${label} preview ${i + 1}`} className="w-full aspect-square object-contain max-h-32" />
                    <p className="text-xs text-muted-foreground truncate px-2 py-1">{files[i]?.name || "Existing image"}</p>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-1 right-1 h-7 w-7 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImageAt(category, i);
                      }}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                Add more images
              </Button>
            </div>
          ) : (
            <>
              <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-2">
                Click to upload or drag and drop (multiple allowed)
              </p>
              <p className="text-xs text-muted-foreground">{helperText}</p>
            </>
          )}
        </div>
      </div>
    );
  };


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
                      <Label htmlFor="state">State</Label>
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
                      <Label htmlFor="town">Town/City</Label>
                      <Input
                        id="town"
                        type="text"
                        value={town}
                        onChange={(e) => {
                          setTown(sanitizeTown(e.target.value));
                          if (fieldErrors.town) {
                            setFieldErrors((prev) => ({ ...prev, town: undefined }));
                          }
                        }}
                        placeholder="Enter town/city..."
                        list="town-options"
                        aria-label="Town or city"
                        className={fieldErrors.town ? "border-destructive" : ""}
                      />
                      {/* <datalist id="town-options">
                        {townOptions.map((opt) => (
                          <option key={opt.value} value={opt.value} />
                        ))}
                      </datalist> */}
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
                      <Label htmlFor="manuscript">Manuscript</Label>
                      <Select
                        value={manuscript}
                        onValueChange={(v) => {
                          setManuscript(v);
                          if (fieldErrors.manuscript) {
                            setFieldErrors((prev) => ({ ...prev, manuscript: undefined }));
                          }
                        }}
                      >
                        <SelectTrigger id="manuscript" className={fieldErrors.manuscript ? "border-destructive" : ""}>
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
                      <Label htmlFor="impression">Impression</Label>
                      <Select value={impression} onValueChange={setImpression}>
                        <SelectTrigger id="impression">
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
                            <Label htmlFor="earliest-day" className="text-xs text-muted-foreground">
                              Day
                            </Label>
                            <Input
                              id="earliest-day"
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
                                {MONTH_OPTIONS.map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="earliest-year" className="text-xs text-muted-foreground">
                              Year
                            </Label>
                            <Input
                              id="earliest-year"
                              type="text"
                              inputMode="numeric"
                              placeholder="YYYY"
                              value={earliestYear}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                                setEarliestYear(v);
                                if (fieldErrors.earliestDate) setFieldErrors((p) => ({ ...p, earliestDate: undefined }));
                                setEarliestYearError(validateYearString(v));
                              }}
                              disabled={earliestUnknown}
                              className={earliestYearError ? "border-destructive" : ""}
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
                                  setEarliestYearError(null);
                                }
                                if (fieldErrors.earliestDate) setFieldErrors((p) => ({ ...p, earliestDate: undefined }));
                              }}
                            />
                            Unknown
                          </label>
                        </div>
                        {fieldErrors.earliestDate && <p className="text-sm text-destructive">{fieldErrors.earliestDate}</p>}
                        {earliestYearError && !fieldErrors.earliestDate && <p className="text-sm text-destructive">{earliestYearError}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label>Latest Use</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                          <div className="space-y-1">
                            <Label htmlFor="latest-day" className="text-xs text-muted-foreground">
                              Day
                            </Label>
                            <Input
                              id="latest-day"
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
                                {MONTH_OPTIONS.map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="latest-year" className="text-xs text-muted-foreground">
                              Year
                            </Label>
                            <Input
                              id="latest-year"
                              type="text"
                              inputMode="numeric"
                              placeholder="YYYY"
                              value={latestYear}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                                setLatestYear(v);
                                if (fieldErrors.latestDate) setFieldErrors((p) => ({ ...p, latestDate: undefined }));
                                setLatestYearError(validateYearString(v));
                              }}
                              disabled={latestUnknown}
                              className={latestYearError ? "border-destructive" : ""}
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
                                  setLatestYearError(null);
                                }
                                if (fieldErrors.latestDate) setFieldErrors((p) => ({ ...p, latestDate: undefined }));
                              }}
                            />
                            Unknown
                          </label>
                        </div>
                        {fieldErrors.latestDate && <p className="text-sm text-destructive">{fieldErrors.latestDate}</p>}
                        {latestYearError && !fieldErrors.latestDate && <p className="text-sm text-destructive">{latestYearError}</p>}
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
                          Add extra date ranges with the same date inputs. Saved in submitted data as comma-separated values.
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
                      <Label htmlFor="type">Shape</Label>
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

                    <div className="flex items-center gap-2">
                      <input
                        id="is-irregular"
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={isIrregular}
                        onChange={(e) => setIsIrregular(e.target.checked)}
                      />
                      <Label htmlFor="is-irregular">Is Irregular</Label>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="color">Color</Label>
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
                      <Label htmlFor="date-type">Date type</Label>
                      <Select value={dateType} onValueChange={setDateType}>
                        <SelectTrigger id="date-type">
                          <SelectValue placeholder="Select date type (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {DATE_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild disabled={catalogOptionsLoading}>
                          <Button
                            type="button"
                            variant="outline"
                            className={`w-full justify-start text-left font-normal ${fieldErrors.framing ? "border-destructive" : ""}`}
                          >
                            {catalogOptionsLoading ? "Loading..." : selectedFramingSummary}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-auto">
                          {framingOptions.map((opt) => {
                            const value = String(opt.id);
                            const checked = framingIds.includes(value);
                            return (
                              <DropdownMenuCheckboxItem
                                key={opt.id}
                                checked={checked}
                                onCheckedChange={(next) => {
                                  setFramingIds((prev) => {
                                    if (next) return prev.includes(value) ? prev : [...prev, value];
                                    return prev.filter((id) => id !== value);
                                  });
                                  setFieldErrors((prev) => ({ ...prev, framing: undefined }));
                                }}
                              >
                                {opt.name}
                              </DropdownMenuCheckboxItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className={`w-full justify-between ${fieldErrors.dateFormat ? "border-destructive" : ""}`}
                            disabled={catalogOptionsLoading}
                          >
                            {catalogOptionsLoading ? "Loading..." : selectedDateFormatSummary}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-auto">
                          {dateFormatOptions.map((opt) => {
                            const value = String(opt.id);
                            const checked = dateFormatIds.includes(value);
                            return (
                              <DropdownMenuCheckboxItem
                                key={opt.id}
                                checked={checked}
                                onCheckedChange={(next) => {
                                  setDateFormatIds((prev) => {
                                    if (next) return prev.includes(value) ? prev : [...prev, value];
                                    return prev.filter((id) => id !== value);
                                  });
                                  setFieldErrors((prev) => ({ ...prev, dateFormat: undefined }));
                                }}
                              >
                                {opt.name}
                              </DropdownMenuCheckboxItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {fieldErrors.dateFormat && <p className="text-sm text-destructive">{fieldErrors.dateFormat}</p>}
                    </div>

                    {showDiameter ? (
                      <div className="space-y-2">
                        <Label htmlFor="diameter-mm">Diameter (mm)</Label>
                        <Input
                          id="diameter-mm"
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
                            <Label htmlFor="width-mm">Width (mm)</Label>
                            <Input
                              id="width-mm"
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
                            <Label htmlFor="height-mm">Height (mm)</Label>
                            <Input
                              id="height-mm"
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
                          Optional. If you enter one, enter both. Stored on the catalog as width × height (mm).
                        </p>
                      </>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="inscription-text">Inscription Text</Label>
                      <Textarea
                        id="inscription-text"
                        placeholder="Exact text inscribed on the marking device (abbreviations/annotations)."
                        value={inscriptionText}
                        onChange={(e) => setInscriptionText(e.target.value)}
                        rows={3}
                      />
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

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Reference Works</Label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-between"
                              disabled={referenceWorksLoading}
                            >
                              <span>
                                {referenceWorksLoading
                                  ? "Loading reference works..."
                                  : selectedReferenceWorks.length > 0
                                    ? `${selectedReferenceWorks.length} selected`
                                    : "Select reference works"}
                              </span>
                              <ChevronDown className="h-4 w-4 opacity-60" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-72 overflow-y-auto"
                            align="start"
                          >
                            {referenceWorksError ? (
                              <div className="px-2 py-1.5 text-sm text-destructive">
                                {referenceWorksError}
                              </div>
                            ) : referenceWorks.length === 0 ? (
                              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                No reference works found.
                              </div>
                            ) : (
                              referenceWorks.map((work) => {
                                const checked = selectedReferenceWorks.some((w) => w.id === work.id);
                                return (
                                  <DropdownMenuCheckboxItem
                                    key={work.id}
                                    checked={checked}
                                    onCheckedChange={(next) => {
                                      setPendingReferenceWorkIds([]);
                                      if (next) {
                                        setSelectedReferenceWorks((prev) =>
                                          prev.some((w) => w.id === work.id) ? prev : [...prev, work],
                                        );
                                        setReferenceDetailsById((prev) => ({
                                          ...prev,
                                          [work.id]: prev[work.id] ?? { pageNumber: "", citationUrl: "" },
                                        }));
                                        setReferenceDetailErrorsById((prev) => ({
                                          ...prev,
                                          [work.id]: prev[work.id] ?? {},
                                        }));
                                        return;
                                      }
                                      setSelectedReferenceWorks((prev) => prev.filter((w) => w.id !== work.id));
                                      setReferenceDetailsById((prev) => {
                                        const updated = { ...prev };
                                        delete updated[work.id];
                                        return updated;
                                      });
                                      setReferenceDetailErrorsById((prev) => {
                                        const updated = { ...prev };
                                        delete updated[work.id];
                                        return updated;
                                      });
                                    }}
                                  >
                                    {work.title || `Reference work #${work.id}`}
                                  </DropdownMenuCheckboxItem>
                                );
                              })
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {selectedReferenceWorks.length > 0 && (
                        <div className="space-y-2">
                          {selectedReferenceWorks.map((work) => (
                            <div
                              key={work.id}
                              className="rounded-md border border-border px-3 py-2 space-y-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {work.title || "Untitled"}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {[work.authorship, work.publisher]
                                      .filter((x) => (x ?? "").trim() !== "")
                                      .join(" — ")}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setPendingReferenceWorkIds([]);
                                    setSelectedReferenceWorks((prev) =>
                                      prev.filter((w) => w.id !== work.id),
                                    );
                                    setReferenceDetailsById((prev) => {
                                      const next = { ...prev };
                                      delete next[work.id];
                                      return next;
                                    });
                                    setReferenceDetailErrorsById((prev) => {
                                      const next = { ...prev };
                                      delete next[work.id];
                                      return next;
                                    });
                                  }}
                                >
                                  Remove
                                </Button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label htmlFor={`reference-page-${work.id}`} className="text-xs">
                                    Page number
                                  </Label>
                                  <Input
                                    id={`reference-page-${work.id}`}
                                    placeholder="e.g. 42, plate 3"
                                    value={referenceDetailsById[work.id]?.pageNumber ?? ""}
                                    className={referenceDetailErrorsById[work.id]?.pageNumber ? "border-destructive" : ""}
                                    onChange={(e) =>
                                      {
                                        setReferenceDetailsById((prev) => ({
                                          ...prev,
                                          [work.id]: {
                                            pageNumber: e.target.value,
                                            citationUrl: prev[work.id]?.citationUrl ?? "",
                                          },
                                        }));
                                        setReferenceDetailErrorsById((prev) => ({
                                          ...prev,
                                          [work.id]: {
                                            ...prev[work.id],
                                            pageNumber: undefined,
                                          },
                                        }));
                                      }
                                    }
                                  />
                                  {referenceDetailErrorsById[work.id]?.pageNumber && (
                                    <p className="text-xs text-destructive">
                                      {referenceDetailErrorsById[work.id]?.pageNumber}
                                    </p>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor={`reference-url-${work.id}`} className="text-xs">
                                    Citation URL
                                  </Label>
                                  <Input
                                    id={`reference-url-${work.id}`}
                                    type="url"
                                    placeholder="https://..."
                                    value={referenceDetailsById[work.id]?.citationUrl ?? ""}
                                    className={referenceDetailErrorsById[work.id]?.citationUrl ? "border-destructive" : ""}
                                    onChange={(e) =>
                                      {
                                        setReferenceDetailsById((prev) => ({
                                          ...prev,
                                          [work.id]: {
                                            pageNumber: prev[work.id]?.pageNumber ?? "",
                                            citationUrl: e.target.value,
                                          },
                                        }));
                                        setReferenceDetailErrorsById((prev) => ({
                                          ...prev,
                                          [work.id]: {
                                            ...prev[work.id],
                                            citationUrl: undefined,
                                          },
                                        }));
                                      }
                                    }
                                  />
                                  {referenceDetailErrorsById[work.id]?.citationUrl && (
                                    <p className="text-xs text-destructive">
                                      {referenceDetailErrorsById[work.id]?.citationUrl}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Optional. Select one or more established reference works to associate with this submission.
                      </p>
                    </div>

                    {isStateEditor && (
                      <div className="border-t pt-6 mt-6 space-y-4">
                        <p className="text-sm text-muted-foreground">When approving (adding directly to the catalog), Value and Comment are required.</p>
                        <div className="space-y-2">
                          <Label htmlFor="editor-value">Value (of this postmark)</Label>
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
                          <Label htmlFor="editor-comment">Comment</Label>
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

                    {renderImageUploader(
                      "postmark",
                      "Postmark Images",
                      `PNG, JPG, or TIFF up to ${MAX_IMAGE_SIZE_MB}MB each`,
                      true,
                    )}
                    {renderImageUploader(
                      "ratemark",
                      "Ratemark Images (Optional)",
                      `Upload separate ratemark scans/photos (PNG, JPG, TIFF up to ${MAX_IMAGE_SIZE_MB}MB each).`,
                    )}
                    {renderImageUploader(
                      "auxmark",
                      "Auxmark Images (Optional)",
                      `Upload separate auxiliary mark scans/photos (PNG, JPG, TIFF up to ${MAX_IMAGE_SIZE_MB}MB each).`,
                    )}

                    <Button
                      type="submit"
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={submitting || noAssignedStates}
                    >
                      {submitting ? "Submitting..." : "Submit Postmark"}
                    </Button>
                  </form>

                  <p className="text-xs text-muted-foreground">
                    Required: State, Town/City, Manuscript (Yes/No), and at least one postmark image. Earliest Use requires Day, Month, Year, or Unknown. When approving (adding to catalog), editors must still add Value and Comment.
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
                    <strong className="text-foreground">Reference works:</strong> Include references when available to help verification.
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