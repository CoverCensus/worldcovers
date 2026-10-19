import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * The element's content size in CSS pixels, kept current on resize; zero until
 * measured (and always in jsdom). `active` re-measures once the element mounts,
 * e.g. when a dialog opens.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>, active = true) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, active]);

  return size;
}
