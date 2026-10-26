/**
 * The Cover submitted together with a new Marking (Trello T37).
 *
 * Ian, 2026-10-19: "When adding a NEW marking, give the opportunity to add the
 * corresponding cover at that time." The section stages the Cover's fields and
 * images inside the Marking form; the server stores them as pending_cover and
 * turns them into a cover submission when the Marking is approved. Both Entries
 * are reviewed separately. Nothing here talks to the server.
 */
import { useEffect, useMemo } from "react";
import { Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldHelp } from "@/components/FieldHelp";
import { PartialDateFields } from "@/components/PartialDateFields";
import { COVER_TYPE_OPTIONS } from "@/lib/coverTypes";
import { COVER_DATE_HELP, COVER_TYPE_HELP, PENDING_COVER_SECTION } from "@/labels/guidelines";
import { cn } from "@/lib/utils";

import {
  type PendingCoverErrors,
  type PendingCoverFields,
  type PendingCoverSavedImage,
} from "@/lib/pendingCover";

interface PendingCoverSectionProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  fields: PendingCoverFields;
  onFieldsChange: (next: PendingCoverFields) => void;
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  savedImages: PendingCoverSavedImage[];
  onRemoveSavedImage: (key: string) => void;
  errors: PendingCoverErrors;
  disabled?: boolean;
  /** An upload on the form looks like a whole cover: draw the eye here. */
  highlight?: boolean;
}

function FilePreview({ file }: { file: File }) {
  // Object URLs are the only way to preview a File; a runtime without them
  // (or a revoked one) just shows the file name.
  const url = useMemo(() => {
    try {
      return URL.createObjectURL(file);
    } catch {
      return "";
    }
  }, [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return <img src={url} alt={file.name} className="h-20 w-full object-contain bg-muted rounded" />;
}

export function PendingCoverSection({
  enabled,
  onEnabledChange,
  fields,
  onFieldsChange,
  files,
  onAddFiles,
  onRemoveFile,
  savedImages,
  onRemoveSavedImage,
  errors,
  disabled = false,
  highlight = false,
}: PendingCoverSectionProps) {
  const set = (patch: Partial<PendingCoverFields>) => onFieldsChange({ ...fields, ...patch });
  const imageCount = files.length + savedImages.length;

  return (
    <section
      aria-labelledby="pending-cover-title"
      data-testid="pending-cover-section"
      className={cn(
        "rounded-md border p-4 space-y-4",
        highlight && !enabled ? "border-primary/60 bg-primary/5" : "border-border",
      )}
    >
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          id="pending-cover-enabled"
          checked={enabled}
          onCheckedChange={(v) => onEnabledChange(v === true)}
          disabled={disabled}
          aria-describedby="pending-cover-help"
        />
        <span>
          <span id="pending-cover-title" className="font-medium">
            {PENDING_COVER_SECTION.toggle}
          </span>
          <span id="pending-cover-help" className="block text-muted-foreground">
            {PENDING_COVER_SECTION.help}
          </span>
        </span>
      </label>

      {enabled && (
        <div className="space-y-4 pl-6">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="pending-cover-type">
                Cover type <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <FieldHelp label="Cover type">{COVER_TYPE_HELP}</FieldHelp>
            </div>
            <Select
              value={fields.type || undefined}
              onValueChange={(v) => set({ type: v })}
              disabled={disabled}
            >
              <SelectTrigger id="pending-cover-type" className={cn(errors.type && "border-destructive")}>
                <SelectValue placeholder="Select cover type..." />
              </SelectTrigger>
              <SelectContent>
                {COVER_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && <p className="text-sm text-destructive">{errors.type}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>
                Cover date <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <FieldHelp label="Cover date">{COVER_DATE_HELP}</FieldHelp>
            </div>
            <PartialDateFields
              idPrefix="pending-cover-date"
              value={fields.date}
              onChange={(next) => set({ date: next })}
              disabled={disabled}
              error={errors.date}
              showUnknown
            />
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={fields.isInstitutional}
                onCheckedChange={(v) => set({ isInstitutional: v === true })}
                disabled={disabled}
              />
              Is Institutional
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={fields.isBackstamp}
                onCheckedChange={(v) => set({ isBackstamp: v === true })}
                disabled={disabled}
              />
              Is Backstamp
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pending-cover-description">Cover description</Label>
            <Textarea
              id="pending-cover-description"
              value={fields.description}
              onChange={(e) => set({ description: e.target.value })}
              disabled={disabled}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pending-cover-file-input">
              {PENDING_COVER_SECTION.imagesLabel} <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <p className="text-sm text-muted-foreground">{PENDING_COVER_SECTION.imagesHelp}</p>
            {imageCount > 0 && (
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Cover images">
                {savedImages.map((img) => (
                  <li key={img.key} className="space-y-1">
                    <img src={img.url} alt="Saved cover image" className="h-20 w-full object-contain bg-muted rounded" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveSavedImage(img.key)}
                      disabled={disabled}
                      aria-label="Remove saved cover image"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                    </Button>
                  </li>
                ))}
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="space-y-1">
                    <FilePreview file={file} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveFile(index)}
                      disabled={disabled}
                      aria-label={`Remove cover image ${file.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <input
              id="pending-cover-file-input"
              type="file"
              accept="image/png,image/jpeg"
              multiple
              className="sr-only"
              disabled={disabled}
              onChange={(e) => {
                const picked = e.target.files ? Array.from(e.target.files) : [];
                if (picked.length) onAddFiles(picked);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" asChild>
              <label htmlFor="pending-cover-file-input" className="cursor-pointer">
                <Upload className="h-3.5 w-3.5 mr-1" /> {PENDING_COVER_SECTION.addImage}
              </label>
            </Button>
            {errors.images && <p className="text-sm text-destructive">{errors.images}</p>}
            {imageCount === 0 && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={fields.noImage}
                  onCheckedChange={(v) => set({ noImage: v === true })}
                  disabled={disabled}
                />
                No cover image is available
              </label>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default PendingCoverSection;
