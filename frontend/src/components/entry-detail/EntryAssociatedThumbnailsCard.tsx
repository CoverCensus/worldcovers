import { ArrowDown, ArrowUp, Replace, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import type { CarouselApi } from "@/components/ui/carousel";
import type { EntryGalleryImage } from "./types";
import { UNSAVED_IMAGE_REASON } from "@/lib/coverImageActionState";

export function EntryAssociatedThumbnailsCard({
  images,
  carouselApi,
  currentIndex,
  emptyMessage,
  canReorder,
  reorderingImages,
  deletingImageId,
  onMoveBy,
  onSetDefault,
  onDeleteImage,
  onMoveImage,
  moveImageLabel,
  moveImageDisabledReason = null,
  title = "Associated Thumbnails",
}: {
  images: EntryGalleryImage[];
  carouselApi: CarouselApi | undefined;
  currentIndex: number;
  emptyMessage: string;
  /**
   * Names the screen this card sits on (issue #138). The marking and cover
   * detail screens look alike, and an identical "Associated Thumbnails" on
   * both left people unsure which one they were on. Callers pass the noun for
   * their own screen; the default is the pre-#138 wording so any other caller
   * keeps its current heading.
   */
  title?: string;
  canReorder?: boolean;
  reorderingImages?: boolean;
  deletingImageId?: number | null;
  onMoveBy?: (index: number, offset: -1 | 1) => void;
  onSetDefault?: (index: number) => void;
  onDeleteImage?: (index: number) => void;
  /** Reassign the image to another subject (issue #48), e.g. cover → marking. */
  onMoveImage?: (index: number) => void;
  moveImageLabel?: string;
  /**
   * Why "move" is disabled right now, or null when it is usable (workspace
   * issues.md #180). Rendered as visible text under the controls, never only
   * as a tooltip: a tooltip on a disabled button is unreliable to reach and
   * invisible to anyone not hovering. An unsaved image (no `imageId`) has its
   * own reason and overrides this one.
   */
  moveImageDisabledReason?: string | null;
}) {
  return (
    <Card className="shadow-archival-md">
      <CardHeader>
        <CardTitle className="font-heading text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {images.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {images.map((img, idx) => {
              // Unsaved rows (draft previews, uploads not yet saved) cannot be
              // moved or deleted; that reason wins over a missing destination.
              const unsaved = img.imageId == null;
              const moveReason = unsaved ? UNSAVED_IMAGE_REASON : moveImageDisabledReason;
              const deleteReason = unsaved ? UNSAVED_IMAGE_REASON : null;
              const reasonText = onMoveImage ? moveReason : deleteReason;
              return (
              <div
                key={`${img.imageId ?? img.originalFilename ?? "img"}-${idx}`}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                <button
                  type="button"
                  onClick={() => carouselApi?.scrollTo(idx)}
                  aria-label={`Show image ${idx + 1}`}
                  className={`relative h-16 w-16 rounded border overflow-hidden transition-all ${idx === currentIndex ? "border-primary ring-2 ring-primary" : "border-border"}`}
                >
                  <img
                    src={img.imageUrl || imageNotAvailable}
                    alt={img.originalFilename || `Thumbnail ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
                {(canReorder || onDeleteImage || onMoveImage) && (
                  <div className="flex flex-col items-center gap-0.5">
                    {canReorder && onMoveBy && onSetDefault && (
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          aria-label="Move thumbnail left"
                          disabled={reorderingImages || idx === 0}
                          onClick={() => onMoveBy(idx, -1)}
                        >
                          <ArrowUp className="h-3 w-3 -rotate-90" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          aria-label="Move thumbnail right"
                          disabled={reorderingImages || idx === images.length - 1}
                          onClick={() => onMoveBy(idx, 1)}
                        >
                          <ArrowDown className="h-3 w-3 -rotate-90" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={
                            img.isDefault
                              ? "h-6 w-6 text-amber-600 hover:text-amber-600 disabled:opacity-100"
                              : "h-6 w-6"
                          }
                          aria-label="Set as default catalog thumbnail"
                          disabled={reorderingImages || img.isDefault}
                          onClick={() => onSetDefault(idx)}
                        >
                          <Star className={`h-3 w-3 ${img.isDefault ? "fill-amber-500 text-amber-500" : ""}`} />
                        </Button>
                      </div>
                    )}
                    {(onMoveImage || onDeleteImage) && (
                      <div className="flex items-center justify-center gap-0.5">
                        {onMoveImage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            aria-label={moveImageLabel ?? "Move image to another record"}
                            title={moveImageLabel ?? "Move image"}
                            disabled={reorderingImages || moveReason != null}
                            onClick={() => onMoveImage(idx)}
                          >
                            <Replace className="h-3 w-3" />
                          </Button>
                        )}
                        {onDeleteImage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            aria-label="Delete image"
                            title="Delete image"
                            disabled={
                              reorderingImages || unsaved || deletingImageId === img.imageId
                            }
                            onClick={() => onDeleteImage(idx)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                    {reasonText && (
                      // Text, not only a tooltip (issues.md 166 / #180).
                      <p className="max-w-[10rem] text-center text-[10px] leading-tight text-muted-foreground">
                        {reasonText}
                      </p>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
