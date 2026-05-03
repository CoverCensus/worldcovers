/**
 * Framings stub. Framing was dropped in the model.md realignment;
 * the corresponding API endpoint no longer exists. This module is
 * retained only so callers continue to type-check while the framing
 * selector is removed from the contribute/edit forms.
 */

/** Normalized option for dropdowns / filters (retained for type compat). */
export interface FramingOption {
  id: number;
  name: string;
  description: string;
}

/**
 * Framings have been removed from the model.md realignment. This stub
 * returns an empty list so contribute/edit forms that still render a
 * framing selector see no options. The selector itself should be
 * removed in a follow-up; the model and API no longer track framing.
 */
export async function getFramings(): Promise<FramingOption[]> {
  return [];
}
