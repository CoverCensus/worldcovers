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
import { useNavigate, useLocation, useSearchParams, useParams } from "react-router-dom";
import { getColors, type ColorOption } from "@/services/colors";
import { getShapes, type ShapeOption } from "@/services/shapes";
import { getPostOffices, type PostOfficeOption } from "@/services/postOffices";
import { getMarkingByIdRaw, normalizeImageUrl } from "@/services/markings";
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
const MAX_IMAGE_SIZE_MB = 100;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/tiff"];


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

/** docs/model.md lettering seed values; the dropdown is restricted to these. */
const LETTERING_SEED_NAMES = new Set([
  "Italic",
  "Serif",
  "Sans-serif",
  "Small",
  "Large",
  "Outline",
  "Bold",
  "Block",
  "Gothic",
]);

type ContributeMode = "new" | "edit-contribution" | "edit-marking";

const MODE_COPY: Record<ContributeMode, {
  h1: string;
  intro: string;
  card: string;
  button: string;
  toastTitle: string;
  toastBody: string;
}> = {
  "new": {
    h1: "Contributor Dashboard",
    intro: "Submit new postmark records or corrections. All fields match what reviewers see on the Submission Detail page.",
    card: "Submit New Entry",
    button: "Submit Postmark",
    toastTitle: "Submission sent",
    toastBody: "Your catalog entry has been submitted for approval. It will appear in Search after an editor approves it.",
  },
  "edit-contribution": {
    h1: "Edit and resubmit",
    intro: "Update your submission using the editor feedback, then submit to send it back for review.",
    card: "Edit submission",
    button: "Resubmit Postmark",
    toastTitle: "Changes submitted",
    toastBody: "Your updated submission has been sent for review again.",
  },
  "edit-marking": {
    h1: "Edit Catalog Entry",
    intro: "Edit requests are prefilled from the selected record and always go through the approval workflow before master listing data is updated.",
    card: "Edit and Submit",
    button: "Submit for Approval",
    toastTitle: "Submitted for review",
    toastBody: "Changes to master listing fields are submitted for editor approval and do not update the catalog directly.",
  },
};

type MarkingTypeValue = "TOWNMARK" | "RATEMARK" | "AUXMARK";

function normalizeMarkingTypeValue(raw: string): MarkingTypeValue | "" {
  const v = String(raw || "").trim().toUpperCase().replace(/[\s/_-]+/g, "");
  if (v === "TOWNMARK") return "TOWNMARK";
  if (v === "RATEMARK") return "RATEMARK";
  if (v === "AUXMARK" || v.includes("AUX")) return "AUXMARK";
  return "";
}

const PAGE_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9\s\-.,:;()/#]*$/;

/** Field-error key -> element id, in DOM order (drives scroll-to-first-error). */
const FIELD_ERROR_SCROLL_TARGETS: Array<[string, string]> = [
  ["markingType", "marking-type"],
  ["state", "state"],
  ["town", "town"],
  ["inscriptionText", "inscription-text"],
  ["shape", "shape"],
  ["color", "color"],
  ["dateFormat", "date-format"],
  ["widthMm", "width-mm"],
  ["heightMm", "height-mm"],
  ["lettering", "lettering"],
  ["images", "postmark-images-input"],
];

