import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Loader2,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import axios from "axios";
import apiClient, { ensureCsrfToken } from "@/lib/api";

import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { isCoverContributionData } from "@/lib/contributionDisplay";
import {
  contributionImageMetasFromSubmittedData,
  markingImagesFromContributionMetas,
} from "@/lib/contributionImages";

import {
  createCover,
  createCoverMarking,
  createDateSeen,
  deleteDateSeen,
  updateCover,
  updateCoverMarking,
  updateDateSeen,
  type CoverWritePayload,
  type DateSeenGranularity,
} from "@/services/covers";
import {
  createCitationSubject,
  deleteCitationSubject,
  listCitationsForSubject,
  updateCitationSubject,
} from "@/services/citations";
import {
  createImageForSubject,
  getImagesForSubject,
  abandonCoverContributionDraft,
  getMarkingById,
  getMarkingCovers,
  normalizeImageUrl,
  resolveMarkingRoutingState,
  routingStateFromMarkingRecord,
  postCoverMarkingResubmit,
  reorderImages,
  updateImage,
  type AssociatedCover,
  type AssociatedDateSeen,
  type MarkingImage,
  type MarkingRecord,
} from "@/services/markings";
import { getReferenceWorks, type ReferenceWorkRecord } from "@/services/referenceWorks";

type Mode = "create" | "edit";

type CoverDateField = {
  existingId?: number;
  date: string;
};

type PendingUpload = {
  key: string;
  file: File;
  tracing: boolean;
  previewUrl: string;
};

type ReferenceDetailInput = {
  pageNumber: string;
  citationUrl: string;
};

type ReferenceDetailFieldErrors = {
  pageNumber?: string;
  citationUrl?: string;
};

const COVER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "FC", label: "FC - Folded Cover" },
  { value: "FL", label: "FL - Folded Letter" },
];

const DEFAULT_COVER_TYPE = "FL";

const MAX_IMAGE_SIZE_MB = 100;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/tiff"];
const PAGE_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9\s\-.,:;()/#]*$/;

function formatAxiosError(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err.message : "Request failed.";
  }
  const data = err.response?.data as Record<string, unknown> | undefined;
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(String).join(" ");
  if (data && typeof data === "object") return JSON.stringify(data);
  return err.message || "Request failed.";
}

function deriveGranularityFromIso(iso: string): { granularity: DateSeenGranularity; normalizedDate: string } | null {
  const trimmed = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const normalizedDate = `${m[1]}-${m[2]}-${m[3]}`;
  if (month === 1 && day === 1) {
    return { granularity: "YEAR", normalizedDate: `${y}-01-01` };
  }
  if (day === 1) {
    return { granularity: "MONTH", normalizedDate: `${y}-${String(month).padStart(2, "0")}-01` };
  }
  return { granularity: "DAY", normalizedDate };
}

function normalizeCoverType(raw: string | null | undefined): string {
  return raw === "FC" || raw === "FL" ? raw : DEFAULT_COVER_TYPE;
}

function buildEditState(cover: AssociatedCover | null | undefined) {
  const c = cover?.coverDetails ?? null;
  const seen = c?.datesSeen ?? [];
  const sorted = [...seen].sort((a, b) => a.date.localeCompare(b.date));
  const primary = sorted[0];
  const coverDate: CoverDateField =
    primary != null ? { existingId: primary.id, date: primary.date.slice(0, 10) } : { date: "" };

  return {
    type: normalizeCoverType(c?.type ?? null),
    isInstitutional: c?.isInstitutional === true,
    isBackstamp: cover?.isBackstamp === true,
    coverDate,
  };
}

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
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

function citationDetailForApi(work: ReferenceWorkRecord, detail?: ReferenceDetailInput): string {
  const raw = formatReferenceWorkForReferences(work, detail);
  return raw.length <= 500 ? raw : `${raw.slice(0, 497)}...`;
}

function parseCitationDetailBlob(text: string): ReferenceDetailInput {
  let pageNumber = "";
  let citationUrl = "";
  for (const line of text.split("\n")) {
    const p = line.match(/^Page number:\s*(.*)$/i);
    if (p) pageNumber = p[1]?.trim() ?? "";
    const u = line.match(/^Citation url:\s*(.*)$/i);
    if (u) citationUrl = u[1]?.trim() ?? "";
  }
  return { pageNumber, citationUrl };
}

type FieldErrorsShape = {
  type?: string;
  date?: string;
  images?: string;
  referenceWorks?: string;
  contributorComment?: string;
};

const COVER_FIELD_SCROLL_ORDER: Array<{ key: keyof FieldErrorsShape; id: string }> = [
  { key: "type", id: "cover-type" },
  { key: "date", id: "cover-date" },
  { key: "images", id: "cover-images-zone" },
  { key: "referenceWorks", id: "cover-reference-works" },
  { key: "contributorComment", id: "contributor-comment" },
];

