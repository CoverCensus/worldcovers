import { supabase } from "@/integrations/supabase/client";

type SubmissionForCatalog = {
  name: string;
  state: string;
  town: string;
  date_range: string;
  type: string;
  color: string;
  image_url: string | null;
};

/**
 * When a submission is approved, add it to catalog_records so it appears in the
 * catalog (Search) list. Skips insert if a matching record already exists.
 */
export async function syncApprovedSubmissionToCatalog(
  submission: SubmissionForCatalog
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: existing } = await supabase
      .from("catalog_records")
      .select("id")
      .eq("name", submission.name)
      .eq("state", submission.state)
      .eq("town", submission.town)
      .eq("date_range", submission.date_range)
      .eq("type", submission.type)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return { ok: true };
    }

    const { error } = await supabase.from("catalog_records").insert({
      name: submission.name,
      state: submission.state,
      town: submission.town,
      date_range: submission.date_range,
      color: submission.color,
      type: submission.type,
      image_url: submission.image_url,
      valuation: "Common",
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to sync to catalog",
    };
  }
}
