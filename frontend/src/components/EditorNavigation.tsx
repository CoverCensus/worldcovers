import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { dashboardHrefForTab, type DashboardTab } from "@/lib/dashboardParams";

type EditorSection = DashboardTab | "editors" | "reference-works";

interface EditorNavigationProps {
  active: EditorSection;
  onTabChange?: (tab: DashboardTab) => void;
}

export function EditorNavigation({ active, onTabChange }: EditorNavigationProps) {
  return (
    <nav aria-label="Editor navigation" className="inline-flex flex-wrap items-center rounded-md border border-border bg-card p-1">
      {(["submissions", "editor"] as const).map((tab) => {
        const label = tab === "submissions" ? "My Submissions" : "User Submissions";
        const variant = active === tab ? "secondary" : "ghost";
        return onTabChange ? (
          <Button key={tab} variant={variant} size="sm" aria-current={active === tab ? "page" : undefined} onClick={() => onTabChange(tab)}>
            {label}
          </Button>
        ) : (
          <Button key={tab} asChild variant={variant} size="sm">
            <Link to={dashboardHrefForTab(tab)}>{label}</Link>
          </Button>
        );
      })}
      <Button asChild variant={active === "editors" ? "secondary" : "ghost"} size="sm">
        <Link to="/editors" aria-current={active === "editors" ? "page" : undefined}>Editors</Link>
      </Button>
      <Button asChild variant={active === "reference-works" ? "secondary" : "ghost"} size="sm">
        <Link to="/reference-works" aria-current={active === "reference-works" ? "page" : undefined}>Reference Works</Link>
      </Button>
    </nav>
  );
}
