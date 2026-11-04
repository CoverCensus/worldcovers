import { useParams } from "react-router-dom";
import RecordDetail from "./RecordDetail";
import CoverDetailPage from "./CoverDetail";

/**
 * Unified entry detail router: marking records vs cover records share the same
 * two-column layout via shared entry-detail components.
 */
export default function EntryDetail() {
  const { id, coverId } = useParams();
  if (coverId != null && String(coverId).trim() !== "") {
    return <CoverDetailPage />;
  }
  // Keyed by id so stepping Previous/Next (Trello T95) mounts a fresh page:
  // carousel index, dialogs and the catalog cursor read are per record.
  return <RecordDetail key={id} />;
}
