import Papa from "papaparse";

/** State ID → { name, abbr } mapping from old database */
const STATE_MAP: Record<number, { name: string; abbr: string }> = {
  1: { name: "Alabama", abbr: "AL" },
  2: { name: "Alaska", abbr: "AK" },
  3: { name: "Arizona", abbr: "AZ" },
  4: { name: "Arkansas", abbr: "AR" },
  5: { name: "California", abbr: "CA" },
  6: { name: "Colorado", abbr: "CO" },
  7: { name: "Connecticut", abbr: "CT" },
  8: { name: "Delaware", abbr: "DE" },
  9: { name: "Florida", abbr: "FL" },
  10: { name: "Georgia", abbr: "GA" },
  11: { name: "Hawaii", abbr: "HI" },
  12: { name: "Idaho", abbr: "ID" },
  13: { name: "Illinois", abbr: "IL" },
  14: { name: "Indiana", abbr: "IN" },
  15: { name: "Iowa", abbr: "IA" },
  16: { name: "Kansas", abbr: "KS" },
  17: { name: "Kentucky", abbr: "KY" },
  18: { name: "Louisiana", abbr: "LA" },
  19: { name: "Maine", abbr: "ME" },
  20: { name: "Maryland", abbr: "MD" },
  21: { name: "Massachusetts", abbr: "MA" },
  22: { name: "Michigan", abbr: "MI" },
  23: { name: "Minnesota", abbr: "MN" },
  24: { name: "Mississippi", abbr: "MS" },
  25: { name: "Missouri", abbr: "MO" },
  26: { name: "Montana", abbr: "MT" },
  27: { name: "Nebraska", abbr: "NE" },
  28: { name: "Nevada", abbr: "NV" },
  29: { name: "New Hampshire", abbr: "NH" },
  30: { name: "New Jersey", abbr: "NJ" },
  31: { name: "New Mexico", abbr: "NM" },
  32: { name: "New York", abbr: "NY" },
  33: { name: "North Carolina", abbr: "NC" },
  34: { name: "North Dakota", abbr: "ND" },
  35: { name: "Ohio", abbr: "OH" },
  36: { name: "Oklahoma", abbr: "OK" },
  37: { name: "Oregon", abbr: "OR" },
  38: { name: "Pennsylvania", abbr: "PA" },
  39: { name: "Rhode Island", abbr: "RI" },
  40: { name: "South Carolina", abbr: "SC" },
  41: { name: "South Dakota", abbr: "SD" },
  42: { name: "Tennessee", abbr: "TN" },
  43: { name: "Texas", abbr: "TX" },
  44: { name: "Utah", abbr: "UT" },
  45: { name: "Vermont", abbr: "VT" },
  46: { name: "Virginia", abbr: "VA" },
  47: { name: "Washington", abbr: "WA" },
  48: { name: "West Virginia", abbr: "WV" },
  49: { name: "Wisconsin", abbr: "WI" },
  50: { name: "Wyoming", abbr: "WY" },
  51: { name: "District of Columbia", abbr: "DC" },
  52: { name: "Indian Territory", abbr: "IT" },
  53: { name: "Puerto Rico", abbr: "PR" },
  54: { name: "US Territories", abbr: "US" },
  55: { name: "Virgin Islands", abbr: "VI" },
};

export type ImportProgress = {
  total: number;
  processed: number;
  inserted: number;
  skipped: number;
  errors: number;
  done: boolean;
};

type RawRow = Record<string, string>;

function clean(val: string | undefined | null): string {
  if (!val || val === "NULL" || val === "null" || val === "n/a") return "";
  return val.trim();
}

function buildDateRange(row: RawRow): string {
  const earliest = clean(row.nEarliestUseYear);
  const latest = clean(row.txtLatestUseYear) || clean(row.nLatestUseYear?.toString());

  if (earliest && latest && earliest !== latest) return `${earliest}-${latest}`;
  if (earliest) return earliest;
  if (latest) return latest;

  // Fallback to txtDatesSeen
  const seen = clean(row.txtDatesSeen);
  if (seen) return seen;

  return "Unknown";
}

function buildColor(row: RawRow): string {
  const primary = clean(row.txtTownmarkColor);
  if (primary && primary !== "n/a") return primary;

  const colors = clean(row.txtColors);
  if (colors) {
    // Take first color from comma-separated list
    const first = colors.split(",")[0]?.trim();
    if (first) return first;
  }
  return "Unknown";
}

function buildType(row: RawRow): string {
  const shape = clean(row.txtTownmarkShape);
  if (shape) return shape;

  // Check if manuscript
  if (row.ynManuscript === "1") return "Manuscript";

  return "Unknown";
}

function buildDimensions(row: RawRow): string | null {
  const w = clean(row.nWidth);
  const h = clean(row.nHeight);
  if (w && h) return `${w} x ${h}`;
  if (w) return `${w}mm`;
  return null;
}

function mapRow(row: RawRow) {
  const stateId = parseInt(row.nStateID, 10);
  const stateInfo = STATE_MAP[stateId];
  if (!stateInfo) return null;

  const name = clean(row.txtPostmark) || clean(row.txtTownPostmark) || clean(row.txtTown);
  if (!name) return null;

  const town = clean(row.txtTown);
  if (!town) return null;

  return {
    name,
    state: stateInfo.name,
    town,
    date_range: buildDateRange(row),
    color: buildColor(row),
    type: buildType(row),
    valuation: clean(row.txtValue) || "Common",
    description: clean(row.memNotes) || null,
    dimensions: buildDimensions(row),
    manuscript: row.ynManuscript === "1" ? "Yes" : null,
    rarity: null as string | null,
    submitted_by: null as string | null,
    image_url: null as string | null,
    citation_references: null as string | null,
  };
}

const BATCH_SIZE = 500;

export async function importLegacyData(
  onProgress: (progress: ImportProgress) => void
): Promise<ImportProgress> {
  const progress: ImportProgress = {
    total: 0,
    processed: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
    done: false,
  };

  // Fetch CSV from public folder
  const csvUrl = `${window.location.origin}/Old%20Data/tblRawStateData.csv`;
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch CSV: ${response.statusText}`);
  }
  const csvText = await response.text();

  // Parse CSV
  const parsed = Papa.parse<RawRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (parsed.errors.length > 0) {
    console.warn("CSV parse warnings:", parsed.errors.slice(0, 5));
  }

  // Filter: only non-deleted rows
  const rows = parsed.data.filter(
    (row) => row.ynDeleted === "0" && clean(row.txtTown) !== ""
  );

  progress.total = rows.length;
  onProgress({ ...progress });

  // Map rows to catalog_records format
  const mappedRows: ReturnType<typeof mapRow>[] = [];
  for (const row of rows) {
    const mapped = mapRow(row);
    if (mapped) {
      mappedRows.push(mapped);
    } else {
      progress.skipped++;
    }
  }

  progress.total = mappedRows.length + progress.skipped;
  onProgress({ ...progress });

  // Bulk import is done via Django admin (e.g. management commands). No Supabase.
  for (let i = 0; i < mappedRows.length; i += BATCH_SIZE) {
    const batch = mappedRows.slice(i, i + BATCH_SIZE).filter(Boolean) as NonNullable<
      ReturnType<typeof mapRow>
    >[];
    progress.processed += batch.length;
    progress.skipped += batch.length;
    onProgress({ ...progress });
    await new Promise((r) => setTimeout(r, 50));
  }

  progress.done = true;
  onProgress({ ...progress });
  return progress;
}
