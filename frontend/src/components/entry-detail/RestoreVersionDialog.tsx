import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { EditComparisonCard } from "@/components/entry-detail/EditComparisonCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RestorePreview, RestorePreviewResult } from "@/services/markings";

const RELATIONSHIP_LABELS: Record<string, string> = {
  images: "Images",
  dates_seen: "Dates seen",
  citations: "Citations",
  cover_markings: "Marking links",
  valuations: "Valuations",
};

interface RestoreVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryLabel: "marking" | "cover";
  versionNo: number | null;
  /** Fetch what the restore would change; runs each time the dialog opens. */
  loadPreview: () => Promise<RestorePreviewResult>;
  /** Apply the restore. Resolve to an error message to keep the dialog open, or null to close. */
  onConfirm: () => Promise<string | null>;
}

/**
 * Compare-then-confirm for restoring an Entry version (Trello T74). The
 * server computes one plan for both the preview and the restore, so what is
 * shown here is exactly what confirming does; the limitations list says what
 * the version cannot bring back.
 */
export function RestoreVersionDialog({
  open,
  onOpenChange,
  entryLabel,
  versionNo,
  loadPreview,
  onConfirm,
}: RestoreVersionDialogProps) {
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || versionNo == null) return;
    let cancelled = false;
    setPreview(null);
    setLoadError(null);
    setError(null);
    setLoading(true);
    loadPreview()
      .then((result) => {
        if (cancelled) return;
        if (result.ok === true) setPreview(result.preview);
        else setLoadError(result.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // loadPreview is rebuilt by the parent on every render; the version number is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, versionNo]);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const message = await onConfirm();
      if (message) {
        setError(message);
        return;
      }
      onOpenChange(false);
    } catch {
      // The restore itself reports failures as a message; this is the reload after it.
      setError("The restore may have completed, but the page could not reload. Refresh to check.");
    } finally {
      setBusy(false);
    }
  };

  const canConfirm = !busy && !loading && preview != null && preview.has_changes;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Restore version {versionNo ?? ""}</DialogTitle>
          <DialogDescription>
            The {entryLabel} is set back to how it stood at that version. Nothing is lost: the state
            before the restore is saved as a new version first, and the restore is recorded in Record
            History.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Working out what this restore would change...
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive" role="alert">{loadError}</p>
        ) : preview ? (
          <div className="space-y-4">
            <EditComparisonCard entryLabel={entryLabel} rows={preview.fields} />
            <ul className="text-sm text-muted-foreground space-y-0.5">
              {Object.entries(preview.relationships).map(([kind, counts]) => (
                <li key={kind}>
                  <span className="font-medium text-foreground">{RELATIONSHIP_LABELS[kind] ?? kind}</span>
                  {`: ${counts.added} added, ${counts.removed} removed, ${counts.kept} kept, ${counts.skipped} skipped`}
                </li>
              ))}
            </ul>
            {preview.limitations.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-foreground">What this restore cannot bring back</h3>
                <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground space-y-0.5">
                  {preview.limitations.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            {!preview.has_changes && (
              <p className="text-sm text-muted-foreground">
                The {entryLabel} already matches this version; there is nothing to restore.
              </p>
            )}
          </div>
        ) : null}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)} autoFocus>
            Cancel
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={() => void handleConfirm()}>
            {busy ? "Restoring..." : `Restore from version ${versionNo ?? ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RestoreVersionDialog;
