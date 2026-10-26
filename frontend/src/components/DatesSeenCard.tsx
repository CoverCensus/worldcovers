/**
 * Dates seen, editable (issues.md 107). Greg Stone: "When editing a listing, I
 * don't see where the dates seen can be modified." Todd Hause: "'Dates Seen'
 * ... is not available ... Where does this data come?"
 *
 * The edit form's ERD/LRD block can only ADD an observation on approval; it
 * cannot correct or remove one. This card works on the Marking edit page over the
 * existing /dates-seen/ API: one row per click, region-scoped and audited on
 * the server (issue #128), each change one version in the marking's history.
 * Saved Markings require the server's can_edit_dates permission. New Marking
 * forms keep these dates with the submission until approval.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { PartialDateFields } from "@/components/PartialDateFields";
import {
  formatDateSeenLike,
  isRangeBearing,
  partialDateInputFromDateSeen,
  sortDateSeenRows,
  validatePartialDate,
  type PartialDateInput,
} from "@/lib/partialDate";
import type { AssociatedDateSeen } from "@/services/markings";
import {
  createDateSeen,
  dateSeenErrorMessage,
  deleteDateSeen,
  updateDateSeen,
} from "@/services/datesSeen";

const EMPTY: PartialDateInput = { unknown: false, year: "", month: "", day: "" };

type DatesSeenCardProps = { datesSeen: AssociatedDateSeen[] } & (
  | { markingId: number; onChanged: () => Promise<void> | void; onDatesChange?: never }
  | { markingId?: never; onChanged?: never; onDatesChange: (rows: AssociatedDateSeen[]) => void }
);

type EditorState =
  | { mode: "idle" }
  | { mode: "add"; value: PartialDateInput }
  | { mode: "edit"; id: number; value: PartialDateInput };

export function DatesSeenCard({
  markingId,
  datesSeen,
  onChanged,
  onDatesChange,
}: DatesSeenCardProps) {
  const [editor, setEditor] = useState<EditorState>({ mode: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AssociatedDateSeen | null>(null);

  const rows = sortDateSeenRows(datesSeen);

  const submit = async () => {
    if (editor.mode === "idle") return;
    const check = validatePartialDate(editor.value);
    if (check.ok === false) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (onDatesChange) {
        const value = check.value;
        if (!value.granularity) {
          setError("Enter at least one date component.");
          return;
        }
        const row: AssociatedDateSeen = {
          id: editor.mode === "edit" ? editor.id : Math.min(0, ...datesSeen.map((date) => date.id)) - 1,
          date: value.legacyDate,
          granularity: value.granularity,
          dateYear: value.year,
          dateMonth: value.month,
          dateDay: value.day,
        };
        if (datesSeen.some((date) => date.id !== row.id && date.dateYear === row.dateYear && date.dateMonth === row.dateMonth && date.dateDay === row.dateDay)) {
          setError("This date is already recorded for this Marking.");
          return;
        }
        onDatesChange(editor.mode === "add" ? [...datesSeen, row] : datesSeen.map((date) => date.id === row.id ? row : date));
      } else if (editor.mode === "add") {
        await createDateSeen({ subjectType: "MARKING", subjectId: markingId, parts: editor.value });
      } else {
        await updateDateSeen(editor.id, editor.value);
      }
      setEditor({ mode: "idle" });
      await onChanged?.();
    } catch (err) {
      setError(dateSeenErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    setError(null);
    try {
      if (onDatesChange) onDatesChange(datesSeen.filter((date) => date.id !== pendingDelete.id));
      else await deleteDateSeen(pendingDelete.id);
      setPendingDelete(null);
      await onChanged?.();
    } catch (err) {
      setError(dateSeenErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const editing = editor.mode !== "idle";

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label>Dates seen</Label>
          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditor({ mode: "add", value: EMPTY })} disabled={busy}>
              Add date
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Dates on this Marking come from the source catalog text and from Editors. Dates on
          linked covers count toward Earliest/Latest but are edited on each cover.
        </p>
        <p className="text-sm text-muted-foreground">
          {onDatesChange
            ? "These dates save with your submission and are added when it is approved."
            : "Changes here save immediately, separate from the edit submission."}
        </p>
      </div>
      <div className="space-y-3">
        {rows.length === 0 && !editing && (
          <p className="text-sm text-muted-foreground">
            {onDatesChange ? "No dates added to this submission." : "No dates recorded directly on this marking. Earliest/Latest, if shown, come from linked covers."}
          </p>
        )}
        {rows.length > 0 && (
          <ul className="divide-y divide-border">
            {rows.map((row) =>
              editor.mode === "edit" && editor.id === row.id ? (
                <li key={row.id} className="py-3 space-y-2">
                  <PartialDateFields idPrefix={`date-${row.id}`} value={editor.value} onChange={(v) => setEditor({ mode: "edit", id: row.id, value: v })} disabled={busy} error={error ?? undefined} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={submit} disabled={busy}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditor({ mode: "idle" }); setError(null); }} disabled={busy}>Cancel</Button>
                  </div>
                </li>
              ) : (
                <li key={row.id} className="py-2 flex items-center justify-between gap-3">
                  <span className="text-sm text-foreground">
                    {formatDateSeenLike(row)}
                    {!isRangeBearing(row.granularity) && (
                      <Badge variant="outline" className="ml-2 font-normal">Not used for Earliest/Latest</Badge>
                    )}
                  </span>
                  {!editing && (
                    <span className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => { setError(null); setEditor({ mode: "edit", id: row.id, value: partialDateInputFromDateSeen(row) }); }} disabled={busy}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setPendingDelete(row)} disabled={busy}>Remove</Button>
                    </span>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
        {editor.mode === "add" && (
          <div className="pt-2 space-y-2">
            <PartialDateFields idPrefix="date-new" value={editor.value} onChange={(v) => setEditor({ mode: "add", value: v })} disabled={busy} error={error ?? undefined} />
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={busy}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditor({ mode: "idle" }); setError(null); }} disabled={busy}>Cancel</Button>
            </div>
          </div>
        )}
        {error && editor.mode === "idle" && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this date?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? formatDateSeenLike(pendingDelete) : ""} will be removed from this marking.
              {onDatesChange ? "You can add it back before submitting." : "The change is recorded in the marking's history and can be added back."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={busy}>Remove date</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
