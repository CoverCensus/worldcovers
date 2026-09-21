import { useId, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { filterMoveTargets, type MoveTargetDescription } from "@/lib/moveTargetDisplay";

/**
 * Pick a destination for a move-image operation -- issues.md 114 / Trello T38.
 *
 * Replaces a Radix <Select> of bare catalog codes. Each row carries a
 * thumbnail and an identifying line, and a filter box sits above the list so a
 * destination can be found without knowing a code, which is T38's acceptance.
 *
 * Deliberately built from a plain <button role="radio"> list rather than a
 * Select or a Radix RadioGroup. The control has 147 options at Richmond, needs
 * two lines and an image per row, and must be testable -- no test in this repo
 * drives a Radix Select and jsdom carries none of the shims one needs.
 *
 * Presentational only: no services, no fetching. Every candidate is already in
 * memory by the time this renders.
 */
export function MoveTargetPicker({
  targets,
  selectedId,
  onSelect,
  filterLabel,
  filterPlaceholder,
  emptyMessage,
  disabled = false,
}: {
  targets: MoveTargetDescription[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  filterLabel: string;
  filterPlaceholder: string;
  emptyMessage: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filterId = useId();

  const visible = useMemo(() => filterMoveTargets(targets, query), [targets, query]);

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={filterId}>{filterLabel}</Label>
        <Input
          id={filterId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={filterPlaceholder}
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      {visible.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div
          role="radiogroup"
          // Distinct from the filter input's label: this group is the results,
          // not the search box, and two controls sharing one accessible name
          // is ambiguous to a screen reader as well as to a test.
          aria-label={`${filterLabel} — results`}
          className="max-h-[22rem] space-y-1 overflow-y-auto rounded border border-border p-1"
        >
          {visible.map((t) => {
            const isSelected = t.id === selectedId;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={disabled}
                onClick={() => onSelect(t.id)}
                className={`flex w-full items-center gap-3 rounded border p-2 text-left transition-colors disabled:opacity-50 ${
                  isSelected
                    ? "border-primary ring-2 ring-primary"
                    : "border-transparent hover:border-border hover:bg-muted/50"
                }`}
              >
                <img
                  src={t.thumbnailUrl || imageNotAvailable}
                  alt=""
                  // 147 rows at Richmond, so do not fetch them all eagerly.
                  loading="lazy"
                  decoding="async"
                  className="h-12 w-12 shrink-0 rounded border border-border object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.title}</span>
                  {t.detail && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {t.detail}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MoveTargetPicker;
