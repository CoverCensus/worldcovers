import { withReturnTo } from "@/lib/returnTo";

/**
 * Where a Dashboard row opens. The image button, the title link and the
 * status badge on a row all resolve their destination here, so the three can
 * never disagree (Trello T97).
 *
 * A draft resumes in its edit form: a cover draft with a resolvable parent
 * marking goes to CoverEdit, any other draft to the Contribute form, each
 * carrying `from` so the form returns to the dashboard view that was on
 * screen. Everything else opens the review page with the return-to query
 * (issue #147: state alone is lost on reload or in a new tab).
 */
export interface DashboardOpenTarget {
  to: string;
  state: Record<string, unknown>;
}

export interface DashboardOpenable {
  id: number;
  status: string;
  isCover?: boolean;
  cover_parent_marking_id?: number | null;
}

export function dashboardItemTarget(
  item: DashboardOpenable,
  from: string,
  returnState: Record<string, unknown>,
): DashboardOpenTarget {
  const status = String(item.status || "").toLowerCase();
  if (status === "draft") {
    if (item.isCover && item.cover_parent_marking_id != null) {
      return {
        to: `/record/${item.cover_parent_marking_id}/cover/new?edit=${item.id}`,
        state: { from },
      };
    }
    return { to: `/contribute?edit=${item.id}`, state: { from } };
  }
  return {
    to: withReturnTo(`/contribution/${item.id}`, from),
    state: returnState,
  };
}
