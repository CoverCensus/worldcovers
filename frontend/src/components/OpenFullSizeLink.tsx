import { useEffect, useState, type MouseEvent } from "react";
import { ExternalLink } from "@/components/ExternalLink";

// Trello T110: an upload tile shows a 128-144px preview, and nothing in the
// upload window showed the file at its real size, so a contributor could not
// tell a soft photo from a small tile. This link opens the file the browser
// already holds in a new tab at full pixels, the same way the record page
// opens a stored image. A picked File gets a blob: URL here (top-level
// navigation to the data: URL the preview uses is blocked by browsers) and the
// URL is released when the tile goes or the file changes.
export const OPEN_FULL_SIZE_LABEL = "Open full size";

type OpenFullSizeLinkProps = {
  /** A newly picked file; a blob: URL is made for it and revoked on cleanup. */
  file?: File;
  /** An already-usable URL (a stored image, or a blob: URL the caller owns). */
  href?: string;
  className?: string;
};

function useObjectUrl(file: File | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!file) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

export function OpenFullSizeLink({ file, href, className }: OpenFullSizeLinkProps) {
  const fileUrl = useObjectUrl(file);
  const target = file ? fileUrl : href;
  if (!target) return null;
  // The Marking form's tiles sit inside the clickable drop zone; a click on the
  // link must not also open the file picker.
  const stop = (event: MouseEvent<HTMLAnchorElement>) => event.stopPropagation();
  return (
    <ExternalLink
      href={target}
      onClick={stop}
      className={className ?? "text-xs text-primary underline underline-offset-2 hover:text-primary/80"}
    >
      {OPEN_FULL_SIZE_LABEL}
    </ExternalLink>
  );
}
