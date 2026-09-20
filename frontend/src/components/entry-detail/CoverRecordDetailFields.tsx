const EMPTY = "-";

export function CoverRecordDetailFields({
  type,
  date,
  institutionallyOwned,
  backstamp,
  catalogCode,
  showCatalogCode = false,
  submittedBy,
  description,
}: {
  type: string;
  date: string;
  institutionallyOwned: string;
  backstamp: string;
  /** Editor-only catalog reference code. */
  catalogCode?: string | null;
  showCatalogCode?: boolean;
  /** Submitter display name; shown only when the submitter opted in. */
  submittedBy?: string | null;
  /** Free-text cover description / notes; shown only when present. */
  description?: string | null;
}) {
  const rows = [
    { label: "Type", value: type || EMPTY },
    { label: "Date", value: date || EMPTY },
    { label: "Institutionally Owned", value: institutionallyOwned || EMPTY },
    { label: "Backstamp", value: backstamp || EMPTY },
  ];
  if (showCatalogCode && catalogCode?.trim()) {
    rows.push({ label: "Catalog Cover code", value: catalogCode.trim() });
  }
  if (submittedBy) {
    rows.push({ label: "Submitted by", value: submittedBy });
  }
  if (description && description.trim()) {
    rows.push({ label: "Description", value: description });
  }
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <span className="text-muted-foreground">{row.label}:</span>{" "}
          <span className="text-foreground break-words whitespace-pre-line">{row.value}</span>
        </div>
      ))}
    </dl>
  );
}
