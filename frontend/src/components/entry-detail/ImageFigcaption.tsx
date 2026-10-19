/**
 * An image's caption (Image.image_description, T43). Place it as the last
 * child of the image's <figure>; renders nothing for an uncaptioned image.
 */
export function ImageFigcaption({ text }: { text?: string | null }) {
  const caption = text?.trim();
  if (!caption) return null;
  return (
    <figcaption className="mt-2 text-sm text-muted-foreground break-words">{caption}</figcaption>
  );
}
