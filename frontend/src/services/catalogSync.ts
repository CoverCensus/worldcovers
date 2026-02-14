/**
 * Catalog sync: no-op. Catalog data is managed in Django (postmarks API).
 */

export type SubmissionForCatalog = {
  name: string;
  state: string;
  town: string;
  date_range: string;
  type: string;
  color: string;
  image_url: string | null;
  description?: string | null;
  citation_references?: string | null;
  dimensions?: string | null;
  manuscript?: string | null;
  rarity?: string | null;
  user_id: string;
};

export async function syncApprovedSubmissionToCatalog(
  _submission: SubmissionForCatalog
): Promise<{ ok: boolean; error?: string }> {
  return { ok: true };
}
