import type { KeyboardEvent, MouseEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Matches the backend's MAX_IMAGE_DESCRIPTION_LENGTH (T43). */
export const MAX_IMAGE_CAPTION_LENGTH = 500;

type ImageCaptionInputProps = {
  /** Unique per gallery item, so every caption has its own label. */
  id: string;
  value: string;
  onChange: (value: string) => void;
};

// The upload galleries sit inside a role="button" drop zone whose click and
// Enter/Space handlers open the file picker; keep this field's events from
// reaching it so typing and clicking stay in the caption.
const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();

/** Optional caption for a newly uploaded image, saved as its description. */
export function ImageCaptionInput({ id, value, onChange }: ImageCaptionInputProps) {
  return (
    <div className="w-full space-y-1 px-2 pb-2 text-left">
      <Label htmlFor={id} className="text-xs" onClick={stop}>
        Caption (optional)
      </Label>
      <Input
        id={id}
        value={value}
        maxLength={MAX_IMAGE_CAPTION_LENGTH}
        className="h-8 text-xs"
        onClick={stop}
        onKeyDown={stop}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
