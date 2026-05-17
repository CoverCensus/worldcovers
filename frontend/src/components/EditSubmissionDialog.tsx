import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ENTRY_LABELS } from "@/labels/entry";
import { SUBMISSION_LABELS } from "@/labels/submission";

type EditSubmissionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: {
    state: string;
    town: string;
    firstSeen: string;
    lastSeen: string;
    shape: string;
    color: string;
    description: string;
  };
};

function getApiBaseUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  return env.trim().replace(/\/+$/, "");
}

export function EditSubmissionDialog({ open, onOpenChange, initial }: EditSubmissionDialogProps) {
  const { toast } = useToast();
  const [state, setState] = useState(initial.state);
  const [town, setTown] = useState(initial.town);
  const [firstSeen, setFirstSeen] = useState(initial.firstSeen);
  const [lastSeen, setLastSeen] = useState(initial.lastSeen);
  const [shape, setShape] = useState(initial.shape);
  const [color, setColor] = useState(initial.color);
  const [description, setDescription] = useState(initial.description);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.trim() || !town.trim() || !firstSeen.trim() || !shape.trim() || !color.trim()) {
      toast({
        title: "Missing required fields",
        description: "State, town, earliest seen, shape, and color are required.",
        variant: "destructive",
      });
      return;
    }

    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      toast({
        title: "Configuration error",
        description: "VITE_API_URL is not set. Cannot submit changes.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        state: state.trim(),
        town: town.trim(),
        first_seen: firstSeen.trim(),
        last_seen: lastSeen.trim(),
        shape: shape.trim(),
        color: color.trim(),
        description: description.trim() || undefined,
      };

      const res = await fetch(`${apiBase}/contributions/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = errBody?.detail || res.statusText || "Could not submit changes.";
        throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }

      toast({
        title: SUBMISSION_LABELS.toast.received,
        description: "Your Marking has been submitted for approval. It will appear in the catalog after review.",
      });
      onOpenChange(false);
    } catch (err: unknown) {
      toast({
        title: "Edit failed",
        description: err instanceof Error ? err.message : "Could not submit changes. Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Catalog Entry</DialogTitle>
          <DialogDescription>
            Update the core catalog details. This will create a new, corrected catalog record.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-state">State</Label>
              <Input
                id="edit-state"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-town">Town</Label>
              <Input
                id="edit-town"
                value={town}
                onChange={(e) => setTown(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-firstSeen">{ENTRY_LABELS.datesObserved.earliest}</Label>
              <Input
                id="edit-firstSeen"
                type="number"
                value={firstSeen}
                onChange={(e) => setFirstSeen(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lastSeen">{ENTRY_LABELS.datesObserved.latest}</Label>
              <Input
                id="edit-lastSeen"
                type="number"
                value={lastSeen}
                onChange={(e) => setLastSeen(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-shape">Shape</Label>
              <Input
                id="edit-shape"
                value={shape}
                onChange={(e) => setShape(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-color">Color</Label>
              <Input
                id="edit-color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description (optional)</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Submit Edit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

