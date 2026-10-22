/**
 * Form state for the Cover submitted together with a new Marking (Trello T37).
 * Kept out of the component file so the constant does not break fast refresh.
 */
import { type PartialDateInput } from "@/lib/partialDate";

export interface PendingCoverFields {
  type: string;
  date: PartialDateInput;
  isInstitutional: boolean;
  isBackstamp: boolean;
  description: string;
  /** The contributor confirmed no cover image is available. */
  noImage: boolean;
}

export const EMPTY_PENDING_COVER: PendingCoverFields = {
  type: "",
  date: { unknown: false, year: "", month: "", day: "" },
  isInstitutional: false,
  isBackstamp: false,
  description: "",
  noImage: false,
};

export interface PendingCoverErrors {
  type?: string;
  date?: string;
  images?: string;
}

/** An image already saved with a draft; removed by key on resubmit. */
export interface PendingCoverSavedImage {
  key: string;
  url: string;
}
