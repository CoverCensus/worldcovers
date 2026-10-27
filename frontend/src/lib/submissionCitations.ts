import type { Submission, SubmissionReference, SubmissionFormData } from "@/lib/submission";
import type { EntryCitationItem } from "@/components/entry-detail/EntryCitationsCard";
import type { ReferenceWorkRecord } from "@/services/referenceWorks";

export type ReferenceDetailInput = {
  pageNumber: string;
  citationUrl: string;
};

export type ReferenceDetailPayload = Omit<SubmissionReference, "reference_work_id"> & {
  reference_work_id: number;
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

export function referenceDetailsForForm(rows: SubmissionReference[] = []): Record<number, ReferenceDetailInput> {
  const result: Record<number, ReferenceDetailInput> = {};
  for (const row of rows ?? []) {
    const id = Number(row.reference_work_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    result[id] = { pageNumber: row.page_number?.trim() ?? "", citationUrl: row.url?.trim() ?? "" };
  }
  return result;
}

export function appendSubmissionCitations(
  form: SubmissionFormData,
  ids: number[],
  details: ReferenceDetailPayload[],
): void {
  // An explicit empty field clears Citations; omission preserves them.
  if (ids.length === 0) form.append("reference_work_ids[]", "");
  ids.forEach((id) => form.append("reference_work_ids[]", String(id)));
  form.append("reference_work_details", JSON.stringify(details));
}

export function submissionCitations(
  data: Submission,
  referenceWorks: ReferenceWorkRecord[],
): EntryCitationItem[] {
  const rawIds = data.reference_work_ids;
  const details = referenceDetailsForForm(data.reference_work_details ?? []);
  const ids = rawIds == null
    ? Object.keys(details).map(Number)
    : rawIds;
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