function scrollToFirstFieldError(errors: FieldErrorsShape) {
  for (const { key, id } of COVER_FIELD_SCROLL_ORDER) {
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

export default function CoverEdit() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const user = useAuth();

  const markingId = params.id ? parseInt(String(params.id).replace(/^api-/, ""), 10) : NaN;
  const routeCoverId = params.coverId ? parseInt(String(params.coverId).replace(/^api-/, ""), 10) : null;
  const mode: Mode = routeCoverId != null && Number.isFinite(routeCoverId) ? "edit" : "create";
  const editContributionIdRaw = searchParams.get("edit");
  const editContributionId =
    editContributionIdRaw && /^\d+$/.test(editContributionIdRaw)
      ? parseInt(editContributionIdRaw, 10)
      : null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftLoadDone, setDraftLoadDone] = useState(editContributionId == null);
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [coverRow, setCoverRow] = useState<AssociatedCover | null>(null);
  const [markingRecord, setMarkingRecord] = useState<MarkingRecord | null>(null);

  const initial = useMemo(
    () => (mode === "edit" ? buildEditState(coverRow) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, coverRow],
  );

  const [type, setType] = useState(mode === "create" ? "" : DEFAULT_COVER_TYPE);
  const [isInstitutional, setIsInstitutional] = useState(false);
  const [isBackstamp, setIsBackstamp] = useState(false);
  const [coverDate, setCoverDate] = useState<CoverDateField>({ date: "" });

  const [fieldErrors, setFieldErrors] = useState<FieldErrorsShape>({});
  const [referenceDetailErrorsById, setReferenceDetailErrorsById] = useState<
    Record<number, ReferenceDetailFieldErrors>
  >({});

  const [contributorComment, setContributorComment] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const coverId = coverRow?.coverDetails?.id ?? null;
  const [existingImages, setExistingImages] = useState<MarkingImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [reorderingImages, setReorderingImages] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const [referenceWorks, setReferenceWorks] = useState<ReferenceWorkRecord[]>([]);
  const [referenceWorksLoading, setReferenceWorksLoading] = useState(true);
  const [referenceWorksError, setReferenceWorksError] = useState<string | null>(null);
  const [selectedReferenceWorks, setSelectedReferenceWorks] = useState<ReferenceWorkRecord[]>([]);
  const [referenceDetailsById, setReferenceDetailsById] = useState<Record<number, ReferenceDetailInput>>({});

  const citationsLoadedRef = useRef(false);

  useEffect(() => {
    citationsLoadedRef.current = false;
  }, [routeCoverId, mode, editContributionId]);

  // Resume an existing cover draft from My Submissions (?edit=contributionId).
  useEffect(() => {
    if (editContributionId == null || mode !== "create") {
      setDraftLoadDone(true);
      setDraftLoadError(null);
      return;
    }
    let cancelled = false;
    setDraftLoadDone(false);
    setDraftLoadError(null);
    void (async () => {
      try {
        const res = await apiClient.get(`/contributions/${editContributionId}/`);
        const data = res.data as Record<string, unknown>;
        const sd = (data.submitted_data ?? data.submittedData) as Record<string, unknown> | undefined;
        if (!sd || typeof sd !== "object" || !isCoverContributionData(sd)) {
          if (!cancelled) {
            setDraftLoadError("This draft is not a cover submission.");
            setDraftLoadDone(true);
          }
          return;
        }
        const typeVal = String(sd.type ?? "").trim().toUpperCase();
        if (typeVal === "FC" || typeVal === "FL") setType(typeVal);
        const rawDate = String(sd.cover_date ?? sd.coverDate ?? "").trim();
        if (rawDate) setCoverDate({ date: rawDate.slice(0, 10) });
        setIsInstitutional(String(sd.is_institutional ?? sd.isInstitutional) === "true");
        setIsBackstamp(String(sd.is_backstamp ?? sd.isBackstamp) === "true");
        const comment = String(sd.contributor_comment ?? sd.comment_for_editor ?? "").trim();
        if (comment) setContributorComment(comment);

        const refIdsRaw = sd.reference_work_ids ?? sd.referenceWorkIds;
        const refIds = Array.isArray(refIdsRaw)
          ? refIdsRaw.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n))
          : [];
        if (refIds.length > 0 && referenceWorks.length > 0) {
          const selected = referenceWorks.filter((w) => refIds.includes(w.id));
          setSelectedReferenceWorks(selected);
        }

        const metas = contributionImageMetasFromSubmittedData(sd);
        const draftImages = markingImagesFromContributionMetas(metas, markingId);
        if (draftImages.length > 0) {
          const tagsRaw = sd.cover_image_tags ?? sd.coverImageTags;
          let tags: string[] = [];
          if (typeof tagsRaw === "string") {
            try {
              const parsed = JSON.parse(tagsRaw) as unknown;
              tags = Array.isArray(parsed) ? parsed.map((t) => String(t)) : [];
            } catch {
              tags = [];
            }
          } else if (Array.isArray(tagsRaw)) {
            tags = tagsRaw.map((t) => String(t));
          }
          setExistingImages(
            draftImages.map((img, i) => ({
              ...img,
              isTracing: tags[i] === "tracing",
            })),
          );
        }

        if (!cancelled) setDraftLoadDone(true);
      } catch {
        if (!cancelled) {
          setDraftLoadError("Could not load cover draft.");
          setDraftLoadDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editContributionId, mode, referenceWorks]);

  useEffect(() => {
    if (mode !== "edit" || !initial) return;
    setType(initial.type);
    setIsInstitutional(initial.isInstitutional);
    setIsBackstamp(initial.isBackstamp);
    setCoverDate(initial.coverDate);
  }, [mode, initial]);

  useEffect(() => {
    if (!coverRow) return;
    setContributorComment(coverRow.contributorComment ?? "");
  }, [coverRow?.id]);

  useEffect(() => {
    let cancelled = false;
    setReferenceWorksLoading(true);
    setReferenceWorksError(null);
    getReferenceWorks()
      .then((rows) => {
        if (!cancelled) setReferenceWorks(rows);
      })
      .catch(() => {
        if (!cancelled) setReferenceWorksError("Could not load reference works.");
      })
      .finally(() => {
        if (!cancelled) setReferenceWorksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!Number.isFinite(markingId) || markingId <= 0) {
      setMarkingRecord(null);
      return;
    }
    let cancelled = false;
    getMarkingById(markingId)
      .then((rec) => {
        if (!cancelled) setMarkingRecord(rec);
      })
      .catch(() => {
        if (!cancelled) setMarkingRecord(null);
      });
    return () => {
      cancelled = true;
    };
  }, [markingId]);

  useEffect(() => {
    if (!Number.isFinite(markingId) || markingId <= 0) {
      setLoadError("Invalid marking id.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getMarkingCovers(markingId)
      .then(({ covers }) => {
        if (cancelled) return;
        if (mode === "create") {
          setCoverRow(null);
          return;
        }
        const found = covers.find((c) => c.coverDetails?.id === routeCoverId) ?? null;
        if (!found) {
          setLoadError("Cover not found for this marking.");
          setCoverRow(null);
          return;
        }
        setCoverRow(found);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Unable to load cover details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markingId, routeCoverId, mode]);

  useEffect(() => {
    if (
      mode !== "edit" ||
      !coverRow?.coverDetails?.id ||
      referenceWorks.length === 0 ||
      citationsLoadedRef.current
    ) {
      return;
    }
    const cid = coverRow.coverDetails.id;
    let cancelled = false;
    void listCitationsForSubject({ subjectType: "COVER", subjectId: cid }).then((rows) => {
      if (cancelled) return;
      const picked: ReferenceWorkRecord[] = [];
      const details: Record<number, ReferenceDetailInput> = {};
      for (const row of rows) {
        const rw = referenceWorks.find((w) => w.id === row.referenceWorkId);
        if (!rw) continue;
        picked.push(rw);
        details[rw.id] = parseCitationDetailBlob(row.citationDetail);
      }
      if (picked.length > 0) {
        setSelectedReferenceWorks(picked);
        setReferenceDetailsById((prev) => ({ ...details, ...prev }));
      }
      citationsLoadedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [mode, coverRow, referenceWorks]);

  const refreshImages = async () => {
    if (coverId == null) {
      // Create/draft flow stores images in submitted_data until a Cover row exists.
      return;
    }
    setImagesLoading(true);
    try {
      const imgs = await getImagesForSubject({ subjectType: "COVER", subjectId: coverId });
      setExistingImages(imgs);
    } finally {
      setImagesLoading(false);
    }
  };

  useEffect(() => {
    void refreshImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverId]);

  const returnPath = () => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from) return from;
    if (mode === "edit" && routeCoverId != null) {
      return `/record/${markingId}/cover/${routeCoverId}`;
    }
    return `/record/${markingId}`;
  };

  const handleBack = () => {
    navigate(returnPath());
  };

  const mergePickedFiles = (files: FileList | File[] | null) => {
    if (!files || (Array.isArray(files) && files.length === 0)) return;
    const list = Array.isArray(files) ? files : Array.from(files);
    const next: PendingUpload[] = [];
    for (const file of list) {
      const mime = (file.type || "").toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.includes(mime)) continue;
      if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) continue;
      next.push({
        key: fileKey(file),
        file,
        tracing: false,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (next.length === 0) return;
    setPendingUploads((prev) => {
      const seen = new Set(prev.map((p) => p.key));
      const additions = next.filter((p) => !seen.has(p.key));
      return [...prev, ...additions];
    });
    setFieldErrors((prev) => ({ ...prev, images: undefined }));
    if (inputRef.current) inputRef.current.value = "";
  };

  const removePendingAt = (index: number) => {
    setPendingUploads((prev) => {
      const row = prev[index];
      if (row) URL.revokeObjectURL(row.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const movePendingBy = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    setPendingUploads((prev) => {
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const setPendingAsDefault = (index: number) => {
    if (index <= 0) return;
    setPendingUploads((prev) => {
      const next = prev.slice();
      const [picked] = next.splice(index, 1);
      next.unshift(picked);
      return next;
    });
  };

  const setPendingTracingAt = (index: number, tracing: boolean) => {
    setPendingUploads((prev) => prev.map((row, i) => (i === index ? { ...row, tracing } : row)));
  };

  const applyExistingImageOrder = async (newImages: MarkingImage[]) => {
    if (reorderingImages) return;
    const ids = newImages.map((img) => img.imageId).filter((id) => id > 0);
    if (ids.length === 0) return;
    setReorderingImages(true);
    setExistingImages(newImages.map((img, idx) => ({ ...img, displayOrder: idx })));
    try {
      const ok = await reorderImages(ids);
      if (!ok) {
        toast({
          title: "Reorder failed",
          description: "Could not save the new image order. Refreshing from the server.",
          variant: "destructive",
        });
      }
      await refreshImages();
    } finally {
      setReorderingImages(false);
    }
  };

  const moveExistingImageBy = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= existingImages.length) return;
    const next = existingImages.slice();
    [next[index], next[target]] = [next[target], next[index]];
    void applyExistingImageOrder(next);
  };

  const setExistingAsDefault = (index: number) => {
    if (index <= 0) return;
    const next = existingImages.slice();
    const [picked] = next.splice(index, 1);
    next.unshift(picked);
    void applyExistingImageOrder(next);
  };

  const toggleExistingTracing = async (index: number, tracing: boolean) => {
    const img = existingImages[index];
    if (!img) return;
    const ok = await updateImage(img.imageId, { isTracing: tracing });
    if (!ok) {
      toast({
        title: "Could not update image",
        description: "Please try again.",
        variant: "destructive",
      });
      return;
    }
    setExistingImages((prev) => prev.map((row, i) => (i === index ? { ...row, isTracing: tracing } : row)));
  };

  const uploadPendingOrThrow = async (targetCoverId: number) => {
    if (uploading) return;
    if (pendingUploads.length === 0) return;
    setUploading(true);
    try {
      const baseOrder = existingImages.length;
      const created: Array<MarkingImage | null> = [];
      for (let i = 0; i < pendingUploads.length; i += 1) {
        const row = pendingUploads[i];
        const img = await createImageForSubject({
          file: row.file,
          subjectType: "COVER",
          subjectId: targetCoverId,
          imageView: "FRONT",
          isTracing: row.tracing,
          displayOrder: baseOrder + i,
        });
        created.push(img);
      }
      const okCount = created.filter(Boolean).length;
      if (okCount === 0) {
        throw new Error("Could not upload cover images. Check format (PNG, JPG, TIFF) and try again.");
      }
      pendingUploads.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPendingUploads([]);
      await refreshImages();
    } finally {
      setUploading(false);
    }
  };

  const validateForm = (saveAsDraft: boolean): boolean => {
    if (saveAsDraft) {
      setReferenceDetailErrorsById({});
      setFieldErrors({});
      return true;
    }
    const errors: FieldErrorsShape = {};
    const referenceDetailErrors: Record<number, ReferenceDetailFieldErrors> = {};

    if (!type.trim()) {
      errors.type = "Cover type is required.";
    }
    const trimmedDate = (coverDate.date ?? "").trim();
    if (!trimmedDate) {
      errors.date = "Date is required.";
    } else if (!deriveGranularityFromIso(trimmedDate)) {
      errors.date = "Enter a complete calendar date.";
    }
    const imageCount = existingImages.length + pendingUploads.length;
    if (imageCount < 1) {
      errors.images = "At least one cover image is required.";
    }

    for (const work of selectedReferenceWorks) {
      const detail = referenceDetailsById[work.id];
      const page = detail?.pageNumber.trim() ?? "";
      const citationUrl = detail?.citationUrl.trim() ?? "";
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
      errors.referenceWorks = "Fix citation fields for selected reference works.";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      scrollToFirstFieldError(errors);
      return false;
    }
    return true;
  };

  const syncCoverCitations = async (savedCoverPk: number) => {
    const existing = await listCitationsForSubject({ subjectType: "COVER", subjectId: savedCoverPk });
    const byRef = new Map(existing.map((r) => [r.referenceWorkId, r]));
    const selectedIds = new Set(selectedReferenceWorks.map((w) => w.id));

    for (const row of existing) {
      if (!selectedIds.has(row.referenceWorkId)) {
        const ok = await deleteCitationSubject(row.id);
        if (!ok) throw new Error("Could not update reference citations.");
      }
    }
    for (const work of selectedReferenceWorks) {
      const text = citationDetailForApi(work, referenceDetailsById[work.id]);
      const prev = byRef.get(work.id);
      if (prev) {
        if (prev.citationDetail !== text) {
          const ok = await updateCitationSubject(prev.id, text);
          if (!ok) throw new Error("Could not update reference citations.");
        }
      } else {
        const created = await createCitationSubject({
          referenceWorkId: work.id,
          subjectType: "COVER",
          subjectId: savedCoverPk,
          citationDetail: text,
        });
        if (!created) throw new Error("Could not create reference citations.");
      }
    }
  };

  const handleSaveDraft = async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to save a draft.", variant: "destructive" });
      return;
    }
    if (mode !== "create") return;
    if (!Number.isFinite(markingId) || markingId <= 0) {
      toast({
        title: "Invalid marking",
        description: "This cover must be linked to a marking record.",
        variant: "destructive",
      });
      return;
    }

    // State helps route the draft to the correct Collection when available; the
    // API still accepts cover drafts without it (fallback collection + status=draft).
    let stateRoute = routingStateFromMarkingRecord(markingRecord);
    if (!stateRoute) {
      const rec = markingRecord ?? (await getMarkingById(markingId));
      if (rec) {
        if (!markingRecord) setMarkingRecord(rec);
        stateRoute = routingStateFromMarkingRecord(rec);
      }
    }
    if (!stateRoute) {
      stateRoute = await resolveMarkingRoutingState(markingId);
    }
    const oversized = pendingUploads.filter((p) => p.file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024);
    if (oversized.length) {
      toast({
        title: "Image too large",
        description: `Use images under ${MAX_IMAGE_SIZE_MB}MB.`,
        variant: "destructive",
      });
      return;
    }
    if (!validateForm(true)) return;

    setSubmitting(true);
    try {
      await ensureCsrfToken();

      const form = new FormData();
      form.append("submission_kind", "cover");
      form.append("save_as_draft", "true");
      if (editContributionId != null) {
        form.append("edit_contribution_id", String(editContributionId));
      }
      if (stateRoute) {
        form.append("state", stateRoute);
      }
      form.append("parent_marking_id", String(markingId));
      form.append("marking_id", String(markingId));
      if (type.trim()) form.append("type", type.trim().toUpperCase());
      const trimmedDate = coverDate.date.trim();
      const derived = deriveGranularityFromIso(trimmedDate);
      if (derived) {
        form.append("cover_date", derived.normalizedDate);
        form.append("cover_granularity", derived.granularity);
      }
      form.append("is_institutional", String(isInstitutional));
      form.append("is_backstamp", String(isBackstamp));
      const trimmedComment = contributorComment.trim();
      if (trimmedComment) {
        form.append("contributor_comment", trimmedComment);
        form.append("comment_for_editor", trimmedComment);
      }
      selectedReferenceWorks.forEach((w) => form.append("reference_work_ids[]", String(w.id)));
      if (selectedReferenceWorks.length > 0) {
        const payload = selectedReferenceWorks.map((work) => ({
          reference_work_id: work.id,
          page_number: referenceDetailsById[work.id]?.pageNumber?.trim() || undefined,
          url: referenceDetailsById[work.id]?.citationUrl?.trim() || undefined,
        }));
        form.append("reference_work_details", JSON.stringify(payload));
      }
      const tracingTags = pendingUploads.map((p) => (p.tracing ? "tracing" : "photograph"));
      form.append("cover_image_tags", JSON.stringify(tracingTags));
      for (const row of pendingUploads) {
        form.append("cover_image", row.file, row.file.name);
      }

      await apiClient.post("/contributions/", form);

      toast({
        title: editContributionId != null ? "Cover draft updated" : "Cover draft saved",
        description: "Your draft is listed under Associated Covers on this marking.",
      });
      navigate(`/record/${markingId}`);
    } catch (err) {
      toast({
        title: "Could not save draft",
        description: formatAxiosError(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitCatalog = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in before submitting.", variant: "destructive" });
      return;
    }
    if (!validateForm(false)) return;

    const trimmedDate = coverDate.date.trim();
    const derived = deriveGranularityFromIso(trimmedDate);
    if (!derived) return;

    const { granularity, normalizedDate } = derived;

    const coverType = normalizeCoverType(type);
    const coverPayload: CoverWritePayload = {
      type: coverType,
      color: null,
      has_adhesive: false,
      is_institutional: isInstitutional,
      width: null,
      height: null,
    };

    const trimmedComment = contributorComment.trim();

    const oversized = pendingUploads.filter((p) => p.file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024);
    if (oversized.length) {
      toast({
        title: "Image too large",
        description: `Use images under ${MAX_IMAGE_SIZE_MB}MB.`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      let savedCoverId: number;
      let coverMarkingPk: number;
      let originalDates: AssociatedDateSeen[] = [];

      if (mode === "create") {
        const created = await createCover(coverPayload);
        savedCoverId = created.id;
        const link = await createCoverMarking({
          cover: savedCoverId,
          marking: markingId,
          is_backstamp: isBackstamp,
          placement: null,
          contributor_comment: trimmedComment,
        });
        coverMarkingPk = link.id;
      } else {
        if (!coverRow || !coverRow.coverDetails) {
          throw new Error("Cannot edit cover: missing cover details.");
        }
        savedCoverId = coverRow.coverDetails.id;
        coverMarkingPk = coverRow.id;
        originalDates = coverRow.coverDetails.datesSeen;

        await updateCover(savedCoverId, coverPayload);
        await updateCoverMarking(coverMarkingPk, {
          is_backstamp: isBackstamp,
          placement: null,
          contributor_comment: trimmedComment,
        });
      }

      const keepId = coverDate.existingId ?? null;
      const deleteOps = originalDates.filter((d) => d.id !== keepId).map((d) => deleteDateSeen(d.id));

      if (keepId != null) {
        await Promise.all([...deleteOps, updateDateSeen(keepId, { date: normalizedDate, granularity })]);
      } else {
        await Promise.all([
          ...deleteOps,
          createDateSeen({
            subject_type: "COVER",
            subject_id: savedCoverId,
            date: normalizedDate,
            granularity,
          }),
        ]);
      }

      await syncCoverCitations(savedCoverId);

      if (mode === "create") {
        const { covers } = await getMarkingCovers(markingId);
        const found = covers.find((c) => c.id === coverMarkingPk) ?? null;
        setCoverRow(found);
      }

      if (pendingUploads.length > 0) {
        await uploadPendingOrThrow(savedCoverId);
      }

      if (mode === "edit" && coverRow?.reviewStatus === "needs_revision") {
        try {
          await postCoverMarkingResubmit(coverMarkingPk);
        } catch (re) {
          toast({
            title: "Could not resubmit for review",
            description: re instanceof Error ? re.message : "Your edits were saved.",
            variant: "destructive",
          });
        }
      }

      if (editContributionId != null && mode === "create") {
        try {
          await abandonCoverContributionDraft(editContributionId);
        } catch {
          toast({
            title: "Could not remove draft entry",
            description:
              "Your cover was submitted for review, but the saved draft may still appear on the record until it is cleared.",
            variant: "destructive",
          });
        }
      }

      toast({
        title: mode === "create" ? "Cover submitted" : "Cover updated",
        description:
          mode === "create"
            ? "Your cover is linked to this marking and will appear after editor review."
            : "Your changes have been saved.",
      });

      navigate(returnPath());
    } catch (err) {
      toast({
        title: mode === "create" ? "Could not submit cover" : "Could not save cover",
        description: formatAxiosError(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !draftLoadDone) {
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

  if (loadError || draftLoadError) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 bg-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Card className="border-destructive/50">
              <CardContent className="pt-6 space-y-4">
                <p className="text-destructive">{loadError || draftLoadError}</p>
                <Button variant="outline" onClick={handleBack}>
                  Go back
                </Button>
              </CardContent>
            </Card>
          </div>
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
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={handleBack} className="-ml-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>

          <div className="mb-8">
            <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-2">
              Contributor Dashboard
            </h1>
            <p className="text-muted-foreground">
              Submit new cover entries or corrections. All fields match what reviewers see on Submission Detail page.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card className="shadow-archival-lg">
                <CardHeader>
                  <CardTitle className="font-heading text-xl">
                    {mode === "create"
                      ? editContributionId != null
                        ? "Continue Cover Draft"
                        : "Submit New Cover"
                      : "Edit Cover"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {mode === "edit" && coverRow?.reviewStatus === "pending" && (
                    <p className="text-sm rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-900 dark:text-amber-100">
                      This cover is <strong>pending editor review</strong>. It is only visible to you and assigned
                      editors until it is approved.
                    </p>
                  )}
                  {mode === "edit" && coverRow?.reviewStatus === "needs_revision" && (
                    <div className="text-sm rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2 space-y-1">
                      <p className="font-medium text-foreground">Editor requested changes</p>
                      {(coverRow.reviewNotes ?? "").trim().length > 0 ? (
                        <p className="text-muted-foreground whitespace-pre-wrap">{coverRow.reviewNotes}</p>
                      ) : (
                        <p className="text-muted-foreground">Update the cover below, then save to send it back.</p>
                      )}
                    </div>
                  )}

                  <form onSubmit={handleSubmitCatalog} className="space-y-6" noValidate>
                    <div className="space-y-2">
                      <Label htmlFor="cover-type">
                        Type <span className="text-destructive" aria-hidden="true">*</span>
                      </Label>
                      <Select
                        value={type || undefined}
                        onValueChange={(v) => {
                          setType(v);
                          setFieldErrors((prev) => ({ ...prev, type: undefined }));
                        }}
                      >
                        <SelectTrigger id="cover-type" className={cn(fieldErrors.type && "border-destructive")}>
                          <SelectValue placeholder="Select cover type…" />
                        </SelectTrigger>
                        <SelectContent>
                          {COVER_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.type && <p className="text-sm text-destructive">{fieldErrors.type}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cover-date">
                        Date <span className="text-destructive" aria-hidden="true">*</span>
                      </Label>
                      <Input
                        id="cover-date"
                        type="date"
                        value={coverDate.date}
                        onChange={(e) => {
                          setCoverDate((prev) => ({ ...prev, date: e.target.value }));
                          setFieldErrors((prev) => ({ ...prev, date: undefined }));
                        }}
                        disabled={submitting}
                        className={cn(fieldErrors.date && "border-destructive")}
                      />
                      {fieldErrors.date && <p className="text-sm text-destructive">{fieldErrors.date}</p>}
                    </div>

                    <div className="space-y-2" id="cover-images-zone">
                      <Label>
                        Cover images <span className="text-destructive" aria-hidden="true">*</span>
                      </Label>
                      <input
                        ref={inputRef}
                        type="file"
                        accept={ALLOWED_IMAGE_TYPES.join(",")}
                        multiple
                        className="hidden"
                        onChange={(e) => mergePickedFiles(e.target.files)}
                      />
                      <div
                        role="presentation"
                        tabIndex={0}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            inputRef.current?.click();
                          }
                        }}
                        onClick={() => inputRef.current?.click()}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          setDropActive(true);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDropActive(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          setDropActive(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDropActive(false);
                          mergePickedFiles(e.dataTransfer.files);
                        }}
                        className={cn(
                          "rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-6 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          dropActive && "border-primary bg-muted/40",
                          fieldErrors.images && "border-destructive",
                        )}
                      >
                        <div className="pointer-events-none flex flex-col items-center gap-2 text-center select-none">
                          <Upload className="h-10 w-10 text-muted-foreground" aria-hidden />
                          <p className="text-sm text-muted-foreground">
                            Click or drag images here (PNG, JPG, TIFF — max {MAX_IMAGE_SIZE_MB}MB each).
                          </p>
                        </div>

                        {imagesLoading ? (
                          <div className="pointer-events-none flex items-center gap-2 text-sm text-muted-foreground mt-4 justify-center">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading images…
                          </div>
                        ) : (
                          (existingImages.length > 0 || pendingUploads.length > 0) && (
                            <div
                              className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6 pointer-events-auto"
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              {existingImages.map((img, idx) => {
                                const url = normalizeImageUrl(img.imageUrl);
                                const isDefault = img.displayOrder === 0;
                                return (
                                  <div key={img.imageId} className="flex flex-col items-center gap-2 rounded border border-border p-3">
                                    <div className="h-36 w-36 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center border border-border">
                                      {url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={url} alt="" className="max-h-full max-w-full object-contain" />
                                      ) : (
                                        <span className="text-xs text-muted-foreground text-center px-2">No preview</span>
                                      )}
                                    </div>
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label="Move left"
                                        disabled={reorderingImages || idx === 0}
                                        onClick={() => moveExistingImageBy(idx, -1)}
                                      >
                                        <ArrowLeft className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label="Move right"
                                        disabled={reorderingImages || idx === existingImages.length - 1}
                                        onClick={() => moveExistingImageBy(idx, 1)}
                                      >
                                        <ArrowRight className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant={isDefault ? "secondary" : "ghost"}
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label="Set as default"
                                        disabled={reorderingImages || isDefault}
                                        onClick={() => setExistingAsDefault(idx)}
                                      >
                                        <Star className={cn("h-4 w-4", isDefault && "fill-current")} />
                                      </Button>
                                    </div>
                                    <label className="flex items-center gap-2 text-sm">
                                      <Checkbox
                                        checked={img.isTracing === true}
                                        onCheckedChange={(v) => void toggleExistingTracing(idx, v === true)}
                                        disabled={submitting}
                                      />
                                      Tracing
                                    </label>
                                  </div>
                                );
                              })}

                              {pendingUploads.map((row, idx) => {
                                const isDefault = idx === 0 && existingImages.length === 0;
                                return (
                                  <div key={row.key} className="flex flex-col items-center gap-2 rounded border border-border p-3">
                                    <div className="h-36 w-36 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center border border-border">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={row.previewUrl} alt="" className="max-h-full max-w-full object-contain" />
                                    </div>
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label="Move left"
                                        disabled={idx === 0}
                                        onClick={() => movePendingBy(idx, -1)}
                                      >
                                        <ArrowLeft className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label="Move right"
                                        disabled={idx === pendingUploads.length - 1}
                                        onClick={() => movePendingBy(idx, 1)}
                                      >
                                        <ArrowRight className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant={isDefault ? "secondary" : "ghost"}
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label="Set as default"
                                        disabled={isDefault}
                                        onClick={() => setPendingAsDefault(idx)}
                                      >
                                        <Star className={cn("h-4 w-4", isDefault && "fill-current")} />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label="Remove"
                                        onClick={() => removePendingAt(idx)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    <label className="flex items-center gap-2 text-sm">
                                      <Checkbox
                                        checked={row.tracing}
                                        onCheckedChange={(v) => setPendingTracingAt(idx, v === true)}
                                      />
                                      Tracing
                                    </label>
                                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">{row.file.name}</p>
                                  </div>
                                );
                              })}
                            </div>
                          )
                        )}
                      </div>
                      {fieldErrors.images && <p className="text-sm text-destructive">{fieldErrors.images}</p>}
                    </div>

                    <div className="space-y-3 pt-1">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={isInstitutional}
                          onCheckedChange={(v) => setIsInstitutional(v === true)}
                          disabled={submitting}
                        />
                        Institutionally Owned
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={isBackstamp} onCheckedChange={(v) => setIsBackstamp(v === true)} disabled={submitting} />
                        Backstamp
                      </label>
                    </div>

                    <div className="space-y-3" id="cover-reference-works">
                      <div className="space-y-2">
                        <Label>Reference Works</Label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="outline" className="w-full justify-between" disabled={referenceWorksLoading}>
                              <span>
                                {referenceWorksLoading
                                  ? "Loading reference works…"
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
                              <div className="px-2 py-1.5 text-sm text-destructive">{referenceWorksError}</div>
                            ) : referenceWorks.length === 0 ? (
                              <div className="px-2 py-1.5 text-sm text-muted-foreground">No reference works found.</div>
                            ) : (
                              referenceWorks.map((work) => {
                                const checked = selectedReferenceWorks.some((w) => w.id === work.id);
                                return (
                                  <DropdownMenuCheckboxItem
                                    key={work.id}
                                    checked={checked}
                                    onCheckedChange={(next) => {
                                      if (next) {
                                        setSelectedReferenceWorks((prev) =>
                                          prev.some((w) => w.id === work.id) ? prev : [...prev, work],
                                        );
                                        setReferenceDetailsById((prev) => ({
                                          ...prev,
                                          [work.id]: prev[work.id] ?? { pageNumber: "", citationUrl: "" },
                                        }));
                                      } else {
                                        setSelectedReferenceWorks((prev) => prev.filter((w) => w.id !== work.id));
                                        setReferenceDetailsById((prev) => {
                                          const u = { ...prev };
                                          delete u[work.id];
                                          return u;
                                        });
                                        setReferenceDetailErrorsById((prev) => {
                                          const u = { ...prev };
                                          delete u[work.id];
                                          return u;
                                        });
                                      }
                                      setFieldErrors((prev) => ({ ...prev, referenceWorks: undefined }));
                                    }}
                                  >
                                    {work.title || `Reference #${work.id}`}
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
                            <div key={work.id} className="rounded-md border border-border px-3 py-2 space-y-3">
                              <p className="text-sm font-medium truncate">{work.title || "Untitled"}</p>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Page number</Label>
                                  <Input
                                    value={referenceDetailsById[work.id]?.pageNumber ?? ""}
                                    className={referenceDetailErrorsById[work.id]?.pageNumber ? "border-destructive" : ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setReferenceDetailsById((prev) => ({
                                        ...prev,
                                        [work.id]: {
                                          pageNumber: v,
                                          citationUrl: prev[work.id]?.citationUrl ?? "",
                                        },
                                      }));
                                      setReferenceDetailErrorsById((prev) => ({
                                        ...prev,
                                        [work.id]: { ...prev[work.id], pageNumber: undefined },
                                      }));
                                    }}
                                  />
                                  {referenceDetailErrorsById[work.id]?.pageNumber && (
                                    <p className="text-xs text-destructive">{referenceDetailErrorsById[work.id]?.pageNumber}</p>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Citation URL</Label>
                                  <Input
                                    value={referenceDetailsById[work.id]?.citationUrl ?? ""}
                                    className={referenceDetailErrorsById[work.id]?.citationUrl ? "border-destructive" : ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setReferenceDetailsById((prev) => ({
                                        ...prev,
                                        [work.id]: {
                                          pageNumber: prev[work.id]?.pageNumber ?? "",
                                          citationUrl: v,
                                        },
                                      }));
                                      setReferenceDetailErrorsById((prev) => ({
                                        ...prev,
                                        [work.id]: { ...prev[work.id], citationUrl: undefined },
                                      }));
                                    }}
                                  />
                                  {referenceDetailErrorsById[work.id]?.citationUrl && (
                                    <p className="text-xs text-destructive">{referenceDetailErrorsById[work.id]?.citationUrl}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {fieldErrors.referenceWorks && (
                        <p className="text-sm text-destructive">{fieldErrors.referenceWorks}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contributor-comment">Comment for editor</Label>
                      <Textarea
                        id="contributor-comment"
                        rows={3}
                        placeholder="Optional notes for reviewers."
                        value={contributorComment}
                        onChange={(e) => setContributorComment(e.target.value)}
                        disabled={submitting}
                      />
                      {fieldErrors.contributorComment && (
                        <p className="text-sm text-destructive">{fieldErrors.contributorComment}</p>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      {mode === "create" && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full sm:flex-1"
                          disabled={submitting || uploading}
                          onClick={() => void handleSaveDraft()}
                        >
                          Save as Draft
                        </Button>
                      )}
                      <Button type="submit" className="w-full sm:flex-1" disabled={submitting || uploading}>
                        {submitting ? "Saving…" : mode === "create" ? "Submit Cover" : "Save changes"}
                      </Button>
                    </div>
                  </form>
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
                    <strong className="text-foreground">Image Quality:</strong> Provide clear, high-resolution scans or photographs.
                  </p>
                  <p className="leading-relaxed">
                    <strong className="text-foreground">Accuracy:</strong> Verify all dates and details before submission.
                  </p>
                  <p className="leading-relaxed">
                    <strong className="text-foreground">Reference works:</strong> Include references when available to help verification.
                  </p>
                  <p className="leading-relaxed">
                    <strong className="text-foreground">Review Time:</strong> Most submissions are reviewed within 1–3 business days.
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
}
