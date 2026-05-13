import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, History, Loader2, MessageSquare, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { formatCatalogDate, markingTypeLabel } from "@/lib/catalogRecordDisplay";
import {
  getMarkingById,
  getMarkingChangelog,
  getMarkingCovers,
  normalizeImageUrl,
  reorderImages,
  type AssociatedCover,
  type AssociatedDateSeen,
  type MarkingChangelogEvent,
  type MarkingCitation,
  type MarkingCitationReferenceWork,
  type MarkingImage,
  type MarkingRecord,
  type MarkingTypeValue,
} from "@/services/markings";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { AuthUser } from "@/lib/auth";
import { deleteCover } from "@/services/covers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type GalleryImage = {
  imageUrl: string | null;
  originalFilename?: string;
  /**
   * Subject label shown in the upper-left tag stack: "Cover" when the image
   * is attached to an associated cover (subject_type=COVER), otherwise the
   * marking's type label (Townmark / Ratemark / Auxmark) since
   * subject_type=MARKING images belong to the marking itself.
   */
  subjectLabel: string;
  isDefault: boolean;
  isTracing: boolean;
  /**
   * Backing image_id (Image.image_id) used by the editor reorder controls
   * to call PATCH /api/v2/images/{id}/. null only on the synthetic
   * "image not available" placeholder slide.
   */
  imageId: number | null;
};

const EMPTY = "-";

function isCircleShapeName(shapeName: string | null | undefined): boolean {
  const s = String(shapeName ?? "").trim().toLowerCase();
  if (!s) return false;
  if (s === "c - circle") return true;
  return s.includes("circle");
}

function dimensionsDisplay(record: MarkingRecord): string {
  const w = record.width?.trim() ?? "";
  const h = record.height?.trim() ?? "";

  // Circle / Oval -> display the diameter, not WxH. Must run BEFORE the
  // sizeDisplay branch because the API serializer always populates
  // size_display as "WxH" (see common/api/v2/serializers.py
  // get_size_display); deferring this check would surface "28x28 mm" for
  // circles instead of "28 mm diameter" and disagree with the Search card.
  if (!record.isManuscript && isCircleShapeName(record.shapeName)) {
    const d = w || h;
    if (d) return `${d} mm diameter`;
    return "";
  }
  if (record.sizeDisplay && record.sizeDisplay.trim()) {
    return record.sizeDisplay.trim().includes("mm")
      ? record.sizeDisplay.trim()
      : `${record.sizeDisplay.trim()} mm`;
  }
  if (w && h) return `${w}x${h} mm`;
  if (w) return `${w} mm`;
  if (h) return `${h} mm`;
  return "";
}

function coverDimensionsDisplay(width: string | null, height: string | null): string {
  const w = (width ?? "").trim();
  const h = (height ?? "").trim();
  if (w && h) return `${w}x${h} mm`;
  if (w) return `${w} mm`;
  if (h) return `${h} mm`;
  return EMPTY;
}

function coverTypeLabel(t: string | null): string {
  if (t === "FC") return "Folded Cover";
  if (t === "FL") return "Folded Letter";
  return EMPTY;
}

function formatCoverDate(d: AssociatedDateSeen): string {
  // Honor the dates_seen granularity: YEAR -> "1980", MONTH -> "01/1980",
  // DAY -> "01/01/1980". Truncating the ISO string before formatting lets
  // formatCatalogDate pick the matching display shape.
  const raw = d.date || "";
  const truncated =
    d.granularity === "YEAR"
      ? raw.slice(0, 4)
      : d.granularity === "MONTH"
        ? raw.slice(0, 7)
        : raw.slice(0, 10);
  return formatCatalogDate(truncated) || truncated;
}

function yearOnly(value: string | null | undefined): string {
  const s = value != null ? String(value).trim() : "";
  if (!s) return "";
  const m = /^(\d{4})/.exec(s);
  return m ? m[1] : s;
}

function formatRateValue(cents: string | null | undefined): string {
  if (cents == null || String(cents).trim() === "") return "";
  const n = parseFloat(String(cents));
  if (!Number.isFinite(n)) return "";
  return (n / 100).toFixed(2);
}

/**
 * Title text for a citation entry. The optional reference-work `code`
 * (editor-assigned identifier like "ASCC-204") is shown as a separate
 * badge in the UI, so this function returns just the human-readable
 * title and leaves the code to the caller.
 */
