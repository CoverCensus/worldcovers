import { useState } from "react";
import { cn } from "@/lib/utils";
import imageNotAvailable from "@/assets/image-not-available.jpg";

const noImageClassName =
  "w-full h-full min-w-0 min-h-0 object-cover bg-muted";

/** Placeholder when image is missing or fails to load. */
export function ImageOrPlaceholder({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <img
        src={imageNotAvailable}
        alt="No image available"
        className={cn(noImageClassName, className)}
      />
    );
  }
  if (!src) {
    return (
      <img
        src={imageNotAvailable}
        alt="No image available"
        className={cn(noImageClassName, className)}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  );
}
