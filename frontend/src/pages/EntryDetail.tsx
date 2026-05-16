import { useParams } from "react-router-dom";
import RecordDetail from "./RecordDetail";
import CoverDetailPage from "./CoverDetail";

/**
 * Unified entry detail router: marking records vs cover records share the same
 * two-column layout via shared entry-detail components.
 */
export default function EntryDetail() {
  const { coverId } = useParams();
  if (coverId != null && String(coverId).trim() !== "") {
    return <CoverDetailPage />;
  }
  return <RecordDetail />;
}
