import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PREFERRED_IMAGE_DPI } from "@/lib/imageResolution";

interface LowResolutionImageWarningProps {
  count: number;
}

export function LowResolutionImageWarning({ count }: LowResolutionImageWarningProps) {
  if (count < 1) return null;

  return (
    <Alert variant="warning" className="mt-3" data-testid="low-resolution-image-warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Image may be low quality</AlertTitle>
      <AlertDescription>
        <p>
          We prefer images at {PREFERRED_IMAGE_DPI} DPI or higher. If you have a
          higher-resolution scan or photograph, please upload that instead. You can still submit
          this image.
        </p>
        {count > 1 && (
          <p className="mt-1 text-xs opacity-80">
            {count} of the images you selected may be under {PREFERRED_IMAGE_DPI} DPI.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

export default LowResolutionImageWarning;
