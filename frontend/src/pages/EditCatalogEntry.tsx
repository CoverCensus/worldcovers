import { useState, useEffect, useRef, useMemo } from "react";
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
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { getMarkingByIdRaw, normalizeImageUrl } from "@/services/markings";
import { getColors, type ColorOption } from "@/services/colors";
import { getRegions, getAssignedRegions, type StateOption } from "@/services/regions";
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
import { getReferenceWorks, type ReferenceWorkRecord } from "@/services/referenceWorks";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

function getApiBaseUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  return env.trim().replace(/\/+$/, "");
}

const MAX_IMAGE_SIZE_MB = 100;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/tiff"];

const STATE_OTHER_VALUE = "__other__";
const COLOR_OTHER_VALUE = "__other__";

const IMPRESSION_OPTIONS = [
  { value: "Normal", label: "Normal" },
  { value: "Stencil", label: "Stencil" },
  { value: "Negative", label: "Negative" },
];

const MARKING_TYPE_OPTIONS = [
  { value: "TOWNMARK", label: "Town mark" },
  { value: "RATEMARK", label: "Rate mark" },
  { value: "AUXMARK", label: "Auxiliary/Instructional Mark" },
];

const MIN_YEAR = 1661;
const CURRENT_YEAR = new Date().getFullYear();

type ObservedDate = {
  month: string;
  day: string;
  year: string;
};

function observedDateToIso(d: ObservedDate): string {
  const yy = d.year.trim();
  if (!yy) return "";
  const mRaw = d.month.trim();
  const dRaw = d.day.trim();
  const mm = mRaw.padStart(2, "0");
  const dd = dRaw.padStart(2, "0");
  const mNum = Number(mm);
  if (
    mm.length === 2 &&
    dd.length === 2 &&
    !Number.isNaN(mNum) &&
    mNum >= 1 &&
    mNum <= 12
  ) {
    return `${yy}-${mm}-${dd}`;
  }
  return yy;
}

