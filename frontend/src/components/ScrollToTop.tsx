import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Open every new page at the top, but leave the browser's own position alone
 * when the viewer arrives by Back or Forward (a POP on the history stack).
 *
 * Trello T95: an editor working down a 1,200-row state list opened a marking,
 * pressed Back, and landed at the top of the list every time because this
 * reset ran on POP as well as on PUSH. Browsers restore the scroll position of
 * a popped entry themselves; the catalog then centres the row that was opened
 * (see lib/catalogCursor.ts).
 */
export function ScrollToTop({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType === "POP") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search, navigationType]);
  return <>{children}</>;
}
