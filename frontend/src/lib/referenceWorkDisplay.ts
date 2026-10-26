/**
 * Compact Reference Work display for the citation cards on the submission
 * forms (Trello S19): the first author plus "et al." when there are more,
 * then edition, volume and year. Full authorship stays in storage and on
 * the detail pages.
 *
 * Authors are recognised only when the authorship string carries a
 * semicolon or an "and" / "&" between names. A comma never splits, so a
 * single person written "Briggs, Deane R." is shown whole; the price is
 * that "Deane R. Briggs, Francis Ferguson and Thomas M. Lera" shows its
 * first two names before "et al.", which is long but never wrong. A
 * corporate name with "and" in it ("Harrison and Sons") reads as two
 * authors; the help text tells Editors to prefer a semicolon between people.
 */
import { withOrdinalSuffix, type ReferenceWorkRecord } from "@/services/referenceWorks";

const AUTHOR_SEPARATOR = /\s*;\s*|\s+and\s+|\s*&\s*/i;
const LEADING_SEPARATORS = /^(?:\s*;\s*|\s*&\s*|and\s+)+/i;

export interface FirstAuthor {
  name: string;
  etAl: boolean;
}

export function firstAuthor(authorship: string | null | undefined): FirstAuthor {
  const text = (authorship ?? "").trim().replace(LEADING_SEPARATORS, "").trim();
  if (!text) return { name: "", etAl: false };
  const match = AUTHOR_SEPARATOR.exec(text);
  if (!match) return { name: text, etAl: false };
  const name = text.slice(0, match.index).trim();
  const rest = text.slice(match.index + match[0].length).trim();
  return { name: name || text, etAl: rest !== "" && name !== "" };
}

export function formatAuthorsCompact(authorship: string | null | undefined): string {
  const { name, etAl } = firstAuthor(authorship);
  if (!name) return "";
  return etAl ? `${name} et al.` : name;
}

/**
 * "First Author et al. | 2nd Ed. | Vol. 3 | 2021" with empty parts left out.
 */
export function compactReferenceWorkLine(
  work: Pick<ReferenceWorkRecord, "authorship" | "edition" | "volume" | "publicationYear">,
): string {
  const parts: string[] = [];
  const authors = formatAuthorsCompact(work.authorship);
  if (authors) parts.push(authors);
  const edition = (work.edition ?? "").trim();
  if (edition) parts.push(`${withOrdinalSuffix(edition)} Ed.`);
  const volume = (work.volume ?? "").trim();
  if (volume) parts.push(`Vol. ${volume}`);
  if (work.publicationYear) parts.push(String(work.publicationYear));
  return parts.join(" | ");
}
