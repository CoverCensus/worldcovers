import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPartialDateInput, type PartialDateInput } from "@/lib/partialDate";

/** Cover views only. Sending a marking view (FULL) to a cover subject is rejected. */
const COVER_VIEWS = ["FRONT", "BACK", "INTERIOR", "DETAIL"] as const;

/**
 * The body of the "create a cover from this image" dialog -- issues.md 167 /
 * Trello T37.
 *
 * Deliberately excludes the Radix <Dialog> wrapper. No test in this repo
 * drives a Radix overlay and jsdom carries none of the shims one needs, so
 * keeping the fields here means the form that writes five records can actually
 * be tested.
 *
 * Ian asked for "all is needed is the date". Everything else on this form is
 * either a checkbox with a default or a four-value enum with a default, and a
 * Cover carrying only a date is a complete, valid record.
 */
export function CreateCoverFromImageForm({
  date,
  onDateChange,
  isBackstamp,
  onBackstampChange,
  imageView,
  onImageViewChange,
  isOnlyImage,
  onCropFirst,
  busy,
  error,
}: {
  date: PartialDateInput;
  onDateChange: (next: PartialDateInput) => void;
  isBackstamp: boolean;
  onBackstampChange: (next: boolean) => void;
  imageView: string;
  onImageViewChange: (next: string) => void;
  /** Moving this image would leave the marking with no picture at all. */
  isOnlyImage: boolean;
  onCropFirst: () => void;
  busy: boolean;
  error: string | null;
}) {
  const preview = formatPartialDateInput(date);

  return (
    <div className="space-y-4 py-2">
      {isOnlyImage && (
        // Warn, do not block. The editor may genuinely be fixing a record that
        // should never have carried this scan. But the backend promotes the
        // next sibling to display_order 0 after a move and there is no sibling
        // here, so the marking really is left with nothing.
        <Alert variant="warning" data-testid="only-image-warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <p>
              This is the marking's only image. Crop the marking out of it first, or this record
              will be left with no picture.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={busy}
              onClick={onCropFirst}
            >
              Crop the marking out first
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* The fieldset carries the grouping and legend. Each Input also takes
          `disabled` explicitly: a disabled ancestor fieldset blocks
          interaction but does not set the control's own disabled state, so
          without this they would render as enabled while being unusable. */}
      <fieldset className="space-y-1" disabled={busy}>
        <legend className="text-sm font-medium">Date on the cover</legend>
        <p className="text-xs text-muted-foreground">
          A year is enough. This is what sets the marking's earliest and latest dates.
        </p>
        <div className="flex gap-2">
          <div className="space-y-1">
            <Label htmlFor="new-cover-year">Year</Label>
            <Input
              id="new-cover-year"
              inputMode="numeric"
              value={date.year}
              onChange={(e) => onDateChange({ ...date, year: e.target.value })}
              disabled={busy}
              placeholder="1847"
              className="w-24"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-cover-month">Month</Label>
            <Input
              id="new-cover-month"
              inputMode="numeric"
              value={date.month}
              onChange={(e) => onDateChange({ ...date, month: e.target.value })}
              disabled={busy}
              placeholder="8"
              className="w-20"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-cover-day">Day</Label>
            <Input
              id="new-cover-day"
              inputMode="numeric"
              value={date.day}
              onChange={(e) => onDateChange({ ...date, day: e.target.value })}
              disabled={busy}
              placeholder="3"
              className="w-20"
            />
          </div>
        </div>
        {preview && (
          <p className="text-xs text-muted-foreground">
            Will be recorded as <span className="font-medium">{preview}</span>
          </p>
        )}
      </fieldset>

      <div className="space-y-1">
        <Label htmlFor="new-cover-view">Which side of the cover is this?</Label>
        <select
          id="new-cover-view"
          value={imageView}
          disabled={busy}
          onChange={(e) => onImageViewChange(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {COVER_VIEWS.map((v) => (
            <option key={v} value={v}>
              {v.charAt(0) + v.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={isBackstamp}
          disabled={busy}
          onCheckedChange={(v) => onBackstampChange(v === true)}
        />
        This marking is a backstamp on the cover
      </label>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default CreateCoverFromImageForm;
