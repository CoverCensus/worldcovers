import type { MarkingFieldRow } from "@/lib/markingFields";
import { hasDisplayValue } from "@/lib/markingFields";

const EMPTY = "-";

interface Props {
  rows: MarkingFieldRow[];
  // "record"       -- hide blanks per row.alwaysShow + hasDisplayValue
  //                  (RecordDetail behavior)
  // "contribution" -- show every row; blanks render as "-" so a contribution
  //                  review always has the same row count and order as a
  //                  RecordDetail page
  mode: "record" | "contribution";
}

export function MarkingFieldsDisplay({ rows, mode }: Props) {
  const visible =
    mode === "record"
      ? rows.filter((r) => r.alwaysShow || hasDisplayValue(r.value))
      : rows;
  return (
    <dl className="space-y-0 text-sm">
      {visible.map((row, idx) => (
        <div
          key={row.label}
          className={`flex justify-between py-2 ${idx === visible.length - 1 ? "" : "border-b border-border"}`}
        >
          <dt className="text-muted-foreground font-medium">{row.label}</dt>
          <dd className="text-foreground whitespace-pre-line text-right">
            {row.value && row.value.trim() !== "" ? row.value : EMPTY}
          </dd>
        </div>
      ))}
    </dl>
  );
}