function citationTitle(citation: MarkingCitation): string {
  const rw = citation.referenceWork;
  if (!rw) return "Reference work";
  const title = rw.title.trim();
  if (title) return title;
  const code = (rw.code ?? "").trim();
  return code || "Reference work";
}

/**
 * Build the "Author (Year)" subtitle that sits directly under the title.
 * Returns "" when neither field is populated; either alone is fine.
 */
function citationByline(rw: MarkingCitationReferenceWork | null): string {
  if (!rw) return "";
  const authorship = rw.authorship.trim();
  const year = rw.publicationYear != null ? String(rw.publicationYear) : "";
  if (authorship && year) return `${authorship} (${year})`;
  if (authorship) return authorship;
  if (year) return `(${year})`;
  return "";
}

function inscriptionLabel(type: MarkingTypeValue): string {
  if (type === "RATEMARK") return "Ratemark Text";
  if (type === "AUXMARK") return "Auxiliary/Instructional Text";
  return "Townmark Text";
}

/**
 * Format a server-side ISO timestamp (e.g. "2026-04-12T19:34:51.123Z") for
 * the Record History row. We render in the viewer's locale so timestamps
 * read naturally, with second precision since events can fire close together
 * during automated workflows. Falls back to the raw string if Date parsing
 * fails (e.g. a malformed payload) so editors still see *something*.
 */
function formatHistoryTimestamp(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Fallback when an event has no actor email (e.g. system-generated). */
function historyActorDisplay(event: MarkingChangelogEvent): string {
  const email = (event.actor_email ?? "").trim();
  if (email) return email;
  const actor = (event.actor ?? "").trim();
  if (actor) return actor;
  return "system";
}

function shouldShowEditorComment(params: {
  user: AuthUser | null;
  editorComment: string;
}): boolean {
  if (!params.editorComment.trim()) return false;
  if (!params.user) return false;
  return (
    params.user.role === "editor" ||
    params.user.role === "administrator" ||
    params.user.is_superuser === true
  );
}

function hasDisplayValue(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return s !== "" && s !== "-" && s.toLowerCase() !== "unknown";
}

function buildGalleryImages(record: MarkingRecord): GalleryImage[] {
  const typeLabel = markingTypeLabel(record.type) || "Marking";
  return record.images.map((img: MarkingImage) => ({
    imageUrl: normalizeImageUrl(img.imageUrl),
    originalFilename: img.originalFilename || undefined,
    subjectLabel: img.subjectType === "COVER" ? "Cover" : typeLabel,
    // display_order=0 is the canonical "default" slot — matches the editor
    // tooling on ContributionDetail.tsx where displayOrder===0 is what gets
    // labeled "Default" / "Set default".
    isDefault: img.displayOrder === 0,
    isTracing: img.subjectType === "MARKING" && img.isTracing,
    imageId: img.imageId > 0 ? img.imageId : null,
  }));
}

function DetailRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last: boolean;
}) {
  return (
    <div
      className={`flex justify-between py-2 ${last ? "" : "border-b border-border"}`}
    >
      <dt className="text-muted-foreground font-medium">{label}</dt>
      <dd className="text-foreground whitespace-pre-line text-right">{value}</dd>
    </div>
  );
}

function AssociatedCoverEntry({
  cover,
  isFirst,
  onEdit,
  onDelete,
  isDeleting,
}: {
  cover: AssociatedCover;
  isFirst: boolean;
  /** Per-row "Submit Edit" hook. Navigates to cover edit page. */
  onEdit?: (cover: AssociatedCover) => void;
  /**
   * Per-row "Delete Cover" hook (editor-only). Rendered at the bottom of the
   * entry; parent owns the confirmation modal so all rows share a single
   * AlertDialog.
   */
  onDelete?: (cover: AssociatedCover) => void;
  /** True while a delete request is in flight against this cover. */
  isDeleting?: boolean;
}) {
  const c = cover.coverDetails;
  const datesText =
    c && c.datesSeen.length > 0
      ? c.datesSeen.map(formatCoverDate).filter(Boolean).join("\n")
      : EMPTY;
  const colorText = c?.colorName?.trim() ?? "";
  const allRows: { label: string; value: string; show: boolean }[] = [
    { label: "Catalog key", value: c?.code?.trim() || EMPTY, show: true },
    { label: "Color", value: colorText, show: colorText.length > 0 },
    { label: "Type", value: coverTypeLabel(c?.type ?? null), show: true },
    {
      label: "Dimensions",
      value: coverDimensionsDisplay(c?.width ?? null, c?.height ?? null),
      show: coverDimensionsDisplay(c?.width ?? null, c?.height ?? null) !== EMPTY,
    },
    { label: "Dates", value: datesText, show: true },
    { label: "Has adhesive", value: "Yes", show: c?.hasAdhesive === true },
    { label: "Institutionally Owned", value: "Yes", show: c?.isInstitutional === true },
    { label: "Backstamp", value: "Yes", show: cover.isBackstamp === true },
  ];
  const rows = allRows.filter((r) => r.show);
  return (
    <div className={isFirst ? "" : "border-t-2 border-primary/40 pt-6 mt-6"}>
      {onEdit && (
        <div className="flex justify-end gap-2 mb-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(cover)}
            aria-label="Submit edit for this cover"
            disabled={isDeleting}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Submit Edit
          </Button>
        </div>
      )}
      <dl className="text-sm">
        {rows.map((r, i) => (
          <DetailRow
            key={r.label}
            label={r.label}
            value={r.value}
            last={i === rows.length - 1}
          />
        ))}
      </dl>
      {onDelete && (
        <div className="flex justify-end gap-2 mt-3">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(cover)}
            aria-label="Delete this cover"
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Delete Cover
          </Button>
        </div>
      )}
    </div>
  );
}

const RecordDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuth();
  const { toast } = useToast();
  const { id } = useParams();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<MarkingRecord | null>(null);
  const [associatedCovers, setAssociatedCovers] = useState<AssociatedCover[]>([]);
  const [coversOpen, setCoversOpen] = useState(true);
  // Delete-cover confirmation: holds the cover the user has just clicked
  // "Delete Cover" on. AlertDialog renders only when this is non-null.
  // deletingCoverId tracks the in-flight DELETE so the row's button can
  // show a spinner and other rows' delete buttons can be disabled while
  // we're talking to the server.
  const [pendingDeleteCover, setPendingDeleteCover] =
    useState<AssociatedCover | null>(null);
  const [deletingCoverId, setDeletingCoverId] = useState<number | null>(null);
  const [historyEvents, setHistoryEvents] = useState<MarkingChangelogEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  // Disables the editor's reorder buttons while a PATCH round-trip is in
  // flight. Without this an editor can fire two overlapping reorders before
  // the first one resolves, producing inconsistent display_order values.
  const [reorderingImages, setReorderingImages] = useState(false);

  const markingId = id ? parseInt(String(id).replace(/^api-/, ""), 10) : null;

  // Editors see the Record History panel; everyone else doesn't even fire the
  // changelog request. Mirrors the same role gate used for the destructive
  // Delete buttons further down so a single role-string change can't desync
  // the two surfaces. user is `null` while we're still resolving auth, so
  // wait for that to settle before deciding.
  const canViewHistory = useMemo(() => {
    if (!user) return false;
    return (
      user.role === "editor" ||
      user.role === "administrator" ||
      user.is_superuser === true
    );
  }, [user]);

  useEffect(() => {
    if (markingId == null || Number.isNaN(markingId)) {
      setError("Invalid record ID");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMarkingById(markingId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setError("Record not found");
          return;
        }
        setRecord(data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load record");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [markingId]);

  // Fetcher extracted so both the initial mount and post-edit navigation
  // returns can refresh the cover list without duplicating request logic.
  // setCoversOpen is intentionally only touched on the mount path so a save
  // doesn't clobber the user's collapse choice.
  const refreshAssociatedCovers = useCallback(
    async (options?: { resetOpen?: boolean }) => {
      if (markingId == null || Number.isNaN(markingId)) {
        setAssociatedCovers([]);
        return;
      }
      const rows = await getMarkingCovers(markingId);
      setAssociatedCovers(rows);
      if (options?.resetOpen) setCoversOpen(rows.length > 0);
    },
    [markingId],
  );

  useEffect(() => {
    if (markingId == null || Number.isNaN(markingId)) {
      setAssociatedCovers([]);
      return;
    }
    let cancelled = false;
    getMarkingCovers(markingId).then((rows) => {
      if (cancelled) return;
      setAssociatedCovers(rows);
      setCoversOpen(rows.length > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [markingId]);

  // Record History (audit trail). Only fires for editor-class users since the
  // backend `markings/{id}/changelog/` endpoint requires
  // `_user_is_responsible_for_marking` (assigned region OR superuser). For
  // unauthorized users the call returns null (see getMarkingChangelog), which
  // we surface as an empty-state message inside the panel instead of crashing
  // the page.
  useEffect(() => {
    if (markingId == null || Number.isNaN(markingId)) {
      setHistoryEvents([]);
      setHistoryError(null);
      return;
    }
    if (!canViewHistory) {
      setHistoryEvents([]);
      setHistoryError(null);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryExpanded(false);
    getMarkingChangelog(markingId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setHistoryEvents([]);
          setHistoryError(
            "Unable to load record history (you may not be assigned to this region).",
          );
          return;
        }
        setHistoryEvents(Array.isArray(data.events) ? data.events : []);
      })
      .catch(() => {
        if (cancelled) return;
        setHistoryEvents([]);
        setHistoryError("Unable to load record history.");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [markingId, canViewHistory]);

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  /**
   * Apply a new ordering to the marking's images. Optimistically rewrites
   * `record.images` so the UI re-renders immediately, fires parallel PATCHes
   * to /api/v2/images/{id}/, and refetches the marking on completion to
   * reconcile any drift (e.g. if a concurrent edit changed display_order).
   * Used by the "Move up", "Move down", and "Set as default" controls.
   */
  const applyImageOrder = async (newImages: MarkingImage[]) => {
    if (markingId == null || Number.isNaN(markingId)) return;
    if (newImages.length === 0) return;
    setReorderingImages(true);
    setRecord((prev) =>
      prev
        ? {
            ...prev,
            images: newImages.map((img, idx) => ({
              ...img,
              displayOrder: idx,
            })),
            mainImage: newImages[0] ?? null,
            secondImage: newImages[1] ?? null,
          }
        : prev,
    );
    try {
      const ok = await reorderImages(
        newImages.map((img) => img.imageId).filter((id) => id > 0),
      );
      if (!ok) {
        toast({
          title: "Reorder failed",
          description:
            "Could not save the new image order. Refreshing from the server.",
          variant: "destructive",
        });
      }
      const refreshed = await getMarkingById(markingId);
      if (refreshed) setRecord(refreshed);
    } finally {
      setReorderingImages(false);
    }
  };

  const moveImageBy = (index: number, offset: -1 | 1) => {
    if (!record) return;
    const target = index + offset;
    if (target < 0 || target >= record.images.length) return;
    const next = record.images.slice();
    [next[index], next[target]] = [next[target], next[index]];
    void applyImageOrder(next);
  };

  const setImageAsDefault = (index: number) => {
    if (!record) return;
    if (index <= 0 || index >= record.images.length) return;
    const next = record.images.slice();
    const [picked] = next.splice(index, 1);
    next.unshift(picked);
    void applyImageOrder(next);
  };

  const fromDashboard = location.state?.fromDashboard;
  const handleBack = () => {
    if (fromDashboard) {
      navigate("/dashboard");
    } else {
      navigate(-1);
    }
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

  if (error || !record) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">{error || "Record not found"}</p>
          <Button variant="outline" onClick={handleBack}>Back</Button>
        </div>
        <Footer />
      </div>
    );
  }

  const editorComment = record.desc?.trim() ?? "";
  const showEditorComment = shouldShowEditorComment({ user, editorComment });
  const galleryImages = buildGalleryImages(record);
  const typeLabel = markingTypeLabel(record.type) || "Townmark";

  const goEdit = () =>
    navigate(`/edit/${record.id}?mode=suggestion`, {
      state: {
        fromSearch: location.state?.fromSearch,
        fromDashboard,
        fromDashboardViaDetail: !!fromDashboard,
        mode: "suggestion",
      },
    });

  const dimensionsValue = dimensionsDisplay(record) || EMPTY;
  const earliestValue = yearOnly(record.earliestSeen);
  const latestValue = yearOnly(record.latestSeen);
  const impressionValue =
    record.impression && record.impression.trim().toLowerCase() !== "normal"
      ? record.impression
      : "";
  const isIrregValue = record.isIrreg === true ? "Yes" : "";
  const isStaff =
    !!user &&
    (user.role === "editor" ||
      user.role === "administrator" ||
      user.is_superuser === true);

  // Record History display rule: collapsed by default we show only the most
  // recent event; when expanded we cap at the 10 newest events. Backend
  // already returns events sorted by timestamp DESC, so we slice from the
  // front to avoid an extra sort pass on every render.
  const HISTORY_COLLAPSED_LIMIT = 1;
  const HISTORY_EXPANDED_LIMIT = 10;
  const visibleHistoryEvents = historyExpanded
    ? historyEvents.slice(0, HISTORY_EXPANDED_LIMIT)
    : historyEvents.slice(0, HISTORY_COLLAPSED_LIMIT);
  const hasMoreHistory = historyEvents.length > HISTORY_COLLAPSED_LIMIT;
  const historyOverflow = Math.max(
    0,
    historyEvents.length - HISTORY_EXPANDED_LIMIT,
  );

  // Field order mirrors the contribute/edit form. Town and State/Territory show
  // for every mark type (Townmark, Ratemark, Auxmark), not just Townmarks.
  //
  // Shape / Lettering / Dimensions:
  //   - Manuscripts have no shape/lettering/dimensions by data model, so we
  //     always hide these rows for manuscript markings.
  //   - Townmarks always include them (subject to the standard
  //     alwaysShow=false + hasDisplayValue filter that hides blanks).
  //   - Ratemark / Auxmark also include them with the same blank-filter, so
  //     real values still show on the record detail page; the Search card
  //     (CatalogRecordFields.tsx, variant="search") intentionally hides them
  //     for non-Townmarks to avoid cluttering result rows.
  const showPhysicalDetailFields = record.isManuscript !== true;
  const details = [
    { label: "Type", value: typeLabel, alwaysShow: false },
    { label: "Manuscript", value: record.isManuscript ? "Yes" : "No", alwaysShow: false },
    { label: "State/Territory", value: record.state, alwaysShow: false },
    { label: "Town", value: record.town, alwaysShow: false },
    { label: inscriptionLabel(record.type), value: record.inscriptionTxt, alwaysShow: false },
    { label: "Earliest Seen", value: earliestValue, alwaysShow: true },
    { label: "Latest Seen", value: latestValue, alwaysShow: true },
    ...(showPhysicalDetailFields ? [{ label: "Shape", value: record.shapeName, alwaysShow: false }] : []),
    // Rate Value: always shown for Ratemarks (even when blank), shown for
    // Auxmarks only when populated, never shown for Townmarks.
    ...(record.type === "RATEMARK"
      ? [{ label: "Rate Value", value: formatRateValue(record.rateVal), alwaysShow: true }]
      : record.type === "AUXMARK"
        ? [{ label: "Rate Value", value: formatRateValue(record.rateVal), alwaysShow: false }]
        : []),
    { label: "Date Format", value: record.dateFmt, alwaysShow: false },
    { label: "Impression", value: impressionValue, alwaysShow: false },
    { label: "Is Irregular", value: isIrregValue, alwaysShow: false },
    { label: "Color", value: record.colorName, alwaysShow: false },
    ...(showPhysicalDetailFields ? [{ label: "Lettering", value: record.letteringName, alwaysShow: false }] : []),
    ...(showPhysicalDetailFields ? [{ label: "Dimensions", value: dimensionsValue, alwaysShow: false }] : []),
    ...(isStaff
      ? [{ label: "Catalog text", value: record.catalogTxt, alwaysShow: false }]
      : []),
    { label: "Catalog code", value: record.code, alwaysShow: false },
  ];
  const visibleDetails = details.filter(
    (row) => row.alwaysShow || hasDisplayValue(row.value),
  );

  const coverCount = associatedCovers.length;
  // Unauthenticated visitors clicking a write-action button get bounced to
  // /auth with `from` state so the auth page can return them here after
  // login. Matches the pattern used in App.tsx for protected routes.
  const requireAuth = (): boolean => {
    if (user) return true;
    navigate("/auth", { state: { from: location } });
    return false;
  };
  const openNewCoverDialog = () => {
    if (!requireAuth()) return;
    navigate(`/record/${markingId}/cover/new`, {
      state: { from: location.pathname + location.search },
    });
  };
  const openEditCoverDialog = (cover: AssociatedCover) => {
    if (!requireAuth()) return;
    navigate(`/record/${markingId}/cover/${cover.id}`, {
      state: { from: location.pathname + location.search },
    });
  };

  const requestDeleteCover = (cover: AssociatedCover) => {
    setPendingDeleteCover(cover);
  };

  const confirmDeleteCover = async () => {
    const cover = pendingDeleteCover;
    if (!cover || !cover.coverDetails) return;
    const coverPk = cover.coverDetails.id;
    setDeletingCoverId(coverPk);
    try {
      // DELETE /covers/{id}/ cascades to CoverMarking via FK on_delete=CASCADE.
      // DateSeen is polymorphic (no FK), so cover-bound dates are NOT cascaded
      // by the DB; the backend Cover delete path is responsible for cleaning
      // up DateSeen rows where subject_type=COVER and subject_id=coverPk. We
      // therefore still issue a single DELETE /covers/{id}/ here and rely on
      // the server-side cleanup rather than fanning out to /dates-seen/{id}/.
      await deleteCover(coverPk);
      toast({
        title: "Cover deleted",
        description: "The cover and its dates were removed from this marking.",
      });
      setPendingDeleteCover(null);
      await refreshAssociatedCovers({ resetOpen: true });
    } catch (err) {
      toast({
        title: "Could not delete cover",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingCoverId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <Button variant="ghost" onClick={handleBack} className="-ml-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>

          <div className="grid items-start lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <Card className="shadow-archival-lg">
                <CardContent className="p-6">
                  <Carousel setApi={setApi} className="w-full">
                    <CarouselContent>
                      {(galleryImages.length
                        ? galleryImages
                        : [
                            {
                              imageUrl: imageNotAvailable,
                              subjectLabel: typeLabel,
                              isDefault: false,
                              isTracing: false,
                            } satisfies GalleryImage,
                          ]
                      ).map((img, index) => {
                        const src = img.imageUrl || imageNotAvailable;
                        const alt = img.originalFilename || `Image ${index + 1}`;
                        const isPlaceholder = !img.imageUrl;
                        const inner = (
                          <div className="relative flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                            <img src={src} alt={alt} className="w-full h-full object-contain" />
                            <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1">
                              <Badge variant="secondary">{img.subjectLabel}</Badge>
                              {!isPlaceholder && img.isTracing && (
                                <Badge variant="secondary">Tracing</Badge>
                              )}
                            </div>
                          </div>
                        );
                        return (
                          <CarouselItem key={index}>
                            {img.imageUrl ? (
                              <a
                                href={img.imageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${alt} in new tab`}
                                className="block"
                              >
                                {inner}
                              </a>
                            ) : (
                              inner
                            )}
                          </CarouselItem>
                        );
                      })}
                    </CarouselContent>
                    {galleryImages.length > 1 && (<><CarouselPrevious className="left-2" /><CarouselNext className="right-2" /></>)}
                  </Carousel>
                  {galleryImages.length > 1 && (
                    <div className="flex justify-center gap-2 mt-4">
                      {galleryImages.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => api?.scrollTo(index)}
                          className={`h-2 rounded-full transition-all ${index === current ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"}`}
                          aria-label={`Go to image ${index + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-archival-md">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Associated Thumbnails</CardTitle>
                </CardHeader>
                <CardContent>
                  {galleryImages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No approved images linked to this marking.</p>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {galleryImages.map((img, idx) => {
                        const canReorder =
                          isStaff && img.imageId != null && galleryImages.length > 1;
                        return (
                          <div
                            key={`${img.imageId ?? img.originalFilename ?? "img"}-${idx}`}
                            className="flex flex-col items-center gap-1 shrink-0"
                          >
                            <button
                              type="button"
                              onClick={() => api?.scrollTo(idx)}
                              aria-label={`Show image ${idx + 1}`}
                              className={`relative h-16 w-16 rounded border overflow-hidden transition-all ${idx === current ? "border-primary ring-2 ring-primary" : "border-border"}`}
                            >
                              <img
                                src={img.imageUrl || imageNotAvailable}
                                alt={img.originalFilename || `Thumbnail ${idx + 1}`}
                                className="h-full w-full object-cover"
                              />
                            </button>
                            {canReorder && (
                              // Editor reorder strip. Each button issues a
                              // PATCH /api/v2/images/{id}/ via applyImageOrder
                              // (with optimistic UI). Star = move to position
                              // 0 = becomes the Catalog Search thumbnail.
                              <div className="flex items-center gap-0.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  aria-label="Move thumbnail left"
                                  disabled={
                                    reorderingImages || idx === 0
                                  }
                                  onClick={() => moveImageBy(idx, -1)}
                                >
                                  <ArrowUp className="h-3 w-3 -rotate-90" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  aria-label="Move thumbnail right"
                                  disabled={
                                    reorderingImages ||
                                    idx === galleryImages.length - 1
                                  }
                                  onClick={() => moveImageBy(idx, 1)}
                                >
                                  <ArrowDown className="h-3 w-3 -rotate-90" />
                                </Button>
                                <Button
                                  type="button"
                                  variant={img.isDefault ? "secondary" : "ghost"}
                                  size="icon"
                                  className="h-6 w-6"
                                  aria-label="Set as default catalog thumbnail"
                                  title={
                                    img.isDefault
                                      ? "Default catalog thumbnail"
                                      : "Set as default catalog thumbnail"
                                  }
                                  disabled={reorderingImages || img.isDefault}
                                  onClick={() => setImageAsDefault(idx)}
                                >
                                  <Star
                                    className={`h-3 w-3 ${img.isDefault ? "fill-current" : ""}`}
                                  />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {isStaff && (
                <Card className="shadow-archival-md">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg flex items-center gap-2">
                      <History className="h-5 w-5 text-muted-foreground" />
                      Record History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {historyLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading history...
                      </div>
                    ) : historyError ? (
                      <p className="text-sm text-muted-foreground">{historyError}</p>
                    ) : historyEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No audit events recorded for this marking yet.
                      </p>
                    ) : (
                      <>
                        <ul className="divide-y divide-border text-sm">
                          {visibleHistoryEvents.map((event) => (
                            <li
                              key={event.event_id}
                              className="py-3 first:pt-0 last:pb-0"
                            >
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="font-medium text-foreground">
                                  {event.action_label || event.action}
                                </span>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatHistoryTimestamp(event.timestamp)}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground break-all">
                                {historyActorDisplay(event)}
                              </div>
                            </li>
                          ))}
                        </ul>
                        {hasMoreHistory && (
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setHistoryExpanded((v) => !v)}
                            >
                              {historyExpanded
                                ? "Show only latest"
                                : `Show recent history (up to ${HISTORY_EXPANDED_LIMIT})`}
                            </Button>
                            {historyExpanded && historyOverflow > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {historyOverflow} older event
                                {historyOverflow === 1 ? "" : "s"} not shown
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card className="shadow-archival-md">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="font-heading text-lg">Record Details</CardTitle>
                    <Button variant="outline" size="sm" onClick={goEdit}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Submit Edit
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-0 text-sm">
                    {visibleDetails.map((row, idx) => (
                      <DetailRow
                        key={row.label}
                        label={row.label}
                        value={String(row.value || EMPTY)}
                        last={idx === visibleDetails.length - 1}
                      />
                    ))}
                  </dl>
                </CardContent>
              </Card>

              {record.citations.length > 0 && (
                <Card className="shadow-archival-md">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">
                      Citations ({record.citations.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {record.citations.map((citation, idx) => {
                      const rw = citation.referenceWork;
                      const code = (rw?.code ?? "").trim();
                      const title = citationTitle(citation);
                      const byline = citationByline(rw);
                      const detail = citation.citationDetail.trim();
                      // A citation_detail that already looks like a URL is
                      // surfaced as a clickable link in the Reference row;
                      // this matches contributor practice of pasting a
                      // deep-link (e.g. archive.org page) directly into
                      // citation_detail. When detail is a URL we hide the
                      // separate Link row so we don't show the same URL
                      // twice on a single citation.
                      const detailIsUrl = /^https?:\/\//i.test(detail);
                      const rwUrl = (rw?.url ?? "").trim();
                      const rows: { label: string; value: ReactNode }[] = [];
                      // citation_detail is the most important field for a
                      // reader scanning the catalog, so it leads. Labeled
                      // "Page" per the convention used elsewhere in the UI,
                      // even though the underlying field can also hold a
                      // section reference or URL depending on the source.
                      if (detail) {
                        rows.push({
                          label: "Page",
                          value: detailIsUrl ? (
                            <a
                              href={detail}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline text-primary break-all"
                            >
                              {detail}
                            </a>
                          ) : (
                            detail
                          ),
                        });
                      }
                      if (rw?.publisher.trim()) {
                        rows.push({ label: "Publisher", value: rw.publisher.trim() });
                      }
                      if (rw?.edition.trim()) {
                        rows.push({ label: "Edition", value: rw.edition.trim() });
                      }
                      if (rw?.volume.trim()) {
                        rows.push({ label: "Volume", value: rw.volume.trim() });
                      }
                      if (rw?.isbn.trim()) {
                        rows.push({ label: "ISBN", value: rw.isbn.trim() });
                      }
                      if (rwUrl && !detailIsUrl) {
                        rows.push({
                          label: "Link",
                          value: (
                            <a
                              href={rwUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline text-primary break-all"
                            >
                              {rwUrl}
                            </a>
                          ),
                        });
                      }
                      return (
                        <div
                          key={citation.id}
                          className={
                            idx === 0
                              ? ""
                              : "border-t-2 border-primary/40 pt-6 mt-6"
                          }
                        >
                          <div className="flex items-baseline gap-2 flex-wrap">
                            {code && (
                              <Badge variant="secondary" className="font-mono">
                                {code}
                              </Badge>
                            )}
                            <div className="font-medium text-foreground">
                              {title}
                            </div>
                          </div>
                          {byline && (
                            <div className="mt-1 text-xs text-muted-foreground italic">
                              {byline}
                            </div>
                          )}
                          {rows.length > 0 && (
                            <dl className="mt-3 text-sm">
                              {rows.map((r, i) => (
                                <div
                                  key={r.label}
                                  className={`flex justify-between gap-4 py-2 ${i === rows.length - 1 ? "" : "border-b border-border"}`}
                                >
                                  <dt className="text-muted-foreground font-medium shrink-0">
                                    {r.label}
                                  </dt>
                                  <dd className="text-foreground text-right break-words min-w-0">
                                    {r.value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              <Card className="shadow-archival-md">
                {coverCount === 0 ? (
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">
                      Associated Covers (0)
                    </CardTitle>
                  </CardHeader>
                ) : (
                  <Collapsible open={coversOpen} onOpenChange={setCoversOpen}>
                    <CardHeader>
                      <CollapsibleTrigger className="flex items-center gap-2 text-left cursor-pointer">
                        <CardTitle className="font-heading text-lg">
                          Associated Covers ({coverCount})
                        </CardTitle>
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform ${coversOpen ? "rotate-180" : ""}`}
                        />
                      </CollapsibleTrigger>
                    </CardHeader>
                    <CollapsibleContent>
                      <CardContent>
                        {associatedCovers.map((cover, idx) => (
                          <AssociatedCoverEntry
                            key={cover.id}
                            cover={cover}
                            isFirst={idx === 0}
                            onEdit={openEditCoverDialog}
                            onDelete={isStaff ? requestDeleteCover : undefined}
                            isDeleting={
                              cover.coverDetails != null &&
                              deletingCoverId === cover.coverDetails.id
                            }
                          />
                        ))}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </Card>

              <AlertDialog
                open={pendingDeleteCover !== null}
                onOpenChange={(next) => {
                  // Block dismiss-while-deleting so the user can't
                  // double-click cancel and leave a half-finished DELETE
                  // request hanging out without UI feedback.
                  if (deletingCoverId != null) return;
                  if (!next) setPendingDeleteCover(null);
                }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this cover?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {pendingDeleteCover?.coverDetails?.code
                        ? `Cover "${pendingDeleteCover.coverDetails.code}" will be permanently removed, including its dates and link to this marking.`
                        : "This cover will be permanently removed, including its dates and link to this marking."}{" "}
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deletingCoverId != null}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        // Stop AlertDialog from auto-closing on click; we
                        // close manually inside confirmDeleteCover after
                        // the DELETE request resolves so the UI state stays
                        // consistent with the server.
                        e.preventDefault();
                        void confirmDeleteCover();
                      }}
                      disabled={deletingCoverId != null}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deletingCoverId != null ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        "Delete"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {record.desc.trim() && (
                <Card className="shadow-archival-md">
                  <CardHeader><CardTitle className="font-heading text-lg">Description</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{record.desc}</p>
                  </CardContent>
                </Card>
              )}

              {showEditorComment && (
                <Card className="shadow-archival-md border-amber-500/20 bg-amber-500/5">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-amber-600" />
                      Editor feedback
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{editorComment}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Bottom action row. Mirrors the two-column grid above so
              Submit New Cover sits under the left edge of the Associated
              Covers card (right column) rather than against the page edge,
              while Delete Marking stays flush right. */}
          <div className="mt-10 grid items-start lg:grid-cols-2 gap-8">
            <div className="hidden lg:block" />
            <div className="flex items-center justify-between gap-3">
              <Button
                size="sm"
                onClick={openNewCoverDialog}
                className="bg-green-800 hover:bg-green-900 text-white"
              >
                <Plus className="mr-2 h-4 w-4" />
                Submit New Cover
              </Button>
              {isStaff && (
                // Visual placement only. The backend delete actions (DELETE
                // /api/v2/markings/<id>/delete-mine/ and the standard
                // MarkingViewSet destroy) need their behavior / permissions
                // verified before this button is wired up. No-op onClick so
                // the button stays inert without surfacing a placeholder
                // alert.
                <Button size="sm" variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Marking
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default RecordDetail;
