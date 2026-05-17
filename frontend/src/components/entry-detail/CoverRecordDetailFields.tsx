const EMPTY = "-";

export function CoverRecordDetailFields({
  type,
  date,
  institutionallyOwned,
  backstamp,
}: {
  type: string;
  date: string;
  institutionallyOwned: string;
  backstamp: string;
}) {
  const rows = [
    { label: "Type", value: type || EMPTY },
    { label: "Date", value: date || EMPTY },
    { label: "Institutionally Owned", value: institutionallyOwned || EMPTY },
    { label: "Backstamp", value: backstamp || EMPTY },
  ];
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
