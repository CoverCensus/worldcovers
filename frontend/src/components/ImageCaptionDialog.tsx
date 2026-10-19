import { useEffect, useState } from "react";

import { MAX_IMAGE_CAPTION_LENGTH } from "@/components/ImageCaptionInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ImageCaptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The image's current caption; the field starts from it each time it opens. */
  caption: string;
  /** Save the caption. Resolve to an error message to keep the dialog open, or null to close. */
  onSave: (caption: string) => Promise<string | null>;
}

/** Change a saved image's caption (Trello T87); an empty field clears it. */
export function ImageCaptionDialog({ open, onOpenChange, caption, onSave }: ImageCaptionDialogProps) {
  const [value, setValue] = useState(caption);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(caption);
      setError(null);
    }
  }, [open, caption]);

  const unchanged = value.trim() === caption.trim();

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const message = await onSave(value.trim());
      if (message) {
        setError(message);
        return;
      }
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit caption</DialogTitle>
          <DialogDescription>
            The caption shows under the image. The change is recorded in Record History.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="image-caption-edit">Caption</Label>
          <Textarea
            id="image-caption-edit"
            value={value}
            maxLength={MAX_IMAGE_CAPTION_LENGTH}
            rows={3}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || unchanged} onClick={() => void handleSave()}>
            {busy ? "Saving..." : "Save caption"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImageCaptionDialog;
