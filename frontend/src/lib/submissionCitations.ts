import type { EntryCitationItem } from "@/components/entry-detail/EntryCitationsCard";
import type { ReferenceWorkRecord } from "@/services/referenceWorks";

export type ReferenceDetailInput = {
  pageNumber: string;
  citationUrl: string;
};

export type ReferenceDetailPayload = {
  reference_work_id: number;
  page_number?: string;
  url?: string;
};

export function parseCitationDetail(text: string): ReferenceDetailInput {
  const legacyPage = text.match(/^Page number:\s*(.*)$/im);
  const legacyUrl = text.match(/^Citation url:\s*(.*)$/im);
  if (legacyPage || legacyUrl) {
    return { pageNumber: legacyPage?.[1]?.trim() ?? "", citationUrl: legacyUrl?.[1]?.trim() ?? "" };
  }
  const url = text.match(/https?:\/\/\S+$/)?.[0] ?? "";
  const page = (url ? text.slice(0, text.length - url.length) : text)
    .replace(/\s+-\s*$/, "").replace(/^p\.\s*/, "").trim();
  return { pageNumber: page, citationUrl: url };
}

export function parseReferenceWorkIds(raw: unknown): number[] {
  const values: unknown[] = [];
  if (Array.isArray(raw)) {
    values.push(...raw);
  } else if (raw != null) {
    values.push(raw);
  }

  const parsed: number[] = [];
  const seen = new Set<number>();

  for (const value of values) {
    if (Array.isArray(value)) {
      value.forEach((v) => values.push(v));
      continue;
    }
    const s = String(value ?? "").trim();
    if (!s) continue;
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        const json = JSON.parse(s);
        if (Array.isArray(json)) {
          json.forEach((v) => values.push(v));
          continue;
        }
      } catch {
        // Ignore malformed payloads from legacy records.
      }
    }
    if (s.includes(",")) {
      s.split(",").forEach((chunk) => values.push(chunk.trim()));
      continue;
    }
    const n = Number.parseInt(s, 10);
    if (Number.isNaN(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    parsed.push(n);
  }

  return parsed;
}

export function parseReferenceWorkDetails(raw: unknown): Record<number, ReferenceDetailInput> {
  if (raw == null) return {};
  let list: unknown = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return {};
    try {
      list = JSON.parse(s);
    } catch {
      return {};
    }
  }
  if (!Array.isArray(list)) {
    if (list && typeof list === "object") {
      list = Object.entries(list as Record<string, unknown>).map(([id, detail]) => ({
        reference_work_id: id,
        ...(detail && typeof detail === "object" ? detail : {}),
      }));
    } else {
      return {};
    }
  }
  const rows = list as unknown[];
  const out: Record<number, ReferenceDetailInput> = {};
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const idRaw = rec.reference_work_id ?? rec.referenceWorkId;
    const id = Number.parseInt(String(idRaw ?? ""), 10);
    if (Number.isNaN(id) || id <= 0) continue;
    out[id] = {
      pageNumber: String(rec.page_number ?? rec.pageNumber ?? "").trim(),
      citationUrl: String(rec.url ?? "").trim(),
    };
  }
  return out;
}

export function appendSubmissionCitations(
  form: FormData,
  ids: number[],
  details: ReferenceDetailPayload[],
): void {
  // An explicit empty field clears Citations; omission preserves them.
  if (ids.length === 0) form.append("reference_work_ids[]", "");
  ids.forEach((id) => form.append("reference_work_ids[]", String(id)));
  form.append("reference_work_details", JSON.stringify(details));
}

export function submissionCitations(
  data: Record<string, unknown>,
  referenceWorks: ReferenceWorkRecord[],
): EntryCitationItem[] {
  const rawIds = data.reference_work_ids ?? data.referenceWorkIds ?? data["reference_work_ids[]"];
  const details = parseReferenceWorkDetails(data.reference_work_details ?? data.referenceWorkDetails);
  const ids = rawIds == null
    ? Object.keys(details).map(Number)
    : parseReferenceWorkIds(rawIds);
  return ids.map((id) => {
    const detail = details[id];
    return {
      id,
      citationDetail: [detail?.pageNumber ? `p. ${detail.pageNumber}` : "", detail?.citationUrl]
        .filter(Boolean).join(" - "),
      referenceWork: referenceWorks.find((work) => work.id === id) ?? null,
    };
  });
}