function isoToObservedDate(raw: unknown): ObservedDate | null {
  const s = String(raw ?? "").slice(0, 10);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return { year: y, month: m, day: d };
  }
  const y = s.match(/^(\d{4})/);
  return y ? { year: y[1], month: "", day: "" } : null;
}

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
type UploadedImageTag = "mark" | "cover" | "tracing" | "";
const PAGE_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9\s\-–—.,:;()/#]*$/;

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
        // Ignore malformed legacy payloads.
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
  const out: Record<number, ReferenceDetailInput> = {};
  for (const row of list as unknown[]) {
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
  const postmarkFileInputRef = useRef<HTMLInputElement>(null);
  const ratemarkFileInputRef = useRef<HTMLInputElement>(null);
  const auxmarkFileInputRef = useRef<HTMLInputElement>(null);

  const postmarkId = id ? parseInt(String(id).replace(/^api-/, ""), 10) : null;

  const [colorOptions, setColorOptions] = useState<ColorOption[]>([]);
  const [stateOptions, setStateOptions] = useState<StateOption[]>([]);
  const [shapeOptions, setShapeOptions] = useState<ShapeOption[]>([]);
  const [postOffices, setPostOffices] = useState<PostOfficeOption[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [stateOptionsError, setStateOptionsError] = useState<string | null>(null);
  const [loadingShapes, setLoadingShapes] = useState(true);
  const [shapeOptionsError, setShapeOptionsError] = useState<string | null>(null);
  const [loadingTowns, setLoadingTowns] = useState(false);
  const [townOptionsError, setTownOptionsError] = useState<string | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(true);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [markingType, setMarkingType] = useState("");
  const [rateValue, setRateValue] = useState("");
  const [rateText, setRateText] = useState("");
  const [state, setState] = useState("");
  const [stateOther, setStateOther] = useState("");
  const [town, setTown] = useState("");
  // Dates Observed: list of single date entries (Month/Day/Year as numbers).
  // Backend still receives firstSeen/lastSeen plus a dates_observed string.
  const [observedDates, setObservedDates] = useState<ObservedDate[]>([
    { month: "", day: "", year: "" },
  ]);
  const [shape, setShape] = useState("");
  const [color, setColor] = useState("");
  const [colorOther, setColorOther] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [diameterMm, setDiameterMm] = useState("");
  const [manuscript, setManuscript] = useState("No");
  const [isIrregular, setIsIrregular] = useState(false);
  const [impression, setImpression] = useState("Normal");
  const [inscriptionText, setInscriptionText] = useState("");
  const [description, setDescription] = useState("");
  // Contributor -> editor note for suggestions/corrections
  const [contributorComment, setContributorComment] = useState("");
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [postmarkImageFiles, setPostmarkImageFiles] = useState<File[]>([]);
  const [postmarkImagePreviews, setPostmarkImagePreviews] = useState<string[]>([]);
  const [postmarkImageTags, setPostmarkImageTags] = useState<UploadedImageTag[]>([]);
  const [ratemarkImageFiles, setRatemarkImageFiles] = useState<File[]>([]);
  const [ratemarkImagePreviews, setRatemarkImagePreviews] = useState<string[]>([]);
  const [ratemarkImageTags, setRatemarkImageTags] = useState<UploadedImageTag[]>([]);
  const [auxmarkImageFiles, setAuxmarkImageFiles] = useState<File[]>([]);
  const [auxmarkImagePreviews, setAuxmarkImagePreviews] = useState<string[]>([]);
  const [auxmarkImageTags, setAuxmarkImageTags] = useState<UploadedImageTag[]>([]);
  const [letteringId, setLetteringId] = useState("");
  const [framingIds, setFramingIds] = useState<string[]>([]);
  const [dateFormatIds, setDateFormatIds] = useState<string[]>([]);
  const [letteringOptions, setLetteringOptions] = useState<LetteringOption[]>([]);
  const [framingOptions, setFramingOptions] = useState<FramingOption[]>([]);
  const [dateFormatOptions, setDateFormatOptions] = useState<DateFormatOption[]>([]);
  const [referenceWorks, setReferenceWorks] = useState<ReferenceWorkRecord[]>([]);
  const [selectedReferenceWorks, setSelectedReferenceWorks] = useState<ReferenceWorkRecord[]>([]);
  const [pendingReferenceWorkIds, setPendingReferenceWorkIds] = useState<number[]>([]);
  const [referenceDetailsById, setReferenceDetailsById] = useState<Record<number, ReferenceDetailInput>>({});
  const [referenceDetailErrorsById, setReferenceDetailErrorsById] = useState<Record<number, ReferenceDetailFieldErrors>>({});
  const [referenceWorksLoading, setReferenceWorksLoading] = useState(false);
  const [referenceWorksError, setReferenceWorksError] = useState<string | null>(null);
  const [referenceWorksFetched, setReferenceWorksFetched] = useState(false);
  const [catalogOptionsLoading, setCatalogOptionsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    state?: string;
    town?: string;
    observedDates?: string;
    shape?: string;
    color?: string;
    inscriptionText?: string;
    widthMm?: string;
    heightMm?: string;
    diameterMm?: string;
    lettering?: string;
    dateFormat?: string;
    imageTags?: string;
  }>({});

  /** Town/City: letters, spaces, hyphens, apostrophes only */
  const sanitizeTown = (v: string) => v.replace(/[^a-zA-Z\s\-']/g, "");
  useEffect(() => {
    getColors()
      .then(setColorOptions)
      .catch(() => setColorOptions([{ id: 0, name: "Black", value: "" }]));
  }, []);

  useEffect(() => {
    if (color.trim()) return;
    const black = colorOptions.find((c) => c.name.trim().toLowerCase() === "black");
    if (black) setColor(black.name);
  }, [colorOptions, color]);

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
    const loadStates = async () => {
      try {
        const isStateEditor = user?.role === "editor" || user?.role === "administrator" || !!user?.is_superuser;
        if (isStateEditor) {
          const assignedStates = await getAssignedRegions().catch(() => []);
          if (assignedStates.length > 0) {
            setStateOptions(assignedStates);
            return;
          }
          const assignedOnlyStates = await getRegions(true);
          setStateOptions(assignedOnlyStates);
          return;
        }
        const allStates = await getRegions();
        setStateOptions(allStates);
      } catch (err) {
        setStateOptionsError(err instanceof Error ? err.message : "Failed to load states");
        setStateOptions([]);
      } finally {
        setLoadingStates(false);
      }
    };
    void loadStates();
  }, [user?.role]);

  useEffect(() => {
    setLoadingShapes(true);
    setShapeOptionsError(null);
    getShapes()
      .then(setShapeOptions)
      .catch((err) => {
        setShapeOptionsError(err instanceof Error ? err.message : "Failed to load postmark shapes");
        setShapeOptions([]);
      })
      .finally(() => setLoadingShapes(false));
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
    if (referenceWorksFetched || referenceWorksLoading) return;
    setReferenceWorksLoading(true);
    setReferenceWorksError(null);
    getReferenceWorks()
      .then((rows) => {
        setReferenceWorks(rows);
        setReferenceWorksFetched(true);
      })
      .catch((err) => {
        setReferenceWorksError(err instanceof Error ? err.message : "Failed to load reference works");
      })
      .finally(() => setReferenceWorksLoading(false));
  }, [referenceWorksFetched, referenceWorksLoading]);

  useEffect(() => {
    if (pendingReferenceWorkIds.length === 0 || referenceWorks.length === 0) return;
    const mapped = pendingReferenceWorkIds
      .map((id) => referenceWorks.find((w) => w.id === id))
      .filter((w): w is ReferenceWorkRecord => Boolean(w));
    if (mapped.length > 0) {
      setSelectedReferenceWorks(mapped);
    }
    setPendingReferenceWorkIds([]);
  }, [pendingReferenceWorkIds, referenceWorks]);

  useEffect(() => {
    if (postmarkId == null || isNaN(postmarkId)) {
      setLoadingRecord(false);
      setRecordError("Invalid record ID");
      return;
    }
    let cancelled = false;
    setLoadingRecord(true);
    setRecordError(null);
    getMarkingByIdRaw(postmarkId)
      .then((data) => {
        if (cancelled || !data) {
          if (!data) setRecordError("Record not found");
          return;
        }
        const existingUrls = Array.isArray(data.images)
          ? (data.images as unknown[])
              .map((img) => {
                const o = img as Record<string, unknown>;
                const url = typeof o.image_url === "string" ? o.image_url : null;
                return normalizeImageUrl(url);
              })
              .filter((u: string | null): u is string => !!u)
          : [];

        setExistingImageUrls(existingUrls);

        const typeRaw = String(data.type ?? "").trim().toUpperCase();
        if (typeRaw === "RATEMARK") setMarkingType("RATEMARK");
        else if (typeRaw === "AUXMARK") setMarkingType("AUXMARK");
        else setMarkingType("TOWNMARK");

        setState(typeof data.state === "string" ? data.state : "");
        setTown(sanitizeTown(typeof data.town === "string" ? data.town : ""));
        setObservedDates([{ month: "", day: "", year: "" }]);

        const shapeName = typeof data.shape_name === "string" ? data.shape_name : "";
        if (shapeName) {
          setShape(shapeName);
        } else if (data.shape != null) {
          const shapeById = shapeOptions.find((opt) => String(opt.id) === String(data.shape));
          setShape(shapeById?.name ?? "");
        } else {
          setShape("");
        }
        setColor(typeof data.color_name === "string" ? data.color_name : "");
        setWidthMm(String(data.width ?? "").replace(/[^0-9.]/g, ""));
        setHeightMm(String(data.height ?? "").replace(/[^0-9.]/g, ""));
        setManuscript(Boolean(data.is_manuscript) ? "Yes" : "No");
        setIsIrregular(Boolean(data.is_irreg));
        const impressionRaw = String(data.impression ?? "").trim();
        const normalizedImpression = impressionRaw
          ? IMPRESSION_OPTIONS.find((opt) => opt.value.toLowerCase() === impressionRaw.toLowerCase())?.value
          : undefined;
        setImpression(normalizedImpression ?? "Normal");
        setInscriptionText(typeof data.inscription_txt === "string" ? data.inscription_txt : "");
        setDescription(typeof data.desc === "string" ? data.desc : "");
        setPendingReferenceWorkIds([]);
        setReferenceDetailsById({});

        setLetteringId(data.lettering != null ? String(data.lettering) : "");
        setFramingIds([]);
        const dateFmt = String(data.date_fmt ?? "").trim();
        if (dateFmt) {
          const byCode = dateFormatOptions.find(
            (opt) => String(opt.description ?? "").trim().toLowerCase() === dateFmt.toLowerCase()
              || String(opt.name).trim().toLowerCase() === dateFmt.toLowerCase()
          );
          setDateFormatIds(byCode ? [String(byCode.id)] : []);
        } else {
          setDateFormatIds([]);
        }
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
  }, [postmarkId, dateFormatOptions, letteringOptions, shapeOptions]);

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

  const selectedPostOfficeId = useMemo(() => {
    const normalizedState = state.trim().toLowerCase();
    const normalizedTown = town.trim().toLowerCase();
    if (!normalizedState || !normalizedTown) return null;
    const matched = postOffices.find((facility) => {
      const facilityState = (facility.state || "").trim().toLowerCase();
      const facilityTown = (facility.town || "").trim().toLowerCase();
      return facilityState === normalizedState && facilityTown === normalizedTown;
    });
    return matched?.id ?? null;
  }, [postOffices, state, town]);

  const inscriptionLabel = useMemo(() => {
    const t = markingType.trim().toLowerCase();
    if (t === "rate mark") return "Ratemark Text";
    if (t === "auxiliary/instructional mark") return "Auxmark Text";
    if (t === "town mark") return "Townmark Text";
    return "Inscription Text";
  }, [markingType]);

  const normalizedMarkingType = useMemo(() => markingType.trim().toLowerCase(), [markingType]);
  const isTownmark = normalizedMarkingType === "town mark";
  const isRatemark = normalizedMarkingType === "rate mark";
  const isAuxmark = normalizedMarkingType === "auxiliary/instructional mark";
  const isHandstamped = manuscript !== "Yes";
  const showShapeField = isHandstamped;
  const showDateFormatField = isHandstamped && isTownmark;
  const showRateValueField = isRatemark;
  const showAnythingElseSection = isHandstamped && (isTownmark || isRatemark || isAuxmark);
  const isCircularShape = isCircularType(shape.trim());

  const appendCategoryFiles = (category: ImageCategory, files: File[]) => {
    if (files.length === 0) return;
    if (category === "postmark") {
      setPostmarkImageFiles((prev) => [...prev, ...files]);
      setPostmarkImageTags((prev) => [...prev, ...files.map(() => "" as UploadedImageTag)]);
    }
    if (category === "ratemark") {
      setRatemarkImageFiles((prev) => [...prev, ...files]);
      setRatemarkImageTags((prev) => [...prev, ...files.map(() => "" as UploadedImageTag)]);
    }
    if (category === "auxmark") {
      setAuxmarkImageFiles((prev) => [...prev, ...files]);
      setAuxmarkImageTags((prev) => [...prev, ...files.map(() => "" as UploadedImageTag)]);
    }
  };

  const appendCategoryPreviews = (category: ImageCategory, previews: string[]) => {
    if (category === "postmark") setPostmarkImagePreviews((prev) => [...prev, ...previews]);
    if (category === "ratemark") setRatemarkImagePreviews((prev) => [...prev, ...previews]);
    if (category === "auxmark") setAuxmarkImagePreviews((prev) => [...prev, ...previews]);
  };

  const processImageFiles = (category: ImageCategory, files: File[]) => {
    const toAdd: File[] = [];
    const rejectedType: string[] = [];
    const rejectedSize: string[] = [];
    for (const file of files) {
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
    if (toAdd.length === 0) return;
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
  };

  const handleImageChange = (category: ImageCategory, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    processImageFiles(category, Array.from(files));
    e.target.value = "";
  };

  const removeImageAt = (category: ImageCategory, index: number) => {
    if (category === "postmark") {
      setPostmarkImageFiles((prev) => prev.filter((_, i) => i !== index));
      setPostmarkImagePreviews((prev) => prev.filter((_, i) => i !== index));
      setPostmarkImageTags((prev) => prev.filter((_, i) => i !== index));
      if (postmarkFileInputRef.current) postmarkFileInputRef.current.value = "";
    }
    if (category === "ratemark") {
      setRatemarkImageFiles((prev) => prev.filter((_, i) => i !== index));
      setRatemarkImagePreviews((prev) => prev.filter((_, i) => i !== index));
      setRatemarkImageTags((prev) => prev.filter((_, i) => i !== index));
      if (ratemarkFileInputRef.current) ratemarkFileInputRef.current.value = "";
    }
    if (category === "auxmark") {
      setAuxmarkImageFiles((prev) => prev.filter((_, i) => i !== index));
      setAuxmarkImagePreviews((prev) => prev.filter((_, i) => i !== index));
      setAuxmarkImageTags((prev) => prev.filter((_, i) => i !== index));
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

  const getCategoryTags = (category: ImageCategory) => {
    if (category === "postmark") return postmarkImageTags;
    if (category === "ratemark") return ratemarkImageTags;
    return auxmarkImageTags;
  };

  const setCategoryTagAt = (category: ImageCategory, index: number, value: UploadedImageTag) => {
    if (category === "postmark") {
      setPostmarkImageTags((prev) => prev.map((t, i) => (i === index ? value : t)));
    } else if (category === "ratemark") {
      setRatemarkImageTags((prev) => prev.map((t, i) => (i === index ? value : t)));
    } else {
      setAuxmarkImageTags((prev) => prev.map((t, i) => (i === index ? value : t)));
    }
    if (fieldErrors.imageTags) {
      setFieldErrors((prev) => ({ ...prev, imageTags: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const stateVal = state === STATE_OTHER_VALUE ? stateOther.trim() : state.trim();
    const townVal = town.trim();
    const isManuscriptSelected = manuscript === "Yes";
    const shapeVal = isManuscriptSelected ? "" : shape.trim();
    const typeVal = markingType.trim();
    const shapeIdVal = shapeOptions.find(
      (opt) => String(opt.name).trim().toLowerCase() === shapeVal.toLowerCase()
    )?.id;
    const colorVal = color === COLOR_OTHER_VALUE ? colorOther.trim() : color.trim();
    const colorIdVal = colorOptions.find(
      (c) => c.name.trim().toLowerCase() === colorVal.toLowerCase()
    )?.id;
    const isCircular = isCircularType(shapeVal);

    const errors: typeof fieldErrors = {};
    if (!stateVal) {
      errors.state = "State is required";
    }
    if (!townVal) {
      errors.town = "Town/City is required";
    }
    if (!isManuscriptSelected && !shapeVal) {
      errors.shape = "Shape is required when Manuscript is No";
    }
    if (!inscriptionText.trim()) {
      errors.inscriptionText = `${inscriptionLabel} is required`;
    }

    // Dates Observed: at least the first entry must have a year, month, or day.
    const firstDate = observedDates[0];
    if (
      !firstDate ||
      (!firstDate.month.trim() && !firstDate.day.trim() && !firstDate.year.trim())
    ) {
      errors.observedDates = "Enter at least one date";
    } else {
      for (const od of observedDates) {
        if (!od.month.trim() && !od.day.trim() && !od.year.trim()) continue;
        const yErr = getYearError(od.year, { required: false, label: "Year" });
        if (yErr) {
          errors.observedDates = yErr;
          break;
        }
        if (od.month.trim()) {
          const m = Number(od.month);
          if (Number.isNaN(m) || m < 1 || m > 12) {
            errors.observedDates = "Month must be between 1 and 12";
            break;
          }
        }
        if (od.day.trim()) {
          const d = Number(od.day);
          if (Number.isNaN(d) || d < 1 || d > 31) {
            errors.observedDates = "Day must be between 1 and 31";
            break;
          }
        }
      }
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

    const effectiveHeight = isCircular ? widthMm : heightMm;
    const mmErr = validateMmPair(widthMm, effectiveHeight);
    if (mmErr.width) errors.widthMm = mmErr.width;
    if (mmErr.height && !isCircular) errors.heightMm = mmErr.height;
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const validIsoDates = observedDates
      .map(observedDateToIso)
      .filter((s) => s.length > 0);
    const datesObservedToSend = validIsoDates.length > 1
      ? validIsoDates.slice(1).join(", ")
      : "";
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
        description: "VITE_API_URL is not set. Cannot submit.",
        variant: "destructive",
      });
      return;
    }

    const allImageFiles = [...postmarkImageFiles, ...ratemarkImageFiles, ...auxmarkImageFiles];
    const allImageTags = [...postmarkImageTags, ...ratemarkImageTags, ...auxmarkImageTags];
    if (allImageFiles.length > 0 && allImageTags.some((tag) => !String(tag).trim())) {
      setFieldErrors((prev) => ({ ...prev, imageTags: "Select a tag for each uploaded image." }));
      toast({
        title: "Image tag required",
        description: "Tag every uploaded image as mark, cover, or tracing.",
        variant: "destructive",
      });
      return;
    }
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
      let headers: Record<string, string> = {};

      const firstSeenToSend = validIsoDates[0] ?? "";
      const lastSeenToSend =
        validIsoDates.length > 1
          ? validIsoDates[validIsoDates.length - 1]
          : firstSeenToSend;
      const derivedDimensions = (() => {
        const w = widthMm.trim();
        const h = isCircular ? w : heightMm.trim();
        if (w && h) return `${w}×${h} mm`;
        return "";
      })();
      const descriptionToSend = description.trim();
      const inscriptionToSend = inscriptionText.trim();

      if (allImageFiles.length > 0) {
        const form = new FormData();
        form.append("editPostmarkId", String(postmarkId!));
        if (selectedPostOfficeId != null) form.append("post_office_id", String(selectedPostOfficeId));
        form.append("state", stateVal);
        form.append("town", townVal);
        if (typeVal) form.append("type", typeVal);
        form.append("firstSeen", firstSeenToSend);
        form.append("lastSeen", lastSeenToSend);
        if (firstSeenToSend) form.append("date_seen", firstSeenToSend);
        if (datesObservedToSend) form.append("dates_observed", datesObservedToSend);
        if (!isManuscriptSelected) form.append("shape", shapeVal);
        if (!isManuscriptSelected && shapeIdVal != null) form.append("shape_id", String(shapeIdVal));
        if (colorIdVal != null) form.append("color_id", String(colorIdVal));
        form.append("color", colorVal);
        if (!isManuscriptSelected && letteringId) form.append("lettering_style_id", letteringId);
        if (!isManuscriptSelected && letteringId) form.append("lettering_id", letteringId);
        if (framingIds.length > 0) {
          form.append("framing_style_id", framingIds[0]);
          framingIds.forEach((id) => form.append("framing_style_ids[]", id));
        }
        if (dateFormatIds.length > 0) {
          form.append("date_format_id", dateFormatIds[0]);
          if (showDateFormatField) form.append("date_fmt", dateFormatIds[0]);
          dateFormatIds.forEach((id) => form.append("date_format_ids[]", id));
        }
        if (derivedDimensions) form.append("dimensions", derivedDimensions);
        if (manuscript.trim()) form.append("manuscript", manuscript.trim());
        form.append("is_manuscript", String(isManuscriptSelected));
        if (!isManuscriptSelected) {
          form.append("is_irreg", String(isIrregular));
          if (impression.trim()) form.append("impression", impression.trim());
        }
        if (inscriptionToSend) form.append("inscription_txt", inscriptionToSend);
        if (showRateValueField && rateValue.trim()) form.append("rate_val", rateValue.trim());
        if (descriptionToSend) {
          form.append("desc", descriptionToSend);
        }
        if (referencesToSend) form.append("references", referencesToSend);
        referenceWorkIdsToSend.forEach((id) => form.append("reference_work_ids[]", String(id)));
        if (referenceWorkDetailsToSend.length > 0) {
          form.append("reference_work_details", JSON.stringify(referenceWorkDetailsToSend));
        }
        if (contributorComment.trim()) {
          form.append("contributorComment", contributorComment.trim());
          form.append("contributor_comment", contributorComment.trim());
          form.append("commentForEditor", contributorComment.trim());
          form.append("comment_for_editor", contributorComment.trim());
        }
        if (submitterName) form.append("submitterName", submitterName);
        for (const file of postmarkImageFiles) form.append("marking_image", file, file.name);
        for (const file of ratemarkImageFiles) form.append("marking_image", file, file.name);
        for (const file of auxmarkImageFiles) form.append("marking_image", file, file.name);
        form.append(
          "marking_image_tags",
          JSON.stringify([...postmarkImageTags, ...ratemarkImageTags, ...auxmarkImageTags])
        );
        body = form;
      } else {
        body = JSON.stringify({
          editPostmarkId: postmarkId!,
          post_office_id: selectedPostOfficeId ?? undefined,
          state: stateVal,
          town: townVal,
          type: typeVal || undefined,
          firstSeen: firstSeenToSend,
          lastSeen: lastSeenToSend,
          date_seen: firstSeenToSend || undefined,
          dates_observed: datesObservedToSend || undefined,
          shape: isManuscriptSelected ? null : shapeVal,
          shape_id: isManuscriptSelected ? null : shapeIdVal ?? null,
          color: colorVal,
          color_id: colorIdVal ?? undefined,
          lettering_style_id: isManuscriptSelected ? null : letteringId ? Number(letteringId) : undefined,
          lettering_id: isManuscriptSelected ? null : letteringId ? Number(letteringId) : undefined,
          framing_style_id: framingIds[0] ? Number(framingIds[0]) : undefined,
          framing_style_ids: framingIds.length > 0 ? framingIds.map((id) => Number(id)) : undefined,
          date_format_id: dateFormatIds[0] ? Number(dateFormatIds[0]) : undefined,
          date_fmt: showDateFormatField && dateFormatIds[0] ? Number(dateFormatIds[0]) : undefined,
          date_format_ids: dateFormatIds.length > 0 ? dateFormatIds.map((id) => Number(id)) : undefined,
          dimensions: derivedDimensions || undefined,
          manuscript: manuscript.trim() || undefined,
          is_manuscript: isManuscriptSelected,
          is_irreg: isManuscriptSelected ? null : isIrregular,
          impression: isManuscriptSelected ? null : impression.trim() || undefined,
          rate_val: showRateValueField ? rateValue.trim() || undefined : undefined,
          inscription_txt: inscriptionToSend || undefined,
          desc: descriptionToSend || undefined,
          references: referencesToSend || undefined,
          reference_work_ids: referenceWorkIdsToSend.length > 0 ? referenceWorkIdsToSend : undefined,
          reference_work_details: referenceWorkDetailsToSend.length > 0 ? referenceWorkDetailsToSend : undefined,
          marking_image_tags: [
            ...postmarkImageTags,
            ...ratemarkImageTags,
            ...auxmarkImageTags,
          ],
          ...(contributorComment.trim()
            ? {
                contributorComment: contributorComment.trim(),
                contributor_comment: contributorComment.trim(),
                commentForEditor: contributorComment.trim(),
                comment_for_editor: contributorComment.trim(),
              }
            : {}),
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
      const contributionId = (result as any)?.contributionId as number | undefined;
      toast({
        title: "Submitted for review",
        description:
          "Changes to master listing fields are submitted for editor approval and do not update the catalog directly.",
      });

      const fromDashboard = location.state?.fromDashboard;
      const fromDashboardDirect = location.state?.fromDashboardDirect;
      const fromDashboardViaDetail = location.state?.fromDashboardViaDetail;
      const fromSearch = location.state?.fromSearch;

      if (contributionId) {
        navigate(`/contribution/${contributionId}`, { state: { fromDashboard: true } });
      } else if (fromDashboardDirect || fromDashboard || fromDashboardViaDetail) {
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

  const renderImageUploader = (
    category: ImageCategory,
    label: string,
    helperText: string,
    includeExisting = false,
  ) => {
    const inputRef = getCategoryInputRef(category);
    const files = getCategoryFiles(category);
    const previews = getCategoryPreviews(category);
    const tags = getCategoryTags(category);
    const hasExisting = includeExisting && existingImageUrls.length > 0;

    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        {fieldErrors.imageTags && <p className="text-sm text-destructive">{fieldErrors.imageTags}</p>}
        {hasExisting && (
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
            {previews.length === 0 && (
              <p className="text-sm text-muted-foreground">Add more images below (optional).</p>
            )}
          </div>
        )}
        <Label className={hasExisting ? "mt-4 block" : ""}>
          {hasExisting ? "Add more images" : "Upload images (optional, multiple allowed)"}
        </Label>
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
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            if (files.length) processImageFiles(category, files);
          }}
          className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
        >
          {previews.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {previews.map((preview, i) => (
                  <div key={i} className="relative rounded border bg-muted/30 overflow-hidden">
                    <img src={preview} alt={`New image ${i + 1}`} className="w-full aspect-square object-contain max-h-32" />
                    <p className="text-xs text-muted-foreground truncate px-2 py-1">{files[i]?.name}</p>
                    <div className="px-2 pb-2">
                      <Select
                        value={tags[i] ?? ""}
                        onValueChange={(value) => setCategoryTagAt(category, i, value as UploadedImageTag)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Tag: mark/cover/tracing" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mark">mark</SelectItem>
                          <SelectItem value="cover">cover</SelectItem>
                          <SelectItem value="tracing">tracing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                {hasExisting
                  ? "Click to add more images (optional)"
                  : "Click to upload or drag and drop (optional, multiple allowed)"}
              </p>
              <p className="text-xs text-muted-foreground">{helperText}</p>
            </>
          )}
        </div>
      </div>
    );
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
              Edit requests are prefilled from the selected record and always go through the approval workflow before master listing data is updated.
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
                      <Label htmlFor="edit-marking-type">Marking Type</Label>
                      <Select value={markingType} onValueChange={setMarkingType}>
                        <SelectTrigger id="edit-marking-type">
                          <SelectValue placeholder="Select marking type..." />
                        </SelectTrigger>
                        <SelectContent>
                          {MARKING_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id="edit-manuscript"
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={manuscript === "Yes"}
                        onChange={(e) => {
                          const next = e.target.checked ? "Yes" : "No";
                          setManuscript(next);
                          if (next === "Yes") {
                            setShape("");
                            setLetteringId("");
                            setImpression("Normal");
                            setIsIrregular(false);
                            setFieldErrors((p) => ({ ...p, shape: undefined }));
                          }
                        }}
                      />
                      <Label htmlFor="edit-manuscript">Manuscript</Label>
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
                      <Label htmlFor="edit-inscription-text">{inscriptionLabel}</Label>
                      <Textarea
                        id="edit-inscription-text"
                        placeholder="Exact text inscribed on the marking device (abbreviations/annotations)."
                        value={inscriptionText}
                        onChange={(e) => {
                          setInscriptionText(e.target.value);
                          if (fieldErrors.inscriptionText) {
                            setFieldErrors((prev) => ({ ...prev, inscriptionText: undefined }));
                          }
                        }}
                        rows={3}
                        className={fieldErrors.inscriptionText ? "border-destructive" : ""}
                      />
                      {fieldErrors.inscriptionText && (
                        <p className="text-sm text-destructive">{fieldErrors.inscriptionText}</p>
                      )}
                    </div>

                    {showShapeField && (
                    <div className="space-y-2">
                      <Label htmlFor="edit-shape">
                        Shape <span className="text-destructive" aria-hidden="true">*</span>
                      </Label>
                      <SearchableSelect
                        id="edit-shape"
                        value={shape}
                        onValueChange={(value) => {
                          setShape(value);
                          if (fieldErrors.shape) {
                            setFieldErrors((prev) => ({ ...prev, shape: undefined }));
                          }
                        }}
                        placeholder="Select shape..."
                        options={shapeOptions.map((t) => ({ value: t.name, label: t.name }))}
                        loading={loadingShapes}
                        error={!!shapeOptionsError}
                        errorMessage={shapeOptionsError ?? "Failed to load postmark shapes"}
                        searchPlaceholder="Search shapes..."
                        emptyMessage="No shape found."
                        aria-label="Postmark shape"
                        triggerClassName={fieldErrors.shape ? "border-destructive" : ""}
                      />
                      {fieldErrors.shape && (
                        <p className="text-sm text-destructive">{fieldErrors.shape}</p>
                      )}
                    </div>
                    )}

                    {showAnythingElseSection && <div className="flex items-center gap-2">
                      <input
                        id="edit-is-irregular"
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={isIrregular}
                        onChange={(e) => setIsIrregular(e.target.checked)}
                      />
                      <Label htmlFor="edit-is-irregular">Is Irregular</Label>
                    </div>}

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
                      <div className="flex items-center justify-between gap-2">
                        <Label>Dates Observed</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setObservedDates((prev) => [
                              ...prev,
                              { month: "", day: "", year: "" },
                            ])
                          }
                        >
                          Add Date
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {observedDates.map((entry, idx) => (
                          <div
                            key={idx}
                            className="space-y-2 rounded-md border border-border p-3"
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-muted-foreground">
                                Date {idx + 1}
                              </p>
                              {observedDates.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setObservedDates((prev) =>
                                      prev.filter((_, i) => i !== idx),
                                    )
                                  }
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Month</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="MM"
                                  value={entry.month}
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                                    setObservedDates((prev) =>
                                      prev.map((p, i) =>
                                        i === idx ? { ...p, month: v } : p,
                                      ),
                                    );
                                    if (fieldErrors.observedDates) {
                                      setFieldErrors((prev) => ({
                                        ...prev,
                                        observedDates: undefined,
                                      }));
                                    }
                                  }}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Day</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="DD"
                                  value={entry.day}
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                                    setObservedDates((prev) =>
                                      prev.map((p, i) =>
                                        i === idx ? { ...p, day: v } : p,
                                      ),
                                    );
                                    if (fieldErrors.observedDates) {
                                      setFieldErrors((prev) => ({
                                        ...prev,
                                        observedDates: undefined,
                                      }));
                                    }
                                  }}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Year</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="YYYY"
                                  value={entry.year}
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                                    setObservedDates((prev) =>
                                      prev.map((p, i) =>
                                        i === idx ? { ...p, year: v } : p,
                                      ),
                                    );
                                    if (fieldErrors.observedDates) {
                                      setFieldErrors((prev) => ({
                                        ...prev,
                                        observedDates: undefined,
                                      }));
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {fieldErrors.observedDates && (
                        <p className="text-sm text-destructive">{fieldErrors.observedDates}</p>
                      )}
                    </div>

                    {showDateFormatField && <div className="space-y-2">
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
                    </div>}
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

                    {showRateValueField && <div className="space-y-2">
                      <Label htmlFor="edit-rate-value">Rate Value</Label>
                      <Input
                        id="edit-rate-value"
                        type="text"
                        placeholder="e.g. 5"
                        value={rateValue}
                        onChange={(e) => setRateValue(e.target.value)}
                      />
                    </div>}

                    {showRateValueField && <div className="space-y-2">
                      <Label htmlFor="edit-rate-text">Rate Text</Label>
                      <Input
                        id="edit-rate-text"
                        type="text"
                        placeholder="Text appearing on the rate mark"
                        value={rateText}
                        onChange={(e) => setRateText(e.target.value)}
                      />
                    </div>}

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
                      {!isCircularShape && <div className="space-y-2">
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
                      </div>}
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Optional. If circular shape is selected, height is auto-saved as width.
                    </p>

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="edit-reference-works">Reference Works</Label>
                        <SearchableMultiSelect
                          id="edit-reference-works"
                          values={selectedReferenceWorks.map((work) => String(work.id))}
                          onValuesChange={(values) => {
                            setPendingReferenceWorkIds([]);
                            const next = values
                              .map((value) => referenceWorks.find((work) => String(work.id) === value))
                              .filter((work): work is ReferenceWorkRecord => Boolean(work));
                            const nextIds = new Set(next.map((work) => work.id));
                            setSelectedReferenceWorks(next);
                            setReferenceDetailsById((prev) => {
                              const updated: Record<number, ReferenceDetailInput> = {};
                              for (const work of next) {
                                updated[work.id] = prev[work.id] ?? { pageNumber: "", citationUrl: "" };
                              }
                              return updated;
                            });
                            setReferenceDetailErrorsById((prev) => {
                              const updated: Record<number, ReferenceDetailFieldErrors> = {};
                              for (const [key, value] of Object.entries(prev)) {
                                const id = Number(key);
                                if (!Number.isNaN(id) && nextIds.has(id)) {
                                  updated[id] = value;
                                }
                              }
                              return updated;
                            });
                          }}
                          options={referenceWorks.map((work) => ({
                            value: String(work.id),
                            label: work.title || `Reference work #${work.id}`,
                          }))}
                          loading={referenceWorksLoading}
                          placeholder="Select reference works"
                          searchPlaceholder="Search reference works..."
                          emptyMessage={referenceWorksError ?? "No reference works found."}
                          aria-label="Reference works"
                        />
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
                                    onChange={(e) => {
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
                                    }}
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
                                    onChange={(e) => {
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
                                    }}
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

                    {showAnythingElseSection && <div className="space-y-2">
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
                    </div>}

                    {showAnythingElseSection && <div className="space-y-2">
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
                    </div>}

                    {renderImageUploader(
                      "postmark",
                      "Postmark Images (Optional)",
                      `PNG, JPG, or TIFF up to ${MAX_IMAGE_SIZE_MB}MB each`,
                      true,
                    )}

                    <Button
                      type="submit"
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={submitting}
                    >
                      {submitting ? "Submitting..." : "Submit for Approval"}
                    </Button>
                  </form>

                  <p className="text-xs text-muted-foreground">
                    Required: State, Town/City, and at least one entry under Dates Observed.
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
                  <p className="leading-relaxed">
                    Changes to master listing fields never apply directly from this screen. Every edit is submitted as
                    a contribution and updates the catalog only after approval.
                  </p>
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
