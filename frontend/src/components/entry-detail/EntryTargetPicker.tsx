import { useId, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import imageNotAvailable from "@/assets/image-not-available.jpg";
import { filterMoveTargets, type MoveTargetDescription } from "@/lib/moveTargetDisplay";

/**
 * Pick a Marking or Cover destination for a link or image move.
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
 * Presentational only: the caller supplies candidates. Image moves filter their
 * loaded candidates here; linking passes a query to server search instead.
 */
export function EntryTargetPicker({
  targets,
  selectedId,
  onSelect,
  filterLabel,
  filterPlaceholder,
  emptyMessage,
  disabled = false,
  selectionDisabled = false,
  serverSearch,
  linkedTargets,
  onOpenTarget,
}: {
  targets: MoveTargetDescription[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  filterLabel: string;
  filterPlaceholder: string;
  emptyMessage: string;
  disabled?: boolean;
  selectionDisabled?: boolean;
  serverSearch?: { query: string; onQueryChange: (query: string) => void };
  linkedTargets?: Map<number, string>;
  onOpenTarget?: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const filterId = useId();

  const visible = useMemo(
    () => serverSearch ? targets : filterMoveTargets(targets, query),
    [targets, query, serverSearch],
  );

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={filterId}>{filterLabel}</Label>
        <Input
          id={filterId}
          value={serverSearch ? serverSearch.query : query}
          onChange={(e) => serverSearch ? serverSearch.onQueryChange(e.target.value) : setQuery(e.target.value)}
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
          aria-label={`${filterLabel} results`}
          className="max-h-[22rem] space-y-1 overflow-y-auto rounded border border-border p-1"
        >
          {visible.map((t) => {
            const isSelected = t.id === selectedId;
            const linkedStatus = linkedTargets?.get(t.id);
            return (
              <div key={t.id} className="flex items-center gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={disabled || selectionDisabled || linkedStatus != null}
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
                    <span className="block break-all font-medium">{t.title}</span>
                    {t.detail && (
                      <span className="block break-words text-xs text-muted-foreground">
                        {t.detail}
                      </span>
                    )}
                    {linkedStatus && <span className="block text-xs">Linked: {linkedStatus}</span>}
                  </span>
                </button>
                {linkedStatus && onOpenTarget && (
                  <button
                    type="button"
                    className="shrink-0 text-sm underline disabled:opacity-50"
                    disabled={disabled}
                    onClick={() => onOpenTarget(t.id)}
                  >
                    Open Marking
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default EntryTargetPicker;