function scrollToFirstError(errors: Record<string, string | undefined>) {
  for (const [key, id] of FIELD_ERROR_SCROLL_TARGETS) {
    if (!errors[key]) continue;
    const el = document.getElementById(id);
    if (!el) continue;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = el as HTMLElement & { focus?: () => void };
    if (typeof focusable.focus === "function") {
      window.setTimeout(() => focusable.focus?.(), 300);
    }
    return;
  }
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

type UploadedImageTag = "mark" | "cover" | "tracing";

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
  const markingFileInputRef = useRef<HTMLInputElement>(null);

  const user = useAuth();
  const { id: editMarkingIdParam } = useParams();
  const editMarkingIdRaw = editMarkingIdParam
    ? parseInt(String(editMarkingIdParam).replace(/^api-/, ""), 10)
    : NaN;
  const editMarkingId =
    Number.isFinite(editMarkingIdRaw) && editMarkingIdRaw > 0 ? editMarkingIdRaw : null;
  const editContributionIdRaw =
    location.state?.editContributionId ??
    (() => {
      const edit = searchParams.get("edit");
      if (!edit) return null;
      const n = parseInt(edit, 10);
      return Number.isNaN(n) ? null : n;
    })();
  const editContributionId = editContributionIdRaw ?? null;
  const mode: ContributeMode =
    editMarkingId != null
      ? "edit-marking"
      : editContributionId != null
        ? "edit-contribution"
        : "new";
  const isEditContribution = mode === "edit-contribution";
  const isEditMarking = mode === "edit-marking";
  const isEditMode = isEditContribution || isEditMarking;
  const copy = MODE_COPY[mode];
  const [editLoadDone, setEditLoadDone] = useState(!editContributionId);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(isEditMarking);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [colorOptions, setColorOptions] = useState<ColorOption[]>([]);
  const [stateOptions, setStateOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [shapeOptions, setShapeOptions] = useState<ShapeOption[]>([]);
  const [postOffices, setPostOffices] = useState<PostOfficeOption[]>([]);
  const [loadingShapes, setLoadingShapes] = useState(true);
  const [shapeOptionsError, setShapeOptionsError] = useState<string | null>(null);
  const [loadingTowns, setLoadingTowns] = useState(false);
  const [townOptionsError, setTownOptionsError] = useState<string | null>(null);
  const [townFocused, setTownFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state – all fields shown on Submission Detail
  const [state, setState] = useState("");

  const [town, setTown] = useState("");
  const [markingType, setMarkingType] = useState("");
  const [rateValue, setRateValue] = useState("");
  const [rateText, setRateText] = useState("");
  const [description, setDescription] = useState("");
  const [contributorComment, setContributorComment] = useState("");
  // Existing images on the loaded Marking (edit-marking mode). Each entry is
  // an editable thumbnail: the user can change its tag or remove it. Removed
  // urls move into removedExistingImageKeys so the apply step can drop them.
  const [existingImages, setExistingImages] = useState<Array<{ url: string; tag: UploadedImageTag | "" }>>([]);
  const [removedExistingImageKeys, setRemovedExistingImageKeys] = useState<string[]>([]);
  const [shape, setShape] = useState("");
  const [color, setColor] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [manuscript, setManuscript] = useState("No");
  const [isIrregular, setIsIrregular] = useState(false);
  const [impression, setImpression] = useState("Normal");
  const [inscriptionText, setInscriptionText] = useState("");
  const [selectedReferenceWorks, setSelectedReferenceWorks] = useState<ReferenceWorkRecord[]>([]);
  const [referenceDetailsById, setReferenceDetailsById] = useState<Record<number, ReferenceDetailInput>>({});
  const [referenceDetailErrorsById, setReferenceDetailErrorsById] = useState<Record<number, ReferenceDetailFieldErrors>>({});
  const [markingImageFiles, setMarkingImageFiles] = useState<File[]>([]);
  const [markingImagePreviews, setMarkingImagePreviews] = useState<string[]>([]);
  const [markingImageTags, setMarkingImageTags] = useState<string[]>([]);
  const [letteringId, setLetteringId] = useState("");
  const [framingIds, setFramingIds] = useState<string[]>([]);
  const [dateFormatIds, setDateFormatIds] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{
    markingType?: string;
    state?: string;
    town?: string;
    shape?: string;
    color?: string;
    widthMm?: string;
    heightMm?: string;
    images?: string;
    imageTags?: string;
    lettering?: string;
    dateFormat?: string;
    inscriptionText?: string;
  }>({});

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

  const isStateEditor = user?.role === "editor";

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
    const seen = new Set<string>();
    const options = postOffices
      .map((facility) => (facility.state || "").trim())
      .filter((name) => {
        if (!name) return false;
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((name) => ({ value: name, label: name }));
    setStateOptions(options);
  }, [postOffices]);

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
        const shapeVal = getStr(sd.shape);
        const colorVal = getStr(sd.color);
        const typeVal = getStr(sd.type);
        setState(stateVal);
        setTown(townVal);
        if (typeVal) setMarkingType(typeVal);
        setContributorComment(getStr((sd as Record<string, unknown>).contributor_comment));
        setShape(shapeVal || "");
        setColor(colorVal || "");
        const wh = submittedDataToWidthHeightStrings(sd as Record<string, unknown>);
        setWidthMm(wh.width);
        setHeightMm(wh.height);
        const loadedManuscript = getStr(sd.manuscript);
        setManuscript(loadedManuscript === "Yes" ? "Yes" : "No");
        const loadedImpression = getStr(sd.impression);
        setImpression(loadedImpression || "Normal");
        setIsIrregular(Boolean(sd.is_irreg));
        setInscriptionText(getStr(sd.inscription_txt));
        setDescription(getStr(sd.desc));
        const referenceWorkIds = parseReferenceWorkIds(
          (sd as Record<string, unknown>).reference_work_ids
        );
        const referenceDetails = parseReferenceWorkDetails(
          (sd as Record<string, unknown>).reference_work_details
        );
        setPendingReferenceWorkIds(referenceWorkIds);
        setReferenceDetailsById(referenceDetails);
        if (referenceWorkIds.length === 0) {
          setSelectedReferenceWorks([]);
        }
        const lid = sd.lettering_id ?? sd.lettering_style_id;
        setLetteringId(lid != null ? String(lid) : "");
        const fids = sd.framing_style_ids as unknown;
        const normalizedFramingIds = Array.isArray(fids)
          ? fids.map((x) => String(x)).filter(Boolean)
          : [];
        setFramingIds(normalizedFramingIds);
        const dids = sd.date_format_ids as unknown;
        const normalizedDateFormatIds = Array.isArray(dids)
          ? dids.map((x) => String(x)).filter(Boolean)
          : [];
        setDateFormatIds(normalizedDateFormatIds);
        const submittedMarkingImages = Array.isArray(sd.marking_images)
          ? (sd.marking_images as unknown[])
              .map((v) => (typeof v === "string" ? v.trim() : ""))
              .filter((v) => v.length > 0)
          : [];
        if (submittedMarkingImages.length > 0) {
          setMarkingImagePreviews(submittedMarkingImages);
        } else {
          const metas = Array.isArray(sd.marking_image_metas)
            ? (sd.marking_image_metas as Array<{ storage_filename?: string }>)
            : [];
          const baseUrl = (import.meta.env.VITE_IMAGE_URL ?? "").replace(/\/+$/, "");
          if (baseUrl && metas.length > 0) {
            const urls: string[] = [];
            metas.forEach((m) => {
              const sf = m?.storage_filename;
              if (sf) urls.push(`${baseUrl}/markings/${sf}`);
            });
            if (urls.length > 0) setMarkingImagePreviews(urls);
          }
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
  }, [editContributionId]); // shapeOptions/colorOptions may not be loaded yet; we set shape/color as strings

  // Load Marking record for edit-marking mode (from /edit/:id).
  useEffect(() => {
    if (!isEditMarking || editMarkingId == null) return;
    let cancelled = false;
    setLoadingRecord(true);
    setRecordError(null);
    getMarkingByIdRaw(editMarkingId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setRecordError("Record not found");
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
        setExistingImages(existingUrls.map((url) => ({ url, tag: "" as UploadedImageTag | "" })));
        setRemovedExistingImageKeys([]);

        const typeRaw = String(data.type ?? "").trim().toUpperCase();
        if (typeRaw === "RATEMARK") setMarkingType("RATEMARK");
        else if (typeRaw === "AUXMARK") setMarkingType("AUXMARK");
        else if (typeRaw === "TOWNMARK") setMarkingType("TOWNMARK");

        setState(typeof data.state === "string" ? data.state : "");
        setTown(sanitizeTown(typeof data.town === "string" ? data.town : ""));

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
        setManuscript(data.is_manuscript ? "Yes" : "No");
        setIsIrregular(Boolean(data.is_irreg));
        const impressionRaw = String(data.impression ?? "").trim();
        const normalizedImpression = impressionRaw
          ? IMPRESSION_OPTIONS.find((opt) => opt.value.toLowerCase() === impressionRaw.toLowerCase())?.value
          : undefined;
        setImpression(normalizedImpression ?? "Normal");
        setInscriptionText(typeof data.inscription_txt === "string" ? data.inscription_txt : "");
        setDescription(typeof data.desc === "string" ? data.desc : "");

        setLetteringId(data.lettering != null ? String(data.lettering) : "");
        const dateFmt = String(data.date_fmt ?? "").trim();
        if (dateFmt) {
          const byCode = dateFormatOptions.find(
            (opt) =>
              String(opt.description ?? "").trim().toLowerCase() === dateFmt.toLowerCase() ||
              String(opt.name).trim().toLowerCase() === dateFmt.toLowerCase(),
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
  }, [isEditMarking, editMarkingId, dateFormatOptions, shapeOptions]);

  const noAssignedStates = false;

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
    const t = normalizeMarkingTypeValue(markingType);
    if (t === "RATEMARK") return "Ratemark Text";
    if (t === "AUXMARK") return "Auxmark Text";
    if (t === "TOWNMARK") return "Townmark Text";
    return "Inscription Text";
  }, [markingType]);

  const normalizedMarkingType = useMemo(() => normalizeMarkingTypeValue(markingType), [markingType]);
  const isTownmark = normalizedMarkingType === "TOWNMARK";
  const isRatemark = normalizedMarkingType === "RATEMARK";
  const isAuxmark = normalizedMarkingType === "AUXMARK";
  const isHandstamped = manuscript !== "Yes";
  const showShapeField = isHandstamped;
  const showDateFormatField = isHandstamped && isTownmark;
  const showRateValueField = isRatemark;
  const showAnythingElseSection = isHandstamped && (isTownmark || isRatemark || isAuxmark);

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
    const selectedCodes = dateFormatOptions
      .filter((opt) => dateFormatIds.includes(String(opt.id)))
      .map((opt) => opt.description || opt.name);
    if (selectedCodes.length <= 2) return selectedCodes.join(", ");
    return `${selectedCodes.slice(0, 2).join(", ")} +${selectedCodes.length - 2} more`;
  }, [dateFormatIds, dateFormatOptions]);

  const processImageFiles = (files: File[]) => {
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
    if (fieldErrors.images) {
      setFieldErrors((prev) => ({ ...prev, images: undefined }));
    }
    setMarkingImageFiles((prev) => [...prev, ...toAdd]);
    setMarkingImageTags((prev) => [...prev, ...toAdd.map(() => "")]);
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
      setMarkingImagePreviews((prev) => [...prev, ...newPreviews]);
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    processImageFiles(Array.from(files));
    e.target.value = "";
  };

  const removeImageAt = (index: number) => {
    setMarkingImageFiles((prev) => prev.filter((_, i) => i !== index));
    setMarkingImagePreviews((prev) => prev.filter((_, i) => i !== index));
    setMarkingImageTags((prev) => prev.filter((_, i) => i !== index));
    if (markingFileInputRef.current) markingFileInputRef.current.value = "";
  };

  const setMarkingImageTagAt = (index: number, value: UploadedImageTag) => {
    setMarkingImageTags((prev) => prev.map((t, i) => (i === index ? value : t)));
    if (fieldErrors.imageTags) {
      setFieldErrors((prev) => ({ ...prev, imageTags: undefined }));
    }
  };

  const buildName = () => {
    const stateLabel = state.trim();
    return `${town.trim()}, ${stateLabel} ${shape}`.trim();
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
    const isManuscriptSelected = manuscript === "Yes";
    const shapeVal = isManuscriptSelected ? "" : shape.trim();
    const typeVal = normalizeMarkingTypeValue(markingType.trim()) || markingType.trim();
    const shapeIdVal = shapeOptions.find(
      (opt) => String(opt.name).trim().toLowerCase() === shapeVal.toLowerCase()
    )?.id;
    const colorVal = color.trim();
    const colorIdVal = colorOptions.find(
      (c) => c.name.trim().toLowerCase() === colorVal.toLowerCase()
    )?.id;
    const isCircular = isCircularType(shapeVal);

    const errors: typeof fieldErrors = {};
    if (!typeVal) {
      errors.markingType = "Marking type is required";
    }
    if (!stateVal) {
      errors.state = "State is required";
    }
    if (!townVal) {
      errors.town = "Town/City is required";
    } else if (/[0-9]/.test(townVal)) {
      errors.town = "Town/City must contain only letters and spaces";
    }
    if (!isManuscriptSelected && !shapeVal) {
      errors.shape = "Shape is required when Manuscript is No";
    }
    if (!inscriptionText.trim()) {
      errors.inscriptionText = `${inscriptionLabel} is required`;
    }

    // At least one image must accompany every entry.
    // - "new":               at least one freshly-uploaded file.
    // - "edit-marking":      keep at least one existing image, or upload a new one.
    // - "edit-contribution": images carry over from the prior submission, so no
    //                        new upload is required.
    if (mode === "new" && markingImageFiles.length === 0) {
      errors.images = "At least one image is required";
    } else if (
      mode === "edit-marking" &&
      existingImages.length === 0 &&
      markingImageFiles.length === 0
    ) {
      errors.images = "At least one image is required";
    }

    // Dimensions: only validated for handstamped markings. Manuscript markings
    // have no measurable shape, so we skip the check (and the fields are hidden).
    if (!isManuscriptSelected) {
      const effectiveHeight = isCircular ? widthMm : heightMm;
      const mmErr = validateMmPair(widthMm, effectiveHeight);
      if (mmErr.width) errors.widthMm = mmErr.width;
      if (mmErr.height && !isCircular) errors.heightMm = mmErr.height;
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
      scrollToFirstError(errors);
      return;
    }

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

    const allImageFiles = markingImageFiles;
    const allImageTags = markingImageTags;
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

      const derivedIsCircular = isCircularType(shapeVal);
      const derivedDimensions = (() => {
        const w = widthMm.trim();
        const h = derivedIsCircular ? w : heightMm.trim();
        if (w && h) return `${w}×${h} mm`;
        return "";
      })();
      const inscriptionToSend = inscriptionText.trim();

      if (allImageFiles.length > 0 || isEditMarking) {
        const form = new FormData();
        if (isEditContribution && editContributionId != null) {
          form.append("edit_contribution_id", String(editContributionId));
        }
        if (isEditMarking && editMarkingId != null) {
          form.append("edit_postmark_id", String(editMarkingId));
        }
        if (selectedPostOfficeId != null) form.append("post_office_id", String(selectedPostOfficeId));
        form.append("state", stateVal);
        form.append("town", townVal);
        if (typeVal) form.append("type", typeVal);
        if (!isManuscriptSelected) form.append("shape", shapeVal);
        if (!isManuscriptSelected && shapeIdVal != null) form.append("shape_id", String(shapeIdVal));
        if (colorIdVal != null) form.append("color_id", String(colorIdVal));
        form.append("color", colorVal);
        if (derivedDimensions) form.append("dimensions", derivedDimensions);
        if (manuscript.trim()) form.append("manuscript", manuscript.trim());
        form.append("is_manuscript", String(isManuscriptSelected));
        if (!isManuscriptSelected) {
          form.append("is_irreg", String(isIrregular));
          if (impression.trim()) form.append("impression", impression.trim());
        }
        if (showRateValueField && rateValue.trim()) form.append("rate_val", rateValue.trim());
        if (description.trim()) {
          form.append("desc", description.trim());
        }
        if (inscriptionToSend) form.append("inscription_txt", inscriptionToSend);
        if (referencesToSend) form.append("references", referencesToSend);
        referenceWorkIdsToSend.forEach((id) => form.append("reference_work_ids[]", String(id)));
        if (referenceWorkDetailsToSend.length > 0) {
          form.append("reference_work_details", JSON.stringify(referenceWorkDetailsToSend));
        }
        if (submitterName) form.append("submitter_name", submitterName);
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
        for (const file of markingImageFiles) {
          form.append("marking_image", file, file.name);
        }
        form.append("marking_image_tags", JSON.stringify(markingImageTags));
        const trimmedComment = contributorComment.trim();
        if (trimmedComment) {
          form.append("contributor_comment", trimmedComment);
          form.append("comment_for_editor", trimmedComment);
        }
        if (isEditMarking) {
          if (removedExistingImageKeys.length > 0) {
            form.append("removed_existing_image_keys", JSON.stringify(removedExistingImageKeys));
          }
          const existingTagMap: Record<string, string> = {};
          for (const img of existingImages) {
            if (img.tag) existingTagMap[img.url] = img.tag;
          }
          if (Object.keys(existingTagMap).length > 0) {
            form.append("existing_image_tags", JSON.stringify(existingTagMap));
          }
        }
        body = form;
        // Do not set Content-Type so browser sets multipart/form-data with boundary
      } else {
        const trimmedComment = contributorComment.trim();
        const existingTagMap: Record<string, string> = {};
        for (const img of existingImages) {
          if (img.tag) existingTagMap[img.url] = img.tag;
        }
        body = JSON.stringify({
          ...(isEditContribution && editContributionId != null
            ? { edit_contribution_id: editContributionId }
            : {}),
          ...(isEditMarking && editMarkingId != null
            ? { edit_postmark_id: editMarkingId }
            : {}),
          post_office_id: selectedPostOfficeId ?? undefined,
          state: stateVal,
          town: townVal,
          type: typeVal || undefined,
          shape: isManuscriptSelected ? null : shapeVal,
          shape_id: isManuscriptSelected ? null : shapeIdVal ?? null,
          color_id: colorIdVal ?? undefined,
          color: colorVal,
          dimensions: derivedDimensions || undefined,
          manuscript: manuscript.trim() || undefined,
          is_manuscript: isManuscriptSelected,
          is_irreg: isManuscriptSelected ? null : isIrregular,
          impression: isManuscriptSelected ? null : impression.trim() || undefined,
          rate_val: showRateValueField ? rateValue.trim() || undefined : undefined,
          desc: description.trim() || undefined,
          inscription_txt: inscriptionToSend || undefined,
          references: referencesToSend || undefined,
          reference_work_ids: referenceWorkIdsToSend.length > 0 ? referenceWorkIdsToSend : undefined,
          reference_work_details: referenceWorkDetailsToSend.length > 0 ? referenceWorkDetailsToSend : undefined,
          submitter_name: submitterName || undefined,
          lettering_style_id: isManuscriptSelected ? null : letteringId ? Number(letteringId) : undefined,
          lettering_id: isManuscriptSelected ? null : letteringId ? Number(letteringId) : undefined,
          framing_style_id: framingIds[0] ? Number(framingIds[0]) : undefined,
          framing_style_ids: framingIds.length > 0 ? framingIds.map((id) => Number(id)) : undefined,
          date_format_id: dateFormatIds[0] ? Number(dateFormatIds[0]) : undefined,
          date_fmt: showDateFormatField && dateFormatIds[0] ? Number(dateFormatIds[0]) : undefined,
          date_format_ids: dateFormatIds.length > 0 ? dateFormatIds.map((id) => Number(id)) : undefined,
          marking_image_tags: markingImageTags,
          ...(trimmedComment
            ? { contributor_comment: trimmedComment, comment_for_editor: trimmedComment }
            : {}),
          ...(isEditMarking && removedExistingImageKeys.length > 0
            ? { removed_existing_image_keys: removedExistingImageKeys }
            : {}),
          ...(isEditMarking && Object.keys(existingTagMap).length > 0
            ? { existing_image_tags: existingTagMap }
            : {}),
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

      const resData = (await res.json().catch(() => ({}))) as { contributionId?: number; detail?: string };

      toast({
        title: copy.toastTitle,
        description: copy.toastBody,
      });

      if (isEditContribution && resData?.contributionId != null) {
        navigate(`/contribution/${resData.contributionId}`, { state: { fromDashboard: true } });
        return;
      }

      if (isEditMarking) {
        const fromDashboard = (location.state as Record<string, unknown> | null)?.fromDashboard;
        const fromDashboardDirect = (location.state as Record<string, unknown> | null)?.fromDashboardDirect;
        const fromDashboardViaDetail = (location.state as Record<string, unknown> | null)?.fromDashboardViaDetail;
        const fromSearch = (location.state as Record<string, unknown> | null)?.fromSearch;
        if (resData?.contributionId != null) {
          navigate(`/contribution/${resData.contributionId}`, { state: { fromDashboard: true } });
        } else if (fromDashboardDirect || fromDashboard || fromDashboardViaDetail) {
          navigate("/dashboard");
        } else if (fromSearch) {
          navigate("/search");
        } else {
          navigate("/dashboard");
        }
        return;
      }

      setState("");
      setTown("");
      setMarkingType("");
      setRateValue("");
      setRateText("");
      setDescription("");
      setShape("");
      setColor("");
      setWidthMm("");
      setHeightMm("");
      setManuscript("No");
      setIsIrregular(false);
      setImpression("Normal");
      setInscriptionText("");
      setContributorComment("");
      setPendingReferenceWorkIds([]);
      setSelectedReferenceWorks([]);
      setReferenceDetailsById({});
      setReferenceDetailErrorsById({});
      setMarkingImageFiles([]);
      setMarkingImagePreviews([]);
      setMarkingImageTags([]);
      setLetteringId("");
      setFramingIds([]);
      setDateFormatIds([]);
      if (markingFileInputRef.current) markingFileInputRef.current.value = "";
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

  const effectiveShapeLabel = String(shape ?? "").trim();
  const isCircularShape = isCircularType(effectiveShapeLabel);

  const removeExistingImageAt = (index: number) => {
    setExistingImages((prev) => {
      const target = prev[index];
      if (target) {
        setRemovedExistingImageKeys((keys) =>
          keys.includes(target.url) ? keys : [...keys, target.url],
        );
      }
      return prev.filter((_, i) => i !== index);
    });
    if (fieldErrors.images) {
      setFieldErrors((prev) => ({ ...prev, images: undefined }));
    }
  };

  const setExistingImageTagAt = (index: number, value: UploadedImageTag | "") => {
    setExistingImages((prev) => prev.map((img, i) => (i === index ? { ...img, tag: value } : img)));
  };

  const renderImageUploader = (label: string, helperText: string, required = false) => {
    const inputRef = markingFileInputRef;
    const previews = markingImagePreviews;
    const files = markingImageFiles;
    const tags = markingImageTags;
    const hasAnyImage = previews.length > 0 || existingImages.length > 0;
    return (
      <div className="space-y-2">
        <Label>
          {label}
          {required ? <span className="text-destructive" aria-hidden="true"> *</span> : null}
        </Label>
        {required && fieldErrors.images && <p className="text-sm text-destructive">{fieldErrors.images}</p>}
        {fieldErrors.imageTags && <p className="text-sm text-destructive">{fieldErrors.imageTags}</p>}
        <input
          ref={inputRef}
          id="postmark-images-input"
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={handleImageChange}
        />
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = Array.from(e.dataTransfer.files);
            if (dropped.length) processImageFiles(dropped);
          }}
          className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
        >
          {hasAnyImage ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {existingImages.map((img, i) => (
                  <div key={`existing-${img.url}-${i}`} className="relative rounded border bg-muted/30 overflow-hidden">
                    <img src={img.url} alt={`Current image ${i + 1}`} className="w-full aspect-square object-contain max-h-32" />
                    <p className="text-xs text-muted-foreground truncate px-2 py-1">Current image</p>
                    <div className="px-2 pb-2">
                      <Select
                        value={img.tag || ""}
                        onValueChange={(value) => setExistingImageTagAt(i, value as UploadedImageTag)}
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
                        removeExistingImageAt(i);
                      }}
                    >
                      x
                    </Button>
                  </div>
                ))}
                {previews.map((preview, i) => (
                  <div key={`new-${i}`} className="relative rounded border bg-muted/30 overflow-hidden">
                    <img src={preview} alt={`${label} preview ${i + 1}`} className="w-full aspect-square object-contain max-h-32" />
                    <p className="text-xs text-muted-foreground truncate px-2 py-1">{files[i]?.name || "New image"}</p>
                    <div className="px-2 pb-2">
                      <Select
                        value={tags[i] ?? ""}
                        onValueChange={(value) => setMarkingImageTagAt(i, value as UploadedImageTag)}
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
                        removeImageAt(i);
                      }}
                    >
                      x
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
              {copy.h1}
            </h1>
            <p className="text-muted-foreground">{copy.intro}</p>
          </div>

          {((isEditContribution && !editLoadDone) || (isEditMarking && loadingRecord)) && (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading record...</span>
            </div>
          )}

          {((isEditContribution && editLoadDone && editLoadError) ||
            (isEditMarking && !loadingRecord && recordError)) && (
            <Card className="border-destructive/50">
              <CardContent className="pt-6">
                <p className="text-destructive mb-4">{editLoadError ?? recordError}</p>
                <Button variant="outline" onClick={() => navigate(-1)}>
                  Go back
                </Button>
              </CardContent>
            </Card>
          )}

          {(mode === "new" ||
            (isEditContribution && editLoadDone && !editLoadError) ||
            (isEditMarking && !loadingRecord && !recordError)) && (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Card className="shadow-archival-lg">
                <CardHeader>
                  <CardTitle className="font-heading text-xl">{copy.card}</CardTitle>
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
                      <Label htmlFor="marking-type">
                        Marking Type <span className="text-destructive" aria-hidden="true">*</span>
                      </Label>
                      <Select
                        value={markingType}
                        onValueChange={(value) => {
                          setMarkingType(value);
                          if (fieldErrors.markingType) {
                            setFieldErrors((prev) => ({ ...prev, markingType: undefined }));
                          }
                        }}
                      >
                        <SelectTrigger
                          id="marking-type"
                          className={fieldErrors.markingType ? "border-destructive" : ""}
                        >
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
                      {fieldErrors.markingType && (
                        <p className="text-sm text-destructive">{fieldErrors.markingType}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id="manuscript"
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={manuscript === "Yes"}
                        onChange={(e) => {
                          const next = e.target.checked ? "Yes" : "No";
                          setManuscript(next);
                          if (next === "Yes") {
                            setShape("");
                            setLetteringId("");
                            setImpression("");
                            setIsIrregular(false);
                            setWidthMm("");
                            setHeightMm("");
                            setFieldErrors((p) => ({
                              ...p,
                              shape: undefined,
                              widthMm: undefined,
                              heightMm: undefined,
                            }));
                          }
                        }}
                      />
                      <Label htmlFor="manuscript">Manuscript</Label>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="state">
                        State <span className="text-destructive" aria-hidden="true">*</span>
                      </Label>
                      <SearchableSelect
                        id="state"
                        value={state}
                        onValueChange={(value) => {
                          setState(value);
                          if (fieldErrors.state) {
                            setFieldErrors((prev) => ({ ...prev, state: undefined }));
                          }
                        }}
                        placeholder="Select state..."
                        options={stateOptions}
                        loading={loadingTowns}
                        error={!!townOptionsError}
                        errorMessage={townOptionsError ?? "Failed to load states"}
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
                      <Label htmlFor="town">
                        Town/City <span className="text-destructive" aria-hidden="true">*</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="town"
                          type="text"
                          autoComplete="off"
                          value={town}
                          onChange={(e) => {
                            setTown(sanitizeTown(e.target.value));
                            if (fieldErrors.town) {
                              setFieldErrors((prev) => ({ ...prev, town: undefined }));
                            }
                          }}
                          onFocus={() => setTownFocused(true)}
                          onBlur={() => {
                            // Delay so click on a suggestion can register first.
                            window.setTimeout(() => setTownFocused(false), 120);
                          }}
                          placeholder={state ? "Type a town or pick a suggestion" : "Select state first"}
                          aria-label="Town or city"
                          aria-autocomplete="list"
                          aria-expanded={townFocused && !!state}
                          disabled={!state}
                          className={fieldErrors.town ? "border-destructive" : ""}
                        />
                        {townFocused && state && (() => {
                          const needle = town.trim().toLowerCase();
                          const matches = needle
                            ? townOptions.filter((opt) =>
                                opt.label.toLowerCase().includes(needle),
                              )
                            : townOptions;
                          const limited = matches.slice(0, 25);
                          if (limited.length === 0) return null;
                          return (
                            <ul
                              role="listbox"
                              className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-md"
                            >
                              {limited.map((opt) => (
                                <li
                                  key={opt.value}
                                  role="option"
                                  aria-selected={opt.value === town}
                                  className="cursor-pointer px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                                  onMouseDown={(e) => {
                                    // Use mousedown so it fires before the input blur.
                                    e.preventDefault();
                                    setTown(sanitizeTown(opt.value));
                                    setTownFocused(false);
                                    if (fieldErrors.town) {
                                      setFieldErrors((prev) => ({ ...prev, town: undefined }));
                                    }
                                  }}
                                >
                                  {opt.label}
                                </li>
                              ))}
                            </ul>
                          );
                        })()}
                      </div>
                      {loadingTowns && state ? (
                        <p className="text-xs text-muted-foreground">Loading town suggestions...</p>
                      ) : null}
                      {townOptionsError && state ? (
                        <p className="text-xs text-destructive">{townOptionsError}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Start typing to see suggestions for the selected state. Unrecognized names are accepted as new towns.
                        </p>
                      )}
                      {fieldErrors.town && (
                        <p className="text-sm text-destructive">{fieldErrors.town}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="inscription-text">
                        {inscriptionLabel} <span className="text-destructive" aria-hidden="true">*</span>
                      </Label>
                      <Textarea
                        id="inscription-text"
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
                    {showShapeField && <div className="space-y-2">
                      <Label htmlFor="shape">
                        Shape
                        {manuscript === "No" ? (
                          <span className="text-destructive" aria-hidden="true">*</span>
                        ) : null}
                      </Label>
                      <SearchableSelect
                        id="shape"
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
                    </div>}

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
                        </SelectContent>
                      </Select>
                      {fieldErrors.color && (
                        <p className="text-sm text-destructive">{fieldErrors.color}</p>
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
                                {opt.description || opt.name}
                              </DropdownMenuCheckboxItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {fieldErrors.dateFormat && <p className="text-sm text-destructive">{fieldErrors.dateFormat}</p>}
                    </div>}
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Details about the postmark..."
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>

                    {showRateValueField && <div className="space-y-2">
                      <Label htmlFor="rate-value">Rate Value</Label>
                      <Input
                        id="rate-value"
                        type="text"
                        placeholder="e.g. 5"
                        value={rateValue}
                        onChange={(e) => setRateValue(e.target.value)}
                      />
                    </div>}

                    {isHandstamped && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="width-mm">
                              {isCircularShape ? "Diameter (mm)" : "Width (mm)"}
                            </Label>
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
                              aria-label={isCircularShape ? "Diameter in millimetres" : "Width in millimetres"}
                            />
                            {fieldErrors.widthMm && (
                              <p className="text-sm text-destructive">{fieldErrors.widthMm}</p>
                            )}
                          </div>
                          {!isCircularShape && (
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
                          )}
                        </div>
                        {!isCircularShape && (
                          <p className="text-xs text-muted-foreground -mt-2">
                            Optional. If you enter one, enter both. Stored on the catalog as width x height (mm).
                          </p>
                        )}
                      </>
                    )}

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

                    {showAnythingElseSection && <div className="space-y-3">
                      {/* <Label>Anything else?</Label> */}
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
                            {letteringOptions
                              .filter((opt) => LETTERING_SEED_NAMES.has(opt.name))
                              .map((opt) => (
                                <SelectItem key={opt.id} value={String(opt.id)}>{opt.name}</SelectItem>
                              ))}
                            {(() => {
                              const selected = letteringOptions.find((opt) => String(opt.id) === letteringId);
                              if (!selected || LETTERING_SEED_NAMES.has(selected.name)) return null;
                              return (
                                <SelectItem key={`legacy-${selected.id}`} value={String(selected.id)}>
                                  {selected.name} (legacy)
                                </SelectItem>
                              );
                            })()}
                          </SelectContent>
                        </Select>
                        {fieldErrors.lettering && <p className="text-sm text-destructive">{fieldErrors.lettering}</p>}
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
                    </div>}

                    {renderImageUploader(
                      "Marking Images",
                      `PNG, JPG, or TIFF up to ${MAX_IMAGE_SIZE_MB}MB each`,
                      true,
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="contributor-comment">Comment for editor</Label>
                      <Textarea
                        id="contributor-comment"
                        placeholder="Optional. Anything else you want the reviewing editor to know."
                        rows={3}
                        value={contributorComment}
                        onChange={(e) => setContributorComment(e.target.value)}
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={submitting || noAssignedStates}
                    >
                      {submitting ? "Submitting..." : copy.button}
                    </Button>
                  </form>

                  <p className="text-xs text-muted-foreground">
                    Required: Marking Type, Manuscript, State, Town/City, Inscription Text, Shape (when not Manuscript), and at least one image.
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
                    <strong className="text-foreground">Review Time:</strong> Most submissions are reviewed within 1-3 business days.
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