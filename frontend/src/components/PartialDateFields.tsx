/**
 * Month / day / year input for a partial date (issues.md 107). One copy for the
 * cover form, the marking form's ERD/LRD block and the Dates seen card; the
 * precision is whatever parts are filled in, and validatePartialDate() in
 * lib/partialDate decides whether the combination is one the catalogue keeps.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MONTH_OPTIONS, type PartialDateInput } from "@/lib/partialDate";

const NONE = "__none__";

export function PartialDateFields({
  idPrefix,
  value,
  onChange,
  disabled = false,
  error,
  showUnknown = false,
}: {
  idPrefix: string;
  value: PartialDateInput;
  onChange: (next: PartialDateInput) => void;
  disabled?: boolean;
  error?: string;
  /** Offer a "Date unknown" box (submission forms); the Dates seen card has no unknown row. */
  showUnknown?: boolean;
}) {
  const fieldsDisabled = disabled || value.unknown;
  return (
    <div className="space-y-2">
      {showUnknown && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value.unknown}
            onCheckedChange={(v) =>
              onChange(
                v === true
                  ? { unknown: true, year: "", month: "", day: "" }
                  : { unknown: false, year: "", month: "", day: "" },
              )
            }
            disabled={disabled}
            aria-label="Date unknown"
          />
          Date unknown
        </label>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-month`} className="text-xs text-muted-foreground">
            Month
          </Label>
          <Select
            value={value.month || NONE}
            onValueChange={(v) => onChange({ ...value, unknown: false, month: v === NONE ? "" : v })}
            disabled={fieldsDisabled}
          >
            <SelectTrigger id={`${idPrefix}-month`} className={cn(error && "border-destructive")}>
              <SelectValue placeholder="Unknown" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unknown</SelectItem>
              {MONTH_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-day`} className="text-xs text-muted-foreground">
            Day
          </Label>
          <Input
            id={`${idPrefix}-day`}
            type="text"
            inputMode="numeric"
            placeholder="DD"
            value={value.day}
            onChange={(e) =>
              onChange({ ...value, unknown: false, day: e.target.value.replace(/\D/g, "").slice(0, 2) })
            }
            disabled={fieldsDisabled}
            className={cn(error && "border-destructive")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-year`} className="text-xs text-muted-foreground">
            Year
          </Label>
          <Input
            id={`${idPrefix}-year`}
            type="text"
            inputMode="numeric"
            placeholder="YYYY"
            value={value.year}
            onChange={(e) =>
              onChange({ ...value, unknown: false, year: e.target.value.replace(/\D/g, "").slice(0, 4) })
            }
            disabled={fieldsDisabled}
            className={cn(error && "border-destructive")}
          />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
