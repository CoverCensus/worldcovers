import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowDown, ArrowUp, Loader2, Star, Trash2, Upload } from "lucide-react";

import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

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
  getImagesForSubject,
  createImageForSubject,
  getMarkingCovers,
  postCoverMarkingResubmit,
  reorderImages,
  updateImage,
  type AssociatedCover,
  type AssociatedDateSeen,
  type MarkingImage,
} from "@/services/markings";

type Mode = "create" | "edit";

/** Single cover date row in the form (granularity is derived on save). */
type CoverDateField = {
  existingId?: number;
  date: string;
};

type PendingUpload = {
  key: string;
  file: File;
  tracing: boolean;
  description: string;
};

const COVER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "FC", label: "FC - Folded Cover" },
  { value: "FL", label: "FL - Folded Letter" },
];

const DEFAULT_COVER_TYPE = "FL";

/**
 * From a full ISO calendar day (YYYY-MM-DD from `<input type="date">`):
 * Jan 1 → YEAR, first of any other month → MONTH, otherwise → DAY.
 */
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

function buildInitialState(cover: AssociatedCover | null | undefined) {
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

export default function CoverEdit() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const markingId = Number(params.id);
  const coverMarkingId = params.coverMarkingId ? Number(params.coverMarkingId) : null;
  const mode: Mode = coverMarkingId != null && Number.isFinite(coverMarkingId) ? "edit" : "create";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [coverRow, setCoverRow] = useState<AssociatedCover | null>(null);

  const initial = useMemo(() => buildInitialState(coverRow), [coverRow]);

  const [type, setType] = useState(initial.type);
  const [isInstitutional, setIsInstitutional] = useState(initial.isInstitutional);
  const [isBackstamp, setIsBackstamp] = useState(initial.isBackstamp);
  const [coverDate, setCoverDate] = useState<CoverDateField>(initial.coverDate);

  const [submitting, setSubmitting] = useState(false);

  const coverId = coverRow?.coverDetails?.id ?? null;
  const [existingImages, setExistingImages] = useState<MarkingImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [reorderingImages, setReorderingImages] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setType(initial.type);
    setIsInstitutional(initial.isInstitutional);
    setIsBackstamp(initial.isBackstamp);
    setCoverDate(initial.coverDate);
  }, [initial]);

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
      .then((covers) => {
        if (cancelled) return;
        if (mode === "create") {
          setCoverRow(null);
          return;
        }
        const found = covers.find((c) => c.id === coverMarkingId) ?? null;
        if (!found) {
          setLoadError("Cover association not found.");
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
  }, [markingId, coverMarkingId, mode]);

  const refreshImages = async () => {
    if (coverId == null) {
      setExistingImages([]);
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

  const handleBack = () => {
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from || `/record/${markingId}`);
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

  const moveExistingImageBy = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= existingImages.length) return;
    const next = existingImages.slice();
    [next[index], next[target]] = [next[target], next[index]];
    void applyExistingImageOrder(next);
  };

  const setExistingAsDefault = (index: number) => {
    if (index <= 0 || index >= existingImages.length) return;
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

  const onPickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: PendingUpload[] = [];
    for (const file of Array.from(files)) {
      next.push({ key: fileKey(file), file, tracing: false, description: "" });
    }
    setPendingUploads((prev) => {
      const seen = new Set(prev.map((p) => p.key));
      const additions = next.filter((p) => !seen.has(p.key));
      return [...prev, ...additions];
    });
    if (inputRef.current) inputRef.current.value = "";
  };

  const movePendingBy = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= pendingUploads.length) return;
    setPendingUploads((prev) => {
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const setPendingAsDefault = (index: number) => {
    if (index <= 0 || index >= pendingUploads.length) return;
    setPendingUploads((prev) => {
      const next = prev.slice();
      const [picked] = next.splice(index, 1);
      next.unshift(picked);
      return next;
    });
  };

  const removePendingAt = (index: number) => {
    setPendingUploads((prev) => prev.filter((_, i) => i !== index));
  };

  const setPendingTracingAt = (index: number, tracing: boolean) => {
    setPendingUploads((prev) => prev.map((row, i) => (i === index ? { ...row, tracing } : row)));
  };

  const setPendingDescriptionAt = (index: number, description: string) => {
    setPendingUploads((prev) => prev.map((row, i) => (i === index ? { ...row, description } : row)));
  };

  const uploadPending = async (targetCoverId: number) => {
    if (uploading) return;
    if (pendingUploads.length === 0) return;
    setUploading(true);
    try {
      const baseOrder = existingImages.length;
      const created: Array<MarkingImage | null> = [];
      for (let i = 0; i < pendingUploads.length; i += 1) {
        const row = pendingUploads[i];
        created.push(
          await createImageForSubject({
            file: row.file,
            subjectType: "COVER",
            subjectId: targetCoverId,
            imageView: "FRONT",
            imageDescription: row.description || null,
            isTracing: row.tracing,
            displayOrder: baseOrder + i,
          }),
        );
      }
      const okCount = created.filter(Boolean).length;
      if (okCount === 0) {
        toast({
          title: "Upload failed",
          description: "Could not upload images. Please try again.",
          variant: "destructive",
        });
        return;
      }
      setPendingUploads([]);
      await refreshImages();
      toast({
        title: "Images uploaded",
        description: okCount === 1 ? "1 image uploaded." : `${okCount} images uploaded.`,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const imageCount = existingImages.length + pendingUploads.length;
    if (imageCount < 1) {
      toast({
        title: "Cover image required",
        description: "Add at least one image before saving.",
        variant: "destructive",
      });
      return;
    }

    const trimmed = (coverDate.date ?? "").trim();
    if (!trimmed) {
      toast({
        title: "Cover date required",
        description: "Choose the date when this cover was used.",
        variant: "destructive",
      });
      return;
    }

    const derived = deriveGranularityFromIso(trimmed);
    if (!derived) {
      toast({
        title: "Invalid date",
        description: "Enter a complete calendar date.",
        variant: "destructive",
      });
      return;
    }

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
        });
      }

      const keepId = coverDate.existingId ?? null;
      const deleteOps = originalDates.filter((d) => d.id !== keepId).map((d) => deleteDateSeen(d.id));

      if (keepId != null) {
        await Promise.all([
          ...deleteOps,
          updateDateSeen(keepId, { date: normalizedDate, granularity }),
        ]);
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

      toast({
        title: mode === "create" ? "Cover added" : "Cover updated",
        description: mode === "create" ? "The cover is now linked to this marking." : "Your changes have been saved.",
      });

      if (mode === "create") {
        // Prime coverRow so the image widget can bind to the saved cover id.
        const covers = await getMarkingCovers(markingId);
        const found = covers.find((c) => c.id === coverMarkingPk) ?? null;
        setCoverRow(found);
      }

      if (pendingUploads.length > 0) {
        await uploadPending(savedCoverId);
      }

      if (mode === "edit" && coverRow?.reviewStatus === "needs_revision") {
        try {
          await postCoverMarkingResubmit(coverMarkingPk);
        } catch (re) {
          toast({
            title: "Could not resubmit for review",
            description: re instanceof Error ? re.message : "Your edits were saved. Try resubmitting from the record page.",
            variant: "destructive",
          });
        }
      }

      navigate(`/record/${markingId}`);
    } catch (err) {
      toast({
        title: mode === "create" ? "Could not add cover" : "Could not save cover",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
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

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 bg-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Card className="border-destructive/50">
              <CardContent className="pt-6 space-y-4">
                <p className="text-destructive">{loadError}</p>
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <Button variant="ghost" onClick={handleBack} className="-ml-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>

          <Card className="shadow-archival-lg">
            <CardHeader>
              <CardTitle className="font-heading text-xl">
                {mode === "create" ? "Submit New Cover" : "Edit Cover"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {mode === "create"
                  ? "Choose the cover type, add at least one image, and record when it was used. Other details are optional."
                  : "Update type, images, and observed date. Catalog key is assigned by the system."}
              </p>
              {mode === "edit" && coverRow?.reviewStatus === "pending" && (
                <p className="text-sm rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-900 dark:text-amber-100">
                  This cover is <strong>pending editor review</strong>. It is only visible to you and assigned editors until it is approved.
                </p>
              )}
              {mode === "edit" && coverRow?.reviewStatus === "needs_revision" && (
                <div className="text-sm rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2 space-y-1">
                  <p className="font-medium text-foreground">Editor requested changes</p>
                  {(coverRow.reviewNotes ?? "").trim().length > 0 ? (
                    <p className="text-muted-foreground whitespace-pre-wrap">{coverRow.reviewNotes}</p>
                  ) : (
                    <p className="text-muted-foreground">Update the cover below, then save to send it back for review.</p>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label>Catalog key</Label>
                  <div
                    className="flex min-h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
                    aria-live="polite"
                  >
                    {mode === "edit" && coverRow?.coverDetails?.code
                      ? coverRow.coverDetails.code
                      : mode === "edit"
                        ? "—"
                        : "Generated automatically when you save"}
                  </div>
                  <p className="text-xs text-muted-foreground">This value cannot be edited.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cover-type">Type</Label>
                  <select
                    id="cover-type"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={normalizeCoverType(type)}
                    onChange={(e) => setType(e.target.value)}
                    disabled={submitting}
                  >
                    {COVER_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3 pt-1">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={isInstitutional} onCheckedChange={(v) => setIsInstitutional(v === true)} disabled={submitting} />
                    Institutionally Owned
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={isBackstamp} onCheckedChange={(v) => setIsBackstamp(v === true)} disabled={submitting} />
                    Backstamp
                  </label>
                </div>

                <div className="space-y-2">
                  <Label>
                    Cover images <span className="text-destructive" aria-hidden="true">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">At least one image is required.</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground sm:max-w-[60%]">
                      Upload photos or diagrams of this cover. Reorder and set default before or after save.
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <Input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => onPickFiles(e.target.files)}
                        disabled={submitting}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => inputRef.current?.click()}
                        disabled={submitting}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Add images
                      </Button>
                    </div>
                  </div>

                  {imagesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading images...
                    </div>
                  ) : (
                    <>
                      {existingImages.length === 0 && pendingUploads.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-6 text-center">
                          <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                          <p className="text-sm text-muted-foreground">
                            At least one image is required. Click “Add images” to upload (multiple allowed).
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {existingImages.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground">
                                Existing images (editors can reorder and set default).
                              </p>
                              <div className="space-y-2">
                                {existingImages.map((img, idx) => {
                                  const isDefault = img.displayOrder === 0;
                                  return (
                                    <div
                                      key={img.imageId}
                                      className="flex flex-col gap-3 rounded border border-border p-3 sm:flex-row sm:items-start"
                                    >
                                      <div className="mx-auto h-20 w-20 shrink-0 rounded overflow-hidden bg-muted sm:mx-0 sm:h-16 sm:w-16">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={img.imageUrl || ""} alt={img.originalFilename || `Image ${idx + 1}`} className="h-full w-full object-cover" />
                                      </div>
                                      <div className="flex flex-col gap-2 sm:flex-1 sm:min-w-0">
                                        <div className="text-center sm:text-left">
                                          <div className="truncate text-sm font-medium">{img.originalFilename || "Image"}</div>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-center gap-1 sm:justify-start">
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7"
                                              aria-label="Move image up"
                                              disabled={reorderingImages || idx === 0}
                                              onClick={() => moveExistingImageBy(idx, -1)}
                                            >
                                              <ArrowUp className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7"
                                              aria-label="Move image down"
                                              disabled={reorderingImages || idx === existingImages.length - 1}
                                              onClick={() => moveExistingImageBy(idx, 1)}
                                            >
                                              <ArrowDown className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                              type="button"
                                              variant={isDefault ? "secondary" : "ghost"}
                                              size="icon"
                                              className="h-7 w-7"
                                              aria-label="Set as default"
                                              title={isDefault ? "Default" : "Set as default"}
                                              disabled={reorderingImages || isDefault}
                                              onClick={() => setExistingAsDefault(idx)}
                                            >
                                              <Star className={`h-3.5 w-3.5 ${isDefault ? "fill-current" : ""}`} />
                                            </Button>
                                        </div>
                                        <label className="flex items-center gap-2 text-sm sm:justify-start">
                                          <Checkbox
                                            checked={img.isTracing === true}
                                            onCheckedChange={(v) => void toggleExistingTracing(idx, v === true)}
                                            disabled={submitting}
                                          />
                                          Tracing
                                        </label>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {pendingUploads.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground">
                                New uploads (drag ordering controls apply before upload; first becomes Default).
                              </p>
                              <div className="space-y-2">
                                {pendingUploads.map((row, idx) => {
                                  const isDefault = idx === 0;
                                  return (
                                    <div key={row.key} className="rounded border border-border p-3 space-y-3">
                                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                          <div className="text-sm font-medium truncate">{row.file.name}</div>
                                          <div className="text-xs text-muted-foreground">
                                            {(row.file.size / (1024 * 1024)).toFixed(2)} MB
                                          </div>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-center gap-1 sm:justify-end">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            aria-label="Move up"
                                            disabled={idx === 0}
                                            onClick={() => movePendingBy(idx, -1)}
                                          >
                                            <ArrowUp className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            aria-label="Move down"
                                            disabled={idx === pendingUploads.length - 1}
                                            onClick={() => movePendingBy(idx, 1)}
                                          >
                                            <ArrowDown className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant={isDefault ? "secondary" : "ghost"}
                                            size="icon"
                                            className="h-7 w-7"
                                            aria-label="Set as default"
                                            title={isDefault ? "Default" : "Set as default"}
                                            disabled={isDefault}
                                            onClick={() => setPendingAsDefault(idx)}
                                          >
                                            <Star className={`h-3.5 w-3.5 ${isDefault ? "fill-current" : ""}`} />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="destructive"
                                            size="icon"
                                            className="h-7 w-7"
                                            aria-label="Remove"
                                            onClick={() => removePendingAt(idx)}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </div>

                                      <label className="flex items-center gap-2 text-sm">
                                        <Checkbox checked={row.tracing} onCheckedChange={(v) => setPendingTracingAt(idx, v === true)} />
                                        Tracing
                                      </label>

                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                                        <Textarea
                                          value={row.description}
                                          onChange={(e) => setPendingDescriptionAt(idx, e.target.value)}
                                          className="min-h-[64px]"
                                          placeholder="Optional notes about this image..."
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                <p className="text-xs text-muted-foreground">
                                  Save the cover to upload new images. Default = first image in order.
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => (coverId != null ? void uploadPending(coverId) : undefined)}
                                  disabled={coverId == null || uploading}
                                >
                                  {uploading ? "Uploading..." : "Upload now"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="space-y-2 pt-2">
                  <div>
                    <Label htmlFor="cover-date">
                      Cover date <span className="text-destructive" aria-hidden="true">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Required. January 1 is stored as year-only; the 1st of any other month as month-only; all other
                      days as a full date.
                    </p>
                  </div>

                  <div className="rounded-md border border-border p-4 space-y-2">
                    <Input
                      id="cover-date"
                      type="date"
                      value={coverDate.date}
                      onChange={(e) => setCoverDate((prev) => ({ ...prev, date: e.target.value }))}
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={handleBack} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving..." : mode === "create" ? "Submit Cover" : "Save changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
}

