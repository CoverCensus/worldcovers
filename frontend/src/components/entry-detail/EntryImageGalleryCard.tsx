import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import type { EntryGalleryImage } from "./types";

export function EntryImageGalleryCard({
  images,
  showSubjectBadge,
  placeholderSubjectLabel,
  carouselApi,
  setCarouselApi,
  currentIndex,
}: {
  images: EntryGalleryImage[];
  /** When true, show subject label badge (marking detail). Cover detail omits this. */
  showSubjectBadge: boolean;
  placeholderSubjectLabel?: string;
  carouselApi: CarouselApi | undefined;
  setCarouselApi: (api: CarouselApi | undefined) => void;
  currentIndex: number;
}) {
  const slides: EntryGalleryImage[] =
    images.length > 0
      ? images
      : [
          {
            imageUrl: imageNotAvailable,
            subjectLabel: placeholderSubjectLabel,
            isDefault: false,
            isTracing: false,
            imageId: null,
          },
        ];

  return (
    <Card className="shadow-archival-lg">
      <CardContent className="p-6">
        <Carousel setApi={setCarouselApi} className="w-full">
          <CarouselContent>
            {slides.map((img, index) => {
              const src = img.imageUrl || imageNotAvailable;
              const alt = img.originalFilename || `Image ${index + 1}`;
              const isPlaceholder = !img.imageUrl;
              const inner = (
                <div className="relative flex w-full aspect-[4/3] items-center justify-center rounded border border-border bg-muted overflow-hidden">
                  <img src={src} alt={alt} className="w-full h-full object-contain" />
                  <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1">
                    {showSubjectBadge && img.subjectLabel && (
                      <Badge variant="secondary">{img.subjectLabel}</Badge>
                    )}
                    {!isPlaceholder && img.isTracing && (
                      <Badge variant="secondary">Tracing</Badge>
                    )}
                  </div>
                </div>
              );
              return (
                <CarouselItem key={index}>
                  {img.imageUrl ? (
                    <a
                      href={img.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${alt} in new tab`}
                      className="block"
                    >
                      {inner}
                    </a>
                  ) : (
                    inner
                  )}
                </CarouselItem>
              );
            })}
          </CarouselContent>
          {images.length > 1 && (
            <>
              <CarouselPrevious className="left-2" />
              <CarouselNext className="right-2" />
            </>
          )}
        </Carousel>
        {images.length > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            {images.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => carouselApi?.scrollTo(index)}
                className={`h-2 rounded-full transition-all ${index === currentIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"}`}
                aria-label={`Go to image ${index + 1}`}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
